/**
 * AUTH CLIENT (Phase 1) - replaces the old client-side login in init_module.js
 * ---------------------------------------------------------------------------
 * - No passwords are read from the database. The browser sends ID + password
 *   to the `staffLogin` Cloud Function; the server verifies and returns a
 *   signed Firebase token. Roles come from that token (cannot be edited in
 *   DevTools like localStorage could).
 * - Exposes the same globals the HTML already calls:
 *     window.handleAdminLogin, window.handleStaffLogin
 */
import { app, auth } from './firebase_config.js';
import { signInWithCustomToken, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { registerPushNotifications } from './fcm_module.js';

// Must match the region you deploy to (default for v2 functions).
const functions = getFunctions(app, 'us-central1');
const callStaffLogin = httpsCallable(functions, 'staffLogin');
const callSetPassword = httpsCallable(functions, 'setStaffPassword');
const callVerifyMyPassword = httpsCallable(functions, 'verifyMyPassword');

const safeNavigate = (url) => {
    if (window.location.pathname.split('/').pop() !== url) window.location.href = url;
};

const spinner = (msg) => window.showGlobalSpinner && window.showGlobalSpinner(msg);
const unspin = () => window.hideGlobalSpinner && window.hideGlobalSpinner();

function friendlyError(err) {
    switch (err && err.code) {
        case 'functions/unauthenticated': return 'Invalid ID or password.';
        case 'functions/resource-exhausted': return err.message || 'Too many attempts. Try again later.';
        case 'functions/permission-denied': return err.message || 'Access denied.';
        case 'functions/invalid-argument': return 'Please enter both ID and password.';
        case 'functions/unavailable':
        case 'functions/deadline-exceeded': return 'Network problem. Check your connection and try again.';
        default:
            console.error('Login error:', err);
            return 'Login failed. Please try again.';
    }
}

/** Shared: call server, sign in with returned token, return profile. */
async function serverLogin(id, password) {
    const res = await callStaffLogin({ id, password });
    await signInWithCustomToken(auth, res.data.token);
    const claims = (await auth.currentUser.getIdTokenResult(true)).claims;
    window.authClaims = claims;
    window.isVerifiedAdmin = claims.admin === true;
    return res.data.profile;
}

/* ============================ ADMIN LOGIN ============================ */
window.handleAdminLogin = async (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const id = (document.getElementById('admin-mobile')?.value || '').trim();
    const pass = document.getElementById('admin-pass')?.value || '';
    if (!id || !pass) { alert('Please enter admin ID and password.'); return false; }

    const btn = e?.target?.querySelector?.('button[type="submit"]');
    if (btn) btn.disabled = true;
    spinner('Verifying admin...');
    try {
        const profile = await serverLogin(id, pass);
        if (!window.isVerifiedAdmin) {
            await signOut(auth);
            alert('This account does not have admin access.');
            return false;
        }
        sessionStorage.setItem('active_staff_user', JSON.stringify(profile));
        if (window.location.pathname.includes('admin.html')) {
            document.getElementById('view-admin-auth')?.classList.add('hidden');
            document.getElementById('view-admin-dash')?.classList.remove('hidden');
            if (window.loadAdminDashboard) window.loadAdminDashboard();
        } else {
            safeNavigate('admin.html');
        }
    } catch (err) {
        alert('❌ ' + friendlyError(err));
    } finally {
        if (btn) btn.disabled = false;
        unspin();
    }
    return false;
};

/* ============================ STAFF LOGIN ============================ */
window.handleStaffLogin = async (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const adek = (document.getElementById('s-log-adek')?.value || '').trim();
    const pass = document.getElementById('s-log-pass')?.value || '';
    if (!adek || !pass) { alert('Please enter both ID and Password.'); return false; }

    const btn = e?.target?.querySelector?.('button[type="submit"]');
    if (btn) btn.disabled = true;
    spinner('Authenticating Identity...');
    try {
        const foundUser = await serverLogin(adek, pass);
        const role = (foundUser.role || '').toLowerCase().trim();

        try { if (foundUser.mobile) registerPushNotifications(String(foundUser.mobile)); }
        catch (fcmErr) { console.warn('FCM skipped:', fcmErr); }

        localStorage.setItem('loggedStaff', JSON.stringify(foundUser));
        sessionStorage.setItem('active_staff_user', JSON.stringify(foundUser));
        localStorage.setItem('app_version', window.__APP_VERSION__ || 'v8.4');

        if (role === 'security') { safeNavigate('security.html'); return false; }
        if (role === 'admin') { safeNavigate('admin.html'); return false; }

        if (window.triggerSuccessPopup) window.triggerSuccessPopup(`Welcome, ${foundUser.name || foundUser.fullName || ''}! 👋`);
        document.getElementById('staff-auth-area')?.classList.add('hidden');
        document.getElementById('staff-login-form')?.reset();

        try {
            if (window.initUserDashboard) await window.initUserDashboard(foundUser);
            else if (window.renderDashboard) window.renderDashboard(foundUser);
        } catch (dashErr) { console.error('Dashboard init error:', dashErr); }

        setTimeout(() => {
            if (window.switchPortalView) window.switchPortalView('DASHBOARD');
            else if (window.showStaffView) window.showStaffView('staff-dashboard-container');
            else {
                const d = document.getElementById('staff-dashboard-container');
                if (d) { d.classList.remove('hidden', 'hidden-view'); d.classList.add('active-view'); d.style.display = 'block'; }
            }
            window.dispatchEvent(new Event('resize'));
        }, 300);
    } catch (err) {
        alert('❌ ' + friendlyError(err));
    } finally {
        if (btn) btn.disabled = false;
        unspin();
    }
    return false;
};

/* ============================== LOGOUT =============================== */
window.authSignOut = () => signOut(auth);

/* ============ RE-VERIFY PASSWORD (check-in / check-out modal) ========= */
window.verifyMyPassword = async (password) => {
    try {
        const res = await callVerifyMyPassword({ password });
        return res.data && res.data.ok === true;
    } catch (err) {
        alert('❌ ' + friendlyError(err));
        return false;
    }
};

/* ===================== ADMIN: SET / RESET PASSWORD ==================== */
/** Call from the admin "Add/Edit Staff" form instead of saving a password. */
window.setStaffPasswordSecure = async (staffKey, password) => {
    try {
        await callSetPassword({ staffKey, password });
        return { ok: true };
    } catch (err) {
        return { ok: false, message: friendlyError(err) };
    }
};

console.log('🔐 auth_client.js loaded (server-verified login)');
