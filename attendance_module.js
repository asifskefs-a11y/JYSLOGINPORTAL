import { db } from './firebase_config.js';
import { ref, set, update, push, onValue, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- SIGNATURE PAD ---
let sigCanvas, sigCtx, sigDrawing = false, sigCallback = null;
window.initSigPad = () => {
    console.log("Initializing Signature Pad");
    sigCanvas = document.getElementById('sig-canvas');
    if (!sigCanvas) {
        return;
    }
    sigCtx = sigCanvas.getContext('2d');

    const getPos = (e) => {
        const rect = sigCanvas.getBoundingClientRect();
        let clientX, clientY;

        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const start = (e) => {
        console.log("Signature drawing started");
        sigDrawing = true;
        sigCtx.beginPath();
        const p = getPos(e);
        sigCtx.moveTo(p.x, p.y);
        if (e.type === 'touchstart') e.preventDefault();
    };

    const move = (e) => {
        if (!sigDrawing) return;
        const p = getPos(e);
        sigCtx.lineTo(p.x, p.y);
        sigCtx.stroke();
        if (e.type === 'touchmove') e.preventDefault();
    };

    const stop = (e) => {
        if (sigDrawing) {
            console.log("Signature drawing stopped");
            sigDrawing = false;
            sigCtx.closePath();
        }
    };

    // Remove existing listeners if any (optional, depends on how init is called)
    sigCanvas.removeEventListener('mousedown', start);
    sigCanvas.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', stop);

    // Mouse Listeners
    sigCanvas.addEventListener('mousedown', start);
    sigCanvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);

    // Touch Listeners
    sigCanvas.addEventListener('touchstart', start, { passive: false });
    sigCanvas.addEventListener('touchmove', move, { passive: false });
    sigCanvas.addEventListener('touchend', stop, { passive: false });
};

window.getCompressedSignature = (canvas) => {
    // Create an offscreen canvas for resizing
    const offscreen = document.createElement('canvas');
    // Extreme optimization for slow internet: 200x100 resolution
    offscreen.width = 200;
    offscreen.height = 100;
    const ctx = offscreen.getContext('2d');

    // Fill white background (crucial for JPEG)
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, 200, 100);

    // Smooth scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(canvas, 0, 0, 200, 100);

    // 0.2 quality JPEG is highly compressed (~3-5KB) but still very readable for signatures
    return offscreen.toDataURL("image/jpeg", 0.2);
};

window.openSignatureModal = (title, callback) => {
    const titleEl = document.getElementById('sig-modal-title');
    const modalEl = document.getElementById('signature-modal');
    if (titleEl) titleEl.innerText = title;
    if (modalEl) {
        modalEl.classList.remove('hidden');
        modalEl.style.display = 'flex';
    }
    sigCallback = callback;

    setTimeout(() => {
        window.initSigPad();
        if (!sigCanvas) return;
        // Correctly set internal resolution to match display size
        sigCanvas.width = sigCanvas.offsetWidth;
        sigCanvas.height = sigCanvas.offsetHeight;

        // Re-initialize context styles after resize
        sigCtx = sigCanvas.getContext('2d');
        sigCtx.lineWidth = 3;
        sigCtx.lineCap = 'round';
        sigCtx.lineJoin = 'round';
        sigCtx.strokeStyle = '#4f46e5';
        sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
    }, 200);
};

window.closeSignatureModal = () => {
    const modal = document.getElementById('signature-modal');
    if (modal) modal.classList.add('hidden');
};

window.clearSigCanvas = () => {
    if (sigCtx) sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
};

const sigConfirmBtn = document.getElementById('sig-confirm-btn');
if (sigConfirmBtn) {
    sigConfirmBtn.onclick = () => {
        const data = window.getCompressedSignature(sigCanvas);
        if (sigCallback) sigCallback(data); closeSignatureModal();
    };
}

// --- PASSWORD AUTH MODAL ---
let passwordCallback = null;
window.openPasswordModal = (title, callback) => {
    const titleEl = document.getElementById('password-modal-title');
    const modalEl = document.getElementById('password-modal');
    const passInput = document.getElementById('modal-auth-pass');
    const errEl = document.getElementById('password-error');

    if (titleEl) titleEl.innerText = title;
    if (modalEl) modalEl.classList.remove('hidden');
    if (passInput) {
        passInput.value = "";
        passInput.focus();
    }
    if (errEl) errEl.classList.add('hidden');

    passwordCallback = callback;
};

window.closePasswordModal = () => {
    const modalEl = document.getElementById('password-modal');
    if (modalEl) modalEl.classList.add('hidden');
    passwordCallback = null;
};

const passConfirmBtn = document.getElementById('password-confirm-btn');
if (passConfirmBtn) {
    passConfirmBtn.onclick = () => {
        const passInput = document.getElementById('modal-auth-pass');
        const errEl = document.getElementById('password-error');
        if (!passInput) return;

        const entered = passInput.value;
        const actual = window.currentStaff ? window.currentStaff.password : "";

        if (entered === actual && actual !== "") {
            if (passwordCallback) passwordCallback();
            closePasswordModal();
        } else {
            if (errEl) errEl.classList.remove('hidden');
            passInput.value = "";
            passInput.focus();
        }
    };
}

// --- DASHBOARD RENDERING & REAL-TIME SYNC ---
window.renderDashboard = async (staff) => {
    try {
        if (!staff) return;
        window.currentStaff = staff;

        const authArea = document.getElementById('staff-auth-area');
        const dashArea = document.getElementById('staff-dash-area');
        const logoutBtn = document.getElementById('staff-logout-btn');

        if (authArea) authArea.classList.add('hidden');
        if (dashArea) dashArea.classList.remove('hidden');
        if (logoutBtn) logoutBtn.classList.remove('hidden');

        const initials = (staff.name || "JY").split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        const avatar = document.getElementById('userAvatar');
        const roleDisplay = document.getElementById('s-dash-role-display');
        const userNameDisplay = document.getElementById('userNameDisplay');
        const userBranchDisplay = document.getElementById('userBranchDisplay');

        if (avatar) {
            const initialsHtml = `<span class="avatar-initials">${initials}</span>`;
            if (staff.profilePicUrl) {
                const directUrl = window.formatDriveImageUrl(staff.profilePicUrl);
                avatar.innerHTML = `
                    ${initialsHtml}
                    <img src="${directUrl}" referrerpolicy="no-referrer" class="profile-img-circle absolute inset-0 w-full h-full object-cover rounded-full" style="display:block;" onerror="this.style.display='none'">
                `;
            } else {
                avatar.innerHTML = initialsHtml;
            }
        }
        if (roleDisplay) roleDisplay.innerText = staff.role || "Staff";
        if (userNameDisplay) userNameDisplay.innerText = staff.name || "Staff Member";
        if (userBranchDisplay) userBranchDisplay.innerText = staff.branch || "School 1";

        const cinBtn = document.getElementById('s-checkin-btn');
        const coutBtn = document.getElementById('s-checkout-btn');

        onValue(ref(db, 'active_staff_sessions/' + staff.mobile), (snapshot) => {
            const sessionObj = snapshot.val();

            if (sessionObj && sessionObj.status === 'checked_in') {
                if (cinBtn) cinBtn.classList.add('hidden');
                if (coutBtn) {
                    coutBtn.classList.remove('hidden');
                    coutBtn.innerText = "Check Out";
                    coutBtn.disabled = false;
                    coutBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                    coutBtn.onclick = () => {
                        window.openPasswordModal("Verify Check-Out", async () => {
                            try {
                                const mobile = staff.mobile;
                                const now = new Date();

                                if (sessionObj && sessionObj.attendanceKey) {
                                    await update(ref(db, 'staff_attendance/' + sessionObj.attendanceKey), {
                                        checkOutTime: now.toLocaleTimeString(),
                                        status: 'completed'
                                    });
                                }

                                await set(ref(db, 'active_staff_sessions/' + mobile), null);
                                localStorage.removeItem('staff_active_session');

                                await push(ref(db, 'staff_attendance_logs'), {
                                    mobile: mobile,
                                    name: staff.name,
                                    action: 'checkout',
                                    timestamp: now.toISOString(),
                                    date: now.toLocaleDateString(),
                                    timeOut: now.toLocaleTimeString()
                                });

                                // FINAL ONE-CLICK PUSH BINDING: Check-Out Success
                                window.OneSignalDeferred = window.OneSignalDeferred || [];
                                window.OneSignalDeferred.push(async function(OneSignal) {
                                    try {
                                        // Ensure Token exists
                                        if (!OneSignal.User.PushSubscription.id && Notification.permission === 'granted') {
                                            await OneSignal.User.PushSubscription.optIn();
                                        }

                                        // TRIGGER DIRECT ONESIGNAL PUSH (Fallback to Local for 100% confirmation)
                                        if ('serviceWorker' in navigator) {
                                            const reg = await navigator.serviceWorker.ready;
                                            reg.showNotification("Check-Out Successful", {
                                                body: "Your check-out time has been logged.",
                                                icon: "jys_Icon.png",
                                                tag: "attendance-checkout"
                                            });
                                        }
                                    } catch (err) { console.warn("Final Push Trigger Error:", err); }
                                });

                                alert("Checked out successfully!");
                            } catch (e) { alert("Checkout error: " + e.message); }
                        });
                    };
                }
                localStorage.setItem('staff_active_session', JSON.stringify(sessionObj));
            } else {
                if (cinBtn) {
                    cinBtn.classList.remove('hidden');
                    cinBtn.onclick = () => {
                        window.openPasswordModal("Verify Check-In", () => {
                            window.openSignatureModal("Staff Check-In Signature", async (sigData) => {
                                try {
                                    const now = new Date();
                                    const res = await window.uploadToDrive({
                                        type: 'signature',
                                        staffName: staff.name,
                                        fileName: `CheckIn_${staff.mobile}_${Date.now()}.png`,
                                        image: sigData
                                    });

                                    const attendanceKey = staff.mobile + '_' + now.getTime();
                                    const session = {
                                        mobile: staff.mobile,
                                        name: staff.name,
                                        status: 'checked_in',
                                        checkInTimestamp: now.toISOString(),
                                        signatureUrl: res.fileUrl || res.signatureUrl,
                                        checkInSignature: res.fileUrl || res.signatureUrl, // Duplicate key for redundancy
                                        attendanceKey: attendanceKey
                                    };

                                    await set(ref(db, 'staff_attendance/' + attendanceKey), {
                                        ...session,
                                        date: now.toLocaleDateString(),
                                        timeIn: now.toLocaleTimeString()
                                    });

                                    await set(ref(db, 'active_staff_sessions/' + staff.mobile), session);
                                    localStorage.setItem('staff_active_session', JSON.stringify(session));

                                    // FINAL ONE-CLICK PUSH BINDING: Check-In Success
                                    window.OneSignalDeferred = window.OneSignalDeferred || [];
                                    window.OneSignalDeferred.push(async function(OneSignal) {
                                        try {
                                            // Ensure Token exists
                                            if (!OneSignal.User.PushSubscription.id && Notification.permission === 'granted') {
                                                await OneSignal.User.PushSubscription.optIn();
                                            }

                                            // TRIGGER DIRECT ONESIGNAL PUSH (Fallback to Local for 100% confirmation)
                                            if ('serviceWorker' in navigator) {
                                                const reg = await navigator.serviceWorker.ready;
                                                reg.showNotification("Attendance Recorded", {
                                                    body: "Your check-in has been successfully confirmed.",
                                                    icon: "jys_Icon.png",
                                                    tag: "attendance-checkin"
                                                });
                                            }
                                        } catch (err) { console.warn("Final Push Trigger Error:", err); }
                                    });

                                    alert("Check-In Successful!");
                                } catch (e) { alert("Check-In Error: " + e.message); }
                            });
                        });
                    };
                }
                if (coutBtn) coutBtn.classList.add('hidden');
                localStorage.removeItem('staff_active_session');
            }
        });

        window.onfocus = () => {
            get(ref(db, 'active_staff_sessions/' + staff.mobile)).then((snapshot) => {
                if (snapshot.exists()) {
                    localStorage.setItem('staff_active_session', JSON.stringify(snapshot.val()));
                }
            });
        };

        const roleNormalized = (staff.role || "").toLowerCase().trim().replace(/ /g, '').replace(/_/g, '');
        const assetAuditAccess = document.getElementById('asset-audit-access');
        const securityArea = document.getElementById('security-task-area');
        const securityTracker = document.getElementById('security-raised-tasks-area');

        if (roleNormalized !== 'security') {
            if (securityArea) {
                console.log("Removing Security Area for non-security role:", roleNormalized);
                securityArea.remove();
            }
            if (securityTracker) securityTracker.remove();
        } else {
            if (securityArea) {
                securityArea.classList.remove('hidden');
                securityArea.style.display = 'block';
            }
            if (securityTracker) {
                securityTracker.classList.remove('hidden');
                window.initRaisedTasksTracker('security-my-tasks-container');
            }
        }

        const authorizedRoles = ['cleanerleader', 'rttechnician', 'security', 'admin'];
        if (assetAuditAccess) {
            const isAuth = authorizedRoles.includes(roleNormalized);
            assetAuditAccess.classList.toggle('hidden', !isAuth);
            if (isAuth) {
                assetAuditAccess.setAttribute('style', 'display: block !important; visibility: visible !important; opacity: 1 !important;');
            }
        }

        window.loadRoleView(staff);

        // OneSignal Notification Status Check
        if (window.checkNotificationStatus) {
            setTimeout(window.checkNotificationStatus, 2000);
        }
    } catch (e) { console.error("Dashboard Render Error:", e); }
};
