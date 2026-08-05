import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, get, update, push, set, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

let capturedTaskPhotoBase64 = "";

window.handleTaskImageCapture = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    capturedTaskPhotoBase64 = await window.compressImageFile(file);
    const preview = document.getElementById('taskPhotoPreview');
    if (preview) { preview.src = capturedTaskPhotoBase64; document.getElementById('taskPhotoPreviewContainer').classList.remove('hidden'); }
};

window.submitNewMaintenanceTask = async () => {
    const school = document.getElementById('taskSchoolSelect')?.value;
    const area = document.getElementById('areaNameInput')?.value;
    const details = document.getElementById('taskDetailsInput')?.value;
    if (!school || !area || !capturedTaskPhotoBase64) return alert("Required fields missing!");

    const btn = document.getElementById('submitTaskBtn');
    btn.disabled = true; btn.innerHTML = 'SYNCING...';

    try {
        const res = await window.uploadToDrive({
            category: UPLOAD_CONFIG.CATEGORIES.TASK_PHOTOS,
            fileName: `Task_${Date.now()}.jpg`,
            image: capturedTaskPhotoBase64
        });

        if (res.status === 'success') {
            const taskId = "TASK-" + Date.now();
            const data = {
                id: taskId, school, location: area, details, beforePhotoUrl: res.fileUrl, status: 'Open',
                timestamp: new Date().toLocaleString(), raisedByName: window.currentStaff?.name || "Staff"
            };
            await set(ref(db, 'tasks/' + taskId), data);
            window.triggerSuccessPopup("Task Raised!");
            document.getElementById('areaNameInput').value = ""; document.getElementById('taskDetailsInput').value = "";
            capturedTaskPhotoBase64 = ""; document.getElementById('taskPhotoPreviewContainer').classList.add('hidden');
            window.showStaffView('staff-dash-area');
        }
    } catch (e) { alert(e.message); } finally { btn.disabled = false; btn.innerHTML = 'CREATE TASK'; }
};

window.closeTaskAction = async (taskId) => {
    const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.setAttribute('capture', 'environment');
    fileInput.onchange = async (e) => {
        if(!e.target.files[0]) return;
        const comp = await window.compressImageFile(e.target.files[0]);
        const res = await window.uploadToDrive({ category: UPLOAD_CONFIG.CATEGORIES.TASK_PHOTOS, fileName: `Task_After_${taskId}.jpg`, image: comp });
        if (res.status === 'success') {
            await update(ref(db, 'tasks/' + taskId), { status: 'Closed', afterPhotoUrl: res.fileUrl, solvedByName: window.currentStaff.name, solvedTimestamp: Date.now() });
            alert("Task Closed!"); window.loadRoleView(window.currentStaff);
        }
    };
    fileInput.click();
};

window.loadRoleView = async (staff) => {
    const snap = await get(ref(db, 'tasks'));
    const container = document.getElementById('tasksContainer'); if (!container) return;
    if (snap.exists()) {
        const tasks = Object.values(snap.val()).filter(t => t.status === 'Open');
        container.innerHTML = tasks.map(t => `<div class="task-card"><h4>${t.location}</h4><p>${t.details}</p><button onclick="window.closeTaskAction('${t.id}')">Resolve</button></div>`).join('');
    } else { container.innerHTML = "No pending tasks."; }
};
