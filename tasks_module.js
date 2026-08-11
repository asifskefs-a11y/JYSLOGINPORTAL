import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, get, update, push, set, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================
// TASK MANAGEMENT MODULE
// ================================================

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
    const assignee = document.getElementById('assignedStaffSelect')?.value;
    if (!school || !area || !capturedTaskPhotoBase64 || !assignee) return alert("Required fields missing!");

    const btn = document.getElementById('submitTaskBtn');
    if (btn) btn.disabled = true;
    window.showLoader();

    try {
        const res = await window.uploadToDrive({
            category: UPLOAD_CONFIG.CATEGORIES.TASK_PHOTOS,
            fileName: `Task_${Date.now()}.jpg`,
            image: capturedTaskPhotoBase64
        });

        if (res.status === 'success') {
            const taskId = "TASK-" + Date.now();
            const data = {
                id: taskId,
                school,
                location: area,
                details,
                beforePhotoUrl: res.fileUrl,
                status: 'Open',
                assignee: assignee,
                timestamp: Date.now(),
                raisedByMobile: window.currentStaff?.mobile,
                raisedByName: window.currentStaff?.name || "Staff"
            };
            await set(ref(db, 'tasks/' + taskId), data);

            // Trigger Notification
            window.showWhatsAppToast("🔔 New Task Assigned!", `From: ${data.raisedByName} | Branch: ${school}\nTask: ${details}`);

            window.triggerSuccessPopup("Task Raised & Assigned!");
            // Reset form...
            window.showStaffView('staff-dash-area');
        }
    } catch (e) { alert(e.message); } finally {
        if (btn) { btn.disabled = false; }
        window.hideLoader();
    }
};

window.closeTaskAction = async (taskId) => {
    const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.setAttribute('capture', 'environment');
    fileInput.onchange = async (e) => {
        if(!e.target.files[0]) return;
        const comp = await window.compressImageFile(e.target.files[0]);
        const res = await window.uploadToDrive({ category: UPLOAD_CONFIG.CATEGORIES.TASK_PHOTOS, fileName: `Task_After_${taskId}.jpg`, image: comp });
        if (res.status === 'success') {
            await update(ref(db, 'tasks/' + taskId), { status: 'Closed', afterPhotoUrl: res.fileUrl, solvedByName: window.currentStaff?.name || "User", solvedTimestamp: Date.now() });
            alert("Task Closed!"); window.loadRoleView(window.currentStaff);
        }
    };
    fileInput.click();
};

window.loadRoleView = async (staff) => {
    const container = document.getElementById('tasksContainer'); if (!container) return;

    try {
        const snap = await get(ref(db, 'tasks'));
        if (snap.exists()) {
            const data = snap.val();
            // Cache locally for Wi-Fi fallback
            localStorage.setItem('cached_tasks', JSON.stringify(data));

            const tasks = Object.values(data).filter(t => t.status === 'Open');
            renderTasksList(tasks, container);
        } else {
            container.innerHTML = "No pending tasks.";
        }
    } catch (e) {
        console.warn("⚠️ Restricted Wi-Fi mode: Loading tasks from local cache.");
        const cached = localStorage.getItem('cached_tasks');
        if (cached) {
            const tasks = Object.values(JSON.parse(cached)).filter(t => t.status === 'Open');
            renderTasksList(tasks, container);
            window.showWhatsAppToast("⚠️ Offline Mode", "Loaded from local cache.");
        } else {
            container.innerHTML = "No connection. Please login on school network first.";
        }
    }
};

function renderTasksList(tasks, container) {
    container.innerHTML = tasks.map(t => `
        <div class="task-card bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center gap-4">
            <div class="flex-1">
                <h4 class="font-black text-indigo-900 uppercase text-sm">${t.location}</h4>
                <p class="text-xs text-slate-500 font-medium line-clamp-2">${t.details}</p>
            </div>
            <button onclick="window.closeTaskAction('${t.id}')" class="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase whitespace-nowrap active:scale-95 transition-all">
                Resolve
            </button>
        </div>
    `).join('');
}

console.log("✅ tasks_module.js loaded (Task Management)");
