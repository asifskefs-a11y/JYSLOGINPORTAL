import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, set, get, child } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { registerPushNotifications } from './fcm_module.js';

console.log("📦 init_module.js: Starting to load...");

// --- SAFE NAVIGATION UTILITY ---
function safeNavigate(targetUrl) {
    const currentPath = window.location.pathname.split('/').pop();
    if (currentPath !== targetUrl) {
        window.location.href = targetUrl;
    }
}

// ================================================================ */
// GLOBAL LOGIN HANDLERS (Buffer-Safe & Prevent Default)            */
// ================================================================ */

/**
 * ADMIN LOGIN HANDLER
 */
window.handleAdminLogin = (e) => {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    console.log("🔑 Admin Login: Form Submitted");

    const userEl = document.getElementById('admin-mobile');
    const passEl = document.getElementById('admin-pass');

    if (!userEl || !passEl) {
        console.error("❌ Admin Login: Missing input fields in DOM");
        alert("System Error: Login fields not found.");
        return false;
    }

    const user = userEl.value.toLowerCase().trim();
    const pass = passEl.value.trim();

    console.log("🔑 Admin Login: Validating for user:", user);

    // HARDCODED ADMIN CREDENTIALS
    if ((user === 'admin' || user === '961486864461') && pass === '1234') {
        window.showGlobalSpinner("Unlocking Admin Hub...");
        console.log("✅ Admin Login: Success");
        localStorage.setItem('isAdminLoggedIn', 'true');

        setTimeout(() => {
            if (window.location.pathname.includes('admin.html')) {
                console.log("🔓 Admin Login: Updating UI sections on current page");
                const authSec = document.getElementById('view-admin-auth');
                const dashSec = document.getElementById('view-admin-dash');
                if (authSec) authSec.classList.add('hidden');
                if (dashSec) dashSec.classList.remove('hidden');
                if (window.loadAdminDashboard) {
                    window.loadAdminDashboard();
                } else {
                    console.warn("⚠️ Admin Login: loadAdminDashboard not found, no refresh.");
                }
            } else {
                console.log("🔓 Admin Login: Redirecting to admin.html");
                safeNavigate('admin.html');
            }
            window.hideGlobalSpinner();
        }, 800);
    } else {
        console.warn("❌ Admin Login: Invalid Credentials entered");
        alert("❌ Invalid Admin Credentials. Please use 'admin' and '1234'.");
    }
    return false;
};

/**
 * STAFF LOGIN HANDLER
 */
window.handleStaffLogin = async (e) => {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    console.log("🛡️ Staff Login: Form Submitted");

    const adekEl = document.getElementById('s-log-adek');
    const passEl = document.getElementById('s-log-pass');
    const btn = e?.target?.querySelector('button[type="submit"]');

    if (!adekEl || !passEl) {
        console.error("❌ Staff Login: Missing inputs in DOM");
        return false;
    }

    const adek = adekEl.value.trim();
    const pass = passEl.value.trim();

    if (!adek || !pass) {
        alert("Please enter both ID and Password.");
        return false;
    }

    if (btn) btn.disabled = true;
    window.showGlobalSpinner("Authenticating Identity...");

    try {
        console.log("🛡️ Staff Login: Fetching staff data from Firebase...");
        const snap = await get(ref(db, 'staff'));

        if (snap.exists()) {
            const val = snap.val();
            const allStaff = Array.isArray(val) ? val.filter(x => x) : Object.values(val);
            let foundUser = null;

            console.log("🛡️ Staff Login: Comparing against", allStaff.length, "staff records");

            for (const u of allStaff) {
                if (!u) continue;
                const adekCheck = (u.adekPass || u.adcPassNumber || u.username || u.mobile || "").toString().toLowerCase().trim();
                const inputAdek = adek.toLowerCase();

                if (adekCheck === inputAdek && u.password === pass) {
                    foundUser = u;
                    break;
                }
            }

            if (foundUser) {
                console.log("✅ Staff Login: Authentication Successful for", foundUser.name);

                // Register FCM after login
                registerPushNotifications(foundUser.mobile);

                if ((foundUser.role || "").toLowerCase().trim() === 'admin') {
                    console.log("🔓 Staff Login: Admin role detected, redirecting...");
                    localStorage.setItem('isAdminLoggedIn', 'true');
                    safeNavigate('admin.html');
                    return false;
                }

                localStorage.setItem('loggedStaff', JSON.stringify(foundUser));
                console.log("💾 Staff Login: Session stored in localStorage");

                if (window.triggerSuccessPopup) {
                    window.triggerSuccessPopup(`Welcome, ${foundUser.name}! 👋`);
                }

                // REDIRECT ALL STAFF ROLES TO DASHBOARD (FIX)
                if (window.showStaffView) {
                    window.showStaffView('staff-dash-area');
                }

                if (window.renderDashboard) {
                    console.log("🛡️ Staff Login: Transitioning to Dashboard View");
                    window.renderDashboard(foundUser);
                } else {
                    console.log("🛡️ Staff Login: renderDashboard not found, manual check required.");
                }
            } else {
                console.warn("❌ Staff Login: No matching credentials found");
                alert("❌ Invalid Credentials. Please check your Pass Number and Password.");
            }
        } else {
            console.error("❌ Staff Login: Firebase 'staff' node is empty");
            alert("❌ Staff database is empty. Please contact administrator.");
        }
    } catch (err) {
        console.error("❌ Staff Login: Unexpected Error:", err);
        alert("❌ Login Error: " + err.message);
    } finally {
        if (btn) btn.disabled = false;
        window.hideGlobalSpinner();
    }
    return false;
};

/**
 * VISITOR / CONTRACTOR SIGN-IN HANDLER
 */
window.handleVisitorSignIn = async (e) => {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const mode = window.portalMode || 'visitor';
    console.log(`🏢 ${mode.toUpperCase()} Sign-In: Form Submitted`);

    const btn = e?.target?.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    window.showGlobalSpinner("Saving Entry Record...");

    try {
        const canvasId = 'v-sig-pad';
        if (window.isCanvasBlank && window.isCanvasBlank(canvasId)) {
            throw new Error("Please provide signature before proceeding.");
        }

        const sigBase64 = window.getCanvasBase64 ? window.getCanvasBase64(canvasId) : null;
        if (!sigBase64 || sigBase64.length < 1000) {
            throw new Error("Please provide signature before proceeding.");
        }

        console.log(`🏢 ${mode.toUpperCase()} Sign-In: Processing signature...`);

        const securityPin = (document.getElementById('v-key-status')?.value === 'YES')
            ? Math.floor(1000 + Math.random() * 9000).toString()
            : null;

        const data = {
            id: document.getElementById('v-id').value,
            name: document.getElementById('v-name').value,
            mobile: document.getElementById('v-mobile').value,
            company: document.getElementById('v-company').value,
            purpose: document.getElementById('v-purpose').value,
            keyCollected: document.getElementById('v-key-status')?.value || 'NO',
            keyReturnPin: securityPin, // 4-Digit Security PIN
            checkoutPin: securityPin,  // Secondary key for validation safety
            date: new Date().toLocaleDateString('en-US'),
            timeIn: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true}),
            timestamp: Date.now(),
            status: "active",
            signatureUrl: sigBase64, // Base64 Data URL
            type: mode
        };

        if (mode === 'contractor') {
            data.contractorId = document.getElementById('contractorId').value;
        }

        const dbPath = mode === 'contractor' ? 'contractor_logs/' : 'visitor_logs/';
        console.log(`🏢 ${mode.toUpperCase()} Sign-In: Saving to Firebase Database [${dbPath}]`);
        await set(ref(db, dbPath + data.id), data);

        // Increment the persistent counter
        const counterPath = mode === 'contractor' ? 'counters/contractors' : 'counters/visitors';
        if (window.currentSequenceCount) {
            await set(ref(db, counterPath), window.currentSequenceCount);
        }

        localStorage.setItem('vActive', JSON.stringify({id: data.id, name: data.name, timeIn: data.timeIn, keyCollected: data.keyCollected, mode: mode}));

        window.showWhatsAppToast(`🚪 New ${mode === 'contractor' ? 'Contractor' : 'Visitor'} Entry`, `${data.name} has checked in.`);

        if (window.triggerSuccessPopup) window.triggerSuccessPopup("Sign-In Successful! 🏢");
        if (window.checkVisitorSession) window.checkVisitorSession();

    } catch (error) {
        console.error(`❌ ${mode.toUpperCase()} Sign-In: Error:`, error);
        alert("Sign-In Error: " + error.message);
    } finally {
        if (btn) btn.disabled = false;
        window.hideGlobalSpinner();
    }
    return false;
};

// ================================================================ */
// INITIALIZATION & AUTO-ROUTING                                    */
// ================================================================ */

document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 SchoolLog Init: DOMContentLoaded triggered");
    const path = window.location.pathname;

    try {
        const isAdmin = localStorage.getItem('isAdminLoggedIn') === 'true';
        const loggedStaff = localStorage.getItem('loggedStaff');

        console.log("🚀 SchoolLog Init: Current Path:", path);
        console.log("🚀 SchoolLog Init: Auth State - Admin:", isAdmin, "| Staff:", !!loggedStaff);

        // --- 1. ADMIN PAGE ROUTING ---
        if (path.includes('admin.html')) {
            const authSec = document.getElementById('view-admin-auth');
            const dashSec = document.getElementById('view-admin-dash');

            if (isAdmin) {
                console.log("🔓 Admin: Showing Dashboard Section");
                if (authSec) authSec.classList.add('hidden');
                if (dashSec) dashSec.classList.remove('hidden');

                if (window.loadAdminDashboard) {
                    window.loadAdminDashboard();
                } else {
                    console.log("⏳ Admin: Waiting for admin_module.js...");
                    setTimeout(() => { if (window.loadAdminDashboard) window.loadAdminDashboard(); }, 1000);
                }
            } else {
                console.log("🔒 Admin: Showing Auth Section");
                if (authSec) authSec.classList.remove('hidden');
                if (dashSec) dashSec.classList.add('hidden');
            }
        }

        // --- 2. STAFF PAGE ROUTING ---
        if (path.includes('staff-login.html')) {
            if (loggedStaff) {
                console.log("🛡️ Staff: Active session found, rendering dashboard...");
                try {
                    const staffData = JSON.parse(loggedStaff);
                    if (window.renderDashboard) {
                        window.renderDashboard(staffData);
                    } else {
                        console.log("⏳ Staff: Waiting for attendance_module.js...");
                        setTimeout(() => {
                            if (window.renderDashboard) window.renderDashboard(staffData);
                            else if (window.checkStaffAuth) window.checkStaffAuth();
                        }, 1000);
                    }
                } catch (e) {
                    console.error("❌ Staff: Session parse error, clearing...", e);
                    localStorage.removeItem('loggedStaff');
                }
            } else {
                console.log("🛡️ Staff: No active session, checking auth area...");
                if (window.checkStaffAuth) window.checkStaffAuth();
            }
        }

        // --- 3. VISITOR PAGE ROUTING ---
        if (path.includes('visitor.html')) {
            if (window.checkVisitorSession) window.checkVisitorSession();
            else setTimeout(() => { if (window.checkVisitorSession) window.checkVisitorSession(); }, 500);
        }

        // --- 4. GLOBAL LOGOUT UTILITIES ---
        window.logoutStaff = () => {
            console.log("🚪 Global Logout Triggered");
            try {
                localStorage.clear();
                sessionStorage.clear();
                safeNavigate('index.html'); // Go back to landing
            } catch (e) { console.error("Logout Error:", e); }
        };

        window.handleUserLogout = () => {
            window.logoutStaff();
        };

        window.checkStaffAuth = () => {
            try {
                const saved = localStorage.getItem('loggedStaff');
                const authArea = document.getElementById('staff-auth-area');
                const dashArea = document.getElementById('staff-dash-area');

                if (saved && dashArea) {
                    console.log("🛡️ checkStaffAuth: Session found, loading dashboard");
                    if (window.renderDashboard) window.renderDashboard(JSON.parse(saved));
                } else if (authArea) {
                    console.log("🛡️ checkStaffAuth: No session, ensuring login visible");
                    authArea.classList.remove('hidden');
                    if (dashArea) dashArea.classList.add('hidden');
                }
            } catch (e) { console.error("Auth Check Error:", e); }
        };

        // --- 5. EVENT BINDING (Post-Load) ---
        // Bind legacy logout buttons if any
        ['staff-logout-btn', 'staff-logout', 'admin-logout-btn'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.onclick = (e) => {
                    e.preventDefault();
                    console.log(`Click: ${id} -> logout`);
                    window.logoutStaff();
                };
            }
        });

        // Initialize Canvas/Pads
        if (window.initSigPad) window.initSigPad();
        if (window.initVisitorCanvas) window.initVisitorCanvas();

    } catch (e) { console.error("🚀 SchoolLog: Initialization Critical Error:", e); }
});

console.log("✅ init_module.js: Successfully loaded and initialized");
