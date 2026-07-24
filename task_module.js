import { db } from './firebase_config.js';
import { ref, get, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- DASHBOARD DATA LOADING ---
window.loadRoleView = async (staff) => {
    try {
        const container = document.getElementById('tasksContainer');
        if (!container) return;
        container.innerHTML = `<div class="bg-white/10 p-4 rounded-xl text-center text-xs text-gray-500 text-gray-800">Loading tasks...</div>`;

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
                    const bImg = window.getDirectDriveImageUrl(t.beforePhotoUrl || t.beforePhoto);
                    const aImg = window.getDirectDriveImageUrl(t.afterPhotoUrl || t.afterPhoto);
                    taskHtml += `
                        <div class="task-card text-gray-800">
                            <div class="task-header">
                                <div>
                                    <h4 style="font-weight:700; font-size:1rem; color:var(--primary-dark);">${t.location}</h4>
                                    <p style="font-size:0.75rem; color:var(--text-gray);">${t.timestamp}</p>
                                </div>
                                <span class="badge ${t.status === 'Open' ? 'badge-pending' : 'badge-completed'}">${t.status}</span>
                            </div>
                            <p style="font-size:0.85rem; color:var(--primary-dark); margin:12px 0; font-weight:500;">${t.details}</p>
                            <div class="image-preview-container">
                                <div class="img-box" onclick="window.openZoomModal('${bImg}')">
                                    <img src="${bImg}">
                                    <span class="img-label">Before</span>
                                </div>
                                ${(t.afterPhotoUrl || t.afterPhoto) ? `
                                <div class="img-box" onclick="window.openZoomModal('${aImg}')">
                                    <img src="${aImg}">
                                    <span class="img-label">After</span>
                                </div>` : ''}
                            </div>
                            <div style="display:flex; gap:10px; margin-top:10px;">
                                <button class="btn btn-teal" style="flex:1; font-size:0.8rem;" onclick="window.closeTaskAction('${t.id}')">Resolve</button>
                                <button class="btn btn-outline" style="flex:1; font-size:0.8rem;" onclick="window.openRejectModal('${t.id}')">Reject</button>
                            </div>
                        </div>`;
                });
            } else {
                taskHtml = '<div class="col-span-full bg-white p-10 rounded-xl text-center text-gray-400 border border-dashed text-gray-800">No pending tasks for your position.</div>';
            }
        } else {
            taskHtml = '<div class="col-span-full bg-white p-10 rounded-xl text-center text-gray-400 border border-dashed text-gray-800">No tasks found.</div>';
        }

        const statTotal = document.getElementById('statTotal');
        const statPending = document.getElementById('statPending');
        const statCompleted = document.getElementById('statCompleted');
        if (statTotal) statTotal.innerText = total;
        if (statPending) statPending.innerText = pending;
        if (statCompleted) statCompleted.innerText = completed;
        container.innerHTML = taskHtml;
    } catch (e) { console.error("Role View Error:", e); }
};

// --- TASK MODAL LOGIC ---
window.openTaskModal = () => {
    try {
        const targetSelect = document.getElementById('task-target');
        if (!targetSelect) return;
        targetSelect.innerHTML = '<option value="">Target Role</option>';
        const roles = window.isAdminLoggedIn ? ['Security', 'RT Technician', 'Cleaner'] : ['Cleaner Leader', 'RT Technician'];
        roles.forEach(r => targetSelect.innerHTML += `<option value="${r}">${r}</option>`);
        const modal = document.getElementById('task-modal');
        if (modal) modal.classList.remove('hidden');
    } catch (e) { console.error("Open task modal error:", e); }
};

window.closeTaskModal = () => {
    const modal = document.getElementById('task-modal');
    if (modal) modal.classList.add('hidden');
};

window.closeTaskAction = async (taskId) => {
    const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*';
    fileInput.onchange = async (e) => {
        if(!e.target.files[0]) return;
        alert("Processing After Photo...");
        const comp = await window.compressImageFile(e.target.files[0]);
        const res = await window.uploadToDrive({
            type: 'task_photo',
            fileName: `After_${taskId}.png`,
            image: comp
        });

        if (res.status !== 'success' && !res.fileUrl) return alert("Upload failed: " + (res.message || "Unknown error"));
        const url = res.fileUrl;

        await update(ref(db, 'tasks/' + taskId), { status: 'Closed', afterPhotoUrl: url, solvedByName: window.currentStaff.name, solvedByRole: window.currentStaff.role, solvedTimestamp: new Date().toISOString() });
        alert("Task Closed!"); window.loadRoleView(window.currentStaff);
    };
    if (confirm("Take CAMERA PHOTO (OK) or Gallery (Cancel)?")) fileInput.setAttribute('capture', 'environment');
    fileInput.click();
};

window.openRejectModal = (id) => {
    window.activeRejectId = id;
    const modal = document.getElementById('reject-modal');
    if (modal) modal.classList.remove('hidden');
};

window.closeRejectModal = () => {
    const modal = document.getElementById('reject-modal');
    if (modal) modal.classList.add('hidden');
};

window.submitRejection = async () => {
    const reasonEl = document.getElementById('reject-reason');
    const reason = reasonEl ? reasonEl.value : "";
    if(!reason) return alert("Reason required.");
    await update(ref(db, 'tasks/' + window.activeRejectId), { status: 'Rejected', rejectionReason: reason, rejectedByName: window.currentStaff.name, rejectedByRole: window.currentStaff.role, rejectedTimestamp: new Date().toISOString() });
    alert("Rejected."); window.closeRejectModal(); window.loadRoleView(window.currentStaff);
};
