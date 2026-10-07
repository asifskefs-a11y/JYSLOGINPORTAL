import { db, UPLOAD_CONFIG } from './firebase_config.js';
import {
    ref,
    set,
    get,
    push,
    remove,
    child,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import './auth_client.js';
import './visitor_api.js'; // visitor/contractor Cloud Functions // server-verified login (replaces old handlers)

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

// 🔐 handleAdminLogin / handleStaffLogin now live in auth_client.js (server-verified).
// The old hardcoded admin/1234 and client-side password check were REMOVED.

/**
 * HELPER: GET LOCAL DATE STRING (YYYY-MM-DD)
 */
const getLocalTodayStr = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/**
 * VISITOR / CONTRACTOR SIGN-IN HANDLER (OVERHAULED v4.0)
 */
window.handleVisitorSignIn = async (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }

    const mode = (window.portalMode || 'visitor').toLowerCase().includes('contractor') ? 'contractor' : 'visitor';
    const val = (id) => (document.getElementById(id)?.value || '').trim();
    const nameVal = val('v-name');
    const mobileVal = val('v-mobile');

    if (!nameVal || !mobileVal) { alert("Please fill in Name and Mobile number."); return false; }
    if (mobileVal.replace(/\D/g, '').length < 8) { alert("Please enter a valid mobile number."); return false; }

    const btn = e?.target?.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    if (window.showGlobalSpinner) window.showGlobalSpinner("Syncing with School Cloud...");

    try {
        const canvasId = 'v-sig-pad';
        if (window.isCanvasBlank(canvasId)) throw new Error("Please provide your signature.");

        // 🔐 Token, PIN, time and Drive upload are all handled by the SERVER now.
        const res = await window.visitorApi.visitorCheckIn({
            mode,
            name: nameVal,
            mobile: mobileVal,
            company: val('v-company'),
            purpose: val('v-purpose'),
            contractorId: val('contractorId'),
            keyCollected: document.getElementById('v-key-status')?.value || 'NO',
            signature: window.getCanvasBase64(canvasId)
        });

        if (res.alreadyActive) {
            // Already inside - resume the check-out view instead of creating a duplicate
            localStorage.setItem('vActive', JSON.stringify({ ...res.record, mobile: mobileVal, mode }));
            if (window.hideGlobalSpinner) window.hideGlobalSpinner();
            alert("You are already checked in. Showing your check-out screen.");
            if (window.checkVisitorSession) window.checkVisitorSession();
            return false;
        }

        const data = res.record;
        if (document.getElementById('v-id')) document.getElementById('v-id').value = data.id;
        const badgeEl = document.getElementById('contractor-token-badge');
        if (badgeEl) badgeEl.innerText = `TOKEN #${data.tokenNumber}`;

        if (window.hideGlobalSpinner) window.hideGlobalSpinner();

        localStorage.setItem('vActive', JSON.stringify({ ...data, firebaseKey: data.firebaseKey, mode }));

        if (window.showWhatsAppToast) {
            window.showWhatsAppToast(`🚪 New ${mode === 'contractor' ? 'Contractor' : 'Visitor'} Entry`, `${data.name} checked in.`);
        }

        if (window.showPortalAnimation) {
            window.showPortalAnimation('entry');
            setTimeout(() => {
                window.hidePortalAnimation();
                if (window.checkVisitorSession) window.checkVisitorSession();
            }, 2000);
        } else if (window.checkVisitorSession) {
            window.checkVisitorSession();
        }
    } catch (error) {
        console.error("❌ Sign-In Failure:", error);
        if (window.hideGlobalSpinner) window.hideGlobalSpinner();
        const msg = error && error.code ? window.visitorApi.apiErrorMessage(error) : error.message;
        alert("Sign-In Error: " + msg);
    } finally {
        if (btn) btn.disabled = false;
    }
    return false;
};

// ================================================================ */
// INITIALIZATION & AUTO-ROUTING                                    */
// ================================================================ */

// ✅ VERSION CONTROL (v6.8)
const APP_VERSION = 'v9.0-p1';
window.__APP_VERSION__ = APP_VERSION;

document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 SchoolLog Init: DOMContentLoaded triggered");

    // --- FIREBASE CONNECTION MONITOR ---
    try {
        const connectedRef = ref(db, ".info/connected");
        onValue(connectedRef, (snap) => {
            if (snap.val() === true) {
                console.log("🔥 Firebase: Online");
            } else {
                console.warn("🔥 Firebase: Offline / Reconnecting...");
            }
        });
    } catch (e) { console.error("Connection monitor failed:", e); }

    // --- 0. DYNAMIC VERSION CHECK & CACHE INVALIDATION ---
    const savedVersion = localStorage.getItem('app_version');
    if (savedVersion !== APP_VERSION) {
        console.warn(`🔄 Version Mismatch: ${savedVersion} -> ${APP_VERSION}. Purging Cache...`);
        localStorage.clear();
        sessionStorage.clear();
    }

    // --- 0. REGISTER SERVICE WORKER (OFFLINE PWA MODE) ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').then(reg => {
                console.log('✅ SW: Registered Successfully', reg.scope);
            }).catch(err => {
                console.warn('❌ SW: Registration Failed', err);
            });
        });
    }

    const path = window.location.pathname;

    try {
        await window.authReady;
        const isAdmin = window.isVerifiedAdmin === true; // from signed token claims

        // 🛡️ STRICT SESSION ISOLATION: Prioritize sessionStorage (tab-isolated)
        const activeStaff = JSON.parse(sessionStorage.getItem('active_staff_user') || 'null');
        const loggedStaff = JSON.parse(localStorage.getItem('loggedStaff') || 'null');

        // Only use localStorage if sessionStorage is empty AND they are on the login page (initial load)
        const effectiveStaff = activeStaff || (path.includes('staff-login.html') ? loggedStaff : null);

        console.log("🚀 SchoolLog Init: Current Path:", path);
        console.log("🚀 SchoolLog Init: Auth State - Session:", !!activeStaff, "| Shared Local:", !!loggedStaff);

        if (effectiveStaff && !activeStaff) {
            console.log("💾 Hydrating Session from LocalStorage...");
            sessionStorage.setItem('active_staff_user', JSON.stringify(effectiveStaff));
        }

        // --- 1. ADMIN PAGE ROUTING ---
        if (path.includes('admin.html')) {
            const authSec = document.getElementById('view-admin-auth');
            const dashSec = document.getElementById('view-admin-dash');

            if (isAdmin) {
                console.log("🔓 Admin: Showing Dashboard Section");
                if (authSec) authSec.classList.add('hidden');
                if (dashSec) dashSec.classList.remove('hidden');

                // ✅ Boot Loader Initialization (v8.3)
                if (window.loadAdminDashboard) {
                    window.loadAdminDashboard();

                    // Trigger initial data render for the default active tab
                    setTimeout(() => {
                        const activeTabBtn = document.querySelector('.admin-nav-tab.active');
                        if (activeTabBtn) {
                            // Extract tabId from onclick="window.showAdminTab('tabId')"
                            const match = activeTabBtn.getAttribute('onclick')?.match(/'([^']+)'/);
                            if (match && match[1]) {
                                window.renderTabFromAppCache(match[1]);
                            }
                        } else {
                            window.renderTabFromAppCache('tab-visitor-logs');
                        }
                    }, 500);
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

        // --- 2. STAFF PAGE ROUTING & REAL-TIME VALIDATION ---
        if (path.includes('staff-login.html') || path.includes('security.html')) {
            if (effectiveStaff) {
                console.log(`🛡️ ${path.includes('security.html') ? 'Security' : 'Staff'}: Validating user existence in Firebase...`);

                try {
                    const userId = effectiveStaff.adekPass || effectiveStaff.mobile;
                    // Find the user by ID/Mobile in the staff collection
                    await window.authReady;
                    // Verify against the signed-in token + OWN record only (no full staff download)
                    const ownKey = window.authClaims && window.authClaims.staffKey;
                    let userStillExists = false;
                    if (ownKey) {
                        const ownSnap = await get(ref(db, `staff/${ownKey}`));
                        userStillExists = ownSnap.exists();
                    }

                    if (userStillExists) {
                        console.log("✅ User verified, rendering dashboard.");
                        if (window.initUserDashboard) {
                            window.initUserDashboard(effectiveStaff);
                        } else if (window.renderDashboard) {
                            window.renderDashboard(effectiveStaff);
                        }

                        if (window.switchPortalView) {
                            window.switchPortalView('DASHBOARD');
                        }
                    } else {
                        console.warn("❌ User record deleted from Firebase. Force Logout.");
                        window.logoutStaff();
                    }
                } catch (e) {
                    console.error("❌ Session validation error, clearing...", e);
                    window.logoutStaff();
                }
            } else if (path.includes('staff-login.html')) {
                console.log("🛡️ Staff: No active session, showing login area...");
                if (window.switchPortalView) {
                    window.switchPortalView('LOGIN');
                }

                // ✅ Task 2: Auto Biometric Prompt (v8.1)
                setTimeout(() => {
                    const isBiometricReady = localStorage.getItem('jys_biometric_enrolled') === 'true' ||
                                           localStorage.getItem('biometric_enabled') === 'true' ||
                                           localStorage.getItem('biometric_registered') === 'true';

                    if (isBiometricReady && window.quickBiometricLogin) {
                        console.log("🧬 Biometric Enrollment Detected. Auto-prompting...");
                        window.quickBiometricLogin();
                    }
                }, 1000);
            }
        }

        // --- 3. VISITOR PAGE ROUTING ---
        if (path.includes('visitor.html')) {
            if (window.checkVisitorSession) window.checkVisitorSession();
            else setTimeout(() => { if (window.checkVisitorSession) window.checkVisitorSession(); }, 500);
        }

        // --- 4. GLOBAL LOGOUT UTILITIES ---
        window.logoutStaff = async () => {
            console.log("🚪 Global Logout Triggered");
            try { if (window.authSignOut) await window.authSignOut(); } catch (e) { console.warn('signOut:', e); }
            try {
                localStorage.clear();
                sessionStorage.clear();

                // Direct redirect to Login Page as requested
                window.location.href = 'staff-login.html';
            } catch (e) { console.error("Logout Error:", e); }
        };

        window.handleUserLogout = () => {
            window.logoutStaff();
        };

        window.checkStaffAuth = () => {
            try {
                const activeStaff = JSON.parse(sessionStorage.getItem('active_staff_user') || 'null');
                if (activeStaff && activeStaff.mobile) {
                    console.log("🛡️ checkStaffAuth: Active session found, loading dashboard");
                    if (window.renderDashboard) window.renderDashboard(activeStaff);
                    if (window.switchPortalView) {
                        window.switchPortalView('DASHBOARD');
                    }
                } else {
                    console.log("🛡️ checkStaffAuth: No active session, ensuring login visible");
                    if (window.switchPortalView) {
                        window.switchPortalView('LOGIN');
                    }
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
