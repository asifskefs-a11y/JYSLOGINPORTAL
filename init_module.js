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

            for (const [key, u] of Object.entries(val)) {
                if (!u) continue;
                const adekCheck = (u.adekPass || u.adcPassNumber || u.username || u.mobile || "").toString().toLowerCase().trim();
                const inputAdek = adek.toLowerCase();

                if (adekCheck === inputAdek && u.password === pass) {
                    foundUser = { ...u, firebaseKey: key };
                    break;
                }
            }

            if (foundUser) {
                console.log("✅ Staff Login: Authentication Successful for", foundUser.fullName || foundUser.name || "User");

                // Register FCM after login (Safe wrapper)
                try {
                    if (typeof registerPushNotifications === 'function') {
                        registerPushNotifications(foundUser.mobile);
                    }
                } catch(fcmErr) {
                    console.warn("⚠️ FCM Registration skipped:", fcmErr);
                }

                // REDIRECT ALL STAFF ROLES TO DASHBOARD
                if ((foundUser.role || "").toLowerCase().trim() === 'security') {
                    console.log("🔓 Staff Login: Security role detected, redirecting to security.html");
                    localStorage.setItem('loggedStaff', JSON.stringify(foundUser));
                    sessionStorage.setItem('active_staff_user', JSON.stringify(foundUser));
                    safeNavigate('security.html');
                    return false;
                }

                if ((foundUser.role || "").toLowerCase().trim() === 'admin') {
                    console.log("🔓 Staff Login: Admin role detected, redirecting...");
                    localStorage.setItem('isAdminLoggedIn', 'true');
                    safeNavigate('admin.html');
                    return false;
                }

                localStorage.setItem('loggedStaff', JSON.stringify(foundUser));
                sessionStorage.setItem('active_staff_user', JSON.stringify(foundUser));
                localStorage.setItem('app_version', APP_VERSION); // ✅ Dynamic Versioning Update
                console.log("💾 Staff Login: Session stored and version updated");

                if (window.triggerSuccessPopup) {
                    window.triggerSuccessPopup(`Welcome, ${foundUser.name}! 👋`);
                }

                // HIDE AUTH AREA & RESET FORM
                const authArea = document.getElementById('staff-auth-area');
                const loginForm = document.getElementById('staff-login-form');
                if (authArea) authArea.classList.add('hidden');
                if (loginForm) loginForm.reset();

                // INITIALIZE USER DASHBOARD (PROFILE, ATTENDANCE, TASKS)
                try {
                    if (window.initUserDashboard) {
                        console.log("🛡️ Staff Login: Initializing User Dashboard Logic");
                        await window.initUserDashboard(foundUser);
                        console.log("🛡️ Staff Login: Dashboard Initialized Successfully");
                    } else if (window.renderDashboard) {
                        console.log("🛡️ Staff Login: Initializing Fallback Dashboard Logic");
                        window.renderDashboard(foundUser);
                    }
                } catch (dashboardErr) {
                    console.error("❌ Dashboard Init Error:", dashboardErr);
                }

                // SHOW DASHBOARD VIEW (With small delay to ensure DOM is ready)
                setTimeout(() => {
                    if (window.switchPortalView) {
                        window.switchPortalView('DASHBOARD');
                    } else if (window.showStaffView) {
                        window.showStaffView('staff-dashboard-container');
                    } else {
                        // Fallback unhide if showStaffView is missing
                        const dashArea = document.getElementById('staff-dashboard-container');
                        if (dashArea) {
                            dashArea.classList.remove('hidden', 'hidden-view');
                            dashArea.classList.add('active-view');
                            dashArea.style.display = 'block';
                        }
                    }

                    // Force refresh layout and images
                    window.dispatchEvent(new Event('resize'));
                }, 300);
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

    const mode = window.portalMode || 'visitor';
    const nameVal = document.getElementById('v-name')?.value;
    const mobileVal = document.getElementById('v-mobile')?.value;

    if (!nameVal || !mobileVal) { alert("Please fill in Name and Mobile number."); return false; }

    const btn = e?.target?.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    if (window.showGlobalSpinner) window.showGlobalSpinner("Syncing with School Cloud...");

    try {
        const canvasId = 'v-sig-pad';
        if (window.isCanvasBlank(canvasId)) throw new Error("Please provide your signature.");

        const sigBase64 = window.getCanvasBase64(canvasId);
        const todayStr = getLocalTodayStr();
        const dbPathName = mode === 'contractor' ? 'contractors' : 'visitors';
        const counterRef = ref(db, `counters/${dbPathName}/${todayStr}`);

        console.log(`🌐 Firebase: Executing Atomic Transaction [${todayStr}]`);

        const txResult = await runTransaction(counterRef, (current) => {
            return (current || 0) + 1;
        });

        if (!txResult.committed) throw new Error("Server sequence conflict. Please try again.");

        const finalTokenNumber = txResult.snapshot.val();
        const prefix = mode === 'contractor' ? 'JYSC' : 'JYSV';
        const finalId = `${prefix}${finalTokenNumber.toString().padStart(3, '0')}`;

        console.log(`✅ Token Allocated: #${finalTokenNumber} | ID: ${finalId}`);

        // --- MANDATORY PERMANENT CLOUD DRIVE SYNC ---
        console.log(`🌐 System: Dispatching signature DIRECT to Google Drive [${mode}]`);
        let finalSignatureUrl = "N/A"; // Enforce no raw Base64

        try {
            const driveResponse = await window.uploadToDrive({
                base64Data: sigBase64,
                adekPassNumber: finalId,
                documentType: "SIGNATURE",
                category: mode === 'contractor' ? 'CONTRACTORS' : 'VISITORS',
                fileName: `SIG_${finalId}_${Date.now()}.png`
            });

            if (driveResponse && driveResponse.status === 'success') {
                console.log("✅ Cloud Sync: Signature stored in Google Drive.");
                finalSignatureUrl = driveResponse.fileUrl;
            } else if (driveResponse.status === 'disabled') {
                console.warn("⚠️ Admin has disabled Drive Sync. Signature will not be stored.");
                finalSignatureUrl = "SYNC_DISABLED_BY_ADMIN";
            } else {
                throw new Error(driveResponse.message || "Upload failed");
            }
        } catch (driveErr) {
            console.error("❌ Critical: Direct Cloud Sync Failed!", driveErr);
            alert("⚠️ SYSTEM BLOCK: Signature could not be synced to Google Drive. Check internet or contact Admin.");
            throw new Error("Mandatory Cloud Sync Failed.");
        }

        const data = {
            id: finalId,
            tokenNumber: finalTokenNumber,
            name: nameVal,
            mobile: mobileVal,
            company: document.getElementById('v-company')?.value || '',
            purpose: document.getElementById('v-purpose')?.value || '',
            keyCollected: document.getElementById('v-key-status')?.value || 'NO',
            checkoutPin: Math.floor(1000 + Math.random() * 9000).toString(),
            date: new Date().toLocaleDateString('en-US'),
            timeIn: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true}),
            timestamp: Date.now(),
            status: "active",
            signatureUrl: finalSignatureUrl, // PERMANENT CLOUD LINK ONLY
            type: mode,
            sequenceNo: finalTokenNumber,
            tokenId: finalId
        };
        data.keyReturnPin = data.checkoutPin;

        // FINAL FIREBASE PERSISTENCE
        console.log(`🏢 Firebase: Writing Master Record to /${dbPathName}/${finalId}`);
        await set(ref(db, `${dbPathName}/${finalId}`), data);

        console.log("🔥 Firebase: Data Saved Successfully.");

        // UI SYNC
        if (document.getElementById('v-id')) document.getElementById('v-id').value = finalId;
        const badgeEl = document.getElementById('contractor-token-badge');
        if (badgeEl) badgeEl.innerText = `TOKEN #${finalTokenNumber}`;

        if (window.hideGlobalSpinner) window.hideGlobalSpinner();

        // KEY CONTROL SYNC
        if (data.keyCollected === 'YES') {
            await set(ref(db, `security_key_control/${data.mobile || finalId}`), {
                name: data.name,
                id: finalId,
                type: mode.toUpperCase(),
                pin: data.checkoutPin,
                status: 'HELD',
                timestamp: Date.now()
            }).catch(()=>{});
        }

        // Cleanup temporary tokens if existing
        if (window.currentReservedToken) {
            await remove(ref(db, `token_reservations/${window.currentReservedToken.tokenId}`)).catch(() => {});
        }

        // Local Session Store
        localStorage.setItem('vActive', JSON.stringify({ ...data, firebaseKey: finalId, mode: mode }));

        if (window.showWhatsAppToast) {
            window.showWhatsAppToast(`🚪 New ${mode === 'contractor' ? 'Contractor' : 'Visitor'} Entry`, `${data.name} checked in.`);
        }

        if (window.showPortalAnimation) {
            window.showPortalAnimation('entry');
            setTimeout(() => {
                window.hidePortalAnimation();
                if (window.checkVisitorSession) window.checkVisitorSession();
            }, 2000);
        } else {
            if (window.checkVisitorSession) window.checkVisitorSession();
        }

    } catch (error) {
        console.error("❌ Sign-In Failure:", error);
        if (window.hideGlobalSpinner) window.hideGlobalSpinner();
        alert("Sign-In Error: " + error.message);
    } finally {
        if (btn) btn.disabled = false;
    }
    return false;
};

// ================================================================ */
// INITIALIZATION & AUTO-ROUTING                                    */
// ================================================================ */

// ✅ VERSION CONTROL (v6.8)
const APP_VERSION = 'v8.4';

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
        const isAdmin = localStorage.getItem('isAdminLoggedIn') === 'true';

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
                    const staffSnap = await get(ref(db, 'staff'));
                    let userStillExists = false;

                    if (staffSnap.exists()) {
                        const allStaff = staffSnap.val();
                        for (const key in allStaff) {
                            const u = allStaff[key];
                            if (u.adekPass === userId || u.mobile === userId) {
                                userStillExists = true;
                                break;
                            }
                        }
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
        window.logoutStaff = () => {
            console.log("🚪 Global Logout Triggered");
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
