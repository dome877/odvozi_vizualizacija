// Get API Gateway URL from auth.js config
const API_BASE_URL = window.AUTH_CONFIG ? window.AUTH_CONFIG.apiUrl : 'https://x4tnkn4ueb.execute-api.eu-north-1.amazonaws.com/dev';

// Check if user is authenticated and add token to requests
async function checkAuthState() {
    try {
        console.log('Checking authentication state...');
        
        if (!window.Auth.isAuthenticated()) {
            console.log('User not authenticated, redirecting to login');
            window.Auth.redirectToLogin();
            return false;
        }
        
        console.log('User is authenticated');
        return true;
    } catch (error) {
        console.error('Authentication check error:', error.message);
        window.Auth.redirectToLogin();
        return false;
    }
}

// Initialize the map
const map = L.map('map').setView([43.7350, 15.8952], 13);

// Add Google Satellite layer
L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    minZoom: 10,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '© Google'
}).addTo(map);

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

// Initialize a layer group to store markers
let markersLayer = L.layerGroup().addTo(map);

// Function to update Asset ID based on vehicle selection
function updateAssetId() {
    const select = document.getElementById('vehicleSelect');
    const assetIdInput = document.getElementById('assetId');
    assetIdInput.value = select.value;
}

async function searchVehicle() {
    // First check if the user is authenticated
    if (!await checkAuthState()) {
        return;
    }

    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    const rfidInput = document.getElementById('rfidInput').value.trim();
    const assetId = document.getElementById('assetId').value;

    console.log('Input values:', { dateFrom, dateTo, rfidInput, assetId });

    if (!dateFrom || !dateTo) {
        alert('Please select dates');
        return;
    }

    try {
        // Debug auth state and token
        console.log('Auth state:', window.Auth.isAuthenticated());
        
        // Get the ID token for API Gateway
        const token = window.Auth.getIdToken(); 
        console.log('ID token found:', !!token, 'length:', token ? token.length : 0);
        
        if (!token) {
            console.error('No ID token available');
            window.Auth.redirectToLogin();
            return;
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
        
        // API Gateway endpoints
        const apiUrl = `${API_BASE_URL}/getData`;
        console.log('Using API URL:', apiUrl);

        // Try with standard Bearer token format first (most common for API Gateway)
        console.log('Using standard Bearer token format');
        const response = await fetch(`${apiUrl}?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Response status:', response.status, response.statusText);

        // Handle authentication errors
        if (response.status === 401 || response.status === 403) {
            console.log('Authentication failed. Trying to refresh token...');
            try {
                await window.Auth.refreshToken();
                console.log('Token refreshed, retrying request...');
                return searchVehicle(); // Retry with fresh token
            } catch (refreshError) {
                console.error('Token refresh failed:', refreshError);
                window.Auth.redirectToLogin();
                return;
            }
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error Response:', errorText);
            throw new Error(`API request failed: ${response.status} ${response.statusText}. Details: ${errorText}`);
        }

        const data = await response.json();
        console.log('Raw response from server:', data);
        displayDataOnMap(data);

    } catch (error) {
        console.error('Request error:', error.message);
        
        if (error.message.includes('token') || error.message.includes('auth')) {
            // Handle authentication errors
            alert('Authentication error. Please log in again.');
            window.Auth.redirectToLogin();
        } else {
            alert(`Error: ${error.message}`);
        }
    }
}

// Also update the date picker initialization
flatpickr("#dateFrom", {
    enableTime: true,
    dateFormat: "Y-m-d H:i",  // Changed format
    time_24hr: true,
    defaultHour: 0,
    defaultMinute: 0
});

flatpickr("#dateTo", {
    enableTime: true,
    dateFormat: "Y-m-d H:i",  // Changed format
    time_24hr: true,
    defaultHour: 23,
    defaultMinute: 59
});

function displayDataOnMap(data) {
    // Clear existing markers
    markersLayer.clearLayers();

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
            .addTo(markersLayer);
    });

    // Draw route line if RFID filter is active
    const rfidInput = document.getElementById('rfidInput').value.trim();
    if (rfidInput && validPoints.length > 1) {
        const routePoints = validPoints.map(point => [
            parseFloat(point.latitude), 
            parseFloat(point.longitude)
        ]);
        
        L.polyline(routePoints, {
            color: '#4CAF50',
            weight: 2,
            opacity: 0.5
        }).addTo(markersLayer);
    }

    // Fit map to points
    if (validPoints.length === 1) {
        const point = validPoints[0];
        map.setView([parseFloat(point.latitude), parseFloat(point.longitude)], 18);
    } else if (validPoints.length > 1) {
        const bounds = L.latLngBounds(
            validPoints.map(point => [
                parseFloat(point.latitude), 
                parseFloat(point.longitude)
            ])
        );
        map.fitBounds(bounds);
    }

    // Log summary
    console.log(`Displayed ${validPoints.length} points on the map`);
}

function hexToDecimal(hexString) {
    // Remove any leading "0x" if present and convert to uppercase
    hexString = hexString.replace(/^0x/i, '').toUpperCase();
    // Convert hex to decimal (as a string to handle large numbers)
    return BigInt('0x' + hexString).toString();
}

function decimalToHex(decimalString) {
    // Convert decimal to hex, remove "0x" prefix and pad with zeros if needed
    return BigInt(decimalString).toString(16).toUpperCase().padStart(8, '0');
}

document.addEventListener('DOMContentLoaded', checkAuthState);
