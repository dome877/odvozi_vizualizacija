const API_BASE_URL = 'https://gfa97tr7ff.execute-api.eu-north-1.amazonaws.com/prod/';

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
        
        // Clear map markers
        if (window.markersLayer) {
            window.markersLayer.clearLayers();
        }
        
        // Clear drawn box
        if (window.drawnItems) {
            window.drawnItems.clearLayers();
            window.drawnBounds = null;
        }
        
        // Clear box info display
        const boxInfo = document.getElementById('boxInfo');
        if (boxInfo) {
            boxInfo.style.display = 'none';
            boxInfo.innerHTML = '';
        }
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
            
            // Initialize a layer for drawn items
            window.drawnItems = new L.FeatureGroup();
            map.addLayer(window.drawnItems);
            
            // Initialize the draw control and add it to the map
            const drawControl = new L.Control.Draw({
                draw: {
                    polyline: false,
                    polygon: false,
                    circle: false,
                    circlemarker: false,
                    marker: false,
                    rectangle: {
                        shapeOptions: {
                            color: '#3388ff',
                            weight: 2
                        }
                    }
                },
                edit: {
                    featureGroup: window.drawnItems,
                    remove: true
                }
            });
            map.addControl(drawControl);
            
            // Event handler for newly drawn items
            map.on(L.Draw.Event.CREATED, function (e) {
                // Clear previous drawings
                window.drawnItems.clearLayers();
                
                // Add the newly drawn layer
                const layer = e.layer;
                window.drawnItems.addLayer(layer);
                
                // Store the bounds for later use in search
                if (e.layerType === 'rectangle') {
                    const bounds = layer.getBounds();
                    window.drawnBounds = bounds;
                    
                    // Show info about the drawn box
                    const boxInfo = document.getElementById('boxInfo');
                    if (boxInfo) {
                        boxInfo.innerHTML = `
                            Box coordinates:<br>
                            NE: ${bounds.getNorthEast().lat.toFixed(7)}, ${bounds.getNorthEast().lng.toFixed(7)}<br>
                            SW: ${bounds.getSouthWest().lat.toFixed(7)}, ${bounds.getSouthWest().lng.toFixed(7)}
                        `;
                        boxInfo.style.display = 'block';
                    }
                }
            });
            
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

        // Set up hex-to-decimal converter
        const convertBtn = document.getElementById('convertBtn');
        const hexInput = document.getElementById('hexInput');
        const decimalOutput = document.getElementById('decimalOutput');
        
        if (convertBtn && hexInput && decimalOutput) {
            convertBtn.addEventListener('click', function() {
                decimalOutput.value = hexToDecimal(hexInput.value);
            });
            
            // Also convert on Enter key press
            hexInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    decimalOutput.value = hexToDecimal(hexInput.value);
                }
            });
        }
        
        // Update timestamp
        updateTimestamp();
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
    const useBoxFilter = document.getElementById('useBoxFilter')?.checked || false;

    console.log('Input values:', { dateFrom, dateTo, rfidInput, assetId, useBoxFilter }); // Debug log

    if (!dateFrom || !dateTo) {
        alert('Please select dates');
        return;
    }
    
    // Check if box filter is enabled but no box is drawn
    if (useBoxFilter && !window.drawnBounds) {
        alert('Please draw a box on the map first');
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
        
        // Add box filter parameters if enabled
        if (useBoxFilter && window.drawnBounds) {
            const bounds = window.drawnBounds;
            params.append('filterByBox', 'true');
            params.append('minLat', bounds.getSouth().toFixed(7));
            params.append('maxLat', bounds.getNorth().toFixed(7));
            params.append('minLng', bounds.getWest().toFixed(7));
            params.append('maxLng', bounds.getEast().toFixed(7));
            console.log('Adding box filter:', {
                minLat: bounds.getSouth().toFixed(7),
                maxLat: bounds.getNorth().toFixed(7),
                minLng: bounds.getWest().toFixed(7),
                maxLng: bounds.getEast().toFixed(7)
            });
        } else {
            params.append('filterByBox', 'false');
        }

        console.log('Sending request with params:', params.toString());

        // Direct API Gateway request
        const response = await fetch(`${API_BASE_URL}?${params}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
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

        // Update status without showing raw data
        resultDiv.innerHTML = '<p>Data fetched successfully</p>';
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
        // Check if the point has the additional object information
        const hasObjectInfo = point.VrstaObjekta || point.SifraObjekta || point.NazivObjekta || point.ZajednickaPostuda;

        // Determine which icon to use:
        // - Red: No valid RFID
        // - Yellow: Has RFID but no object info
        // - Green: Has both RFID and object info
        let iconUrl;
        if (!hasValidRfid) {
            iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png';
        } else if (!hasObjectInfo) {
            iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-yellow.png';
        } else {
            iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png';
        }

        const icon = L.icon({
            iconUrl: iconUrl,
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
                ${point.VrstaObjekta ? `<br><strong>Object Type:</strong> ${point.VrstaObjekta}` : ''}
                ${point.SifraObjekta ? `<br><strong>Object Code:</strong> ${point.SifraObjekta}` : ''}
                ${point.NazivObjekta ? `<br><strong>Object Name:</strong> ${point.NazivObjekta}` : ''}
                ${point.Ulica ? `<br><strong>Street:</strong> ${point.Ulica}` : ''}
                ${point.KucniBroj ? `<br><strong>House Number:</strong> ${point.KucniBroj}` : ''}
                ${point.DatumAktivacije ? `<br><strong>Activation Date:</strong> ${point.DatumAktivacije}` : ''}
                ${point.ZajednickaPostuda ? `<br><strong>Shared Container:</strong> ${point.ZajednickaPostuda}` : ''}
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