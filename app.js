import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, get, update, child, onValue, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBQJbAcwEZLQYLooRydSSgNRvzrXG5Vl24",
    authDomain: "schoollog-f0a04.firebaseapp.com",
    projectId: "schoollog-f0a04",
    storageBucket: "schoollog-f0a04.firebasestorage.app",
    messagingSenderId: "961486864461",
    appId: "1:961486864461:web:62b8742704c55d287f5c04",
    measurementId: "G-G7QEGJTBPE",
    databaseURL: "https://schoollog-f0a04-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const SHEETS_URL = "https://script.google.com/macros/s/AKfycbykqGaM5v2bNQ-MzLLwUY4uj5v8kYUJFd9J8f9P7q8gSLxwpig8AyG162kwq9MdVFAx/exec";

// --- NAVIGATION & VIEW LOGIC ---
window.showView = (viewId) => {
    // If it's a cross-page link, redirect
    const pageMap = {
        'view-landing': 'index.html',
        'view-visitor': 'visitor.html',
        'view-staff': 'staff-login.html',
        'view-admin-auth': 'admin.html',
        'view-admin-dash': 'admin.html'
    };

    if (pageMap[viewId] && !window.location.pathname.includes(pageMap[viewId])) {
        window.location.href = pageMap[viewId];
        return;
    }

    const sections = document.querySelectorAll('.view-section');
    sections.forEach(s => {
        s.classList.remove('active');
        s.classList.add('hidden');
        s.style.display = 'none';
    });

    const target = document.getElementById(viewId);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
        target.style.display = 'flex';
    }
    window.scrollTo(0, 0);
    window.dispatchEvent(new CustomEvent('viewChanged', { detail: { viewId } }));
};

// --- AUTH & STABILIZATION ---
const checkStaffAuth = () => {
    const saved = localStorage.getItem('loggedStaff');
    if (saved && document.getElementById('staff-dash-area')) {
        renderDashboard(JSON.parse(saved));
    } else if (document.getElementById('staff-auth-area')) {
        document.getElementById('staff-auth-area').classList.remove('hidden');
        document.getElementById('staff-dash-area').classList.add('hidden');
        if (document.getElementById('staff-logout-btn')) document.getElementById('staff-logout-btn').classList.add('hidden');
    }
};

window.logoutStaff = () => {
    localStorage.removeItem('loggedStaff');
    localStorage.removeItem('staff_active_session');
    window.location.href = 'index.html';
};

// Attach logout listeners
const logoutBtn1 = document.getElementById('staff-logout-btn');
if (logoutBtn1) logoutBtn1.onclick = window.logoutStaff;
const logoutBtn2 = document.getElementById('staff-logout');
if (logoutBtn2) logoutBtn2.onclick = window.logoutStaff;

// Staff Login
const staffLoginForm = document.getElementById('staff-login-form');
if (staffLoginForm) {
    staffLoginForm.onsubmit = async (e) => {
        e.preventDefault();
        const mobile = document.getElementById('s-log-mobile').value;
        const pass = document.getElementById('s-log-pass').value;
        const submitBtn = e.target.querySelector('button');
        submitBtn.disabled = true;

        try {
            const snapshot = await get(child(ref(db), 'staff/' + mobile));
            if (snapshot.exists() && snapshot.val().password === pass) {
                const staffData = snapshot.val();
                localStorage.setItem('loggedStaff', JSON.stringify(staffData));
                renderDashboard(staffData);
            } else {
                alert("Invalid Credentials");
            }
        } catch (error) {
            alert("Login Error: " + error.message);
        } finally {
            submitBtn.disabled = false;
        }
    };
}

// --- DASHBOARD RENDERING ---
async function renderDashboard(staff) {
    window.currentStaff = staff;
    const authArea = document.getElementById('staff-auth-area');
    const dashArea = document.getElementById('staff-dash-area');
    const logoutBtn = document.getElementById('staff-logout-btn');

    if (authArea) authArea.classList.add('hidden');
    if (dashArea) dashArea.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');

    // Update Avatar Initials
    const initials = staff.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    const avatar = document.getElementById('userAvatar');
    const roleDisplay = document.getElementById('s-dash-role-display');
    if (avatar) avatar.innerText = initials;
    if (roleDisplay) roleDisplay.innerText = staff.role;

    const activeSession = localStorage.getItem('staff_active_session');
    const sessionObj = activeSession ? JSON.parse(activeSession) : null;
    const cinBtn = document.getElementById('s-checkin-btn');
    const coutBtn = document.getElementById('s-checkout-btn');

    if (sessionObj && sessionObj.mobile === staff.mobile && sessionObj.status === 'checked_in') {
        if (cinBtn) cinBtn.classList.add('hidden');
        if (coutBtn) {
            coutBtn.classList.remove('hidden');
            startCheckoutCountdown(new Date(sessionObj.checkInTimestamp), coutBtn);
        }
    } else {
        if (cinBtn) cinBtn.classList.remove('hidden');
        if (coutBtn) coutBtn.classList.add('hidden');
    }

    const securityArea = document.getElementById('security-task-area');
    if (securityArea) securityArea.classList.toggle('hidden', staff.role !== 'Security');
    loadRoleView(staff);
}

function startCheckoutCountdown(checkInTime, coutBtn) {
    const thirtyMinMs = 30 * 60 * 1000;
    const update = () => {
        const remaining = thirtyMinMs - (new Date() - checkInTime);
        if (remaining <= 0) {
            coutBtn.disabled = false;
            coutBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            coutBtn.innerText = "Check Out";
            return;
        }
        coutBtn.disabled = true;
        coutBtn.classList.add('opacity-50', 'cursor-not-allowed');
        const min = Math.floor(remaining / 60000);
        const sec = Math.floor((remaining % 60000) / 1000);
        coutBtn.innerText = `Wait ${min}:${sec.toString().padStart(2, '0')}`;
        setTimeout(update, 1000);
    };
    update();
}

async function loadRoleView(staff) {
    const container = document.getElementById('tasksContainer');
    if (!container) return;
    container.innerHTML = `<div class="bg-white/10 p-4 rounded-xl text-center text-xs text-gray-500">Loading tasks...</div>`;

    const taskSnap = await get(ref(db, 'tasks'));
    let taskHtml = '';
    let total = 0, pending = 0, completed = 0;

    if(taskSnap.exists()) {
        const allTasks = Object.values(taskSnap.val());
        total = allTasks.length;
        pending = allTasks.filter(t => t.status === 'Open').length;
        completed = allTasks.filter(t => t.status === 'Closed').length;

        const filteredTasks = allTasks.filter(t => t.targetRole === staff.role && t.status === 'Open');

        if(filteredTasks.length > 0) {
            filteredTasks.forEach(t => {
                const bImg = getDirectDriveImageUrl(t.beforePhotoUrl || t.beforePhoto);
                const aImg = getDirectDriveImageUrl(t.afterPhotoUrl || t.afterPhoto);
                taskHtml += `
                    <div class="task-card">
                        <div class="task-header">
                            <div>
                                <h4 style="font-weight:700; font-size:1rem; color:var(--primary-dark);">${t.location}</h4>
                                <p style="font-size:0.75rem; color:var(--text-gray);">${t.timestamp}</p>
                            </div>
                            <span class="badge ${t.status === 'Open' ? 'badge-pending' : 'badge-completed'}">${t.status}</span>
                        </div>
                        <p style="font-size:0.85rem; color:var(--primary-dark); margin:12px 0; font-weight:500;">${t.details}</p>
                        <div class="image-preview-container">
                            <div class="img-box" onclick="openZoomModal('${bImg}')">
                                <img src="${bImg}">
                                <span class="img-label">Before</span>
                            </div>
                            ${(t.afterPhotoUrl || t.afterPhoto) ? `
                            <div class="img-box" onclick="openZoomModal('${aImg}')">
                                <img src="${aImg}">
                                <span class="img-label">After</span>
                            </div>` : ''}
                        </div>
                        <div style="display:flex; gap:10px; margin-top:10px;">
                            <button class="btn btn-teal" style="flex:1; font-size:0.8rem;" onclick="closeTaskAction('${t.id}')">Resolve</button>
                            <button class="btn btn-outline" style="flex:1; font-size:0.8rem;" onclick="openRejectModal('${t.id}')">Reject</button>
                        </div>
                    </div>`;
            });
        } else {
            taskHtml = '<div class="col-span-full bg-white p-10 rounded-xl text-center text-gray-400 border border-dashed">No pending tasks for your position.</div>';
        }
    } else {
        taskHtml = '<div class="col-span-full bg-white p-10 rounded-xl text-center text-gray-400 border border-dashed">No tasks found.</div>';
    }

    const statTotal = document.getElementById('statTotal');
    const statPending = document.getElementById('statPending');
    const statCompleted = document.getElementById('statCompleted');
    if (statTotal) statTotal.innerText = total;
    if (statPending) statPending.innerText = pending;
    if (statCompleted) statCompleted.innerText = completed;
    container.innerHTML = taskHtml;
}

// --- MAINTENANCE TASK SYSTEM ---
let capturedTaskImageBase64 = "";

window.handleTaskImageCapture = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const btnText = document.getElementById('cameraBtnText');
    if (btnText) btnText.innerText = "Compressing...";
    const compressed = await compressImageFile(file, 1200, 1200, 0.7);
    capturedTaskImageBase64 = compressed;
    if (btnText) btnText.innerText = "Photo Captured ✓";
};

window.submitNewMaintenanceTask = async () => {
    const area = document.getElementById('areaNameInput').value;
    const targetRole = document.getElementById('departmentSelect').value;
    if (!area || !targetRole || !capturedTaskImageBase64) {
        alert('Please fill Area, Target Role and Take a Photo!');
        return;
    }

    const btn = document.getElementById('submitTaskBtn');
    if (btn) { btn.disabled = true; btn.innerText = "Uploading..."; }

    try {
        const driveUrl = await uploadToDrive({
            type: 'photo',
            fileName: `${area} - Before - ${Date.now()}.png`,
            image: capturedTaskImageBase64
        });

        const now = new Date();
        const taskId = "TASK-" + Date.now();
        const task = {
            id: taskId, location: area,
            details: "Maintenance issue raised via Dashboard", priority: "Medium",
            targetRole: targetRole,
            beforePhotoUrl: driveUrl,
            raisedByName: window.currentStaff.name,
            raisedByRole: window.currentStaff.role,
            raisedTimestamp: now.toISOString(), timestamp: now.toLocaleString(), status: "Open"
        };
        await set(ref(db, 'tasks/' + taskId), task);
        alert("Task Created Successfully!");

        document.getElementById('areaNameInput').value = "";
        document.getElementById('departmentSelect').value = "";
        capturedTaskImageBase64 = "";
        const cameraBtnText = document.getElementById('cameraBtnText');
        if (cameraBtnText) cameraBtnText.innerText = "Take Photo";

        loadRoleView(window.currentStaff);
    } catch (err) {
        alert("Error: " + err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "Create Task"; }
    }
};

window.openZoomModal = (imgSrc) => {
    if (!imgSrc || imgSrc.includes('placeholder')) return;
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    if (modal && modalImg) {
        modal.style.display = 'flex';
        modalImg.src = getDirectDriveImageUrl(imgSrc);
    }
};

window.closeZoomModal = () => {
    const modal = document.getElementById('imageModal');
    if (modal) modal.style.display = 'none';
};

// --- DRIVE UPLOAD UTILITY ---
async function uploadToDrive(payload) {
    try {
        const response = await fetch(SHEETS_URL, { method: 'POST', body: JSON.stringify(payload), mode: 'cors' });
        const result = await response.json();
        return result.fileUrl || result.signatureUrl || "";
    } catch (e) { console.error("Drive Upload Failed", e); return ""; }
}

async function compressImageFile(file, maxWidth = 1200, maxHeight = 1200, quality = 0.7) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width; let h = img.height;
                if (w > h) { if (w > maxWidth) { h *= maxWidth / w; w = maxWidth; } }
                else { if (h > maxHeight) { w *= maxHeight / h; h = maxHeight; } }
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL("image/jpeg", quality));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function getDirectDriveImageUrl(driveUrl) {
    if (!driveUrl) return 'https://placehold.co/400x300?text=No+Photo';
    try {
        const idMatch = driveUrl.match(/[-\w]{25,}/);
        if (idMatch && idMatch[0]) return 'https://lh3.googleusercontent.com/d/' + idMatch[0];
    } catch (e) {}
    return driveUrl;
}

function getCompressedSignature(canvas) {
    const offscreen = document.createElement('canvas'); offscreen.width = 300; offscreen.height = 150;
    const ctx = offscreen.getContext('2d'); ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, 300, 150);
    ctx.drawImage(canvas, 0, 0, 300, 150); return offscreen.toDataURL("image/jpeg", 0.3);
}

// --- SIGNATURE PAD ---
let sigCanvas, sigCtx, sigDrawing = false, sigCallback = null;
window.initSigPad = () => {
    sigCanvas = document.getElementById('sig-canvas');
    if (!sigCanvas) return;
    sigCtx = sigCanvas.getContext('2d');
    const getPos = (e) => { const rect = sigCanvas.getBoundingClientRect(); return { x: (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left, y: (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top }; };
    const start = (e) => { sigDrawing = true; sigCtx.beginPath(); const p = getPos(e); sigCtx.moveTo(p.x, p.y); };
    const move = (e) => { if (!sigDrawing) return; e.preventDefault(); const p = getPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); };
    const stop = () => sigDrawing = false;
    sigCanvas.addEventListener('mousedown', start); sigCanvas.addEventListener('mousemove', move); window.addEventListener('mouseup', stop);
    sigCanvas.addEventListener('touchstart', start, {passive: false}); sigCanvas.addEventListener('touchmove', move, {passive: false}); sigCanvas.addEventListener('touchend', stop);
};

window.openSignatureModal = (title, callback) => {
    const titleEl = document.getElementById('sig-modal-title');
    const modalEl = document.getElementById('signature-modal');
    if (titleEl) titleEl.innerText = title;
    if (modalEl) modalEl.classList.remove('hidden');
    sigCallback = callback;
    setTimeout(() => {
        if (!sigCanvas) return;
        sigCanvas.width = sigCanvas.parentElement.offsetWidth;
        sigCanvas.height = sigCanvas.parentElement.offsetHeight;
        sigCtx.lineWidth = 3; sigCtx.lineCap = 'round'; sigCtx.strokeStyle = '#4f46e5';
    }, 50);
    if (sigCtx) sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
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
        const data = getCompressedSignature(sigCanvas);
        if (sigCallback) sigCallback(data); closeSignatureModal();
    };
}

// --- VISITOR SYSTEM ---
let vCanvas, vCtx;
window.initVisitorCanvas = () => {
    vCanvas = document.getElementById('v-sig-pad');
    if (!vCanvas) return;
    vCtx = vCanvas.getContext('2d');
    const getPos = (e) => { const rect = vCanvas.getBoundingClientRect(); return { x: (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left, y: (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top }; };
    const start = (e) => { vCtx.beginPath(); const p = getPos(e); vCtx.moveTo(p.x, p.y); };
    const move = (e) => { e.preventDefault(); const p = getPos(e); vCtx.lineTo(p.x, p.y); vCtx.stroke(); };
    vCanvas.addEventListener('mousedown', start); vCanvas.addEventListener('mousemove', (e) => { if(e.buttons==1) move(e); });
    vCanvas.addEventListener('touchstart', start, {passive: false}); vCanvas.addEventListener('touchmove', move, {passive: false});
    vCanvas.width = vCanvas.parentElement.offsetWidth;
    vCanvas.height = vCanvas.parentElement.offsetHeight;
    vCtx.lineWidth = 2; vCtx.strokeStyle = '#4f46e5';
};

window.clearVisitorSig = () => {
    if (vCtx) vCtx.clearRect(0, 0, vCanvas.width, vCanvas.height);
};

function checkVisitorSession() {
    const active = localStorage.getItem('vActive');
    const signInArea = document.getElementById('v-signin-area');
    const signOutArea = document.getElementById('v-signout-area');
    if(active) {
        const data = JSON.parse(active);
        if (signInArea) signInArea.classList.add('hidden');
        if (signOutArea) {
            signOutArea.classList.remove('hidden');
            const activeName = document.getElementById('v-active-name');
            const activeId = document.getElementById('v-active-id');
            const activeTimeIn = document.getElementById('v-active-timein');
            if (activeName) activeName.innerText = data.name;
            if (activeId) activeId.innerText = data.id;
            if (activeTimeIn) activeTimeIn.innerText = data.timeIn;
        }
    } else {
        if (signInArea) signInArea.classList.remove('hidden');
        if (signOutArea) signOutArea.classList.add('hidden');
        initVisitorForm();
    }
}

function initVisitorForm() {
    const vId = document.getElementById('v-id');
    const vDate = document.getElementById('v-date');
    if (!vId || !vDate) return;
    const now = new Date();
    vId.value = "VIS-" + Math.random().toString(36).substring(2, 7).toUpperCase();
    vDate.value = now.toLocaleDateString('en-US') + " " + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true});
    setTimeout(window.initVisitorCanvas, 50);
}

const visitorForm = document.getElementById('visitor-form');
if (visitorForm) {
    visitorForm.onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true; btn.innerText = "Processing...";
        const sig = await uploadToDrive({ type: 'signature', department: 'Visitor', staffName: document.getElementById('v-name').value, fileName: `Visitor_Sig_${Date.now()}.png`, image: getCompressedSignature(vCanvas) });
        const now = new Date();
        const data = { id: document.getElementById('v-id').value, name: document.getElementById('v-name').value, mobile: document.getElementById('v-mobile').value, company: document.getElementById('v-company').value, purpose: document.getElementById('v-purpose').value, date: now.toLocaleDateString('en-US'), timeIn: now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true}), status: "active", signatureUrl: sig };
        try { await set(ref(db, 'visitors/' + data.id), data); localStorage.setItem('vActive', JSON.stringify({id: data.id, name: data.name, timeIn: data.timeIn})); alert("Signed In!"); checkVisitorSession(); }
        catch (error) { alert("Error: " + error.message); }
        finally { btn.disabled = false; btn.innerText = "Confirm Sign-In"; }
    };
}

const vSignoutBtn = document.getElementById('v-signout-btn');
if (vSignoutBtn) {
    vSignoutBtn.onclick = async () => {
        const active = JSON.parse(localStorage.getItem('vActive'));
        const timeOut = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true});
        try { await update(ref(db, 'visitors/' + active.id), { status: "completed", timeOut: timeOut }); localStorage.removeItem('vActive'); alert("Signed Out!"); window.location.href = 'index.html'; }
        catch (error) { alert("Error: " + error.message); }
    };
}

// --- STAFF REGISTRATION ---
const staffRegForm = document.getElementById('staff-reg-form');
if (staffRegForm) {
    staffRegForm.onsubmit = async (e) => {
        e.preventDefault();
        if(document.getElementById('s-reg-pass').value !== document.getElementById('s-reg-confirm').value) return alert("Passwords Mismatch");

        const staff = {
            name: document.getElementById('s-reg-name').value,
            branch: document.getElementById('s-reg-branch').value,
            role: document.getElementById('s-reg-role').value,
            password: document.getElementById('s-reg-pass').value,
            company_id: document.getElementById('s-reg-company').value
        };

        document.querySelectorAll('.dynamic-input').forEach(input => {
            const fieldName = input.getAttribute('data-field');
            const key = fieldName.toLowerCase().includes('mobile') ? 'mobile' : fieldName.toLowerCase().replace(/[^a-z0-9]/g, '_');
            staff[key] = input.value;
        });

        if (!staff.mobile) return alert("Mobile Number is required.");

        try { await set(ref(db, 'staff/' + staff.mobile), staff); alert("Staff Registered!"); toggleStaffTab('login'); }
        catch (error) { alert("Error: " + error.message); }
    };
}

window.toggleStaffTab = (tab) => {
    const isLogin = tab === 'login';
    const loginForm = document.getElementById('staff-login-form');
    const regForm = document.getElementById('staff-reg-form');
    const tabLogin = document.getElementById('s-tab-login');
    const tabReg = document.getElementById('s-tab-reg');

    if (loginForm) loginForm.classList.toggle('hidden', !isLogin);
    if (regForm) regForm.classList.toggle('hidden', isLogin);
    if (tabLogin) tabLogin.classList.toggle('text-indigo-600', isLogin).classList.toggle('border-indigo-600', isLogin);
    if (tabReg) tabReg.classList.toggle('text-indigo-600', !isLogin).classList.toggle('border-indigo-600', !isLogin);
};

const checkinBtn = document.getElementById('s-checkin-btn');
if (checkinBtn) {
    checkinBtn.onclick = () => {
        openSignatureModal("Sign to Check-In", async (sigData) => {
            const driveUrl = await uploadToDrive({ type: 'signature', department: window.currentStaff.role, staffName: window.currentStaff.name, fileName: `Signature_${Date.now()}.png`, image: sigData });
            const now = new Date();
            const pushRef = push(ref(db, 'staff_attendance'));
            const log = { mobile: window.currentStaff.mobile, name: window.currentStaff.name, role: window.currentStaff.role, action: "Check-In", date: now.toLocaleDateString('en-US'), timeIn: now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true}), signatureUrl: driveUrl, status: 'active', checkInTimestamp: now.toISOString(), timestamp: Date.now() };
            await set(pushRef, log);
            localStorage.setItem('staff_active_session', JSON.stringify({ mobile: window.currentStaff.mobile, pushId: pushRef.key, status: 'checked_in', checkInTimestamp: log.checkInTimestamp }));
            alert("Checked In!"); renderDashboard(window.currentStaff);
        });
    };
}

const checkoutBtn = document.getElementById('s-checkout-btn');
if (checkoutBtn) {
    checkoutBtn.onclick = async () => {
        const active = JSON.parse(localStorage.getItem('staff_active_session'));
        const timeOut = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true});
        try { await update(ref(db, 'staff_attendance/' + active.pushId), { status: "completed", timeOut: timeOut }); localStorage.removeItem('staff_active_session'); alert("Checked Out Successfully!"); renderDashboard(window.currentStaff); }
        catch (error) { alert("Error: " + error.message); }
    };
}

// --- TASK SYSTEM ---
window.openTaskModal = () => {
    const targetSelect = document.getElementById('task-target');
    if (!targetSelect) return;
    targetSelect.innerHTML = '<option value="">Target Role</option>';
    const roles = window.isAdminLoggedIn ? ['Security', 'RT Technician', 'Cleaner'] : ['Cleaner Leader', 'RT Technician'];
    roles.forEach(r => targetSelect.innerHTML += `<option value="${r}">${r}</option>`);
    const modal = document.getElementById('task-modal');
    if (modal) modal.classList.remove('hidden');
};

window.closeTaskModal = () => {
    const modal = document.getElementById('task-modal');
    if (modal) modal.classList.add('hidden');
};

const taskForm = document.getElementById('task-form');
if (taskForm) {
    taskForm.onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('task-submit-btn');
        const file = document.getElementById('task-photo-in').files[0];
        if (!file) return alert("Please provide a photo.");
        if (btn) { btn.disabled = true; btn.innerText = "Uploading..."; }
        try {
            const comp = await compressImageFile(file);
            const loc = document.getElementById('task-loc').value;
            const url = await uploadToDrive({ type: 'photo', fileName: `${loc} - Before.png`, image: comp });
            const id = "TASK-" + Date.now();
            const task = { id, location: loc, details: document.getElementById('task-desc').value, priority: document.getElementById('task-priority').value, targetRole: document.getElementById('task-target').value, beforePhotoUrl: url, raisedByName: window.currentStaff ? window.currentStaff.name : "Admin", raisedByRole: window.currentStaff ? window.currentStaff.role : "Admin", raisedTimestamp: new Date().toISOString(), timestamp: new Date().toLocaleString(), status: "Open" };
            await set(ref(db, 'tasks/' + id), task);
            alert("Task Routed!"); closeTaskModal();
            // clear photo preview
            const preview = document.getElementById('task-photo-preview');
            if (preview) preview.classList.add('hidden');
        } catch (err) { alert("Error: " + err.message); }
        finally { if (btn) { btn.disabled = false; btn.innerText = "Save & Route Task"; } if(window.currentStaff) loadRoleView(window.currentStaff); }
    };
}

window.closeTaskAction = async (taskId) => {
    const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*';
    fileInput.onchange = async (e) => {
        if(!e.target.files[0]) return;
        alert("Processing After Photo...");
        const comp = await compressImageFile(e.target.files[0]);
        const url = await uploadToDrive({ type: 'photo', fileName: `After_${taskId}.png`, image: comp });
        await update(ref(db, 'tasks/' + taskId), { status: 'Closed', afterPhotoUrl: url, solvedByName: window.currentStaff.name, solvedByRole: window.currentStaff.role, solvedTimestamp: new Date().toISOString() });
        alert("Task Closed!"); loadRoleView(window.currentStaff);
    };
    if (confirm("Take CAMERA PHOTO (OK) or Gallery (Cancel)?")) fileInput.setAttribute('capture', 'environment');
    fileInput.click();
};

let activeRejectId = null;
window.openRejectModal = (id) => { activeRejectId = id; const modal = document.getElementById('reject-modal'); if (modal) modal.classList.remove('hidden'); };
window.closeRejectModal = () => { const modal = document.getElementById('reject-modal'); if (modal) modal.classList.add('hidden'); };
window.submitRejection = async () => {
    const reasonEl = document.getElementById('reject-reason');
    const reason = reasonEl ? reasonEl.value : "";
    if(!reason) return alert("Reason required.");
    await update(ref(db, 'tasks/' + activeRejectId), { status: 'Rejected', rejectionReason: reason, rejectedByName: window.currentStaff.name, rejectedByRole: window.currentStaff.role, rejectedTimestamp: new Date().toISOString() });
    alert("Rejected."); closeRejectModal(); loadRoleView(window.currentStaff);
};

// --- ADMIN ---
const adminLoginForm = document.getElementById('admin-login-form');
if (adminLoginForm) {
    adminLoginForm.onsubmit = async (e) => {
        e.preventDefault();
        if (document.getElementById('admin-mobile').value === "admin" && document.getElementById('admin-pass').value === "1234") {
            window.isAdminLoggedIn = true;
            const authSection = document.getElementById('view-admin-auth');
            const dashSection = document.getElementById('view-admin-dash');
            if (authSection) authSection.classList.add('hidden');
            if (dashSection) { dashSection.classList.remove('hidden'); loadAdminDashboard(); }
        }
        else alert("Denied");
    };
}

window.handleUserLogout = () => {
    localStorage.clear();
    window.location.href = 'index.html';
};

window.showAdminTab = (tabId) => {
    const tabs = document.querySelectorAll('.admin-tab');
    tabs.forEach(t => {
        t.classList.add('hidden');
        t.style.display = 'none';
    });

    const activeTab = document.getElementById(tabId);
    if (activeTab) {
        activeTab.classList.remove('hidden');
        activeTab.style.display = 'block';
    }

    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active-tab'));
    const activeBtn = document.querySelector(`[onclick*="${tabId}"]`);
    if (activeBtn) activeBtn.classList.add('active-tab');
};

async function loadAdminDashboard() {
    if (!document.getElementById('admin-table-body')) return;
    const [v, s, staff, tasks] = await Promise.all([get(ref(db, 'visitors')), get(ref(db, 'staff_attendance')), get(ref(db, 'staff')), get(ref(db, 'tasks'))]);
    let records = [];
    if(v.exists()) Object.values(v.val()).forEach(x => records.push({...x, type: 'visitor'}));
    if(s.exists()) Object.values(s.val()).forEach(x => records.push({...x, type: 'staff', id: x.mobile}));
    records.sort((a,b) => new Date(b.date + ' ' + (b.timeIn || '00:00 AM')) - new Date(a.date + ' ' + (a.timeIn || '00:00 AM')));
    window.adminData = records; renderAdminTable(records);

    const staffList = document.getElementById('admin-staff-list-body');
    if (staffList) {
        staffList.innerHTML = '';
        if(staff.exists()) Object.values(staff.val()).forEach(x => {
            staffList.innerHTML += `<tr class="border-b border-white/5"><td class="p-3 font-bold">${x.name}</td><td class="p-3">${x.branch}</td><td class="p-3">${x.role}</td><td class="p-3">${x.company}</td><td class="p-3">${x.mobile}</td><td class="p-3 text-center"><button onclick="deleteStaffAccount('${x.mobile}', '${x.name}')" class="text-red-500 font-bold text-xs uppercase">Delete</button></td></tr>`;
        });
    }

    const taskBody = document.getElementById('admin-task-list-body');
    if (taskBody) {
        taskBody.innerHTML = '';
        if(tasks.exists()) {
            window.adminTasks = Object.values(tasks.val()).reverse();
            window.adminTasks.forEach(t => {
                const b = getDirectDriveImageUrl(t.beforePhotoUrl || t.beforePhoto);
                const a = getDirectDriveImageUrl(t.afterPhotoUrl || t.afterPhoto);

                const rDT = t.raisedTimestamp ? new Date(t.raisedTimestamp) : null;
                const cDT = t.solvedTimestamp ? new Date(t.solvedTimestamp) : null;

                taskBody.innerHTML += `
                    <tr class="hover:bg-white/5 transition">
                        <td class="p-2 font-mono opacity-50">${t.id}</td>
                        <td class="p-2">${t.schoolBuilding || '-'}</td>
                        <td class="p-2 font-bold">${t.location}</td>
                        <td class="p-2 opacity-70">${t.targetRole}</td>
                        <td class="p-2">${t.raisedByName || 'Admin'}</td>
                        <td class="p-2">${rDT ? rDT.toLocaleDateString() : '-'}</td>
                        <td class="p-2">${rDT ? rDT.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-'}</td>
                        <td class="p-2">${t.solvedByName || '-'}</td>
                        <td class="p-2">${cDT ? cDT.toLocaleDateString() : '-'}</td>
                        <td class="p-2">${cDT ? cDT.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-'}</td>
                        <td class="p-2 font-bold ${t.status === 'Open' ? 'text-blue-400' : (t.status === 'Closed' ? 'text-green-400' : 'text-red-400')}">${t.status}</td>
                        <td class="p-2 italic opacity-60">${t.rejectionReason || 'N/A'}</td>
                        <td class="p-2">
                            <div class="flex gap-1 justify-center">
                                <img src="${b}" class="h-6 w-6 rounded border border-white/10" onclick="openImageZoom('${b}')" onerror="this.style.display='none'">
                                ${(t.afterPhotoUrl || t.afterPhoto) ? `<img src="${a}" class="h-6 w-6 rounded border border-white/10" onclick="openImageZoom('${a}')" onerror="this.style.display='none'">` : ''}
                            </div>
                        </td>
                    </tr>`;
            });
        }
    }
}

function renderAdminTable(data) {
    const body = document.getElementById('admin-table-body');
    if (!body) return;
    body.innerHTML = '';
    data.forEach(r => {
        const sig = getDirectDriveImageUrl(r.signatureUrl || r.signature);
        body.innerHTML += `<tr class="hover:bg-white/5 transition"><td class="p-3 uppercase text-[8px] opacity-40">${r.type}</td><td class="p-3">${r.id || r.mobile}</td><td class="p-3 opacity-60">${r.date}</td><td class="p-3 font-bold">${r.name}</td><td class="p-3 text-green-400">${r.timeIn}</td><td class="p-3 text-red-400">${r.timeOut || '-'}</td><td class="p-3 text-center">${sig ? `<img src="${sig}" class="h-6 mx-auto rounded border border-white/10" onerror="this.style.display='none'">` : '-'}</td></tr>`;
    });
}

// --- DYNAMIC FIELDS & ACCOUNT MGMT ---
async function loadRegistrationFields() {
    const snap = await get(ref(db, 'appConfig/registrationFields'));
    const container = document.getElementById('dynamic-reg-fields');
    if (!container) return;
    container.innerHTML = '';

    const defaultFields = ["Mobile Number", "ADEK Pass Number", "Company Name"];
    const fields = snap.exists() ? Object.values(snap.val()) : defaultFields;

    fields.forEach(field => {
        const id = field.toLowerCase().replace(/[^a-z0-9]/g, '-');
        container.innerHTML += `<input type="text" id="dyn-reg-${id}" data-field="${field}" placeholder="${field}" required class="w-full p-2 border rounded-lg text-sm dynamic-input">`;
    });
}

const deleteMyAccountBtn = document.getElementById('delete-my-account');
if (deleteMyAccountBtn) {
    deleteMyAccountBtn.onclick = async () => {
        if (!confirm("Are you sure? This will PERMANENTLY delete your account and all data. You will need to register again.")) return;
        try {
            const mobile = window.currentStaff.mobile;
            await set(ref(db, 'staff/' + mobile), null);
            localStorage.clear();
            alert("Account Deleted.");
            window.location.href = 'index.html';
        } catch (e) { alert("Error deleting account: " + e.message); }
    };
}

// --- INITIALIZATION ON PAGE LOAD ---
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;

    if (path.includes('visitor.html')) {
        checkVisitorSession();
    } else if (path.includes('staff-login.html')) {
        checkStaffAuth();
        loadRegistrationFields();
    } else if (path.includes('admin.html')) {
        // Admin dashboard needs explicit login check
        if (window.isAdminLoggedIn) {
            loadAdminDashboard();
        }
    }

    window.initSigPad();
    window.initVisitorCanvas();
});

// Helper for photo removal
window.removeCapturedPhoto = (inputId) => {
    const input = document.getElementById(inputId);
    if (input) input.value = '';
    const preview = document.getElementById(inputId + '-preview');
    if (preview) preview.classList.add('hidden');
};
