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
    if (!canvas) return null;

    // Create an offscreen canvas for resizing
    const offscreen = document.createElement('canvas');
    // ✅ Better resolution for Drive upload (300x150 instead of 200x100)
    offscreen.width = 300;
    offscreen.height = 150;
    const ctx = offscreen.getContext('2d');

    // Fill white background (crucial for JPEG)
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, 300, 150);

    // Smooth scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(canvas, 0, 0, 300, 150);

    // ✅ Better quality for Drive (0.4 instead of 0.2)
    return offscreen.toDataURL("image/jpeg", 0.4);
};

window.openSignatureModal = (title, callback) => {
    const titleEl = document.getElementById('sig-modal-title');
    const modalEl = document.getElementById('signature-modal');
    if (titleEl) titleEl.innerText = title;
    if (modalEl) {
        modalEl.classList.add('active');
        modalEl.style.display = 'flex';
    }
    sigCallback = callback;
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
        // Initialize and unlock for better UX
        window.sigPadManager.getPad('sig-canvas').unlock();
    }, 300);
};

window.closeSignatureModal = () => {
    const modal = document.getElementById('signature-modal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    document.body.style.overflow = '';
    sigCallback = null;
};

window.clearSigCanvas = () => {
    window.sigPadManager.getPad('sig-canvas').clear();
};

const sigConfirmBtn = document.getElementById('sig-confirm-btn');
if (sigConfirmBtn) {
    sigConfirmBtn.onclick = () => {
        const pad = window.sigPadManager.getPad('sig-canvas');
        // Use existing getCompressedSignature logic or pad's internal toDataURL
        const data = window.getCompressedSignature(pad.canvas);
        if (sigCallback) sigCallback(data);
        closeSignatureModal();
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

        if (authArea) authArea.classList.add('hidden');
        if (dashArea) dashArea.classList.remove('hidden');


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

        // --- UPDATE SIDEBAR PROFILE (Issue 3) ---
        const menuUserName = document.getElementById('menuUserName');
        const menuUserRole = document.getElementById('menuUserRole');
        const menuAvatar = document.getElementById('menuAvatar');

        if (menuUserName) menuUserName.innerText = staff.name || "User";
        if (menuUserRole) menuUserRole.innerText = staff.role || "Navigation Menu";
        if (menuAvatar) {
            if (staff.profilePicUrl) {
                const directUrl = window.formatDriveImageUrl(staff.profilePicUrl);
                menuAvatar.innerHTML = `<img src="${directUrl}" class="w-full h-full object-cover" onerror="this.style.display='none'">`;
            } else {
                menuAvatar.innerText = initials;
            }
        }


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

                                // --- MULTI-ROLE NOTIFICATION: CHECK-OUT (CRITICAL) ---
                                if (typeof window.triggerMultiRoleNotification === 'function') {
                                    window.triggerMultiRoleNotification({
                                        title: "Attendance: Check-Out Confirmed",
                                        body: `User: ${staff.name} | Time: ${now.toLocaleTimeString()}`,
                                        adekId: staff.adekPass || staff.adcPassNumber,
                                        tag: "attendance-checkout",
                                        icon: "fa-person-walking-arrow-right",
                                        url: "/JYSLOGINPORTAL/staff-login.html"
                                    });
                                }

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

                                    // --- MULTI-ROLE NOTIFICATION: CHECK-IN (CRITICAL) ---
                                    if (typeof window.triggerMultiRoleNotification === 'function') {
                                        window.triggerMultiRoleNotification({
                                            title: "Attendance: Check-In Confirmed",
                                            body: `User: ${staff.name} | Time: ${now.toLocaleTimeString()}`,
                                            adekId: staff.adekPass || staff.adcPassNumber,
                                            tag: "attendance-checkin",
                                            icon: "fa-user-check",
                                            url: "/JYSLOGINPORTAL/staff-login.html"
                                        });
                                    }

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
        const menuAssetSection = document.getElementById('menu-asset-section');
        const securityArea = document.getElementById('security-task-area');
        const menuCreateTaskBtn = document.getElementById('menu-create-task-btn');
        const securityTracker = document.getElementById('security-raised-tasks-area');

        // STRICT ROLE BASED TASK VISIBILITY (Task 3)
        const isSecurityOrAdmin = (roleNormalized === 'security' || roleNormalized === 'admin');

        if (!isSecurityOrAdmin) {
            console.log("Hiding Task Creation for Role:", roleNormalized);
            if (securityArea) securityArea.classList.add('hidden');
            if (menuCreateTaskBtn) menuCreateTaskBtn.classList.add('hidden');
            if (securityTracker) securityTracker.classList.add('hidden');
        } else {
            if (securityArea) securityArea.classList.remove('hidden');
            if (menuCreateTaskBtn) menuCreateTaskBtn.classList.remove('hidden');
            if (securityTracker) {
                securityTracker.classList.remove('hidden');
                window.initRaisedTasksTracker('security-my-tasks-container');
            }
        }


        const authorizedRoles = ['cleanerleader', 'rttechnician', 'security', 'admin'];
        const isAuth = authorizedRoles.includes(roleNormalized);

        if (assetAuditAccess) {
            assetAuditAccess.classList.add('hidden'); // ALWAYS HIDE ON DASHBOARD (v3.3)
            assetAuditAccess.style.display = 'none';
        }

        if (menuAssetSection) {
            menuAssetSection.classList.toggle('hidden', !isAuth);
        }


        window.loadRoleView(staff);
        if (window.initNotificationBell) window.initNotificationBell();
        if (window.checkAndSubscribePush) window.checkAndSubscribePush();
    } catch (e) { console.error("Dashboard Render Error:", e); }
};
