import { db } from './firebase_config.js';
import { ref, get, update, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

let currentTaskView = 'active';

/**
 * --- HYBRID TOUCH DELEGATION (RESTORED) ---
 * Captures all dashboard interactions at the top-most level
 * to prevent Android WebView touch blocking.
 */
(function initGlobalInteraction() {
    const handleInteraction = (e) => {
        const target = e.target.closest('.btn-task-accept, .btn-task-reject, .item-audit-btn, .dispose-item-btn');
        if (!target) return;

        const taskId = target.getAttribute('data-task-id');

        if (target.classList.contains('btn-task-accept')) {
            window.closeTaskAction(taskId);
        } else if (target.classList.contains('btn-task-reject')) {
            window.openRejectModal(taskId);
        } else if (target.classList.contains('item-audit-btn')) {
            window.openAssetAudit();
        } else if (target.classList.contains('dispose-item-btn')) {
            window.openDirectDisposal();
        }
    };

    document.addEventListener('click', handleInteraction);
    document.addEventListener('touchstart', (e) => {
        const target = e.target.closest('button, .portal-card');
        if (target) {
            target.classList.add('active-touch');
            setTimeout(() => target.classList.remove('active-touch'), 100);
        }
    }, { passive: true });
})();

window.switchTaskView = (view) => {
    currentTaskView = view;
    const activeBtn = document.getElementById('task-tab-active');
    const historyBtn = document.getElementById('task-tab-history');

    if (activeBtn && historyBtn) {
        if (view === 'active') {
            activeBtn.classList.add('bg-white', 'text-indigo-600');
            historyBtn.classList.remove('bg-white', 'text-indigo-600');
        } else {
            historyBtn.classList.add('bg-white', 'text-indigo-600');
            activeBtn.classList.remove('bg-white', 'text-indigo-600');
        }
    }
    if (window.currentStaff) window.loadRoleView(window.currentStaff);
};

window.loadRoleView = async (staff) => {
    const container = document.getElementById('tasksContainer');
    if (!container) return;

    onValue(ref(db, 'tasks'), (snapshot) => {
        if (!snapshot.exists()) {
            container.innerHTML = `<div class="p-6 text-center text-gray-400">No tasks assigned.</div>`;
            return;
        }

        const myTasks = Object.values(snapshot.val()).filter(t =>
            t.assignedUserId === staff.mobile || (t.assignedSchool === staff.branch && t.assignedRole === staff.role)
        );

        const filtered = myTasks.filter(t =>
            currentTaskView === 'active' ? (t.status === 'Open' || t.status === 'Accepted') : (t.status === 'Closed' || t.status === 'Rejected')
        );

        container.innerHTML = filtered.map(t => `
            <div class="task-card bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-2" style="max-width: 100%; overflow: hidden;">
                <div class="flex justify-between">
                    <h4 class="font-bold text-indigo-900">${t.location}</h4>
                    <span class="text-[9px] uppercase font-black ${t.status === 'Open' ? 'text-orange-500' : 'text-green-500'}">${t.status}</span>
                </div>
                <p class="text-xs text-gray-600">${t.details || "No description provided."}</p>
                <img src="${window.getDirectDriveImageUrl(t.beforePhotoUrl)}" class="w-full h-32 object-cover rounded-lg">

                ${t.status === 'Open' || t.status === 'Accepted' ? `
                    <div class="flex gap-2 mt-2">
                        <button data-task-id="${t.id}" class="btn-task-accept flex-1 bg-green-500 text-white py-2 rounded-lg font-bold text-xs uppercase">Accept & Resolve</button>
                        <button data-task-id="${t.id}" class="btn-task-reject flex-1 bg-red-100 text-red-600 py-2 rounded-lg font-bold text-xs uppercase">Reject</button>
                    </div>
                ` : `<p class="text-[10px] text-gray-400 italic">Audit: ${t.status} by ${t.solvedByName || t.rejectedByName}</p>`}
            </div>
        `).join('');
    });
};

window.closeTaskAction = async (taskId) => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.capture = 'environment';

    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const comp = await window.compressImageFile(file, 800, 800, 0.7);
            const res = await window.uploadToDrive({ type: 'task_photo', fileName: `AFTER_${taskId}.jpg`, image: comp });

            if (res.status === 'success') {
                await update(ref(db, `tasks/${taskId}`), {
                    status: 'Closed',
                    afterPhotoUrl: res.fileUrl,
                    solvedByName: window.currentStaff.name,
                    solvedTimestamp: new Date().toISOString()
                });
                alert("Task Closed.");
            }
        } catch (err) { alert("Upload failed."); }
    };
    fileInput.click();
};

window.openRejectModal = (id) => {
    window.activeRejectId = id;
    const modal = document.getElementById('reject-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
};

window.submitRejection = async () => {
    const reason = document.getElementById('reject-reason')?.value;
    if (!reason) return alert("Reason required.");
    await update(ref(db, `tasks/${window.activeRejectId}`), {
        status: 'Rejected',
        rejectionReason: reason,
        rejectedByName: window.currentStaff.name,
        rejectedTimestamp: new Date().toISOString()
    });
    document.getElementById('reject-modal').classList.add('hidden');
    alert("Task Rejected.");
};
