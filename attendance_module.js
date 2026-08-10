import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, set, update, push, onValue, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
    document.getElementById('sig-modal-title').innerText = title;
    const modal = document.getElementById('signature-modal');
    if (modal) {
        modal.classList.add('active');
        setTimeout(() => {
            if (window.sigPadManager) {
                const pad = window.sigPadManager.getPad('sig-canvas');
                if (pad) pad._setupCanvas();
            }
            // Auto-hide spinner once modal/canvas is ready
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

            // Basic validation to ensure something was drawn
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

// Bind form submission for password verification
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

            // Validate against the cached staff object
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
});

// ================================================================ */
// KEY HANDOVER LOGIC (STRICT MANDATORY RETURN)                     */
// ================================================================ */

let keyCollectCallback = null;
let keyReturnCallback = null;

// --- SECURITY PIN GENERATION (v4.0) ---
window.generateKeyReturnPin = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
};

window.openKeyCollectionModal = (callback) => {
    const modal = document.getElementById('key-collection-modal');
    if (modal) modal.classList.remove('hidden');
    keyCollectCallback = callback;
};

// ... (existing code)

window.confirmKeyCollection = (hasKey) => {
    const modal = document.getElementById('key-collection-modal');
    if (modal) modal.classList.add('hidden');
    if (keyCollectCallback) keyCollectCallback(hasKey);
    keyCollectCallback = null;
};

window.openKeyReturnModal = (session, callback) => {
    const modal = document.getElementById('key-return-modal');
    const input = document.getElementById('key-return-pin-input');
    const error = document.getElementById('pin-error');

    if (modal) modal.classList.remove('hidden');
    if (input) { input.value = ''; input.focus(); }
    if (error) error.classList.add('hidden');

    window.activeSessionForReturn = session;
    keyReturnCallback = callback;
};

window.confirmKeyReturn = () => {
    const input = document.getElementById('key-return-pin-input');
    const error = document.getElementById('pin-error');
    const enteredPin = input?.value || "";

    if (!window.activeSessionForReturn) {
        console.error("❌ Session context lost for key return");
        alert("Session error. Please try again.");
        return;
    }

    const actualPin = (window.activeSessionForReturn.keyReturnPin || "").toString();

    if (enteredPin === actualPin) {
        console.log("✅ Key PIN Verified");
        const modal = document.getElementById('key-return-modal');
        if (modal) modal.classList.add('hidden');
        if (keyReturnCallback) keyReturnCallback();
        keyReturnCallback = null;
        window.activeSessionForReturn = null;
    } else {
        console.warn("❌ Incorrect Key PIN");
        if (error) error.classList.remove('hidden');
        if (input) { input.value = ''; input.focus(); }
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
// DASHBOARD & ATTENDANCE CORE                                      */
// ================================================================ */

window.renderDashboard = async (staff) => {
    console.log("📊 renderDashboard: Initializing for", staff.name);
    window.currentStaff = staff;

    const role = (staff.role || "Staff").toString().trim().toLowerCase();
    const isSecurity = (role === 'security');
    const isAdmin = (role === 'admin');

    const authArea = document.getElementById('staff-auth-area');
    const dashArea = document.getElementById('staff-dash-area');

    // ENSURE ASSET TRANSFER SECTION IS HIDDEN BY DEFAULT ON DASHBOARD LOAD
    const assetTransferSection = document.getElementById('asset-transfer-section');
    if (assetTransferSection) assetTransferSection.classList.add('hidden');

    if (authArea) authArea.classList.add('hidden');
    if (dashArea) dashArea.classList.remove('hidden');

    // Role-based UI Simplification (Handled by Global Helper)
    if (window.applyRoleDashboardRules) {
        window.applyRoleDashboardRules(role);
        if (role === 'cleaner') window.loadPersonalAttendance(staff.mobile);
        if (role === 'security') window.loadSecurityPinControl();
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
            el.innerHTML = `<img src="${profileImg}" class="w-full h-full object-cover" onerror="this.src='https://ui-avatars.com/api/?name=${staff.name || 'U'}&background=4f46e5&color=fff&size=128'">`;
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

                        // Evening Check-Out Mandatory Return Lock
                        if (session.keyStatus === 'HELD') {
                            window.openKeyReturnModal(async () => {
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

                            // Morning Check-In Key Prompt (Non-Security/Admin)
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
    window.showGlobalSpinner("Saving Check-In Record...");

    try {
        const loc = await getFastLocation();
        const res = await window.uploadToDrive({
            category: UPLOAD_CONFIG.CATEGORIES.STAFF_ATTENDANCE,
            fileName: `Attendance_In_${staff.mobile}_${Date.now()}.png`,
            image: sigData
        });

        if (res.status !== 'success') throw new Error(res.message || "Upload failed");

        const key = staff.mobile + '_' + Date.now();
        const pin = hasKey ? window.generateKeyReturnPin() : null; // GENERATE PIN
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
            keyReturnPin: pin, // STORE PIN
            companyName: staff.companyName || "N/A",
            companyId: staff.companyId || "N/A",
            adekPass: staff.adekPass || staff.adcPassNumber || "N/A"
        };

        await set(ref(db, 'staff_attendance/' + key), data);
        await set(ref(db, 'active_staff_sessions/' + staff.mobile), {
            status: 'checked_in', key, timeIn: data.timeIn, keyStatus: data.keyStatus, keyReturnPin: pin
        });

        if (hasKey) alert("🔑 YOUR KEY RETURN PIN: " + pin + "\n(Keep this for check-out)");

        if (window.triggerSuccessPopup) window.triggerSuccessPopup("Checked In Successfully! ✅");
        else alert("Checked in!");

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

        await update(ref(db, 'staff_attendance/' + session.key), data);
        await set(ref(db, 'active_staff_sessions/' + staff.mobile), null);

        if (window.triggerSuccessPopup) window.triggerSuccessPopup("Checked Out Successfully! 👋");
        else alert("Checked out!");

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
            const all = Object.values(snap.val()).filter(a => a.mobile === mobile);
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
        } else {
            body.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-gray-400">No records found</td></tr>';
        }
    } catch (e) {
        console.error("Personal Attendance Error:", e);
        body.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-red-400">Error loading history</td></tr>';
    }
};

console.log("✅ attendance_module.js: UI & Security Enhanced");

window.loadSecurityPinControl = () => {
    const body = document.getElementById('security-pin-list-body');
    if (!body) return;

    onValue(ref(db, 'staff_attendance'), (snap) => {
        renderPinTable();
    });
    onValue(ref(db, 'visitor_logs'), (snap) => {
        renderPinTable();
    });
    onValue(ref(db, 'contractor_logs'), (snap) => {
        renderPinTable();
    });

    async function renderPinTable() {
        try {
            const [staffSnap, visSnap, conSnap] = await Promise.all([
                get(ref(db, 'staff_attendance')),
                get(ref(db, 'visitor_logs')),
                get(ref(db, 'contractor_logs'))
            ]);

            let rows = [];

            if (staffSnap.exists()) {
                Object.values(staffSnap.val()).forEach(s => {
                    if (s.status === 'checked_in' && s.keyStatus === 'HELD' && s.keyReturnPin) {
                        rows.push({ name: s.name, type: 'STAFF', pin: s.keyReturnPin, time: s.timeIn });
                    }
                });
            }

            if (visSnap.exists()) {
                Object.values(visSnap.val()).forEach(v => {
                    if (v.status === 'active' && v.keyCollected === 'YES' && v.keyReturnPin) {
                        rows.push({ name: v.name, type: 'VISITOR', pin: v.keyReturnPin, time: v.timeIn });
                    }
                });
            }

            if (conSnap.exists()) {
                Object.values(conSnap.val()).forEach(c => {
                    if (c.status === 'active' && c.keyCollected === 'YES' && c.keyReturnPin) {
                        rows.push({ name: c.name, type: 'CONTRACTOR', pin: c.keyReturnPin, time: c.timeIn });
                    }
                });
            }

            if (rows.length === 0) {
                body.innerHTML = '<tr><td colspan="3" class="p-8 text-center text-slate-500">No active keys issued.</td></tr>';
                return;
            }

            body.innerHTML = rows.map(r => `
                <tr>
                    <td class="p-4 font-bold text-white">${r.name}</td>
                    <td class="p-4"><span class="px-2 py-0.5 rounded text-[8px] font-black ${r.type === 'STAFF' ? 'bg-indigo-500/20 text-indigo-400' : r.type === 'VISITOR' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}">${r.type}</span></td>
                    <td class="p-4 text-center">
                        <span class="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl font-black text-xs shadow-lg shadow-emerald-500/20">
                            <i class="fa-solid fa-key"></i> PIN: ${r.pin}
                        </span>
                    </td>
                </tr>
            `).join('');
        } catch (e) {
            console.error("Error loading PIN control:", e);
        }
    }
};
