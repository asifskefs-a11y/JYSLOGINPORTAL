import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, set, update, push, onValue, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- SIGNATURE PAD ---
let sigCanvas, sigCtx, sigDrawing = false, sigCallback = null;
window.initSigPad = () => {
    sigCanvas = document.getElementById('sig-canvas');
    if (!sigCanvas) return;
    sigCtx = sigCanvas.getContext('2d');
    const getPos = (e) => {
        const rect = sigCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    };
    const start = (e) => { sigDrawing = true; sigCtx.beginPath(); const p = getPos(e); sigCtx.moveTo(p.x, p.y); if (e.type === 'touchstart') e.preventDefault(); };
    const move = (e) => { if (!sigDrawing) return; const p = getPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); if (e.type === 'touchmove') e.preventDefault(); };
    const stop = () => { if (sigDrawing) { sigDrawing = false; sigCtx.closePath(); } };
    sigCanvas.addEventListener('mousedown', start); sigCanvas.addEventListener('mousemove', move); window.addEventListener('mouseup', stop);
    sigCanvas.addEventListener('touchstart', start, { passive: false }); sigCanvas.addEventListener('touchmove', move, { passive: false }); sigCanvas.addEventListener('touchend', stop);
};

window.openSignatureModal = (title, callback) => {
    document.getElementById('sig-modal-title').innerText = title;
    const modal = document.getElementById('signature-modal');
    modal.classList.add('active'); modal.style.display = 'flex';
    sigCallback = callback;
};

window.closeSignatureModal = () => {
    document.getElementById('signature-modal').style.display = 'none';
    sigCallback = null;
};

const sigConfirmBtn = document.getElementById('sig-confirm-btn');
if (sigConfirmBtn) {
    sigConfirmBtn.onclick = () => {
        const canvas = window.sigPadManager.getPad('sig-canvas').canvas;
        const data = canvas.toDataURL("image/png");
        if (sigCallback) sigCallback(data);
        window.closeSignatureModal();
    };
}

// --- DASHBOARD & SYNC ---
window.renderDashboard = async (staff) => {
    window.currentStaff = staff;
    document.getElementById('staff-auth-area').classList.add('hidden');
    document.getElementById('staff-dash-area').classList.remove('hidden');
    document.getElementById('userNameDisplay').innerText = staff.name || "Staff";

    const cinBtn = document.getElementById('s-checkin-btn');
    onValue(ref(db, 'active_staff_sessions/' + staff.mobile), (snapshot) => {
        const session = snapshot.val();
        if (session && session.status === 'checked_in') {
            cinBtn.classList.add('hidden');
            document.getElementById('s-checkout-btn').classList.remove('hidden');
        } else {
            cinBtn.classList.remove('hidden'); cinBtn.onclick = () => {
                window.openSignatureModal("Staff Check-In", async (sigData) => {
                    const res = await window.uploadToDrive({ category: UPLOAD_CONFIG.CATEGORIES.STAFF_ATTENDANCE, fileName: `Attendance_${staff.mobile}.png`, image: sigData });
                    if (res.status === 'success') {
                        const key = staff.mobile + '_' + Date.now();
                        const data = { mobile: staff.mobile, name: staff.name, status: 'checked_in', date: new Date().toLocaleDateString(), timeIn: new Date().toLocaleTimeString(), signatureUrl: res.fileUrl };
                        await set(ref(db, 'staff_attendance/' + key), data);
                        await set(ref(db, 'active_staff_sessions/' + staff.mobile), { status: 'checked_in', key });
                        alert("Checked in!");
                    }
                });
            };
        }
    });
};
