/**
 * CSRF Token Manager for Staff Login
 * Provides secure token generation, storage, and validation.
 */

const CSRF_CONFIG = {
    STORAGE_KEY: 'staff_login_csrf_token',
    EXPIRY_MINUTES: 15
};

/**
 * Generates a cryptographically secure random string.
 */
function generateSecureToken(length = 32) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const randomValues = new Uint32Array(length);
    window.crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i++) {
        result += charset[randomValues[i] % charset.length];
    }
    return result;
}

/**
 * Creates and stores a new CSRF token in sessionStorage.
 */
export function refreshCsrfToken() {
    const token = generateSecureToken();
    const expiry = Date.now() + (CSRF_CONFIG.EXPIRY_MINUTES * 60 * 1000);

    const tokenData = {
        token: token,
        expiry: expiry
    };

    sessionStorage.setItem(CSRF_CONFIG.STORAGE_KEY, JSON.stringify(tokenData));

    // Update the hidden field in the form if it exists
    const tokenField = document.getElementById('csrf-token-field');
    if (tokenField) {
        tokenField.value = token;
    }

    console.log("🛡️ CSRF: Token refreshed and stored.");
    return token;
}

/**
 * Validates a provided token against the stored one.
 * @param {string} providedToken - The token to validate.
 * @returns {Object} result - { isValid: boolean, error: string|null }
 */
export function validateCsrfToken(providedToken) {
    const storedDataRaw = sessionStorage.getItem(CSRF_CONFIG.STORAGE_KEY);

    if (!storedDataRaw) {
        return { isValid: false, error: 'CSRF Token missing. Please refresh the page.' };
    }

    let storedData;
    try {
        storedData = JSON.parse(storedDataRaw);
    } catch (e) {
        return { isValid: false, error: 'Invalid token storage format.' };
    }

    // Check if token matches
    if (providedToken !== storedData.token) {
        return { isValid: false, error: 'CSRF Token mismatch. Security violation detected.' };
    }

    // Check expiration
    if (Date.now() > storedData.expiry) {
        sessionStorage.removeItem(CSRF_CONFIG.STORAGE_KEY);
        return { isValid: false, error: 'CSRF Token expired. Please try again.' };
    }

    return { isValid: true, error: null };
}

/**
 * Clears the stored CSRF token.
 */
export function clearCsrfToken() {
    sessionStorage.removeItem(CSRF_CONFIG.STORAGE_KEY);
}
