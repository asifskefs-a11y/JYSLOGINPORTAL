import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, get, update, push, set, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================
// TASK MANAGEMENT MODULE
// ================================================

let capturedTaskPhotoBase64 = "";
let currentTaskView = 'active'; // 'active' or 'history'

window.handleTaskImageCapture = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    capturedTaskPhotoBase64 = await window.compressImageFile(file);
    const preview = document.getElementById('taskPhotoPreview');
    if (preview) { preview.src = capturedTaskPhotoBase64; document.getElementById('taskPhotoPreviewContainer').classList.remove('hidden'); }
};

window.switchTaskView = (view) => {
    currentTaskView = view;
    document.getElementById('task-tab-active')?.classList.toggle('tab-active', view === 'active');
    document.getElementById('task-tab-history')?.classList.toggle('tab-active', view === 'history');
    window.loadRoleView(window.currentStaff);
};

window.submitNewMaintenanceTask = async () => {
    const school = document.getElementById('taskSchoolSelect')?.value;
    const area = document.getElementById('areaNameInput')?.value;
    const details = document.getElementById('taskDetailsInput')?.value;
    const targetRole = document.getElementById('taskRoleSelect')?.value;
    const specificStaff = document.getElementById('assignedStaffSelect')?.value;

    if (!school || !area || !details || !targetRole) return alert("Required fields missing!");

    const btn = document.getElementById('submitTaskBtn');
    if (btn) btn.disabled = true;
    window.showGlobalSpinner("Raising Task...");

    try {
        let photoUrl = "";
        if (capturedTaskPhotoBase64) {
            const res = await window.uploadToDrive({
                category: UPLOAD_CONFIG.CATEGORIES.TASK_PHOTOS,
                fileName: `Task_${Date.now()}.jpg`,
                image: capturedTaskPhotoBase64
            });
            if (res.status === 'success') photoUrl = res.fileUrl;
        }

        const taskId = "TASK-" + Date.now();
        const data = {
            id: taskId,
            assignedSchool: school,
            location: area,
            details,
            beforePhotoUrl: photoUrl,
            status: 'Open',
            assignedRole: targetRole,
            assignedStaff: specificStaff || "Any",
            timestamp: Date.now(),
            raisedByMobile: window.currentStaff?.mobile,
            raisedByName: window.currentStaff?.fullName || window.currentStaff?.name || "Staff"
        };

        await set(ref(db, 'tasks/' + taskId), data);
        window.triggerSuccessPopup("Task Raised Successfully! 🔔");

        // Reset form
        document.getElementById('areaNameInput').value = "";
        document.getElementById('taskDetailsInput').value = "";
        capturedTaskPhotoBase64 = "";
        document.getElementById('taskPhotoPreviewContainer')?.classList.add('hidden');

        window.loadRoleView(window.currentStaff);
    } catch (e) { alert(e.message); } finally {
        if (btn) btn.disabled = false;
        window.hideGlobalSpinner();
    }
};

window.closeTaskAction = async (taskId) => {
    const confirmClose = confirm("Are you sure you want to resolve and close this task?");
    if (!confirmClose) return;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.setAttribute('capture', 'environment');

    fileInput.onchange = async (e) => {
        if(!e.target.files[0]) return;
        window.showGlobalSpinner("Closing Task...");
        try {
            const comp = await window.compressImageFile(e.target.files[0]);
            const res = await window.uploadToDrive({
                category: UPLOAD_CONFIG.CATEGORIES.TASK_PHOTOS,
                fileName: `Task_After_${taskId}.jpg`,
                image: comp
            });

            if (res.status === 'success') {
                await update(ref(db, 'tasks/' + taskId), {
                    status: 'Closed',
                    afterPhotoUrl: res.fileUrl,
                    solvedByName: window.currentStaff?.fullName || window.currentStaff?.name || "User",
                    solvedTimestamp: Date.now()
                });
                window.triggerSuccessPopup("Task Closed Successfully! ✅");
                window.loadRoleView(window.currentStaff);
            }
        } catch (err) {
            alert("Error closing task: " + err.message);
        } finally {
            window.hideGlobalSpinner();
        }
    };
    fileInput.click();
};

window.rejectTaskAction = async (taskId) => {
    const reason = prompt("Please enter reason for rejection:");
    if (!reason) return;

    window.showGlobalSpinner("Rejecting Task...");
    try {
        await update(ref(db, 'tasks/' + taskId), {
            status: 'Rejected',
            rejectionReason: reason,
            solvedByName: window.currentStaff?.fullName || window.currentStaff?.name || "User",
            solvedTimestamp: Date.now()
        });
        window.triggerSuccessPopup("Task Rejected.");
        window.loadRoleView(window.currentStaff);
    } catch (e) {
        alert(e.message);
    } finally {
        window.hideGlobalSpinner();
    }
};

window.loadRoleView = async (staff) => {
    const container = document.getElementById('tasksContainer');
    if (!container || !staff) return;

    const role = (staff.role || "").toLowerCase().trim();
    const isSecurity = role === 'security';
    const isAdmin = role === 'admin';
    const isResolver = role === 'cleaner leader' || role === 'technician' || role === 'housekeeping';

    // Toggle Task Creation Area Visibility
    const taskArea = document.getElementById('security-task-area');
    if (taskArea) {
        if (isSecurity || isAdmin) {
            taskArea.classList.remove('hidden');
        } else {
            taskArea.classList.add('hidden');
        }
    }

    // Toggle Sidebar & Dashboard Create Task Button Visibility
    const sidebarCreateBtn = document.getElementById('menu-create-task-btn');
    const dashCreateBtn = document.getElementById('s-dash-create-task-btn');

    if (isSecurity || isAdmin) {
        if (sidebarCreateBtn) sidebarCreateBtn.classList.remove('hidden');
        if (dashCreateBtn) dashCreateBtn.classList.remove('hidden');
    } else {
        if (sidebarCreateBtn) sidebarCreateBtn.classList.add('hidden');
        if (dashCreateBtn) dashCreateBtn.classList.add('hidden');
    }

    // Use onValue for real-time status sync
    onValue(ref(db, 'tasks'), (snap) => {
        if (snap.exists()) {
            const allTasks = Object.values(snap.val());
            localStorage.setItem('cached_tasks', JSON.stringify(snap.val()));

            let userTasks = [];

            if (isAdmin || isSecurity) {
                // Creators see tasks they raised
                userTasks = allTasks.filter(t => t.raisedByMobile === staff.mobile);
            } else {
                // Resolvers see tasks assigned to their role
                userTasks = allTasks.filter(t => {
                    const assignedRole = (t.assignedRole || "").toLowerCase().trim();
                    return assignedRole === role || (role === 'cleaner leader' && assignedRole === 'cleaner');
                });
            }

            // Update Dashboard Stats for this User
            const total = userTasks.length;
            const pending = userTasks.filter(t => t.status === 'Open' || t.status === 'Accepted').length;
            const completed = userTasks.filter(t => t.status === 'Closed' || t.status === 'Rejected').length;

            if (document.getElementById('statTotal')) document.getElementById('statTotal').innerText = total;
            if (document.getElementById('statPending')) document.getElementById('statPending').innerText = pending;
            if (document.getElementById('statCompleted')) document.getElementById('statCompleted').innerText = completed;

            let filteredTasks = [];
            // Split into Active and History based on tab
            if (currentTaskView === 'active') {
                filteredTasks = userTasks.filter(t => t.status === 'Open' || t.status === 'Accepted');
            } else {
                filteredTasks = userTasks.filter(t => t.status === 'Closed' || t.status === 'Rejected');
            }

            renderTasksList(filteredTasks, container, isResolver);
        } else {
            container.innerHTML = `<p class="p-8 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">No ${currentTaskView} tasks found.</p>`;
        }
    }, (error) => {
        console.warn("⚠️ Task Loading Error:", error);
        const cached = localStorage.getItem('cached_tasks');
        if (cached) {
            container.innerHTML = `<p class="p-8 text-center text-amber-500 font-bold uppercase tracking-widest text-[10px]">Restricted Wi-Fi: Please reconnect.</p>`;
        }
    });
};

window.filterStaffBySchoolAndRole = async () => {
    const school = document.getElementById('taskSchoolSelect')?.value;
    const role = document.getElementById('taskRoleSelect')?.value;
    const staffSelect = document.getElementById('assignedStaffSelect');

    if (!staffSelect) return;
    staffSelect.innerHTML = '<option value="">Loading Staff...</option>';

    if (!school || !role) {
        staffSelect.innerHTML = '<option value="">Select School & Role First</option>';
        return;
    }

    try {
        const snap = await get(ref(db, 'staff'));
        if (snap.exists()) {
            const allStaff = Object.values(snap.val());
            const filtered = allStaff.filter(s => {
                const sSchool = (s.school || s.branch || "").trim();
                const sRole = (s.role || s.position || "").trim().toLowerCase();
                return sSchool === school && sRole === role.toLowerCase();
            });

            if (filtered.length > 0) {
                staffSelect.innerHTML = '<option value="">Assign Specific Staff (Optional)</option>' +
                    filtered.map(s => `<option value="${s.staffId || s.mobile}">${s.fullName || s.name}</option>`).join('');
            } else {
                staffSelect.innerHTML = '<option value="">No staff found for this selection</option>';
            }
        } else {
            staffSelect.innerHTML = '<option value="">No staff database found</option>';
        }
    } catch (e) {
        console.error("Error filtering staff:", e);
        staffSelect.innerHTML = '<option value="">Error loading staff</option>';
    }
};

function renderTasksList(tasks, container, isResolver) {
    if (tasks.length === 0) {
        container.innerHTML = `<p class="p-8 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">No ${currentTaskView} tasks.</p>`;
        return;
    }

    tasks.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    container.innerHTML = tasks.map(t => {
        const isHistory = t.status === 'Closed' || t.status === 'Rejected';
        const statusClass = t.status === 'Open' ? 'bg-amber-500' : t.status === 'Closed' ? 'bg-emerald-500' : 'bg-red-500';

        return `
            <div class="task-card bg-white p-5 rounded-[2rem] shadow-xl border border-indigo-50 flex flex-col gap-4 fade-in">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="px-2 py-0.5 rounded text-[8px] font-black text-white uppercase ${statusClass}">${t.status}</span>
                            <span class="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">${new Date(t.timestamp).toLocaleString()}</span>
                        </div>
                        <h4 class="font-black text-indigo-900 uppercase text-sm leading-tight">${t.location}</h4>
                    </div>
                    ${t.beforePhotoUrl ? `<img src="${window.getDirectDriveImageUrl(t.beforePhotoUrl)}" class="w-12 h-12 rounded-xl object-cover border-2 border-indigo-50 shadow-sm" onclick="window.openImageZoom('${t.beforePhotoUrl}')">` : ''}
                </div>

                <p class="text-xs text-slate-600 font-medium leading-relaxed">${t.details}</p>

                <div class="flex items-center justify-between pt-2 border-t border-slate-50">
                    <div class="flex flex-col">
                        <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Raised By</span>
                        <span class="text-[10px] font-bold text-indigo-600">${t.raisedByName}</span>
                    </div>

                    ${!isHistory && isResolver ? `
                        <div class="flex gap-2">
                            <button onclick="window.rejectTaskAction('${t.id}')" class="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-[9px] font-black uppercase active:scale-95 transition-all">Reject</button>
                            <button onclick="window.closeTaskAction('${t.id}')" class="px-4 py-2 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase shadow-lg shadow-emerald-500/20 active:scale-95 transition-all">Resolve</button>
                        </div>
                    ` : ''}

                    ${isHistory ? `
                        <div class="flex flex-col items-end">
                            <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest">${t.status === 'Closed' ? 'Resolved' : 'Rejected'} By</span>
                            <span class="text-[10px] font-bold text-slate-700">${t.solvedByName || 'System'}</span>
                        </div>
                    ` : ''}
                </div>
                ${t.rejectionReason ? `<div class="mt-2 p-3 bg-red-50 rounded-xl border border-red-100 text-[10px] font-medium text-red-700"><i class="fa-solid fa-circle-exclamation mr-1"></i> Reason: ${t.rejectionReason}</div>` : ''}
            </div>
        `;
    }).join('');
}

console.log("✅ tasks_module.js: Role-Based Logic Restored");

console.log("✅ tasks_module.js loaded (Task Management)");
