// Production auth.js for GitHub Pages with AWS Lambda token exchange

// Configuration
const CONFIG = {
  cognitoUrl: 'https://eu-north-1bad4kil2h.auth.eu-north-1.amazoncognito.com/',
  clientId: '1ue5ecudvmsaoa86g9ndfrt09p',
  redirectUri: window.location.origin + window.location.pathname,
  tokenExchangeUrl: 'https://x4tnkn4ueb.execute-api.eu-north-1.amazonaws.com/dev/token-exchange', // Update with your API Gateway URL
  scope: 'email openid phone'
};

// Make config accessible to other scripts
window.AUTH_CONFIG = CONFIG;

// Track if we've already processed the code
let authCodeProcessed = false;

// Check if user is authenticated
function isAuthenticated() {
  return !!getIdToken() && !isTokenExpired();
}

// Check if token is expired
function isTokenExpired() {
  const expiration = localStorage.getItem('tokenExpiration');
  if (!expiration) return true;
  return new Date().getTime() > parseInt(expiration);
}

// Securely get ID token
function getIdToken() {
  return localStorage.getItem('idToken');
}

// Securely get access token
function getAccessToken() {
  return localStorage.getItem('accessToken');
}

// Get refresh token
function getRefreshToken() {
  return localStorage.getItem('refreshToken');
}

// Store tokens securely
function storeTokens(idToken, accessToken, refreshToken, expiresIn = 3600) {
  localStorage.setItem('idToken', idToken);
  localStorage.setItem('accessToken', accessToken);
  if (refreshToken) {
    localStorage.setItem('refreshToken', refreshToken);
  }
  const expirationTime = new Date().getTime() + (expiresIn * 1000);
  localStorage.setItem('tokenExpiration', expirationTime.toString());
}

// Clear tokens
function clearTokens() {
  localStorage.removeItem('idToken');
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('tokenExpiration');
}

// Redirect to Cognito login
function redirectToLogin() {
  const loginUrl = `${CONFIG.cognitoUrl}/login?client_id=${CONFIG.clientId}&response_type=code&scope=${CONFIG.scope}&redirect_uri=${encodeURIComponent(CONFIG.redirectUri)}`;
  window.location.href = loginUrl;
}

// Logout user
function logout() {
  clearTokens();
  const logoutUrl = `${CONFIG.cognitoUrl}/logout?client_id=${CONFIG.clientId}&logout_uri=${encodeURIComponent(CONFIG.redirectUri)}`;
  window.location.href = logoutUrl;
}

// Track token exchange state in sessionStorage (persists across page navigations)
function isExchangingTokens() {
  return sessionStorage.getItem('exchangingTokens') === 'true';
}

function setExchangingTokens(value) {
  if (value) {
    sessionStorage.setItem('exchangingTokens', 'true');
  } else {
    sessionStorage.removeItem('exchangingTokens');
  }
}

// Update your handleAuthenticationRedirect function
function handleAuthenticationRedirect() {
  const urlParams = new URLSearchParams(window.location.search);
  const authorizationCode = urlParams.get('code');

  console.log('AUTH.JS: URL parameters check running');
  console.log('URL parameters:', Object.fromEntries(urlParams));
  
  // Don't process if already processing
  if (isExchangingTokens()) {
    console.log('Token exchange already in progress');
    return;
  }
  
  if (authorizationCode) {
    console.log('Found authorization code - calling exchangeCodeForTokens');
    exchangeCodeForTokens(authorizationCode);
  } else {
    console.log('No authorization code found in URL');
  }
}

// Use sessionStorage instead of an in-memory variable to track auth state
async function exchangeCodeForTokens(authorizationCode) {
  try {
    console.log('Exchanging authorization code for tokens...');
    
    // Mark that we're in the exchange process
    setExchangingTokens(true);
    
    const response = await fetch(CONFIG.tokenExchangeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: authorizationCode
      })
    });
    
    console.log('Token exchange response status:', response.status);
    const data = await response.json();
    
    if (response.ok) {
      console.log('Token exchange successful');
      storeTokens(
        data.idToken, 
        data.accessToken, 
        data.refreshToken, 
        data.expiresIn
      );
      
      // Exchange complete - remove URL parameters and flag
      window.history.replaceState({}, document.title, window.location.pathname);
      setExchangingTokens(false);
      
      // Force reload the page for a clean state
      window.location.reload();
      return true;
    } else {
      console.error('Token exchange failed:', data.error, data.details);
      setExchangingTokens(false);
      return false;
    }
  } catch (error) {
    console.error('Token exchange error:', error);
    setExchangingTokens(false);
    return false;
  }
}


// Initialize authentication
async function initAuth() {
  const appDiv = document.getElementById('app');
  const loadingDiv = document.getElementById('loading');
  
  try {
    // Check if we're in the middle of exchanging tokens
    if (isExchangingTokens()) {
      console.log('Token exchange in progress, waiting...');
      if (appDiv) appDiv.style.display = 'none';
      if (loadingDiv) {
        loadingDiv.style.display = 'block';
        loadingDiv.innerHTML = '<p>Completing authentication...</p>';
      }
      return false;
    }
    
    // Check if there's a code in the URL that needs processing
    const urlParams = new URLSearchParams(window.location.search);
    const authCode = urlParams.get('code');
    
    if (authCode) {
      console.log('Found auth code, processing...');
      if (appDiv) appDiv.style.display = 'none';
      if (loadingDiv) loadingDiv.style.display = 'block';
      handleAuthenticationRedirect();
      return false;
    }
    
    // Normal auth check when no code is present
    if (isAuthenticated()) {
      if (appDiv) appDiv.style.display = 'block';
      if (loadingDiv) loadingDiv.style.display = 'none';
      return true;
    }
    
    // Only redirect if not authenticated AND not in token exchange
    console.log('Not authenticated, redirecting to login');
    redirectToLogin();
    return false;
  } catch (error) {
    console.error('Authentication error:', error);
    if (loadingDiv) {
      loadingDiv.innerHTML = `
        <div class="error-message">
          <h3>Authentication Error</h3>
          <p>${error.message}</p>
          <button onclick="window.Auth.redirectToLogin()">Try Again</button>
        </div>
      `;
    }
    return false;
  }
}

// Auto refresh the token before it expires
function setupTokenRefresh() {
  const expiration = localStorage.getItem('tokenExpiration');
  if (!expiration) return;
  
  const expirationTime = parseInt(expiration);
  const now = new Date().getTime();
  const timeUntilExpiry = expirationTime - now;
  
  // If token expires in less than 5 minutes, refresh it now
  if (timeUntilExpiry < 300000) {
    refreshToken();
    return;
  }
  
  // Otherwise, set timeout to refresh 5 minutes before expiry
  const refreshTime = timeUntilExpiry - 300000;
  setTimeout(refreshToken, refreshTime);
}

// Refresh the token using the refresh token
async function refreshToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    redirectToLogin();
    return;
  }
  
  try {
    // This would be another endpoint in your Lambda
    // For now, just redirect to login if token is expired
    redirectToLogin();
  } catch (error) {
    console.error('Token refresh error:', error);
    redirectToLogin();
  }
}

function debugTokens() {
  console.log("===== Auth Debug Information =====");
  console.log("Is Authenticated:", isAuthenticated());
  console.log("Is Token Expired:", isTokenExpired());
  
  // Check token expiration
  const expiration = localStorage.getItem('tokenExpiration');
  if (expiration) {
    const expirationTime = new Date(parseInt(expiration));
    const now = new Date();
    const timeUntilExpiry = expirationTime - now;
    console.log(`Token expires at: ${expirationTime.toLocaleString()}`);
    console.log(`Time until expiry: ${Math.floor(timeUntilExpiry / 60000)} minutes`);
  } else {
    console.log("No token expiration found");
  }
  
  // Check localStorage 
  const idToken = getIdToken();
  const accessToken = getAccessToken();
  const refreshToken = getRefreshToken();
  
  console.log("ID Token exists:", !!idToken);
  if (idToken) console.log("ID Token preview:", idToken.substring(0, 15) + "..." + idToken.substring(idToken.length - 10));
  
  console.log("Access Token exists:", !!accessToken);
  if (accessToken) console.log("Access Token preview:", accessToken.substring(0, 15) + "..." + accessToken.substring(accessToken.length - 10));
  
  console.log("Refresh Token exists:", !!refreshToken);
  if (refreshToken) console.log("Refresh Token preview:", refreshToken.substring(0, 15) + "..." + refreshToken.substring(refreshToken.length - 10));
  
  // Display in an alert for easy viewing
  alert(`Auth Debug:
- Authenticated: ${isAuthenticated()}
- Token Expired: ${isTokenExpired()}
- ID Token: ${idToken ? "Present" : "Missing"}
- Access Token: ${accessToken ? "Present" : "Missing"}
- Refresh Token: ${refreshToken ? "Present" : "Missing"}
(See console for full details)`);
}

// Only run once when the page loads
document.addEventListener('DOMContentLoaded', handleAuthenticationRedirect);

// Export functions to window object
window.Auth = {
  initAuth,
  isAuthenticated,
  getIdToken,
  getAccessToken,
  getRefreshToken,
  logout,
  redirectToLogin,
  debugTokens,
  refreshToken,
  setupTokenRefresh,
  isTokenExpired
};