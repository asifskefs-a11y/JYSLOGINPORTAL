import { db } from './firebase_config.js';
import { ref, get, update, set, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

let capturedTaskPhotoBase64 = "";
let currentTaskView = 'active';

/**
 * --- GLOBAL EVENT DELEGATION FOR HYBRID TOUCH ---
 * This ensures that dynamically rendered task buttons respond to
 * Android touch events without being blocked by invisible layers.
 */
(function initTaskTouchDelegation() {
    const handleInteraction = async (e) => {
        const target = e.target.closest('.btn-task-accept, .btn-task-reject');
        if (!target) return;

        const taskId = target.getAttribute('data-task-id');
        if (!taskId) return;

        if (target.classList.contains('btn-task-accept')) {
            window.closeTaskAction(taskId);
        } else if (target.classList.contains('btn-task-reject')) {
            window.openRejectModal(taskId);
        }
    };

    document.addEventListener('click', handleInteraction);
    // Use passive: true to prevent blocking scroll, but execute logic
    document.addEventListener('touchstart', (e) => {
        if (e.target.closest('.btn-task-accept, .btn-task-reject')) {
            // handleInteraction(e); // Handled by click usually, but touchstart helps responsiveness
        }
    }, { passive: true });
})();

window.switchTaskView = (view) => {
    currentTaskView = view;
    const activeBtn = document.getElementById('task-tab-active');
    const historyBtn = document.getElementById('task-tab-history');

    if (activeBtn && historyBtn) {
        if (view === 'active') {
            activeBtn.classList.add('bg-white', 'text-indigo-600', 'shadow-sm');
            activeBtn.classList.remove('text-slate-400');
            historyBtn.classList.remove('bg-white', 'text-indigo-600', 'shadow-sm');
            historyBtn.classList.add('text-slate-400');
        } else {
            historyBtn.classList.add('bg-white', 'text-indigo-600', 'shadow-sm');
            historyBtn.classList.remove('text-slate-400');
            activeBtn.classList.remove('bg-white', 'text-indigo-600', 'shadow-sm');
            activeBtn.classList.add('text-slate-400');
        }
    }
    if (window.currentStaff) window.loadRoleView(window.currentStaff);
};

window.loadRoleView = async (staff) => {
    try {
        const container = document.getElementById('tasksContainer');
        if (!container) return;
        container.innerHTML = `<div class="p-8 text-center text-gray-400 animate-pulse font-bold uppercase tracking-widest text-[10px]">Syncing Tasks...</div>`;

        onValue(ref(db, 'tasks'), (snapshot) => {
            if (!snapshot.exists()) {
                container.innerHTML = `<div class="p-10 text-center text-gray-300 italic border-2 border-dashed rounded-3xl">No tasks assigned yet.</div>`;
                return;
            }

            const allTasks = Object.values(snapshot.val());
            const myBaseTasks = allTasks.filter(t => t.assignedUserId === staff.mobile || (t.assignedSchool === staff.branch && t.assignedRole === staff.role));

            // Stats update
            const total = myBaseTasks.length;
            const pending = myBaseTasks.filter(t => t.status === 'Open' || t.status === 'Accepted').length;
            const completed = myBaseTasks.filter(t => t.status === 'Closed').length;

            if(document.getElementById('statTotal')) document.getElementById('statTotal').innerText = total;
            if(document.getElementById('statPending')) document.getElementById('statPending').innerText = pending;
            if(document.getElementById('statCompleted')) document.getElementById('statCompleted').innerText = completed;

            const filteredTasks = myBaseTasks.filter(t => {
                return currentTaskView === 'active' ? (t.status === 'Open' || t.status === 'Accepted') : (t.status === 'Closed' || t.status === 'Rejected');
            }).sort((a, b) => new Date(b.raisedTimestamp || 0) - new Date(a.raisedTimestamp || 0));

            if (filteredTasks.length === 0) {
                container.innerHTML = `<div class="p-10 text-center text-gray-300 italic border-2 border-dashed rounded-3xl">No ${currentTaskView} tasks.</div>`;
                return;
            }

            container.innerHTML = filteredTasks.map(t => {
                const bImg = window.getDirectDriveImageUrl(t.beforePhotoUrl || t.beforePhoto);
                const isHistory = t.status === 'Closed' || t.status === 'Rejected';

                return `
                    <div class="task-card bg-white p-4 rounded-2xl shadow-md border border-gray-100 flex flex-col gap-3" style="max-width: 100%; box-sizing: border-box; overflow: hidden;">
                        <div class="flex justify-between items-start">
                            <div class="flex-1">
                                <h4 class="text-sm font-black text-indigo-900 uppercase tracking-tight">${t.location}</h4>
                                <p class="text-[9px] text-gray-400 font-bold uppercase mt-0.5">${t.timestamp}</p>
                            </div>
                            <span class="px-2 py-1 rounded-lg text-[8px] font-black uppercase ${t.status === 'Open' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}">${t.status}</span>
                        </div>

                        <p class="text-xs text-slate-700 font-medium leading-relaxed">${t.details || "Maintenance Required"}</p>

                        <div class="grid grid-cols-1 gap-2 mt-2" style="max-width: 100%;">
                            <div class="relative rounded-xl overflow-hidden border bg-slate-50 h-48 w-full">
                                <img src="${bImg}" class="w-full h-full object-contain cursor-pointer" onclick="window.openImageZoom('${bImg}')" style="max-width: 100% !important;">
                                <span class="absolute bottom-2 left-2 px-2 py-0.5 bg-black/50 text-white text-[8px] font-bold rounded uppercase">Before Work</span>
                            </div>
                        </div>

                        ${!isHistory ? `
                            <div class="flex gap-2 mt-3" style="width:100%; flex-wrap: wrap;">
                                <button data-task-id="${t.id}" class="btn-task-accept flex-1 bg-green-500 text-white py-3 rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-md active:scale-95 transition-all min-w-[120px]">Accept & Resolve</button>
                                <button data-task-id="${t.id}" class="btn-task-reject flex-1 bg-red-100 text-red-600 py-3 rounded-xl font-bold text-[10px] uppercase tracking-widest active:scale-95 transition-all min-w-[120px]">Reject</button>
                            </div>
                        ` : `
                            <div class="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-100 text-[10px]">
                                <p class="font-black text-slate-400 uppercase tracking-tighter">Audit Trail</p>
                                <p class="text-slate-700 mt-1 font-bold">${t.status === 'Closed' ? `Resolved by ${t.solvedByName}` : `Rejected: ${t.rejectionReason}`}</p>
                            </div>
                        `}
                    </div>
                `;
            }).join('');
        });
    } catch (e) { console.error("Task Rendering Error:", e); }
};

window.closeTaskAction = async (taskId) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const btn = document.querySelector(`[data-task-id="${taskId}"].btn-task-accept`);
        if(btn) { btn.disabled = true; btn.innerText = "UPLOADING..."; }

        try {
            const compressed = await window.compressImageFile(file, 800, 800, 0.7);
            const uploadRes = await window.uploadToDrive({
                type: 'task_photo',
                fileName: `AFTER_${taskId}.jpg`,
                image: compressed
            });

            if (uploadRes.status === 'success') {
                await update(ref(db, `tasks/${taskId}`), {
                    status: 'Closed',
                    afterPhotoUrl: uploadRes.fileUrl,
                    solvedByName: window.currentStaff.name,
                    solvedByRole: window.currentStaff.role,
                    solvedTimestamp: new Date().toISOString()
                });
                alert("Task Successfully Resolved!");
            } else {
                throw new Error("Cloud Storage Error");
            }
        } catch (err) {
            alert("Upload failed. Please try again.");
            if(btn) { btn.disabled = false; btn.innerText = "ACCEPT & RESOLVE"; }
        }
    };
    input.click();
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
    if (!reason) return alert("Please provide a reason for rejection.");

    try {
        await update(ref(db, `tasks/${window.activeRejectId}`), {
            status: 'Rejected',
            rejectionReason: reason,
            rejectedByName: window.currentStaff.name,
            rejectedByRole: window.currentStaff.role,
            rejectedTimestamp: new Date().toISOString()
        });
        document.getElementById('reject-modal').classList.add('hidden');
        document.getElementById('reject-modal').style.display = 'none';
        alert("Task Rejected.");
    } catch (e) { alert("Error updating task."); }
};
