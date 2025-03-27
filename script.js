const API_BASE_URL = 'https://5m9qq9zf4h.execute-api.eu-north-1.amazonaws.com/prod';

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
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const rfidPolygonFilterCheckbox = document.getElementById('useRfidPolygonFilter');

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
        
        // Initialize export button
        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', exportToCsv);
        }
        
        // Add event listener for RFID-Polygon filter toggle
        if (rfidPolygonFilterCheckbox) {
            rfidPolygonFilterCheckbox.addEventListener('change', function() {
                // If we have data loaded, reapply the filter
                if (window.markersLayerData && window.lastFetchedData) {
                    displayDataOnMap(window.lastFetchedData);
                }
            });
        }
        
        // Show token info (just the expiry time for security)
        displayTokenInfo();
        
        // Initialize map and app functionality
        initializeApp();
    }
});

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
        
        // Initialize a layer for the GeoJSON polygons
        window.geoJsonLayer = L.geoJSON().addTo(map);
        
        // Load GeoJSON file
        loadGeoJsonPolygons(map);
        
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
    let locale = "default";
    try {
        // Check if Croatian locale is available
        if (flatpickr.l10ns && flatpickr.l10ns.hr) {
            console.log("Croatian locale loaded successfully");
            locale = "hr";
            // Ensure the confirmDate text is properly set in Croatian
            if (typeof confirmDatePlugin !== 'undefined') {
                flatpickr.l10ns.hr.confirmDatePlugin = {
                    confirmText: "U redu",
                    showAlways: true
                };
            }
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
        locale: locale !== "default" ? locale : undefined,
        plugins: [
            new confirmDatePlugin({
                confirmText: "U redu",
                confirmIcon: "",
                showAlways: true,
                theme: "light"
            })
        ]
    });

    flatpickr("#dateTo", {
        enableTime: true,
        dateFormat: "Y-m-d H:i:00",
        time_24hr: true,
        defaultHour: 23,
        defaultMinute: 59,
        locale: locale !== "default" ? locale : undefined,
        plugins: [
            new confirmDatePlugin({
                confirmText: "U redu",
                confirmIcon: "",
                showAlways: true,
                theme: "light"
            })
        ]
    });

    // Set up hex-to-decimal converter
    document.addEventListener('DOMContentLoaded', function() {
        const convertBtn = document.getElementById('convertBtn');
        const hexInput = document.getElementById('hexInput');
        const decimalOutput = document.getElementById('decimalOutput');
        
        if (convertBtn && hexInput && decimalOutput) {
            convertBtn.addEventListener('click', function() {
                decimalOutput.value = hexToDecimal(hexInput.value);
            });
            
            // Also convert on enter key in the input
            hexInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    decimalOutput.value = hexToDecimal(hexInput.value);
                }
            });
        }
    });
    
    // Set up CSV export button
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', exportToCsv);
    }
    
    // Initialize collapsible sections
    // Default state: converter collapsed (uncomment to start collapsed)
    // toggleConverter();
    
    // Update timestamp
    updateTimestamp();
}

// Function to update Asset ID based on vehicle selection
function updateAssetId() {
    const select = document.getElementById('vehicleSelect');
    const assetIdInput = document.getElementById('assetId');
    assetIdInput.value = select.value;
}

// Function to create a new job
async function createJob(params) {
    const idToken = window.Auth.getIdToken();
    if (!idToken) {
        throw new Error('Authentication required');
    }

    console.log('Sending job creation request with params:', params);
    const requestBody = params.queryParams ? params : { queryParams: params };


    const response = await fetch(`${API_BASE_URL}/jobs`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            setTimeout(() => window.Auth.redirectToLogin(), 2000);
            throw new Error('Authentication required');
        }
        const errorText = await response.text();
        throw new Error(`Failed to create job: ${errorText}`);
    }

    return await response.json();
}

// Function to check job status
async function checkJobStatus(jobId) {
    const idToken = window.Auth.getIdToken();
    if (!idToken) {
        throw new Error('Authentication required');
    }

    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
        }
    });

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            setTimeout(() => window.Auth.redirectToLogin(), 2000);
            throw new Error('Authentication required');
        }
        const errorText = await response.text();
        throw new Error(`Failed to check job status: ${errorText}`);
    }

    return await response.json();
}

// Function to retrieve job results
async function getJobResults(jobId) {
    const idToken = window.Auth.getIdToken();
    if (!idToken) {
        throw new Error('Authentication required');
    }

    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/result`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
        }
    });

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            setTimeout(() => window.Auth.redirectToLogin(), 2000);
            throw new Error('Authentication required');
        }
        const errorText = await response.text();
        throw new Error(`Failed to retrieve job results: ${errorText}`);
    }

    return await response.json();
}

// Main function to handle the search process
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
    statusSpan.textContent = 'Kreiranje zadatka...';
    
    // Show central loading notification
    showCentralNotification(true, 'Kreiranje zadatka...', true);

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

        // Prepare params for job creation
        const params = {
            dateFrom: formatDate(dateFrom),
            dateTo: formatDate(dateTo),
            filterByBox: useBoxFilter ? 'true' : 'false'
        };

        if (assetId) {
            params.assetId = assetId;
        }

        if (rfidInput) {
            params.RFID = rfidInput;
        }
        
        // Add box filter parameters if enabled
        if (useBoxFilter && window.drawnBounds) {
            const bounds = window.drawnBounds;
            params.minLat = bounds.getSouth().toFixed(7);
            params.maxLat = bounds.getNorth().toFixed(7);
            params.minLng = bounds.getWest().toFixed(7);
            params.maxLng = bounds.getEast().toFixed(7);
            console.log('Adding box filter:', {
                minLat: bounds.getSouth().toFixed(7),
                maxLat: bounds.getNorth().toFixed(7),
                minLng: bounds.getWest().toFixed(7),
                maxLng: bounds.getEast().toFixed(7)
            });
        }

        console.log('Creating job with params:', params);

        // Step 1: Create a new job
        const jobData = await createJob(params);
        const jobId = jobData.jobId;
        
        console.log('Job created:', jobData);
        statusSpan.textContent = `Zadatak kreiran (ID: ${jobId}). Provjera statusa...`;
        showCentralNotification(true, `Zadatak kreiran (ID: ${jobId}). Provjera statusa...`, true);

        // Step 2: Poll for job status until completion or failure
        let status = 'PENDING';
        let maxAttempts = 30; // Maximum number of polling attempts
        let pollInterval = 5000; // Polling interval in milliseconds (5 seconds)

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // Wait for the polling interval before checking again
            if (attempt > 0) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            }
            
            const statusData = await checkJobStatus(jobId);
            status = statusData.status;
            
            console.log(`Job status (attempt ${attempt + 1}/${maxAttempts}):`, statusData);
            statusSpan.textContent = `Status zadatka: ${status} (Pokušaj ${attempt + 1}/${maxAttempts})`;
            showCentralNotification(true, `Status zadatka: ${status} (Pokušaj ${attempt + 1}/${maxAttempts})`, true);
            
            if (status === 'COMPLETED') {
                console.log('Job completed successfully!');
                break;
            } else if (status === 'FAILED') {
                throw new Error(`Job failed: ${statusData.error || 'Unknown error'}`);
            }
        }
        
        if (status !== 'COMPLETED') {
            throw new Error('Job did not complete within the timeout period.');
        }

        // Step 3: Get job results
        console.log('Retrieving job results...');
        statusSpan.textContent = 'Dohvaćanje rezultata...';
        showCentralNotification(true, 'Dohvaćanje rezultata...', true);
        
        const resultData = await getJobResults(jobId);
        
        // Log data but don't display in result div
        console.log('Raw response from server:', resultData);
        console.log('Response type:', typeof resultData);
        console.log('Response structure:', {
            isArray: Array.isArray(resultData),
            hasRoot: resultData?.root !== undefined,
            length: Array.isArray(resultData) ? resultData.length : (resultData?.root?.length || 0)
        });

        // Store the fetched data for potential refiltering
        window.lastFetchedData = resultData;

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

        // Display the results on the map
        displayDataOnMap(resultData);

    } catch (error) {
        console.error('Error in search process:', error);
        
        // Show error in central notification
        showCentralNotification(true, `Greška: ${error.message}`, false);
        setTimeout(() => {
            showCentralNotification(false);
        }, 3000);
        
        statusSpan.textContent = `Greška: ${error.message}`;
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

    // Clear existing list
    const listContainer = document.getElementById('pickupList');
    if (listContainer) {
        listContainer.innerHTML = '';
    } else {
        // Create list container if it doesn't exist
        createPickupListContainer();
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

    // Filter out red pickups inside corresponding vehicle polygons
    const filteredPoints = validPoints.filter(point => {
        const lat = parseFloat(point.latitude);
        const lng = parseFloat(point.longitude);
        const vehicleName = point.deviceName || '';
        const hasValidRfid = point.rfid_value && point.rfid_value !== '-';
        
        // Keep points with valid RFID
        if (hasValidRfid) {
            return true;
        }
        
        // Check if the filter is enabled
        const useRfidPolygonFilter = document.getElementById('useRfidPolygonFilter')?.checked || false;
        if (!useRfidPolygonFilter) {
            return true; // Keep all points if filter is disabled
        }
        
        // If it's a red marker (no valid RFID), check if it's inside a polygon
        // for the same vehicle and filter it out if so
        if (window.vehiclePolygons && window.vehiclePolygons[vehicleName]) {
            const polygons = window.vehiclePolygons[vehicleName];
            const latLng = L.latLng(lat, lng);
            
            // Check if the point is inside any polygon for this vehicle
            for (const polygon of polygons) {
                if (isPointInPolygon(latLng, polygon)) {
                    console.log(`Filtered out pickup without RFID for ${vehicleName} at [${lat}, ${lng}]`);
                    return false;
                }
            }
        }
        
        // Keep the point if it's not inside a polygon
        return true;
    });
    
    // Log the filtering results
    console.log(`Filtered out ${validPoints.length - filteredPoints.length} red pickups inside vehicle polygons`);
    
    // Store the filtered points in a global variable for export
    window.markersLayerData = filteredPoints;

    // Set total count in list header
    const listHeader = document.getElementById('pickupListHeader');
    if (listHeader) {
        listHeader.textContent = `Odvozi (${filteredPoints.length})`;
    }

    // Sort points by dateTime (newest first)
    const sortedPoints = [...filteredPoints].sort((a, b) => {
        return new Date(b.dateTime) - new Date(a.dateTime);
    });

    // Process filtered points
    sortedPoints.forEach((point, index) => {
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
        let iconColor;
        if (!hasValidRfid) {
            iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png';
            iconColor = 'red';
        } else if (!hasObjectInfo) {
            iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-yellow.png';
            iconColor = 'yellow';
        } else {
            iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png';
            iconColor = 'green';
        }

        const icon = L.icon({
            iconUrl: iconUrl,
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
            iconSize: [15, 24],
            iconAnchor: [7, 24],
            popupAnchor: [1, -24],
            shadowSize: [24, 24]
        });

        // Create popup content
        const popupContent = `
            <strong>Vrijeme:</strong> ${timestamp}<br>
            <strong>Vozilo:</strong> ${vehicleName}<br>
            <strong>RFID:</strong> ${rfidValue}<br>
            <strong>Lokacija:</strong> ${lat.toFixed(6)}, ${lng.toFixed(6)}
            ${point.VrstaObjekta ? `<br><strong>Vrsta objekta:</strong> ${point.VrstaObjekta}` : ''}
            ${point.VrstaPosude ? `<br><strong>Vrsta posude:</strong> ${point.VrstaPosude}` : ''}
            ${point.SifraObjekta ? `<br><strong>Šifra objekta:</strong> ${point.SifraObjekta}` : ''}
            ${point.NazivObjekta ? `<br><strong>Naziv objekta:</strong> ${point.NazivObjekta}` : ''}
            ${point.Ulica ? `<br><strong>Ulica:</strong> ${point.Ulica}` : ''}
            ${point.KucniBroj ? `<br><strong>Kućni broj:</strong> ${point.KucniBroj}` : ''}
            ${point.DatumAktivacije ? `<br><strong>Datum aktivacije:</strong> ${point.DatumAktivacije}` : ''}
            ${point.ZajednickaPostuda ? `<br><strong>Zajednička posuda:</strong> ${point.ZajednickaPostuda}` : ''}
        `;

        // Add marker with popup
        const marker = L.marker([lat, lng], { icon })
            .bindPopup(popupContent)
            .addTo(window.markersLayer);

        // Add to list view
        addPointToList(point, index, iconColor, marker);
    });

    // Draw route line if RFID filter is active
    const rfidInput = document.getElementById('rfidInput').value.trim();
    if (rfidInput && filteredPoints.length > 1) {
        const routePoints = filteredPoints.map(point => [
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

// Function to create the pickup list container
function createPickupListContainer() {
    // Create parent container if not exists
    if (!document.getElementById('pickupListContainer')) {
        const container = document.createElement('div');
        container.id = 'pickupListContainer';
        container.className = 'pickup-list-container';
        
        // Create header with count
        const header = document.createElement('div');
        header.id = 'pickupListHeader';
        header.className = 'pickup-list-header';
        header.textContent = 'Locations';
        
        // Create list element
        const list = document.createElement('div');
        list.id = 'pickupList';
        list.className = 'pickup-list';
        
        // Append to container
        container.appendChild(header);
        container.appendChild(list);
        
        // Get the map container's parent and insert the list container after it
        const appContainer = document.querySelector('.app-container') || document.body;
        appContainer.appendChild(container);
        
        // Add styles
        addPickupListStyles();
    }
}

// Function to add a point to the list
function addPointToList(point, index, iconColor, marker) {
    const list = document.getElementById('pickupList');
    if (!list) return;
    
    const date = new Date(point.dateTime);
    const timeStr = date.toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = date.toLocaleDateString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    
    // Create list item
    const item = document.createElement('div');
    item.className = 'pickup-item';
    item.setAttribute('data-index', index);
    
    // Super minimalistic content - just color indicator and timestamp
    let itemContent = `
        <div class="pickup-item-color ${iconColor}"></div>
        <div class="pickup-item-time">${timeStr}, ${dateStr}</div>
    `;
    
    // Add tooltip with full info for hover
    const tooltipContent = `
        ${point.deviceName || 'Unknown vehicle'}<br>
        ${point.rfid_value && point.rfid_value !== '-' ? point.rfid_value : 'No RFID'}<br>
        ${point.NazivObjekta || point.Ulica || ''}
    `;
    
    item.innerHTML = itemContent;
    item.title = tooltipContent.replace(/<br>/g, ' - ').trim();
    
    // Add click event to center on map
    item.addEventListener('click', () => {
        if (window.map && marker) {
            window.map.setView(marker.getLatLng(), 18);
            marker.openPopup();
            
            // Highlight the selected item
            document.querySelectorAll('.pickup-item').forEach(el => {
                el.classList.remove('selected');
            });
            item.classList.add('selected');
        }
    });
    
    list.appendChild(item);
}

// Function to add styles for the pickup list
function addPickupListStyles() {
    if (!document.getElementById('pickupListStyles')) {
        const style = document.createElement('style');
        style.id = 'pickupListStyles';
        style.innerHTML = `
            .pickup-list-container {
                position: absolute;
                top: 10px;
                right: 10px;
                width: 180px;
                max-height: calc(100vh - 20px);
                background: white;
                border-radius: 4px;
                box-shadow: 0 1px 5px rgba(0,0,0,0.2);
                z-index: 1000;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            
            .pickup-list-header {
                padding: 6px 10px;
                font-weight: bold;
                background: #f8f8f8;
                border-bottom: 1px solid #eee;
                font-size: 13px;
                text-align: center;
            }
            
            .pickup-list {
                overflow-y: auto;
                max-height: calc(100vh - 60px);
                padding: 0;
            }
            
            .pickup-item {
                padding: 4px 8px;
                border-bottom: 1px solid #eee;
                font-size: 11px;
                cursor: pointer;
                display: flex;
                align-items: center;
            }
            
            .pickup-item:hover {
                background: #f5f5f5;
            }
            
            .pickup-item.selected {
                background: #e1f5fe;
            }
            
            .pickup-item-color {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                margin-right: 6px;
                flex-shrink: 0;
            }
            
            .pickup-item-color.red {
                background: #f44336;
            }
            
            .pickup-item-color.yellow {
                background: #ffc107;
            }
            
            .pickup-item-color.green {
                background: #4caf50;
            }
            
            .pickup-item-time {
                font-weight: bold;
                width: 100%;
                text-align: left;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            
            @media (max-width: 768px) {
                .pickup-list-container {
                    position: fixed;
                    top: auto;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    width: 100%;
                    max-height: 150px;
                }
                
                .pickup-list {
                    max-height: 120px;
                }
            }
        `;
        document.head.appendChild(style);
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

// Function to export data to CSV
function exportToCsv() {
    // Get the data from the pickup list
    const data = [];
    const validPoints = window.markersLayerData || [];
    
    if (!validPoints || validPoints.length === 0) {
        alert('No data available to export.');
        return;
    }
    
    // Prepare CSV header
    const headers = [
        'Vrijeme', 'Vozilo', 'RFID', 'Latitude', 'Longitude', 
        'Vrsta objekta', 'Vrsta posude', 'Šifra objekta', 
        'Naziv objekta', 'Ulica', 'Kućni broj', 
        'Datum aktivacije', 'Zajednička posuda'
    ];
    
    // Add header row
    data.push(headers.join(','));
    
    // Add data rows
    validPoints.forEach(point => {
        const row = [
            point.dateTime || '',
            (point.deviceName || 'Unknown vehicle').replace(/,/g, ';'),
            (point.rfid_value || 'No RFID').replace(/,/g, ';'),
            point.latitude || '',
            point.longitude || '',
            (point.VrstaObjekta || '').replace(/,/g, ';'),
            (point.VrstaPosude || '').replace(/,/g, ';'),
            (point.SifraObjekta || '').replace(/,/g, ';'),
            (point.NazivObjekta || '').replace(/,/g, ';'),
            (point.Ulica || '').replace(/,/g, ';'),
            (point.KucniBroj || '').replace(/,/g, ';'),
            (point.DatumAktivacije || '').replace(/,/g, ';'),
            (point.ZajednickaPostuda || '').replace(/,/g, ';')
        ];
        
        data.push(row.join(','));
    });
    
    // Create CSV file
    const csvContent = data.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.setAttribute('href', url);
    link.setAttribute('download', `odvozi-podaci-${timestamp}.csv`);
    link.style.visibility = 'hidden';
    
    // Append to the document, click, and remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Function to load GeoJSON polygons
function loadGeoJsonPolygons(map) {
    // Store vehicle polygons for filtering
    window.vehiclePolygons = {};
    
    // Fetch the GeoJSON file
    fetch('map.geojson')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load GeoJSON file');
            }
            return response.json();
        })
        .then(data => {
            // Process the GeoJSON data
            if (data && data.features) {
                // Add each feature to the map
                window.geoJsonLayer = L.geoJSON(data, {
                    style: {
                        color: '#3388ff',
                        weight: 2,
                        fillOpacity: 0.1,
                        fillColor: '#3388ff'
                    },
                    onEachFeature: (feature, layer) => {
                        // Store the polygon by vehicle name for filtering
                        if (feature.properties && feature.properties.Vozilo) {
                            const vehicleName = feature.properties.Vozilo;
                            
                            // Store the layer for later use
                            if (!window.vehiclePolygons[vehicleName]) {
                                window.vehiclePolygons[vehicleName] = [];
                            }
                            
                            window.vehiclePolygons[vehicleName].push(layer);
                            
                            // Add a popup to show the vehicle name
                            layer.bindPopup(`<strong>Vozilo:</strong> ${vehicleName}`);
                        }
                    }
                }).addTo(map);
                
                console.log('Loaded GeoJSON polygons:', Object.keys(window.vehiclePolygons));
            }
        })
        .catch(error => {
            console.error('Error loading GeoJSON file:', error);
        });
}

// Function to check if a point is inside a polygon
function isPointInPolygon(latLng, polygon) {
    // For GeoJSON polygons stored by Leaflet
    if (polygon.feature && polygon.feature.geometry.type === 'Polygon') {
        try {
            return polygon.contains(latLng);
        } catch (error) {
            console.error('Error checking if point is in polygon:', error);
            return false;
        }
    }
    
    // For circles (which might also be in the GeoJSON)
    if (polygon.getRadius) {
        const center = polygon.getLatLng();
        const radius = polygon.getRadius();
        const distance = center.distanceTo(latLng);
        return distance <= radius;
    }
    
    return false;
}