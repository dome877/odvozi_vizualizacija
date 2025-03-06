const API_BASE_URL = 'http://localhost:3000';

document.addEventListener('DOMContentLoaded', async function() {
    // Get DOM elements
    const fetchBtn = document.getElementById('fetchBtn');
    const clearBtn = document.getElementById('clearBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const resultDiv = document.getElementById('result');
    const statusSpan = document.getElementById('status');
    const timestampSpan = document.getElementById('timestamp');
    const tokenInfo = document.getElementById('tokenInfo');
    
    // Initialize authentication (async)
    const isAuthenticated = await window.Auth.initAuth();
    
    // Setup token refresh mechanism and UI if authenticated
    if (isAuthenticated) {
        window.Auth.setupTokenRefresh();
        
        // Add event listeners for auth-related actions
        logoutBtn.addEventListener('click', window.Auth.logout);
        clearBtn.addEventListener('click', clearResults);
        
        // Add event listener for vehicle search (moved from inline HTML)
        fetchBtn.addEventListener('click', searchVehicle);
        
        // Show token info (just the expiry time for security)
        displayTokenInfo();
        
        // Initialize map and app functionality
        initializeApp();
    }
    
    // Function to show basic token information
    function displayTokenInfo() {
        try {
            const idToken = window.Auth.getIdToken();
            if (idToken) {
                // Parse the JWT token
                const tokenParts = idToken.split('.');
                if (tokenParts.length === 3) {
                    const payload = JSON.parse(atob(tokenParts[1]));
                    const expiry = new Date(payload.exp * 1000);
                    
                    if (tokenInfo) {
                        tokenInfo.innerHTML = `
                            <p>Logged in as: <strong>${payload.email || payload['cognito:username'] || 'User'}</strong></p>
                            <p>Token expires: <strong>${expiry.toLocaleString()}</strong></p>
                        `;
                    }
                }
            }
        } catch (error) {
            console.error('Error parsing token:', error);
        }
    }
    
    // Function to clear results
    function clearResults() {
        resultDiv.innerHTML = '<p>API response will appear here...</p>';
        resultDiv.className = '';
        statusSpan.textContent = 'Ready';
    }
    
    // Function to update timestamp
    function updateTimestamp() {
        const now = new Date();
        timestampSpan.textContent = now.toLocaleString();
    }

    // Initialize the app functionality
    function initializeApp() {
        // Initialize the map - add a delay to ensure DOM is ready
        setTimeout(() => {
            const map = L.map('map').setView([43.7350, 15.8952], 13);

            // Add Google Satellite layer
            L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
                maxZoom: 20,
                minZoom: 10,
                subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                attribution: '© Google'
            }).addTo(map);
            
            // Initialize a layer group to store markers
            window.markersLayer = L.layerGroup().addTo(map);
            
            // Fix map rendering - invalidate size after a slight delay to ensure DOM is fully rendered
            setTimeout(() => {
                map.invalidateSize();
                console.log('Map size invalidated');
            }, 200);
            
            // Store map in window object for later access
            window.map = map;
            
            // Add window resize handler to ensure the map renders correctly
            window.addEventListener('resize', function() {
                if (window.map) {
                    window.map.invalidateSize();
                }
            });
        }, 100);

        // Initialize date pickers with ISO string format
        flatpickr("#dateFrom", {
            enableTime: true,
            dateFormat: "Y-m-d H:i:00",
            time_24hr: true,
            defaultHour: 0,
            defaultMinute: 0
        });

        flatpickr("#dateTo", {
            enableTime: true,
            dateFormat: "Y-m-d H:i:00",
            time_24hr: true,
            defaultHour: 23,
            defaultMinute: 59
        });
    }
});

// Function to update Asset ID based on vehicle selection
function updateAssetId() {
    const select = document.getElementById('vehicleSelect');
    const assetIdInput = document.getElementById('assetId');
    assetIdInput.value = select.value;
}

async function searchVehicle() {
    const fetchBtn = document.getElementById('fetchBtn');
    const resultDiv = document.getElementById('result');
    const statusSpan = document.getElementById('status');
    
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    const rfidInput = document.getElementById('rfidInput').value.trim();
    const assetId = document.getElementById('assetId').value;

    console.log('Input values:', { dateFrom, dateTo, rfidInput, assetId }); // Debug log

    if (!dateFrom || !dateTo) {
        alert('Please select dates');
        return;
    }
    
    // Verify authentication before proceeding
    const idToken = window.Auth.getIdToken();
    if (!idToken) {
        resultDiv.innerHTML = '<p>No authentication token available. Please log in again.</p>';
        resultDiv.className = 'error';
        statusSpan.textContent = 'Authentication error';
        setTimeout(() => window.Auth.redirectToLogin(), 2000);
        return;
    }

    // Update UI for loading state
    fetchBtn.disabled = true;
    resultDiv.innerHTML = '<p class="loading">Loading data...</p>';
    resultDiv.className = '';
    statusSpan.textContent = 'Fetching data...';

    try {
        // First, handle login
        console.log('Attempting login...'); // Debug log
        const loginResponse = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Authorization': `Bearer ${idToken}` // Add auth token
            }
        });

        if (!loginResponse.ok) {
            if (loginResponse.status === 401 || loginResponse.status === 403) {
                // Token might be invalid or expired
                resultDiv.innerHTML = '<p>Your session has expired. Redirecting to login...</p>';
                setTimeout(() => window.Auth.redirectToLogin(), 2000);
                throw new Error('Authentication required');
            }
            throw new Error(`Login failed: ${loginResponse.statusText}`);
        }

        const formatDate = (dateString) => {
            const date = new Date(dateString);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            
            const formattedDate = `${year}-${month}-${day}T${hours}:${minutes}:00`;
            
            console.log('Formatting date:', dateString, '→', formattedDate);
            
            return formattedDate;
        };

        const params = new URLSearchParams({
            dateFrom: formatDate(dateFrom),
            dateTo: formatDate(dateTo)
        });

        if (assetId) {
            params.append('assetId', assetId);
        }

        if (rfidInput) {
            params.append('RFID', rfidInput);
        }

        console.log('Sending request with params:', params.toString());

        const response = await fetch(`${API_BASE_URL}/api/getData?${params}`, {
            credentials: 'include',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Authorization': `Bearer ${idToken}` // Add auth token
            }
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                // Token might be invalid or expired
                resultDiv.innerHTML = '<p>Your session has expired. Redirecting to login...</p>';
                setTimeout(() => window.Auth.redirectToLogin(), 2000);
                throw new Error('Authentication required');
            }
            throw new Error(`Data fetch failed: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Response headers:', response.headers); // Debug log
        console.log('Raw response from server:', data);
        console.log('Response type:', typeof data); // Debug log
        console.log('Response structure:', {
            isArray: Array.isArray(data),
            hasRoot: data?.root !== undefined,
            length: Array.isArray(data) ? data.length : (data?.root?.length || 0)
        });

        // Display results in the result div
        resultDiv.innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
        resultDiv.className = 'success';
        statusSpan.textContent = 'Data fetched successfully';
        
        // Update timestamp
        updateTimestamp();

        displayDataOnMap(data);

    } catch (error) {
        console.error('Detailed error:', {
            message: error.message,
            stack: error.stack
        });
        
        resultDiv.innerHTML = `<p>Error fetching data: ${error.message}</p>`;
        resultDiv.className = 'error';
        statusSpan.textContent = 'Error occurred';
        
        // Update timestamp
        updateTimestamp();
        
        alert(error.message || 'Error fetching data');
    } finally {
        // Re-enable button
        fetchBtn.disabled = false;
    }
}

function updateTimestamp() {
    const now = new Date();
    const timestampSpan = document.getElementById('timestamp');
    if (timestampSpan) {
        timestampSpan.textContent = now.toLocaleString();
    }
}

function displayDataOnMap(data) {
    // Clear existing markers
    if (window.markersLayer) {
        window.markersLayer.clearLayers();
    }

    // First, log the raw data for debugging
    console.log('Raw data received:', data);

    // Ensure we have valid data
    if (!data || (!data.root && !Array.isArray(data))) {
        console.error('Invalid data structure received:', data);
        alert('No valid data found for the selected criteria');
        return;
    }

    // Get the data array and filter out hand readers and invalid coordinates
    const dataArray = data.root || data;
    const validPoints = dataArray.filter(point => {
        // Filter out hand readers and ensure valid coordinates
        return (
            point &&
            point.latitude && 
            point.longitude &&
            !isNaN(parseFloat(point.latitude)) &&
            !isNaN(parseFloat(point.longitude)) &&
            !point.deviceName?.includes('Ručni čitač') // Filter out hand readers
        );
    });

    console.log(`Found ${validPoints.length} valid points out of ${dataArray.length} total records`);

    if (validPoints.length === 0) {
        console.log('No valid points with coordinates found');
        alert('No valid location data found for the selected criteria');
        return;
    }

    // Process valid points
    validPoints.forEach(point => {
        const lat = parseFloat(point.latitude);
        const lng = parseFloat(point.longitude);
        const timestamp = point.dateTime;
        const rfidValue = point.rfid_value || 'No RFID';
        const vehicleName = point.deviceName || 'Unknown Vehicle';
        const hasValidRfid = point.rfid_value && point.rfid_value !== '-';

        const icon = L.icon({
            iconUrl: hasValidRfid ? 
                'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png' : 
                'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
            iconSize: [15, 24],
            iconAnchor: [7, 24],
            popupAnchor: [1, -24],
            shadowSize: [24, 24]
        });

        // Add marker with more detailed popup
        L.marker([lat, lng], { icon })
            .bindPopup(`
                <strong>Time:</strong> ${timestamp}<br>
                <strong>Vehicle:</strong> ${vehicleName}<br>
                <strong>RFID:</strong> ${rfidValue}<br>
                <strong>Location:</strong> ${lat.toFixed(6)}, ${lng.toFixed(6)}
            `)
            .addTo(window.markersLayer);
    });

    // Draw route line if RFID filter is active
    const rfidInput = document.getElementById('rfidInput').value.trim();
    if (rfidInput && validPoints.length > 1) {
        const routePoints = validPoints.map(point => [
            parseFloat(point.latitude), 
            parseFloat(point.longitude)
        ]);
        
        L.polyline(routePoints, {
            color: 'blue',
            weight: 3,
            opacity: 0.7,
            dashArray: '5, 10'
        }).addTo(window.markersLayer);
    }
}

function hexToDecimal(hexString) {
    if (!hexString || typeof hexString !== 'string') return '';
    return parseInt(hexString.replace(/^0x/, ''), 16).toString();
}

function decimalToHex(decimalString) {
    if (!decimalString || isNaN(parseInt(decimalString))) return '';
    const hex = parseInt(decimalString).toString(16).toUpperCase();
    return hex.padStart(hex.length + (hex.length % 2), '0');
}