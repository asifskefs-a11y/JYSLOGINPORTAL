import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, set, update, push, onValue, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================================ */
// NETWORK SPEED & OFFLINE SYNC HANDLERS (PUBLIC WI-FI BYPASS)       */
// ================================================================ */

const NETWORK_SPEED_THRESHOLD = 3500;
const OFFLINE_SYNC_KEY = 'pending_offline_sync';

const checkNetworkPing = async () => {
    const start = Date.now();
    try {
        // Fast shallow fetch from Firebase REST endpoint
        await fetch('https://schoollog-f0a04-default-rtdb.firebaseio.com/.json?shallow=true', { cache: 'no-store' });
        return Date.now() - start;
    } catch (e) {
        return 9999;
    }
};

window.showSlowNetWarning = () => {
    const existing = document.getElementById('slow-net-toast');
    if (existing) return;
    const toast = document.createElement('div');
    toast.id = 'slow-net-toast';
    toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 z-[300000] bg-amber-500 text-white px-6 py-3 rounded-2xl font-black shadow-2xl flex items-center gap-3 animate-bounce';
    toast.innerHTML = `<i class="fa-solid fa-wifi"></i> <span>⚠️ Slow Network Detected! Syncing in background...</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
};

async function safeFirebaseWrite(type, path, data) {
    try {
        const ping = await checkNetworkPing();
        if (ping > NETWORK_SPEED_THRESHOLD) {
            window.showSlowNetWarning();
            return await firebaseRestFallback(type, path, data);
        }

        if (type === 'set') await set(ref(db, path), data);
        else await update(ref(db, path), data);
        return { status: 'success' };
    } catch (e) {
        console.error("Firebase SDK Write Failed, trying REST fallback:", e);
        return await firebaseRestFallback(type, path, data);
    }
}

async function firebaseRestFallback(type, path, data) {
    const url = `https://schoollog-f0a04-default-rtdb.firebaseio.com/${path}.json`;
    try {
        const method = type === 'set' ? 'PUT' : 'PATCH';
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error("REST API Failed");
        return { status: 'success' };
    } catch (e) {
        console.error("REST Fallback Failed, saving for offline sync:", e);
        addToOfflineSync(type, path, data);
        return { status: 'offline_queued' };
    }
}

function addToOfflineSync(type, path, data) {
    const queue = JSON.parse(localStorage.getItem(OFFLINE_SYNC_KEY) || '[]');
    queue.push({ type, path, data, timestamp: Date.now() });
    localStorage.setItem(OFFLINE_SYNC_KEY, JSON.stringify(queue));
}

window.processOfflineSync = async () => {
    const queue = JSON.parse(localStorage.getItem(OFFLINE_SYNC_KEY) || '[]');
    if (queue.length === 0) return;
    console.log(`🔄 Offline Sync: Processing ${queue.length} items...`);
    const remaining = [];
    for (const item of queue) {
        try {
            await firebaseRestFallback(item.type, item.path, item.data);
            console.log(`✅ Sync Success: ${item.path}`);
        } catch (e) {
            remaining.push(item);
        }
    }
    localStorage.setItem(OFFLINE_SYNC_KEY, JSON.stringify(remaining));
};
setInterval(window.processOfflineSync, 15000);

// ================================================================ */
// SIGNATURE MODAL HANDLERS                                         */
// ================================================================ */

let sigCallback = null;

window.initSigPad = () => {
    console.log("🖊️ attendance_module: Initializing signature pad...");
    if (window.sigPadManager) {
        window.sigPadManager.getPad('sig-canvas');
    }
};

window.openSignatureModal = (title, callback) => {
    const titleEl = document.getElementById('sig-modal-title');
    if (titleEl) titleEl.innerText = title;
    const modal = document.getElementById('signature-modal');
    if (modal) {
        modal.classList.add('active');
        setTimeout(() => {
            if (window.sigPadManager) {
                const pad = window.sigPadManager.getPad('sig-canvas');
                if (pad) pad._setupCanvas();
            }
            window.hideGlobalSpinner();
        }, 150);
    }
    sigCallback = callback;
};

window.closeSignatureModal = () => {
    const modal = document.getElementById('signature-modal');
    if (modal) modal.classList.remove('active');
    if (window.clearSignaturePad) window.clearSignaturePad('sig-canvas');
    sigCallback = null;
};

const sigConfirmBtn = document.getElementById('sig-confirm-btn');
if (sigConfirmBtn) {
    sigConfirmBtn.onclick = () => {
        try {
            const canvasPad = window.sigPadManager.getPad('sig-canvas');
            const data = canvasPad.toDataURL();

            if (data.length < 1000) {
                alert("Please provide your signature to continue.");
                return;
            }

            if (sigCallback) sigCallback(data);
            window.closeSignatureModal();
        } catch (e) {
            console.error("❌ Signature Confirmation Error:", e);
            alert("Failed to capture signature. Please try again.");
        }
    };
}

// ================================================================ */
// PASSWORD VERIFICATION MODAL                                      */
// ================================================================ */

let passwordCallback = null;

window.openPasswordModal = (title, callback) => {
    console.log("🔐 Password Modal: Opening");
    const titleEl = document.getElementById('password-modal-title');
    if (titleEl) titleEl.innerText = title;

    const modal = document.getElementById('password-modal');
    const input = document.getElementById('modal-auth-pass');
    const error = document.getElementById('password-error');

    if (modal) modal.classList.remove('hidden');
    if (input) { input.value = ''; input.focus(); }
    if (error) error.classList.add('hidden');

    passwordCallback = callback;
};

window.closePasswordModal = () => {
    const modal = document.getElementById('password-modal');
    if (modal) modal.classList.add('hidden');
    passwordCallback = null;
};

document.addEventListener('DOMContentLoaded', () => {
    const passForm = document.getElementById('password-verify-form');
    if (passForm) {
        passForm.onsubmit = (e) => {
            e.preventDefault();
            const input = document.getElementById('modal-auth-pass');
            const error = document.getElementById('password-error');
            const enteredPass = input?.value || "";

            console.log("🔐 Password Modal: Verifying identity...");

            if (!window.currentStaff) {
                console.error("❌ Error: No staff profile in context");
                alert("Session error. Please logout and login again.");
                return;
            }

            const actualPass = (window.currentStaff.password || "").toString();

            if (enteredPass === actualPass) {
                console.log("✅ Password Modal: Identity Verified");
                if (passwordCallback) passwordCallback();
                window.closePasswordModal();
            } else {
                console.warn("❌ Password Modal: Incorrect Password");
                if (error) error.classList.remove('hidden');
                if (input) { input.value = ''; input.focus(); }
            }
        };
    }

    // Attach single ENTER key listener for PIN modal input
    const pinInput = document.getElementById('key-return-pin-input');
    if (pinInput) {
        pinInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.confirmKeyReturn(e);
            }
        });
    }
});

// ================================================================ */
// KEY HANDOVER LOGIC (STRICT MANDATORY RETURN & PIN VERIFICATION)   */
// ================================================================ */

let keyCollectCallback = null;
let keyReturnCallback = null;

window.generateKeyReturnPin = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
};

window.openKeyCollectionModal = (callback) => {
    const modal = document.getElementById('key-collection-modal');
    if (modal) modal.classList.remove('hidden');
    keyCollectCallback = callback;
};

window.confirmKeyCollection = (hasKey) => {
    const modal = document.getElementById('key-collection-modal');
    if (modal) modal.classList.add('hidden');
    if (keyCollectCallback) keyCollectCallback(hasKey);
    keyCollectCallback = null;
};

window.openKeyReturnModal = (staffKey, staffRecord, callback) => {
    // Store full session & key globally
    window.activeSessionForReturn = {
        key: staffKey,
        ...(staffRecord || {})
    };
    keyReturnCallback = callback;

    const modal = document.getElementById('key-return-modal');
    const input = document.getElementById('key-return-pin-input');
    const error = document.getElementById('pin-error');
    if (error) error.classList.add('hidden');
    if (input) input.value = '';
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
    if (input) input.focus();
};

window.confirmKeyReturn = async (event) => {
    if (event) event.preventDefault();

    const input = document.getElementById('key-return-pin-input');
    const error = document.getElementById('pin-error');
    const enteredPin = (input?.value || "").toString().trim();

    if (!window.activeSessionForReturn) {
        alert("Session error. Please close modal and click 'Return Key' again.");
        return;
    }

    window.showGlobalSpinner("Verifying Staff Key PIN...");

    let liveStoredPin = "";
    const active = window.activeSessionForReturn;
    let actualFirebaseKey = active.key;

    try {
        // Deep Lookup: Fetch from specific node or search by mobile
        if (actualFirebaseKey) {
            const snap = await get(ref(db, `staff_attendance/${actualFirebaseKey}`));
            if (snap.exists()) {
                const rec = snap.val();
                liveStoredPin = (rec.keyReturnPin || rec.checkoutPin || rec.pin || "").toString().trim();
            }
        }

        // Fallback: Search all staff attendance if key was direct session
        if (!liveStoredPin) {
            const allSnap = await get(ref(db, 'staff_attendance'));
            if (allSnap.exists()) {
                const data = allSnap.val();
                for (const [k, v] of Object.entries(data)) {
                    if (v.status === 'checked_in' && (v.mobile === active.mobile || k === active.key)) {
                        liveStoredPin = (v.keyReturnPin || v.checkoutPin || v.pin || "").toString().trim();
                        actualFirebaseKey = k;
                        break;
                    }
                }
            }
        }
    } catch (err) {
        console.error("Error fetching live record for staff:", err);
    } finally {
        window.hideGlobalSpinner();
    }

    // Fallback to active session local PIN if Firebase load failed
    if (!liveStoredPin && active.keyReturnPin) {
        liveStoredPin = active.keyReturnPin.toString().trim();
    }

    console.log(`[Staff PIN] Input: "${enteredPin}", Expected: "${liveStoredPin}"`);

    // VERIFY PIN
    if (liveStoredPin !== "" && enteredPin === liveStoredPin) {
        console.log("✅ Staff Key PIN Verified Successfully!");

        try {
            window.showGlobalSpinner("Updating Key Status...");

            // Update Firebase
            if (actualFirebaseKey) {
                await update(ref(db, `staff_attendance/${actualFirebaseKey}`), {
                    keyStatus: 'RETURNED',
                    keyReturnTime: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true})
                });
            }

            // Hide Modal
            const modal = document.getElementById('key-return-modal');
            if (modal) {
                modal.classList.add('hidden');
                modal.style.display = 'none';
            }

            window.activeSessionForReturn = null;

            // Execute Callback if present (For Checkout Flow)
            if (keyReturnCallback) {
                const cb = keyReturnCallback;
                keyReturnCallback = null;
                await cb();
            } else {
                window.triggerSuccessPopup("Staff Key Returned Successfully! 🔑✅");
            }

            if (window.loadSecurityPinControl) window.loadSecurityPinControl();

        } catch (e) {
            alert("Error updating key status: " + e.message);
        } finally {
            window.hideGlobalSpinner();
        }
    } else {
        console.warn("❌ Incorrect Staff Key PIN");
        if (error) error.classList.remove('hidden');
        if (input) {
            input.value = '';
            input.focus();
        }
        alert(`❌ Invalid PIN (${enteredPin || 'Empty'}).\nPlease enter the exact 4-digit PIN shown on the Security Dashboard.`);
    }
};

// ================================================================ */
// PERFORMANCE OPTIMIZATIONS: GEOLOCATION & ASYNC                   */
// ================================================================ */

const getFastLocation = () => {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            console.warn("🌐 Geolocation not supported");
            return resolve({ lat: 0, lng: 0 });
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            (err) => {
                console.warn("⚠️ Geolocation Error:", err.message);
                resolve({ lat: 0, lng: 0 });
            },
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
        );
    });
};

// ================================================================ */
// DASHBOARD & ATTENDANCE CORE                                       */
// ================================================================ */

window.initUserDashboard = async (staff) => {
    console.log("📊 initUserDashboard: Initializing for", staff.name || staff.fullName);
    window.currentStaff = staff;

    // Safety check for mobile number (prevent undefined errors in Firebase)
    if (staff.mobile) {
        localStorage.setItem('loggedStaffMobile', staff.mobile);
    }

    const role = (staff.role || "Staff").toString().trim().toLowerCase();
    const isSecurity = (role === 'security');
    const isAdmin = (role === 'admin') || (localStorage.getItem('isAdminLoggedIn') === 'true');

    // HIDE AUTH / LOGIN SECTION IF VISIBLE
    const authArea = document.getElementById('staff-auth-area');
    const dashArea = document.getElementById('staff-dash-area');
    if (authArea) authArea.classList.add('hidden');
    if (dashArea) dashArea.classList.remove('hidden');

    // RESET SUBVIEWS (Role-Specific)
    const subViews = [
        'tasks-management-section',
        'asset-audit-section',
        'asset-disposal-section',
        'asset-transfer-section',
        'transfer-logs-section',
        'security-pin-control'
    ];

    subViews.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // RESTORATION EXCEPTION: Don't hide core Security Dashboard features if the user is Security
            if (isSecurity && (id === 'security-pin-control' || id === 'tasks-management-section')) return;

            el.classList.add('hidden');
            el.style.display = 'none';
        }
    });

    // --- ENSURE PRIMARY DASHBOARD COMPONENTS ARE VISIBLE ---
    const primaryComponents = [
        'user-profile-card',
        'security-profile-card',
        'active-staff-grid',
        'visitor-log-section',
        'tasks-summary-card',
        'attendance-controls',
        'staff-action-container'
    ];
    primaryComponents.forEach(id => {
        const el = document.getElementById(id) || document.querySelector(`.${id}`);
        if (el) {
            el.classList.remove('hidden');
            el.style.display = ''; // Restore default (flex/block)
        }
    });

    // APPLY ROLE RULES (Side Menu & Restricted Sections)
    if (window.applyRoleDashboardRules) {
        window.applyRoleDashboardRules(role);
        const restrictedRoles = ['cleaner', 'bus musrif', 'bus_musrif', 'gardener', 'office boy', 'office_boy'];
        if (restrictedRoles.includes(role)) window.loadPersonalAttendance(staff.mobile);
        if (role === 'security') window.loadSecurityPinControl();
    }

    // FORCE RELOAD TASK STATS & VIEW (Handles counters)
    if (window.loadRoleView) {
        console.log("🛡️ Dashboard: Re-connecting Task real-time counters");
        window.loadRoleView(staff);
    }

    // POPULATE PROFILE CARD DETAILS WITH SAFE FALLBACKS
    const nameEl = document.getElementById('user-name');
    if (nameEl) nameEl.innerText = staff.name || staff.fullName || "Staff Member";

    const passIdEl = document.getElementById('user-pass-id');
    if (passIdEl) passIdEl.innerText = `ID: ${staff.passId || staff.adekPass || staff.adcPassNumber || staff.staffId || "-"}`;

    const roleBadgeEl = document.getElementById('user-role');
    if (roleBadgeEl) roleBadgeEl.innerText = staff.role || "Staff";

    const branchEl = document.getElementById('user-branch');
    if (branchEl) branchEl.innerHTML = `<i class="fa-solid fa-location-dot text-indigo-400"></i> ${staff.branch || staff.school || "Jern Yafoor School"}`;

    // SAFE AVATAR FALLBACK GENERATOR (SVG Data-URI)
    const initials = (staff.name || staff.fullName || 'U').charAt(0).toUpperCase();
    const fallbackAvatar = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100%' height='100%' fill='%234F46E5'/><text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' fill='%23ffffff' font-size='40' font-family='sans-serif' font-weight='bold'>${initials}</text></svg>`;

    const avatarImg = document.getElementById('user-avatar');
    if (avatarImg) {
        avatarImg.src = staff.profilePicUrl ? window.getDirectDriveImageUrl(staff.profilePicUrl) : fallbackAvatar;
        avatarImg.onerror = () => { avatarImg.src = fallbackAvatar; };
    }

    // UPDATE STAT COUNTERS FROM FIREBASE TASKS
    const userRole = (staff.role || '').toLowerCase();
    const userMobile = (staff.mobile || '').toString();
    const userName = (staff.name || staff.fullName || '').toLowerCase();

    // Security Dashboard Label Update
    const taskOverviewLabel = document.querySelector('#tasks-summary-card .stat-completed .label');
    if (isSecurity && taskOverviewLabel) {
        taskOverviewLabel.innerText = "Task Overview";
    }

    onValue(ref(db, 'tasks'), (snapshot) => {
        const tasks = snapshot.val() || {};
        let total = 0, pending = 0, completed = 0;
        Object.values(tasks).forEach(task => {
            if (!task) return;

            // Flexible Role/Ownership Mapping
            const taskRole = (task.assignedRole || task.category || '').toLowerCase();
            const taskCreatorMobile = (task.raisedByMobile || '').toString();
            const taskCreatorName = (task.raisedByName || task.createdBy || '').toLowerCase();

            const isRelevant = isAdmin ||
                               taskRole.includes(userRole) ||
                               taskCreatorMobile === userMobile ||
                               taskCreatorName === userName;

            if (isRelevant) {
                total++;
                if (task.status === 'Closed' || task.status === 'Completed' || task.status === 'Rejected') {
                    completed++;
                } else {
                    pending++;
                }
            }
        });
        if (document.getElementById('total-tasks-count')) document.getElementById('total-tasks-count').innerText = total;
        if (document.getElementById('pending-tasks-count')) document.getElementById('pending-tasks-count').innerText = pending;
        if (document.getElementById('completed-tasks-count')) document.getElementById('completed-tasks-count').innerText = completed;
    });

    // RE-INITIALIZE ATTENDANCE LISTENER
    const cinBtn = document.getElementById('s-checkin-btn');
    const coutBtn = document.getElementById('s-checkout-btn');
    const statusText = document.getElementById('attendanceStatusText');

    if (cinBtn) { cinBtn.disabled = false; cinBtn.innerHTML = '<i class="fa-regular fa-check-circle"></i> Check In'; }
    if (coutBtn) { coutBtn.disabled = false; coutBtn.innerHTML = '<i class="fa-regular fa-circle-xmark"></i> Check Out'; }

    onValue(ref(db, 'active_staff_sessions/' + staff.mobile), async (snapshot) => {
        const session = snapshot.val();
        console.log("📥 Attendance State Update:", session ? session.status : "No session");

        if (session && session.status === 'checked_in') {
            if (cinBtn) cinBtn.classList.add('hidden');
            if (coutBtn) coutBtn.classList.remove('hidden');
            if (statusText) statusText.innerText = "Checked in at " + (session.timeIn || "recently");

            if (coutBtn) {
                coutBtn.onclick = () => {
                    window.openPasswordModal("Check-Out Security", async () => {
                        if (session.keyStatus === 'HELD') {
                            window.openKeyReturnModal(session.key, session, async () => {
                                await proceedCheckOut(staff, session, coutBtn, true);
                            });
                        } else {
                            await proceedCheckOut(staff, session, coutBtn, false);
                        }
                    });
                };
            }
        } else {
            if (cinBtn) {
                cinBtn.classList.remove('hidden');
                cinBtn.onclick = () => {
                    // Step 1: Security Password
                    window.openPasswordModal("Check-In Security", () => {
                        // Step 2: Signature Modal
                        window.openSignatureModal("Staff Check-In", async (sigData) => {
                            const role = (staff.role || '').toLowerCase();
                            const isSecurityOrAdmin = (role === 'security' || role === 'admin');

                            // Step 3: Trigger Key Collection Modal for Non-Security Staff
                            if (!isSecurityOrAdmin) {
                                if (typeof window.openKeyCollectionModal === 'function') {
                                    window.openKeyCollectionModal(async (hasKey, keyCode) => {
                                        await proceedCheckIn(staff, sigData, cinBtn, hasKey, keyCode);
                                    });
                                } else {
                                    // Fallback prompt if modal function is unavailable
                                    const hasKey = confirm("Did you collect a key for this shift?");
                                    const keyCode = hasKey ? prompt("Enter Key Code/ID:") : null;
                                    await proceedCheckIn(staff, sigData, cinBtn, hasKey, keyCode);
                                }
                            } else {
                                await proceedCheckIn(staff, sigData, cinBtn, false, null);
                            }
                        });
                    });
                };
            }
            if (coutBtn) coutBtn.classList.add('hidden');
            if (statusText) statusText.innerText = "Ready to check in";
        }
    });
};

// Maintain alias for backward compatibility
window.renderDashboard = window.initUserDashboard;

async function proceedCheckIn(staff, sigData, btn, hasKey, keyCode = null) {
    console.log("📥 Check-In: Proceeding...");
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    window.showGlobalSpinner("Saving Check-In Record...");

    try {
        const loc = await getFastLocation();

        // Network Performance Check
        const ping = await checkNetworkPing();
        if (ping > NETWORK_SPEED_THRESHOLD) window.showSlowNetWarning();

        const res = await window.uploadToDrive({
            category: UPLOAD_CONFIG.CATEGORIES.STAFF_ATTENDANCE,
            fileName: `Attendance_In_${staff.mobile}_${Date.now()}.png`,
            image: sigData
        });

        if (res.status !== 'success') throw new Error(res.message || "Upload failed");

        const key = staff.mobile + '_' + Date.now();
        const pin = hasKey ? window.generateKeyReturnPin() : null;
        const data = {
            mobile: staff.mobile,
            name: staff.fullName || staff.name,
            role: staff.role || "Staff",
            branch: staff.branch || staff.school || "School 1",
            status: 'checked_in',
            date: new Date().toLocaleDateString(),
            timeIn: new Date().toLocaleTimeString(),
            timestamp: Date.now(),
            signatureUrl: res.fileUrl,
            lat: loc.lat,
            lng: loc.lng,
            keyStatus: hasKey ? "HELD" : "NONE",
            keyCode: keyCode || "N/A",
            keyCollectTime: hasKey ? Date.now() : null,
            keyReturnPin: pin,
            companyName: staff.companyName || "N/A",
            companyId: staff.companyId || "N/A",
            adekPass: staff.adekPass || staff.adcPassNumber || "N/A"
        };

        // FORCE REST FALLBACK IF NEEDED
        const dbStatus = await safeFirebaseWrite('set', 'staff_attendance/' + key, data);

        // SYNC TO SECURITY KEY CONTROL (RESTORED)
        if (hasKey) {
            await safeFirebaseWrite('set', 'security_key_control/' + staff.mobile, {
                name: data.name,
                mobile: data.mobile,
                role: data.role,
                pin: pin,
                status: 'HELD',
                timestamp: Date.now()
            });
        }

        await safeFirebaseWrite('set', 'active_staff_sessions/' + staff.mobile, {
            status: 'checked_in', key, timeIn: data.timeIn, keyStatus: data.keyStatus, keyReturnPin: pin, mobile: staff.mobile
        });

        if (window.triggerSuccessPopup) {
            const welcomeMsg = `Welcome, ${staff.fullName || staff.name || "Staff"}! Checked-in successfully. Have a great day! 👋`;
            const msg = dbStatus.status === 'offline_queued' ? "Saved Offline! Syncing when network improves. ✅" : welcomeMsg;
            window.triggerSuccessPopup(msg);
        } else alert(`Welcome, ${staff.fullName || staff.name || "Staff"}! Checked-in successfully. Have a great day! 👋`);

    } catch (err) {
        console.error("❌ Check-In Error:", err);
        alert("Error: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-regular fa-check-circle"></i> Check In';
        window.hideGlobalSpinner();
    }
}

async function proceedCheckOut(staff, session, btn, keyReturned) {
    console.log("📤 Check-Out: Proceeding...");
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    window.showGlobalSpinner("Finalizing Check-Out...");

    try {
        const loc = await getFastLocation();

        const data = {
            status: 'checked_out',
            checkOutTime: new Date().toLocaleTimeString(),
            checkOutTimestamp: Date.now(),
            checkOutLat: loc.lat,
            checkOutLng: loc.lng
        };

        if (keyReturned) {
            data.keyStatus = "RETURNED";
            data.keyReturnTime = Date.now();
        }

        const dbStatus = await safeFirebaseWrite('update', 'staff_attendance/' + (session?.key || ""), data);

        // UPDATE SECURITY KEY CONTROL (RESTORED)
        if (keyReturned) {
            await safeFirebaseWrite('set', 'security_key_control/' + staff.mobile, null);
        }

        await safeFirebaseWrite('set', 'active_staff_sessions/' + staff.mobile, null);

        if (window.triggerSuccessPopup) {
            const msg = dbStatus.status === 'offline_queued' ? "Saved Offline! Syncing when network improves. 👋" : "Checked Out Successfully! 👋";
            window.triggerSuccessPopup(msg);
        } else alert("Checked out!");

    } catch (err) {
        console.error("❌ Check-Out Error:", err);
        alert("Error: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-regular fa-circle-xmark"></i> Check Out';
        window.hideGlobalSpinner();
    }
}

window.loadPersonalAttendance = async (mobile) => {
    const body = document.getElementById('cleaner-attendance-body');
    const countEl = document.getElementById('cleaner-total-days');
    if (!body) return;

    try {
        const snap = await get(ref(db, 'staff_attendance'));
        if (snap.exists()) {
            const data = snap.val();
            // Cache locally
            localStorage.setItem(`personal_attendance_${mobile}`, JSON.stringify(data));
            renderAttendanceList(data, mobile, body, countEl);
        } else {
            body.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-gray-400">No records found</td></tr>';
        }
    } catch (e) {
        console.warn("⚠️ Restricted Wi-Fi mode: Loading history from local cache.");
        const cached = localStorage.getItem(`personal_attendance_${mobile}`);
        if (cached) {
            renderAttendanceList(JSON.parse(cached), mobile, body, countEl);
            window.showWhatsAppToast("⚠️ Offline Mode", "Loaded from local cache.");
        } else {
            body.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-red-400">Error loading history</td></tr>';
        }
    }
};

function renderAttendanceList(data, mobile, body, countEl) {
    const all = Object.values(data).filter(a => a.mobile === mobile);
    all.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (countEl) countEl.innerText = `${all.length} Days Total`;

    body.innerHTML = all.map(a => {
        let keyLog = '<span class="text-slate-300">N/A</span>';
        if (a.keyStatus === 'HELD') keyLog = '🔑 <span class="text-amber-600">Held</span>';
        else if (a.keyStatus === 'RETURNED') keyLog = '✅ <span class="text-emerald-600">Returned</span>';
        else if (a.keyStatus === 'NONE') keyLog = '❌ <span class="text-slate-400">None</span>';

        return `
            <tr>
                <td class="p-4 font-bold text-indigo-900">${a.date}</td>
                <td class="p-4 text-emerald-600 font-bold">${a.timeIn || '-'}</td>
                <td class="p-4 text-red-500 font-bold">${a.checkOutTime || '-'}</td>
                <td class="p-4">${keyLog}</td>
            </tr>
        `;
    }).join('');
}

window.loadSecurityPinControl = () => {
    const role = (window.currentStaff?.role || "").toString().trim().toLowerCase();
    const container = document.getElementById('security-pin-control');
    const body = document.getElementById('security-pin-list-body');

    if (role !== 'security' && (localStorage.getItem('isAdminLoggedIn') !== 'true')) {
        if (container) {
            container.classList.add('hidden');
            container.style.display = 'none';
        }
        return;
    }

    if (container) {
        container.classList.remove('hidden');
        container.style.display = 'block';
    }

    if (!body) return;

    onValue(ref(db, 'staff_attendance'), () => renderPinTable());
    onValue(ref(db, 'visitors'), () => renderPinTable());
    onValue(ref(db, 'contractors'), () => renderPinTable());

    renderPinTable();

    async function renderPinTable() {
        try {
            const [staffSnap, visSnap, conSnap] = await Promise.all([
                get(ref(db, 'staff_attendance')),
                get(ref(db, 'visitors')),
                get(ref(db, 'contractors'))
            ]);

            let rows = [];

            // 1. Process Staff
            if (staffSnap.exists()) {
                Object.entries(staffSnap.val()).forEach(([key, s]) => {
                    if (s.status === 'checked_in' && s.keyStatus === 'HELD') {
                        rows.push({
                            name: s.name,
                            id: s.adekPass || s.mobile,
                            type: 'STAFF',
                            info: s.companyName || 'Staff Member',
                            pin: s.keyReturnPin || '0000',
                            key: 'School Master Key',
                            signature: s.signatureUrl,
                            fullData: s,
                            firebaseKey: key,
                            dataType: 'staff'
                        });
                    }
                });
            }

            // 2. Process Visitors
            if (visSnap.exists()) {
                Object.entries(visSnap.val()).forEach(([key, v]) => {
                    if (v.status === 'active' && (v.keyCollected === 'YES' || v.keyCollected === true)) {
                        rows.push({
                            name: v.name,
                            id: v.id,
                            type: 'VISITOR',
                            info: v.company || v.purpose,
                            pin: v.keyReturnPin || v.checkoutPin || '0000',
                            key: 'Visitor Badge',
                            signature: v.signatureUrl,
                            fullData: v,
                            firebaseKey: key,
                            dataType: 'visitor'
                        });
                    }
                });
            }

            // 3. Process Contractors
            if (conSnap.exists()) {
                Object.entries(conSnap.val()).forEach(([key, c]) => {
                    if (c.status === 'active' && (c.keyCollected === 'YES' || c.keyCollected === true)) {
                        rows.push({
                            name: c.name,
                            id: c.id,
                            type: 'CONTRACTOR',
                            info: `${c.company || ''} (${c.contractorId || ''})`,
                            pin: c.keyReturnPin || c.checkoutPin || '0000',
                            key: 'Service Key',
                            signature: c.signatureUrl,
                            fullData: c,
                            firebaseKey: key,
                            dataType: 'contractor'
                        });
                    }
                });
            }

            if (rows.length === 0) {
                body.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500 font-black uppercase tracking-widest">No active keys issued.</td></tr>';
                return;
            }

            body.innerHTML = rows.map(r => {
                const sigHTML = (r.signature && r.signature.length > 30)
                    ? `<img src="${r.signature}" class="h-8 w-14 object-contain bg-white rounded border border-slate-600 mx-auto cursor-pointer shadow-sm hover:scale-110 transition-all" onclick="window.openImageZoom('${r.signature}')" alt="Sig">`
                    : `<span class="text-[8px] text-slate-500 italic">No Sig</span>`;

                const typeColor = r.type === 'STAFF' ? 'bg-indigo-500/20 text-indigo-400' : r.type === 'VISITOR' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400';

                return `
                    <tr class="hover:bg-white/5 border-b border-white/5 transition-colors">
                        <td class="p-4 align-middle font-black text-white uppercase text-xs">${r.name}</td>
                        <td class="p-4 align-middle">
                            <span class="inline-block px-2 py-0.5 rounded text-[8px] font-black uppercase ${typeColor}">${r.type}</span>
                        </td>
                        <td class="p-4 align-middle font-mono font-bold text-slate-400 text-xs">${r.id}</td>
                        <td class="p-4 text-center align-middle">
                            <div class="flex flex-col items-center">
                                <span class="text-amber-500 font-bold text-[9px] flex items-center gap-1 mb-1">
                                    <i class="fa-solid fa-key"></i> ${r.key}
                                </span>
                                <span class="px-2 py-1 bg-emerald-500 text-white rounded-lg font-black text-[10px] tracking-widest shadow-lg shadow-emerald-500/20">
                                    PIN: ${r.pin}
                                </span>
                            </div>
                        </td>
                        <td class="p-4 text-center align-middle">${sigHTML}</td>
                        <td class="p-4 text-center align-middle">
                            <button onclick="window.openDetailedAuditModal('${r.dataType}', '${r.firebaseKey}')" class="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg active:scale-95 transition-all flex items-center justify-center mx-auto">
                                <i class="fa-solid fa-eye text-sm"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (e) {
            console.error("Error loading PIN control:", e);
        }
    }
};

console.log("✅ attendance_module.js: UI & Security Fully Fixed");
// 3. ATTACH KEYPRESS LISTENER FOR 'ENTER' KEY SUBMISSION
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('key-return-pin-input');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.confirmKeyReturn(e);
            }
        });
    }
});
