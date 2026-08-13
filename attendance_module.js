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

window.renderDashboard = async (staff) => {
    console.log("📊 renderDashboard: Initializing for", staff.name);
    window.currentStaff = staff;

    const role = (staff.role || "Staff").toString().trim().toLowerCase();
    const isSecurity = (role === 'security');
    const isAdmin = (role === 'admin');

    const authArea = document.getElementById('staff-auth-area');
    const dashArea = document.getElementById('staff-dash-area');

    if (authArea) authArea.classList.add('hidden');
    if (dashArea) dashArea.classList.remove('hidden');

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
            el.classList.add('hidden');
            el.style.display = 'none';
        }
    });

    const homeView = document.getElementById('staff-home-view') || document.getElementById('staff-dash-area');
    if (homeView) homeView.classList.remove('hidden');

    if (window.applyRoleDashboardRules) {
        window.applyRoleDashboardRules(role);
        if (role === 'cleaner') window.loadPersonalAttendance(staff.mobile);
        if (role === 'security') window.loadSecurityPinControl();
        // Force load task stats for dashboard
        if (window.loadRoleView) window.loadRoleView(staff);
    }

    const nameDisplay = document.getElementById('userNameDisplay');
    if (nameDisplay) nameDisplay.innerText = staff.fullName || staff.name || "Staff";

    const idDisplay = document.getElementById('s-dash-id-display');
    if (idDisplay) idDisplay.innerText = `ID: ${staff.staffId || staff.adekPass || "-"}`;

    const roleEl = document.getElementById('s-dash-role-display');
    if (roleEl) roleEl.innerText = staff.role || "Staff";

    const branchEl = document.getElementById('userBranchDisplay');
    if (branchEl) branchEl.innerHTML = `<i class="fa-solid fa-location-dot text-indigo-400"></i> ${staff.branch || staff.school || "Jern Yafoor School"}`;

    const profileImg = window.getDirectDriveImageUrl(staff.profilePicUrl);
    ['userAvatar', 'menuAvatar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = `<img src="${profileImg}" class="w-full h-full object-cover" onerror="this.src=window.generateLocalAvatar('${staff.name || 'U'}')">`;

            el.classList.add('overflow-hidden');
        }
    });

    const cinBtn = document.getElementById('s-checkin-btn');
    const coutBtn = document.getElementById('s-checkout-btn');
    const statusText = document.getElementById('attendanceStatusText');

    if (cinBtn) { cinBtn.disabled = false; cinBtn.innerHTML = '<i class="fa-regular fa-check-circle"></i> Check In'; }
    if (coutBtn) { coutBtn.disabled = false; coutBtn.innerHTML = '<i class="fa-regular fa-circle-xmark"></i> Check Out'; }

    onValue(ref(db, 'active_staff_sessions/' + staff.mobile), async (snapshot) => {
        const session = snapshot.val();

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
                    window.openPasswordModal("Check-In Security", () => {
                        window.openSignatureModal("Staff Check-In", async (sigData) => {
                            if (!isSecurity && !isAdmin) {
                                window.openKeyCollectionModal(async (hasKey) => {
                                    await proceedCheckIn(staff, sigData, cinBtn, hasKey);
                                });
                            } else {
                                await proceedCheckIn(staff, sigData, cinBtn, false);
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

async function proceedCheckIn(staff, sigData, btn, hasKey) {
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
            keyCollectTime: hasKey ? Date.now() : null,
            keyReturnPin: pin,
            companyName: staff.companyName || "N/A",
            companyId: staff.companyId || "N/A",
            adekPass: staff.adekPass || staff.adcPassNumber || "N/A"
        };

        // FORCE REST FALLBACK IF NEEDED
        const dbStatus = await safeFirebaseWrite('set', 'staff_attendance/' + key, data);
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
    const head = container ? container.querySelector('thead') : null;

    if (role !== 'security') {
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

    if (head) {
        head.innerHTML = `
            <thead class="bg-indigo-950/70 text-indigo-300 font-extrabold uppercase text-[10px] tracking-wider">
                <tr>
                    <th class="p-3 text-left">Visitor / Contractor / Staff</th>
                    <th class="p-3 text-left">Category & Details</th>
                    <th class="p-3 text-left">Key Details</th>
                    <th class="p-3 text-center">Checkout PIN</th>
                </tr>
            </thead>
        `;
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

            const syncLocalVActive = (id, pin) => {
                const local = localStorage.getItem('vActive');
                if (local) {
                    try {
                        const data = JSON.parse(local);
                        if (data.id === id) {
                            data.keyReturnPin = pin;
                            data.checkoutPin = pin;
                            localStorage.setItem('vActive', JSON.stringify(data));
                        }
                    } catch(e) {}
                }
            };

            // 1. Process Staff
            if (staffSnap.exists()) {
                for (const [key, s] of Object.entries(staffSnap.val())) {
                    if (s.status === 'checked_in' && s.keyStatus === 'HELD') {
                        if (!s.keyReturnPin) {
                            const newPin = Math.floor(1000 + Math.random() * 9000).toString();
                            await update(ref(db, `staff_attendance/${key}`), {
                                keyReturnPin: newPin,
                                checkoutPin: newPin
                            });
                            s.keyReturnPin = newPin;
                        }
                        rows.push({
                            name: s.name,
                            id: s.adekPass || s.mobile,
                            type: 'STAFF',
                            info: s.companyName || 'Staff',
                            pin: s.keyReturnPin,
                            key: 'School Master Key'
                        });
                    }
                }
            }

            // 2. Process Visitors
            if (visSnap.exists()) {
                for (const [key, v] of Object.entries(visSnap.val())) {
                    if (v.status === 'active' && v.keyCollected === 'YES') {
                        if (!v.keyReturnPin) {
                            const newPin = Math.floor(1000 + Math.random() * 9000).toString();
                            await update(ref(db, `visitors/${key}`), {
                                keyReturnPin: newPin,
                                checkoutPin: newPin
                            });
                            v.keyReturnPin = newPin;
                            syncLocalVActive(v.id, newPin);
                        }
                        rows.push({
                            name: v.name,
                            id: v.id,
                            type: 'VISITOR',
                            info: v.company || v.purpose,
                            pin: v.keyReturnPin,
                            key: 'Visitor Badge'
                        });
                    }
                }
            }

            // 3. Process Contractors
            if (conSnap.exists()) {
                for (const [key, c] of Object.entries(conSnap.val())) {
                    if (c.status === 'active' && c.keyCollected === 'YES') {
                        if (!c.keyReturnPin) {
                            const newPin = Math.floor(1000 + Math.random() * 9000).toString();
                            await update(ref(db, `contractors/${key}`), {
                                keyReturnPin: newPin,
                                checkoutPin: newPin
                            });
                            c.keyReturnPin = newPin;
                            syncLocalVActive(c.id, newPin);
                        }
                        rows.push({
                            name: c.name,
                            id: c.id,
                            type: 'CONTRACTOR',
                            info: `${c.company || ''} (${c.contractorId || ''})`,
                            pin: c.keyReturnPin,
                            key: 'Service Key'
                        });
                    }
                }
            }

            if (rows.length === 0) {
                body.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-500 font-bold uppercase tracking-widest">No active keys issued.</td></tr>';
                return;
            }

            body.innerHTML = rows.map(r => `
                <tr class="hover:bg-white/5 border-b border-white/5 transition-colors">
                    <td class="p-3 align-middle">
                        <div class="font-black text-white text-sm uppercase tracking-wide">${r.name}</div>
                        <div class="text-[10px] text-indigo-400 font-mono font-bold">ID: ${r.id}</div>
                    </td>
                    <td class="p-3 align-middle">
                        <span class="inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase mb-1 ${r.type === 'STAFF' ? 'bg-indigo-500/20 text-indigo-400' : r.type === 'VISITOR' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}">${r.type}</span>
                        <div class="text-[10px] text-slate-300 font-medium truncate max-w-[150px]">${r.info}</div>
                    </td>
                    <td class="p-3 align-middle">
                        <div class="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                            <i class="fa-solid fa-key text-[9px]"></i> ${r.key}
                        </div>
                    </td>
                    <td class="p-3 text-center align-middle">
                        <div class="inline-flex flex-col items-center">
                            <span class="px-3 py-1.5 bg-emerald-500 text-white rounded-xl font-black text-xs shadow-md tracking-widest">
                                🔑 PIN: ${r.pin}
                            </span>
                            <span class="text-[7px] text-emerald-400 font-bold uppercase mt-0.5">Required for Exit</span>
                        </div>
                    </td>
                </tr>
            `).join('');
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
