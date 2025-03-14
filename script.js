const API_BASE_URL = 'https://gfa97tr7ff.execute-api.eu-north-1.amazonaws.com/prod/ecomobile-lambda';

// Function to toggle the converter section
function toggleConverter() {
    const content = document.getElementById('converterContent');
    const icon = document.querySelector('.toggle-icon');
    
    if (content && icon) {
        content.classList.toggle('collapsed');
        icon.classList.toggle('collapsed');
    }
}

// Function to show/hide central notification
function showCentralNotification(show, message = '', isLoading = true) {
    const notification = document.getElementById('centralNotification');
    const messageEl = notification.querySelector('.message');
    const loader = notification.querySelector('.loader');
    
    if (notification) {
        if (show) {
            if (messageEl) messageEl.textContent = message;
            if (loader) loader.style.display = isLoading ? 'block' : 'none';
            notification.classList.add('visible');
        } else {
            notification.classList.remove('visible');
        }
    }
}

// Function to update timestamp - moved to global scope
function updateTimestamp() {
    const now = new Date();
    const options = { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    };
    const timestampSpan = document.getElementById('timestamp');
    if (timestampSpan) {
        timestampSpan.textContent = now.toLocaleDateString('hr-HR', options);
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    // Get DOM elements
    const fetchBtn = document.getElementById('fetchBtn');
    const clearBtn = document.getElementById('clearBtn');
    const logoutBtn = document.getElementById('logoutBtn');
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
                    
                    const options = { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    };
                    
                    if (tokenInfo) {
                        tokenInfo.innerHTML = `
                            <p>Prijavljeni korisnik: <strong>${payload.email || payload['cognito:username'] || 'Korisnik'}</strong></p>
                            <p>Token ističe: <strong>${expiry.toLocaleDateString('hr-HR', options)}</strong></p>
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
        statusSpan.textContent = 'Spremno';
        
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

        // Make sure the Croatian locale is available or use default
        try {
            // Check if Croatian locale is available
            if (flatpickr.l10ns.hr) {
                console.log("Croatian locale loaded successfully");
            } else {
                console.warn("Croatian locale not available, using default");
            }
        } catch (error) {
            console.warn("Error checking locale:", error);
        }

        // Initialize date pickers with ISO string format
        flatpickr("#dateFrom", {
            enableTime: true,
            dateFormat: "Y-m-d H:i:00",
            time_24hr: true,
            defaultHour: 0,
            defaultMinute: 0,
            // Only use Croatian locale if available
            ...(flatpickr.l10ns.hr ? { locale: "hr" } : {}),
            confirmDate: {
                showAlways: true,
                text: "U redu"
            },
            plugins: [
                new confirmDatePlugin({
                    confirmText: "U redu",
                    confirmIcon: "",
                    showAlways: true
                })
            ]
        });

        flatpickr("#dateTo", {
            enableTime: true,
            dateFormat: "Y-m-d H:i:00",
            time_24hr: true,
            defaultHour: 23,
            defaultMinute: 59,
            // Only use Croatian locale if available
            ...(flatpickr.l10ns.hr ? { locale: "hr" } : {}),
            confirmDate: {
                showAlways: true,
                text: "U redu"
            },
            plugins: [
                new confirmDatePlugin({
                    confirmText: "U redu",
                    confirmIcon: "",
                    showAlways: true
                })
            ]
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
        
        // Initialize collapsible sections
        // Default state: converter collapsed (uncomment to start collapsed)
        // toggleConverter();
        
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
    const statusSpan = document.getElementById('status');
    
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    const rfidInput = document.getElementById('rfidInput').value.trim();
    const assetId = document.getElementById('assetId').value;
    const useBoxFilter = document.getElementById('useBoxFilter')?.checked || false;

    console.log('Input values:', { dateFrom, dateTo, rfidInput, assetId, useBoxFilter }); // Debug log

    if (!dateFrom || !dateTo) {
        alert('Molimo odaberite datume');
        return;
    }
    
    // Check if box filter is enabled but no box is drawn
    if (useBoxFilter && !window.drawnBounds) {
        alert('Molimo nacrtajte pravokutnik na karti');
        return;
    }
    
    // Verify authentication before proceeding
    const idToken = window.Auth.getIdToken();
    if (!idToken) {
        statusSpan.textContent = 'Greška autentifikacije';
        setTimeout(() => window.Auth.redirectToLogin(), 2000);
        return;
    }

    // Update UI for loading state
    fetchBtn.disabled = true;
    statusSpan.textContent = 'Dohvaćanje podataka...';
    
    // Show central loading notification
    showCentralNotification(true, 'Učitavanje podataka...', true);

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
                setTimeout(() => window.Auth.redirectToLogin(), 2000);
                throw new Error('Authentication required');
            }
            throw new Error(`Neuspješno dohvaćanje podataka: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Log data but don't display in result div
        console.log('Response headers:', response.headers);
        console.log('Raw response from server:', data);
        console.log('Response type:', typeof data);
        console.log('Response structure:', {
            isArray: Array.isArray(data),
            hasRoot: data?.root !== undefined,
            length: Array.isArray(data) ? data.length : (data?.root?.length || 0)
        });

        // Show success notification briefly
        showCentralNotification(true, 'Podaci uspješno dohvaćeni', false);
        
        // Hide notification after displaying data
        setTimeout(() => {
            showCentralNotification(false);
        }, 1500);
        
        // Update status without showing raw data
        statusSpan.textContent = 'Podaci uspješno dohvaćeni';
        
        // Update timestamp
        updateTimestamp();

        displayDataOnMap(data);

    } catch (error) {
        console.error('Error fetching data:', error);
        
        // Show error in central notification
        showCentralNotification(true, `Greška: ${error.message}`, false);
        setTimeout(() => {
            showCentralNotification(false);
        }, 3000);
        
        statusSpan.textContent = 'Greška';
    } finally {
        // Re-enable button regardless of outcome
        fetchBtn.disabled = false;
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
                <strong>Vrijeme:</strong> ${timestamp}<br>
                <strong>Vozilo:</strong> ${vehicleName}<br>
                <strong>RFID:</strong> ${rfidValue}<br>
                <strong>Lokacija:</strong> ${lat.toFixed(6)}, ${lng.toFixed(6)}
                ${point.VrstaObjekta ? `<br><strong>Vrsta objekta:</strong> ${point.VrstaObjekta}` : ''}
                ${point.SifraObjekta ? `<br><strong>Šifra objekta:</strong> ${point.SifraObjekta}` : ''}
                ${point.NazivObjekta ? `<br><strong>Naziv objekta:</strong> ${point.NazivObjekta}` : ''}
                ${point.Ulica ? `<br><strong>Ulica:</strong> ${point.Ulica}` : ''}
                ${point.KucniBroj ? `<br><strong>Kućni broj:</strong> ${point.KucniBroj}` : ''}
                ${point.DatumAktivacije ? `<br><strong>Datum aktivacije:</strong> ${point.DatumAktivacije}` : ''}
                ${point.ZajednickaPostuda ? `<br><strong>Zajednička posuda:</strong> ${point.ZajednickaPostuda}` : ''}
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
    // Use BigInt for precise conversion of large hex numbers
    return BigInt('0x' + hexString.replace(/^0x/, '')).toString();
}

function decimalToHex(decimalString) {
    if (!decimalString || isNaN(parseInt(decimalString))) return '';
    const hex = parseInt(decimalString).toString(16).toUpperCase();
    return hex.padStart(hex.length + (hex.length % 2), '0');
}