import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, set, update, push, onValue, get, child, off } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================================ */
// NETWORK SPEED & OFFLINE SYNC HANDLERS (FIXED v4.3)               */
// ================================================================ */

const NETWORK_SPEED_THRESHOLD = 3500;
const OFFLINE_SYNC_KEY = 'pending_offline_sync';
const DB_BASE_URL = db?.app?.options?.databaseURL || 'https://schoollog-f0a04-default-rtdb.firebaseio.com';

const checkNetworkPing = async () => {
    const start = Date.now();
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        await fetch(`${DB_BASE_URL}/.json?shallow=true`, {
            cache: 'no-store',
            signal: controller.signal
        });
        clearTimeout(timeoutId);
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
    toast.innerHTML = `<i class="fa-solid fa-wifi"></i> <span>⚠️ Slow Network Detected! Syncing...</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast?.remove(), 5000);
};

async function safeFirebaseWrite(type, path, data) {
    try {
        if (!navigator.onLine) {
            addToOfflineSync(type, path, data);
            return { status: 'offline_queued' };
        }

        if (type === 'set') {
            await set(ref(db, path), data);
        } else {
            await update(ref(db, path), data);
        }
        return { status: 'success' };
    } catch (e) {
        console.warn("SDK Write Failed, attempting REST Fallback:", e);
        return await firebaseRestFallback(type, path, data, true);
    }
}

async function firebaseRestFallback(type, path, data, allowQueueing = true) {
    const url = `${DB_BASE_URL}/${path}.json`;
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
        if (allowQueueing) {
            addToOfflineSync(type, path, data);
        }
        return { status: 'offline_queued' };
    }
}

function addToOfflineSync(type, path, data) {
    const queue = JSON.parse(localStorage.getItem(OFFLINE_SYNC_KEY) || '[]');
    // Avoid exact duplicate writes in queue
    const isDuplicate = queue.some(item => item.path === path && item.type === type && JSON.stringify(item.data) === JSON.stringify(data));
    if (!isDuplicate) {
        queue.push({ type, path, data, timestamp: Date.now() });
        localStorage.setItem(OFFLINE_SYNC_KEY, JSON.stringify(queue));
    }
}

window.processOfflineSync = async () => {
    if (!navigator.onLine) return;

    const queue = JSON.parse(localStorage.getItem(OFFLINE_SYNC_KEY) || '[]');
    if (queue.length === 0) return;

    const remaining = [];
    for (const item of queue) {
        try {
            const res = await firebaseRestFallback(item.type, item.path, item.data, false);
            if (res.status !== 'success') {
                remaining.push(item);
            }
        } catch (e) {
            remaining.push(item);
        }
    }
    localStorage.setItem(OFFLINE_SYNC_KEY, JSON.stringify(remaining));
};

setInterval(window.processOfflineSync, 15000);

// ================================================================ */
// ✅ SESSION ISOLATION UTILITIES (FIXED v7.0 - ADEK PASS BASED)     */
// ================================================================ */

/**
 * Helper to get unique identifier (ADEK Pass) from staff object
 */
function getStaffPassId(staff) {
    if (!staff) return '';
    return String(staff.adekPass || staff.adcPassNumber || staff.username || staff.mobile || '').trim();
}

/**
 * 1. Logged-In User का Pass ID निकालने का Bulletproof Helper
 * 🛡️ STRICT TAB ISOLATION: Prioritize sessionStorage to prevent multi-tab leaks.
 */
function getActiveUserKey() {
    try {
        // 1. Primary: Current Tab Session (Safe for multi-tab)
        const session = JSON.parse(sessionStorage.getItem('active_staff_user') || '{}');
        const passId = getStaffPassId(session);
        if (passId) return passId;

        // 2. Secondary: Fallback to localStorage only if session is missing
        const local = JSON.parse(localStorage.getItem('loggedStaff') || '{}');
        const localPassId = getStaffPassId(local);
        if (localPassId) return localPassId;

        const mobileStr = localStorage.getItem('loggedStaffMobile');
        if (mobileStr) return String(mobileStr).trim();
    } catch (e) {
        console.warn("⚠️ getActiveUserKey: Parse error", e);
    }
    return '';
}
// ================================================================ */
// SESSION VALIDATION & STALE CLEANUP (FIXED v4.3)                 */
// ================================================================ */

// ================================================================ */
// ✅ FIX 1: Session Validation & Stale Cleanup                     */
// ================================================================ */

async function getValidActiveSession(passId) {
    if (!passId) return { valid: false, session: null, reason: 'No Pass ID' };

    try {
        const sessionRef = ref(db, `active_staff_sessions/${passId}`);
        const sessionSnap = await get(sessionRef);

        if (!sessionSnap.exists()) {
            return { valid: false, session: null, reason: 'No active session found' };
        }

        const session = sessionSnap.val();
        if (session.status !== 'checked_in') {
            return { valid: false, session: null, reason: 'Session is not checked in' };
        }

        // ✅ CRITICAL: Verify attendance record exists
        if (session.key) {
            const attSnap = await get(ref(db, `staff_attendance/${session.key}`));
            if (!attSnap.exists()) {
                console.warn(`🧹 Clearing stale session for ${passId}`);
                await set(sessionRef, null);
                return { valid: false, session: null, reason: 'Stale session cleared' };
            }

            const attRecord = attSnap.val();
            if (attRecord.status !== 'checked_in') {
                await set(sessionRef, null);
                return { valid: false, session: null, reason: 'Invalid session cleared' };
            }

            return {
                valid: true,
                session: { ...session, attendanceRecord: attRecord, attendanceKey: session.key },
                reason: 'Valid session'
            };
        }

        // Security without key
        const isSecurity = (session.role || '').toLowerCase().includes('security');
        if (isSecurity) {
            return { valid: true, session: session, reason: 'Valid Security Session' };
        }

        return { valid: false, session: null, reason: 'No attendance key in session' };

    } catch (error) {
        console.error('Session validation error:', error);
        return { valid: false, session: null, reason: error.message };
    }
}

window.validateActiveSession = async (passId) => {
    const res = await getValidActiveSession(passId);
    return res.valid;
};

// ✅ FIXED: Signature Modal with Global Callback
window.sigCallback = null;

window.openSignatureModal = (title, callback) => {
    console.log("📝 Signature Modal: Opening -", title);

    const titleEl = document.getElementById('sig-modal-title');
    if (titleEl) titleEl.innerText = title;

    const modal = document.getElementById('signature-modal');
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';

        // Reset and Unlock Pad
        const wrappers = modal.querySelectorAll('.canvas-wrapper');
        wrappers.forEach(w => {
            w.classList.remove('unlocked');
            const overlay = w.querySelector('.sig-lock-overlay');
            if (overlay) overlay.style.display = 'flex';

            const canvas = w.querySelector('canvas');
            if (canvas && window.sigPadManager) {
                const pad = window.sigPadManager.getPad(canvas.id);
                if (pad) {
                    pad.lock();
                    pad.clear();
                }
            }
        });

        if (typeof window.hideGlobalSpinner === 'function') {
            window.hideGlobalSpinner();
        }
    }

    // ✅ Store callback globally
    window.sigCallback = callback;
};

window.closeSignatureModal = () => {
    console.log("📝 Signature Modal: Closing");
    const modal = document.getElementById('signature-modal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    if (window.sigPadManager) {
        const pad = window.sigPadManager.getPad('sig-canvas');
        if (pad) {
            pad.lock();
            pad.clear();
        }
    }
    window.sigCallback = null;
};

// Delegate Event Handlers safely
document.addEventListener('DOMContentLoaded', () => {
    // ✅ FIXED: Confirm Button - Uses window.sigCallback (Global)
    const confirmBtn = document.getElementById('sig-confirm-btn');
    if (confirmBtn) {
        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            try {
                if (!window.sigPadManager) {
                    alert("Signature pad manager not initialized.");
                    return;
                }
                const canvasPad = window.sigPadManager.getPad('sig-canvas');
                if (!canvasPad || canvasPad.isEmpty()) {
                    alert("Please provide a signature.");
                    return;
                }

                const data = canvasPad.toDataURL();
                if (!data || data.length < 1000) {
                    alert("Please provide a valid signature.");
                    return;
                }

                if (typeof window.sigCallback === 'function') {
                    const cb = window.sigCallback;
                    window.sigCallback = null;
                    cb(data);
                }
                window.closeSignatureModal();
            } catch (err) {
                console.error("Signature Capture Failed:", err);
                alert("Capture failed.");
            }
        });
    }
});

// ================================================================ */
// PASSWORD VERIFICATION MODAL (FIXED v4.3)                         */
// ================================================================ */

let passwordCallback = null;

window.openPasswordModal = (title, callback) => {
    const titleEl = document.getElementById('password-modal-title');
    if (titleEl) titleEl.innerText = title;

    const modal = document.getElementById('password-modal');
    const input = document.getElementById('modal-auth-pass');

    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 100);
    }
    passwordCallback = callback;
};

window.closePasswordModal = () => {
    const modal = document.getElementById('password-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    const input = document.getElementById('modal-auth-pass');
    if (input) input.value = '';
    passwordCallback = null;
};

// Password Submit Listener setup
document.addEventListener('DOMContentLoaded', () => {
    const confirmPassBtn = document.getElementById('password-modal-confirm');
    const passInput = document.getElementById('modal-auth-pass');

    const handlePasswordSubmit = () => {
        const passVal = passInput ? passInput.value.trim() : '';
        if (!passVal) {
            alert("Please enter password.");
            return;
        }
        if (passwordCallback) {
            const cb = passwordCallback;
            passwordCallback = null;
            cb(passVal);
        }
        window.closePasswordModal();
    };

    if (confirmPassBtn && !confirmPassBtn.dataset.bound) {
        confirmPassBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handlePasswordSubmit();
        });
        confirmPassBtn.dataset.bound = "true";
    }

    if (passInput && !passInput.dataset.bound) {
        passInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handlePasswordSubmit();
            }
        });
        passInput.dataset.bound = "true";
    }
});

// ================================================================ */
// UI BUTTON UPDATER (FIXED v6.1 - STRICT SESSION ISOLATION)        */
// ================================================================ */

/**
 * @param {string} status - 'checked_in' or 'checked_out'
 * @param {string} timeText - Display time
 * @param {boolean} isSecurity_ignored - (Legacy, now auto-detected)
 * @param {string} targetPassId - The Pass ID this data belongs to
 */
function updateAttendanceButtons(status, timeText, isSecurity_ignored, targetPassId) {
    const myPassId = getActiveUserKey();
    const cleanTarget = String(targetPassId || '').trim();

    // 🛡️ SESSION ISOLATION: Only update UI if the update belongs to the logged-in user.
    if (!myPassId || !cleanTarget || myPassId !== cleanTarget) {
        console.log(`🛡️ Isolation Guard: Update for [${cleanTarget}] ignored. My Session: [${myPassId}]`);
        return;
    }

    console.log(`🔄 updateAttendanceButtons: status=${status}, target=${cleanTarget}`);

    // Detect which dashboard we are on by checking button existence
    const isSecurityDashboard = !!document.getElementById('security-checkin-btn');

    const cinBtnId = isSecurityDashboard ? 'security-checkin-btn' : 's-checkin-btn';
    const coutBtnId = isSecurityDashboard ? 'security-checkout-btn' : 's-checkout-btn';

    const cinBtn = document.getElementById(cinBtnId);
    const coutBtn = document.getElementById(coutBtnId);
    const statusText = document.getElementById('attendanceStatusText');

    if (status === 'checked_in') {
        if (cinBtn) {
            cinBtn.classList.add('hidden');
            cinBtn.style.display = 'none';
        }
        if (coutBtn) {
            coutBtn.classList.remove('hidden');
            coutBtn.style.display = 'inline-flex';
        }
        if (statusText) {
            statusText.textContent = isSecurityDashboard ? '🟢 Security shift active' : "Checked in at " + (timeText || 'now');
            statusText.className = 'text-xs font-black text-emerald-600';
        }
        window.currentAttendanceStatus = 'checked_in';
    } else {
        if (cinBtn) {
            cinBtn.classList.remove('hidden');
            cinBtn.style.display = 'inline-flex';
        }
        if (coutBtn) {
            coutBtn.classList.add('hidden');
            coutBtn.style.display = 'none';
        }
        if (statusText) {
            statusText.textContent = "Ready to check in";
            statusText.className = 'text-xs font-black text-slate-400';
        }
        window.currentAttendanceStatus = 'checked_out';
    }
}

function updateAttendanceStatus(text, status) {
    const statusElement = document.getElementById('attendanceStatusText');
    if (!statusElement) {
        console.warn('⚠️ attendanceStatusText element not found');
        return;
    }
    statusElement.innerText = text;
    if (status === 'checked_in') {
        statusElement.className = 'text-xs font-black text-emerald-600';
    } else {
        statusElement.className = 'text-xs font-black text-slate-400';
    }
    console.log(`✅ Status updated: ${text}`);
}

// ================================================================ */
// ✅ FIXED: Check-In Process with ADEK Pass ID                     */
// ================================================================ */

window.proceedCheckIn = async function(staff, sigData, btn, hasKey, keyCode = null, isSecurity = false) {
    const passId = getStaffPassId(staff);
    if (!btn || !passId) return;
    btn.disabled = true;
    try {
        const isActive = await validateActiveSession(passId);
        if (isActive) {
            alert("⚠️ You are already checked in. Please use Check-Out button.");
            updateAttendanceButtons('checked_in', 'Active', isSecurity, passId);
            return;
        }

        if (typeof window.showGlobalSpinner === 'function') {
            window.showGlobalSpinner("Saving Check-In...");
        }

        // Safe location retrieval fallback
        let loc = { lat: 0, lng: 0 };
        try {
            if (typeof getFastLocation === 'function') {
                loc = (await getFastLocation()) || loc;
            }
        } catch (locErr) {
            console.warn("Location capture failed, proceeding with fallback location:", locErr);
        }

        let sigUrl = '';
        if (window.uploadToDrive && sigData) {
            try {
                const res = await window.uploadToDrive({
                    category: UPLOAD_CONFIG.CATEGORIES.STAFF_ATTENDANCE,
                    fileName: `In_${passId}_${Date.now()}.png`,
                    image: sigData
                });
                sigUrl = res?.fileUrl || '';
            } catch (upErr) {
                console.error("Signature upload failed:", upErr);
            }
        }

        const now = new Date();
        const key = `${passId}_${Date.now()}`;
        // Use provided keyCode or generate new if missing
        const pin = hasKey ? (keyCode || Math.floor(1000 + Math.random() * 9000).toString()) : null;
        const timeIn = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateStr = now.toISOString().split('T')[0];

        const updates = {};
        updates[`staff_attendance/${key}`] = {
            mobile: staff.mobile || '',
            passId: passId,
            name: staff.fullName || staff.name || 'Unknown',
            role: staff.role || 'Staff',
            status: 'checked_in',
            timeIn: timeIn,
            date: dateStr,
            signatureUrl: sigUrl,
            keyStatus: hasKey ? "HELD" : "NONE",
            keyReturnPin: pin,
            lat: loc.lat || 0,
            lng: loc.lng || 0,
            timestamp: Date.now()
        };
        const sessionData = {
            status: 'checked_in',
            key: key,
            timeIn: timeIn,
            keyStatus: hasKey ? "HELD" : "NONE",
            keyCollected: hasKey ? "YES" : "NO",
            mobile: staff.mobile || '',
            passId: passId,
            name: staff.fullName || staff.name,
            role: staff.role
        };
        updates[`active_staff_sessions/${passId}`] = sessionData;

        if (hasKey && pin) {
            updates[`security_key_control/${passId}`] = {
                name: staff.fullName || staff.name || 'Unknown',
                id: passId,
                type: 'STAFF',
                pin: pin,
                status: 'HELD',
                timestamp: Date.now()
            };
        }

        // Clean root multi-path update
        await safeFirebaseWrite('update', '', updates);

        // ✅ FIXED: Proper UI Update after successful check-in
        console.log('✅ Check-In successful, updating UI...');
        console.log(`✅ isSecurity: ${isSecurity}, role: ${staff.role}`);

        updateAttendanceButtons('checked_in', timeIn, isSecurity, passId);
        updateAttendanceStatus(isSecurity ? '🟢 Security shift active' : `Checked in at ${timeIn}`, 'checked_in');

        // ✅ ATTACH CHECK-OUT LISTENER IMMEDIATELY
        window.initSecurityCheckOutButton(staff, sessionData);

        // ✅ MANDATED FIX 1: Hiding PIN from user (Staff/Security)
        const successMsg = hasKey ? "✅ Check-In Successful! Key assigned successfully." : "✅ Check-In Successful!";
        alert(successMsg);
    } catch (err) {
        console.error("Check-In Error:", err);
        alert("Check-In Failed.");
    } finally {
        btn.disabled = false;
        if (typeof window.hideGlobalSpinner === 'function') {
            window.hideGlobalSpinner();
        }
    }
};

// ================================================================ */
// CHECK-OUT PROCESS (FIXED SIGNATURE & UI v4.3)                   */
// ================================================================ */

// ✅ FIXED: Check-Out Process with Pass ID Validation
window.executeCheckOutProcess = async function(staffUser, sessionData, sigData, isSecurity = false) {
    if (typeof window.showGlobalSpinner === 'function') {
        window.showGlobalSpinner("Processing Check-Out...");
    }

    try {
        const passId = getStaffPassId(staffUser);
        if (!passId) throw new Error("No Pass ID found.");

        // 🔒 MANDATED FIX: Re-verify session validity
        const validation = await getValidActiveSession(passId);
        if (!validation.valid) {
            alert(validation.reason || "No active session found.");
            return;
        }

        const activeSession = validation.session;
        const attKey = activeSession.attendanceKey;

        let sigUrl = '';
        if (sigData && window.uploadToDrive) {
            try {
                const res = await window.uploadToDrive({
                    category: UPLOAD_CONFIG.CATEGORIES.STAFF_ATTENDANCE,
                    fileName: `Out_${passId}_${Date.now()}.png`,
                    image: sigData
                });
                sigUrl = res?.fileUrl || '';
            } catch (upErr) {
                console.error("Check-out signature upload error:", upErr);
            }
        }

        const now = new Date();
        const checkOutTimeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const updates = {};
        if (attKey) {
            updates[`staff_attendance/${attKey}/status`] = 'checked_out';
            updates[`staff_attendance/${attKey}/checkOutTime`] = checkOutTimeStr;
            updates[`staff_attendance/${attKey}/checkOutSignatureUrl`] = sigUrl;
            updates[`staff_attendance/${attKey}/keyStatus`] = 'RETURNED';
        }
        updates[`active_staff_sessions/${passId}`] = null;
        updates[`security_key_control/${passId}`] = null;

        await safeFirebaseWrite('update', '', updates);
        updateAttendanceButtons('checked_out', null, isSecurity, passId);
        alert("✅ Checked-Out Successfully!");
    } catch (e) {
        console.error("Check-Out Error:", e);
        alert("Check-Out Failed.");
    } finally {
        if (typeof window.hideGlobalSpinner === 'function') {
            window.hideGlobalSpinner();
        }
    }
}
// ================================================================ */
// KEY COLLECTION MODAL HELPER                                      */
// ================================================================ */

let keyCollectionCallback = null;
window.openKeyCollectionModal = (callback) => {
    const modal = document.getElementById('key-collection-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
    keyCollectionCallback = callback;
};

window.confirmKeyCollection = (hasKey) => {
    const modal = document.getElementById('key-collection-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    if (keyCollectionCallback) {
        const cb = keyCollectionCallback;
        keyCollectionCallback = null;
        cb(hasKey);
    }
};

// ================================================================ */
// ✅ STAFF WORKFLOW HANDLERS (FIXED v6.0)                           */
// ================================================================ */

/**
 * 1. STAFF CHECK-IN: Password -> Signature -> Key Prompt
 */
window.handleStaffCheckIn = function(staff, btn) {
    if (!staff || !staff.mobile) {
        alert('Please login first.');
        return;
    }

    console.log(`🔐 handleStaffCheckIn started for: ${staff.fullName || staff.name}`);
    const isSecurity = (staff.role || '').toLowerCase().includes('security');
    console.log(`🔐 Role: ${staff.role}, isSecurity: ${isSecurity}`);

    window.openPasswordModal("Verify Identity to Check-In", (enteredPass) => {
        if (enteredPass !== staff.password) {
            alert("❌ Incorrect Password!");
            return;
        }

        window.openSignatureModal("Staff Signature Required", (sigData) => {
            window.openKeyCollectionModal((hasKey) => {
                let generatedPin = hasKey ?
                    Math.floor(1000 + Math.random() * 9000).toString() :
                    null;

                console.log(`🔐 Calling proceedCheckIn with isSecurity: ${isSecurity}`);
                window.proceedCheckIn(
                    staff,
                    sigData,
                    btn,
                    hasKey,
                    generatedPin,
                    isSecurity
                );
            });
        });
    });
};

/**
 * 4. STAFF CHECK-OUT: No Signature, PIN or Pass verification only
 */
window.handleStaffCheckOut = async function(staff, session, btn) {
    console.log("🚪 handleStaffCheckOut started");
    const hasKey = (session.keyStatus === 'HELD' || session.keyCollected === 'YES');
    const isSecurity = (staff.role || '').toLowerCase().includes('security');

    if (hasKey) {
        // Case A: Key WAS Taken -> Ask for PIN
        const enteredPin = prompt("🔑 KEY RETURN REQUIRED\n\nEnter the 4-digit PIN provided by Security:");
        if (enteredPin === null) return; // User cancelled

        const attSnap = await get(ref(db, `staff_attendance/${session.key}`));
        if (attSnap.exists() && (attSnap.val().keyReturnPin || "").toString() === enteredPin.trim()) {
            executeCheckOutProcess(staff, session, null, isSecurity); // Pass correct role flag
        } else {
            alert("❌ Invalid Key PIN! Verification failed.");
        }
    } else {
        // Case B: No Key -> Password verification only
        window.openPasswordModal("Verify Password to Check-Out", (enteredPass) => {
            if (enteredPass !== staff.password) return alert("❌ Incorrect Password!");
            executeCheckOutProcess(staff, session, null, isSecurity); // Pass correct role flag
        });
    }
};

// ================================================================ */
// SECURITY DASHBOARD SPECIFIC HANDLERS (FIXED v6.0 - DIRECT FLOW)  */
// ================================================================ */

window.handleSecurityCheckIn = function(event) {
    if (event) event.preventDefault();
    const staff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || '{}');
    const cinBtn = document.getElementById('s-checkin-btn') || document.getElementById('security-checkin-btn');
    window.handleStaffCheckIn(staff, cinBtn);
};

window.handleSecurityCheckOut = function(event) {
    if (event) event.preventDefault();
    const staff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || '{}');
    const coutBtn = document.getElementById('s-checkout-btn') || document.getElementById('security-checkout-btn');
    const passId = getStaffPassId(staff);

    get(ref(db, `active_staff_sessions/${passId}`)).then(snap => {
        if (snap.exists()) {
            window.handleStaffCheckOut(staff, snap.val(), coutBtn);
        } else {
            alert("No active check-in session found.");
        }
    });
};

// ================================================================ */
// DASHBOARD PIN LIST LOADER (NEW v5.6)                             */
// ================================================================ */

window.loadSecurityPinControl = function() {
    const tbody = document.getElementById('security-pin-list-body');
    if (!tbody) return;

    onValue(ref(db, 'security_key_control'), (snapshot) => {
        tbody.innerHTML = "";

        if (!snapshot.exists()) {
            tbody.innerHTML = "<tr><td colspan='6' class='p-8 text-center text-slate-500 uppercase font-black tracking-widest'>No active keys issued.</td></tr>";
            return;
        }

        const data = snapshot.val();
        Object.entries(data).forEach(([passId, log]) => {
            const row = document.createElement('tr');
            row.className = "border-b border-white/5 hover:bg-white/5 transition-colors";
            row.innerHTML = `
                <td class="p-3 font-bold text-white uppercase">${log.name || 'Unknown'}</td>
                <td class="p-3"><span class="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-md font-black uppercase text-[8px]">${log.type || 'STAFF'}</span></td>
                <td class="p-3 font-mono text-slate-400">${log.id || '-'}</td>
                <td class="p-3 text-center">
                    <div class="flex flex-col items-center gap-1">
                        <span class="text-[8px] font-black text-amber-500 uppercase">Return PIN</span>
                        <span class="bg-indigo-600 px-3 py-1 rounded-lg text-white font-black text-base shadow-lg shadow-indigo-500/30">${log.pin || '----'}</span>
                    </div>
                </td>
                <td class="p-3 text-center">
                    <span class="inline-flex items-center gap-1 text-[8px] font-black text-emerald-400 uppercase">
                        <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                        Active
                    </span>
                </td>
                <td class="p-3 text-center">
                    <button onclick="window.initiateKeyReturn('${passId}')" class="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[8px] font-black uppercase shadow-md active:scale-95 transition-all">
                        Verify Return
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    });
};

window.initiateKeyReturn = async (passId) => {
    window.showGlobalSpinner("Loading Session...");
    try {
        const snap = await get(ref(db, `active_staff_sessions/${passId}`));
        if (snap.exists()) {
            window.activeSessionForReturn = snap.val();
            window.activeSessionForReturn.passId = passId;

            const modal = document.getElementById('key-return-modal');
            if (modal) {
                modal.style.display = 'flex';
                document.getElementById('key-return-pin-input').value = '';
                document.getElementById('pin-error').classList.add('hidden');
            }
        } else {
            alert("No active session found for this user.");
        }
    } catch (e) {
        console.error("Initiate Return Error:", e);
    } finally {
        window.hideGlobalSpinner();
    }
};

// ================================================================ */
// DASHBOARD BUTTON INITIALIZATION (FIXED v5.7)                     */
// ================================================================ */

window.initSecurityCheckInButton = function() {
    const cinBtn = document.getElementById('s-checkin-btn') || document.getElementById('security-checkin-btn');
    if (!cinBtn) return;

    console.log("🔗 Binding Check-In Button:", cinBtn.id);

    // Remove old listener if any (cloning trick)
    const newBtn = cinBtn.cloneNode(true);
    cinBtn.parentNode.replaceChild(newBtn, cinBtn);

    newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const staff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user'));

        if (!staff || !staff.mobile) {
            alert("Session expired. Please login again.");
            window.location.href = 'staff-login.html';
            return;
        }

        console.log("👆 Check-In Button Pressed for:", staff.fullName || staff.name);
        window.handleStaffCheckIn(staff, newBtn);
    });
};

window.initSecurityCheckOutButton = function(staff, session) {
    console.log('🔧 initSecurityCheckOutButton called');

    // Try multiple button IDs
    let coutBtn = document.getElementById('security-checkout-btn');

    // If not found, try staff check-out button
    if (!coutBtn) {
        coutBtn = document.getElementById('s-checkout-btn');
        console.log('🔍 Using staff check-out button instead');
    }

    if (!coutBtn) {
        console.warn("⚠️ No check-out button found");
        return;
    }

    console.log('✅ Check-Out button found, attaching handler');

    // Remove old listener
    const newBtn = coutBtn.cloneNode(true);
    coutBtn.parentNode.replaceChild(newBtn, coutBtn);

    newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("🔐 Check-Out Button Clicked");

        const activeStaff = window.currentStaff || staff || JSON.parse(sessionStorage.getItem('active_staff_user') || '{}');

        if (!activeStaff || !activeStaff.mobile) {
            alert("Session expired. Please login again.");
            window.location.href = 'staff-login.html';
            return;
        }

        const isSecurity = (activeStaff.role || '').toLowerCase().includes('security');

        if (isSecurity) {
            console.log('🔐 Security Check-Out initiated');
            // Directly call handleStaffCheckOut to avoid redundant Firebase fetch
            window.handleStaffCheckOut(activeStaff, session, newBtn);
        } else {
            console.log('👤 Staff Check-Out initiated');
            window.handleStaffCheckOut(activeStaff, session, newBtn);
        }
    });
};

// ================================================================ */
// DASHBOARD LISTENER (SECURITY VS STAFF FIX v4.3)                  */
// ================================================================ */

let activeSessionUnsubscribe = null;

window.initUserDashboard = async (staff) => {
    const passId = getStaffPassId(staff);
    if (!staff || !passId) return;

    // 🛡️ ISOLATION: Set session identifier for this tab strictly
    window.currentStaff = staff;
    sessionStorage.setItem('active_staff_user', JSON.stringify(staff));

    // Optionally update localStorage but prioritize SESSION for UI
    localStorage.setItem('loggedStaffMobile', staff.mobile || '');

    // ✅ Sync Dashboard Header Data
    if (typeof window.renderDashboardProfile === 'function') {
        window.renderDashboardProfile(staff);
    }

    // Properly detach previous Firebase Realtime listener if active
    if (typeof activeSessionUnsubscribe === 'function') {
        activeSessionUnsubscribe();
        activeSessionUnsubscribe = null;
    }

    const sessionRef = ref(db, `active_staff_sessions/${passId}`);

    activeSessionUnsubscribe = onValue(sessionRef, async (snapshot) => {
        const session = snapshot.val();

        // 🔒 Verify session validity BEFORE updating UI
        const validation = await getValidActiveSession(passId);
        const isSecurity = (staff.role || '').toLowerCase().includes('security');

        if (session && validation.valid) {
            console.log(`📡 Session Update Received for [${passId}]: Checked-In`);
            updateAttendanceButtons('checked_in', session.timeIn, isSecurity, passId);
            window.initSecurityCheckOutButton(staff, session);
        } else {
            console.log(`📡 Session Update Received for [${passId}]: Checked-Out`);
            updateAttendanceButtons('checked_out', null, isSecurity, passId);
            window.initSecurityCheckInButton();
        }
    });

    if ((staff.role || '').toLowerCase() === 'security' && typeof window.loadSecurityPinControl === 'function') {
        window.loadSecurityPinControl();
    }
};

// ================================================================ */
// KEY RETURN MODAL LOGIC (FIXED WRITES v4.3)                      */
// ================================================================ */

window.confirmKeyReturn = async (event) => {
    if (event) event.preventDefault();
    const input = document.getElementById('key-return-pin-input');
    const error = document.getElementById('pin-error');
    const enteredPin = (input?.value || "").toString().trim();

    if (!window.activeSessionForReturn) return;
    const active = window.activeSessionForReturn;
    const passId = getStaffPassId(active);

    try {
        const snap = await get(ref(db, `staff_attendance/${active.key}`));
        if (snap.exists() && enteredPin === (snap.val().keyReturnPin || "").toString()) {
            const updates = {};
            updates[`staff_attendance/${active.key}/keyStatus`] = 'RETURNED';
            updates[`security_key_control/${passId}`] = null;
            updates[`active_staff_sessions/${passId}/keyStatus`] = 'RETURNED';

            await safeFirebaseWrite('update', '', updates);

            const modal = document.getElementById('key-return-modal');
            if (modal) modal.style.display = 'none';
            if (input) input.value = '';
            if (error) error.classList.add('hidden');

            alert("✅ Key Returned!");
            if (typeof window.loadSecurityPinControl === 'function') {
                window.loadSecurityPinControl();
            }
        } else {
            if (error) error.classList.remove('hidden');
        }
    } catch (e) {
        console.error("Key Return Failed:", e);
        alert("Return Failed.");
    }
};

// ================================================================ */
// FAST GEOLOCATION HELPER (WITH TIMEOUT GUARD)                     */
// ================================================================ */

const getFastLocation = () => {
    return new Promise((resolve) => {
        if (!navigator.geolocation) return resolve({ lat: 0, lng: 0 });

        navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            (err) => {
                console.warn("Geolocation fallback triggered:", err.message);
                resolve({ lat: 0, lng: 0 });
            },
            { timeout: 5000, enableHighAccuracy: false }
        );
    });
};

// ================================================================ */
// INITIAL START & PASSWORD MODAL SUBMIT HANDLER                    */
// ================================================================ */

document.addEventListener('DOMContentLoaded', () => {
    const passForm = document.getElementById('password-verify-form');
    if (passForm && !passForm.dataset.bound) {
        passForm.onsubmit = (e) => {
            e.preventDefault();
            const input = document.getElementById('modal-auth-pass');
            const enteredPass = (input?.value || "").trim();
            const actualPass = (window.currentStaff?.password || "").toString().trim();

            if (enteredPass === actualPass) {
                if (passwordCallback) {
                    const cb = passwordCallback;
                    passwordCallback = null;
                    cb(enteredPass);
                }
                window.closePasswordModal();
            } else {
                alert("❌ Wrong password.");
            }
        };
        passForm.dataset.bound = "true";
    }

    setTimeout(() => {
        if (typeof window.initSecurityCheckInButton === 'function') {
            window.initSecurityCheckInButton();
        }
    }, 1000);
});

console.log("✅ attendance_module.js: v5.5 - Fully Fixed & Verified");