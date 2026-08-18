import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, get, update, push, set, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================
// TASK MANAGEMENT MODULE (v4.3 - MATERIAL TRACKING)
// ================================================

let capturedTaskPhotoBase64 = "";
let capturedAfterPhotoBase64 = "";
let activeTaskIdForClosure = null;
let currentTaskTab = 'create'; // 'create', 'active', 'history'
let taskListenerActive = false;

/* --- PHOTO CAPTURE HANDLERS --- */

window.handleTaskImageCapture = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    capturedTaskPhotoBase64 = await window.compressImageFile(file);
    const preview = document.getElementById('taskPhotoPreview');
    if (preview) { preview.src = capturedTaskPhotoBase64; document.getElementById('taskPhotoPreviewContainer').classList.remove('hidden'); }
};

window.removeTaskPhoto = () => {
    capturedTaskPhotoBase64 = "";
    const input = document.getElementById('cameraInput');
    if (input) input.value = "";
    const preview = document.getElementById('taskPhotoPreview');
    if (preview) preview.src = "";
    document.getElementById('taskPhotoPreviewContainer')?.classList.add('hidden');
};

window.handleAfterPhotoCaptured = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    window.showGlobalSpinner("Optimizing Proof...");
    try {
        capturedAfterPhotoBase64 = await window.compressImageFile(file);

        // UI Feedback: Show preview
        const preview = document.getElementById('after-photo-preview');
        const container = document.getElementById('after-photo-preview-container');
        if (preview && container) {
            preview.src = capturedAfterPhotoBase64;
            container.classList.remove('hidden');
            document.getElementById('capture-proof-btn')?.classList.add('hidden');
        }

        // AUTO-SUBMIT: If all required fields are entered before the photo, finalize now
        const comment = document.getElementById('closure-comment').value.trim();
        const material = document.getElementById('task-material-used')?.value;
        const otherText = document.getElementById('task-material-other-text')?.value.trim();

        let isMaterialValid = material && (material !== 'Others' || otherText);

        if (comment && isMaterialValid) {
            console.log("🚀 Photo captured & requirements met. Finalizing closure automatically...");
            window.executeFinalClosure();
        }
    } catch (err) {
        console.error("Photo process error:", err);
    } finally {
        window.hideGlobalSpinner();
    }
};

window.removeAfterPhoto = () => {
    capturedAfterPhotoBase64 = "";
    const input = document.getElementById('task-after-photo-input');
    if (input) input.value = "";
    const preview = document.getElementById('after-photo-preview');
    if (preview) preview.src = "";
    document.getElementById('after-photo-preview-container')?.classList.add('hidden');
    document.getElementById('capture-proof-btn')?.classList.remove('hidden');
};

/* --- MATERIAL DROPDOWN LOGIC --- */

window.toggleMaterialOtherInput = (value) => {
    const container = document.getElementById('material-other-container');
    const otherInput = document.getElementById('task-material-other-text');
    if (!container) return;

    if (value === 'Others') {
        container.classList.remove('hidden');
        if (otherInput) otherInput.focus();
    } else {
        container.classList.add('hidden');
        if (otherInput) otherInput.value = "";
    }
};

/* --- TASK ACTIONS (CLOSE / REJECT) --- */

window.closeClosureModal = () => {
    const modal = document.getElementById('close-task-modal');
    if (modal) modal.classList.add('hidden');
    activeTaskIdForClosure = null;
    window.removeAfterPhoto();
    document.getElementById('closure-comment').value = "";

    const matSelect = document.getElementById('task-material-used');
    if (matSelect) matSelect.value = "";
    window.toggleMaterialOtherInput("");
};

window.closeTaskAction = async (taskId) => {
    activeTaskIdForClosure = taskId;
    const modal = document.getElementById('close-task-modal');
    if (modal) {
        modal.classList.remove('hidden');
        // Reset state for clean start
        window.removeAfterPhoto();
        document.getElementById('closure-comment').value = "";
        const matSelect = document.getElementById('task-material-used');
        if (matSelect) matSelect.value = "";
        window.toggleMaterialOtherInput("");
    }
};

window.submitTaskClosure = function() {
    const commentInput = document.getElementById('closure-comment');
    const comment = commentInput ? commentInput.value.trim() : '';
    const matSelect = document.getElementById('task-material-used');
    const material = matSelect ? matSelect.value : '';
    const otherText = document.getElementById('task-material-other-text')?.value.trim();

    if (!material) {
        alert("Please select the Material / Action used.");
        return;
    }
    if (material === 'Others' && !otherText) {
        alert("Please specify the other material used.");
        return;
    }
    if (!comment) {
        alert("Please enter a resolution remark.");
        return;
    }

    if (!capturedAfterPhotoBase64) {
        // Trigger camera directly from user click event to satisfy browser security
        console.log("📸 Requirements validated. Opening camera for proof...");
        const camInput = document.getElementById('task-after-photo-input');
        if (camInput) {
            camInput.click();
        } else {
            alert("Camera input element missing!");
        }
        return;
    }

    // If photo already exists, finalize
    window.executeFinalClosure();
};

window.executeFinalClosure = async () => {
    const comment = document.getElementById('closure-comment').value.trim();
    const matSelect = document.getElementById('task-material-used');
    const material = matSelect ? matSelect.value : '';
    const otherText = document.getElementById('task-material-other-text')?.value.trim();
    const taskId = activeTaskIdForClosure;

    if (!taskId || !comment || !capturedAfterPhotoBase64) return;

    let finalMaterial = material === 'Others' ? `Others: ${otherText}` : material;

    window.showGlobalSpinner("Finalizing Closure...");
    try {
        const res = await window.uploadToDrive({
            category: UPLOAD_CONFIG.CATEGORIES.TASK_PHOTOS,
            fileName: `Task_After_${taskId}_${Date.now()}.jpg`,
            image: capturedAfterPhotoBase64
        });

        if (res.status === 'success') {
            const updateData = {
                status: 'Closed',
                afterPhotoUrl: res.fileUrl || "",
                completionPhoto: res.fileUrl || "",
                completionComment: comment || "Resolved",
                materialUsed: finalMaterial || "N/A",
                solvedByName: window.currentStaff?.fullName || window.currentStaff?.name || "User",
                solvedTimestamp: Date.now()
            };

            await update(ref(db, 'tasks/' + taskId), updateData);
            window.triggerSuccessPopup("Task Completed & Closed! ✅");
            window.closeClosureModal();
            window.loadRoleView(window.currentStaff);
        } else {
            throw new Error(res.message || "Failed to upload photo");
        }
    } catch (err) {
        alert("Error closing task: " + err.message);
    } finally {
        window.hideGlobalSpinner();
    }
};

window.rejectTaskAction = async (taskId) => {
    const reason = prompt("Please enter reason for rejection:");
    if (!reason) return;

    window.showGlobalSpinner("Rejecting Task...");
    try {
        await update(ref(db, 'tasks/' + taskId), {
            status: 'Rejected',
            rejectionReason: reason || "No reason provided",
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

/* --- TAB NAVIGATION & VIEW LOADING --- */

window.switchTaskTab = function(tabName) {
    currentTaskTab = tabName;

    // Hide all contents
    document.querySelectorAll('.task-tab-content').forEach(el => el.classList.add('hidden'));

    // Reset button styles
    const buttons = ['create-task', 'active', 'history'];
    buttons.forEach(b => {
        const btn = document.getElementById(`tab-btn-${b}`);
        if (btn) {
            btn.className = "flex-1 sm:flex-none px-5 py-2.5 rounded-xl font-black text-[10px] uppercase transition-all text-slate-600 hover:text-indigo-900";
        }
    });

    // Activate selected tab & button
    const activeBtnId = tabName === 'create' ? 'tab-btn-create-task' : `tab-btn-${tabName}`;
    const activeBtn = document.getElementById(activeBtnId);
    if (activeBtn) {
        activeBtn.className = "flex-1 sm:flex-none px-5 py-2.5 rounded-xl font-black text-[10px] uppercase transition-all bg-indigo-600 text-white shadow-md";
    }

    if (tabName === 'create') {
        document.getElementById('section-create-task')?.classList.remove('hidden');
    } else if (tabName === 'active') {
        document.getElementById('section-active-tasks')?.classList.remove('hidden');
        if (!taskListenerActive) window.loadRoleView(window.currentStaff);
    } else if (tabName === 'history') {
        document.getElementById('section-history-tasks')?.classList.remove('hidden');
        if (!taskListenerActive) window.loadRoleView(window.currentStaff);
    }
};

window.handleCreateTaskSubmit = async function(event) {
    event.preventDefault();

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
            assignedSchool: school || "N/A",
            location: area || "N/A",
            details: details || "No details",
            beforePhotoUrl: photoUrl || "",
            status: 'Open',
            assignedRole: targetRole || "General",
            assignedStaff: specificStaff || "Any",
            timestamp: Date.now(),
            raisedByMobile: window.currentStaff?.mobile || localStorage.getItem('loggedStaffMobile') || "Unknown",
            raisedByName: window.currentStaff?.fullName || window.currentStaff?.name || "Staff Member"
        };

        await set(ref(db, 'tasks/' + taskId), data);

        // AUTO-RESET FEATURE
        alert("✅ Task Created Successfully!");
        const form = document.getElementById('raise-task-form');
        if (form) form.reset();
        window.removeTaskPhoto();

        // Switch to Active tab to see the new task
        window.switchTaskTab('active');

    } catch (e) {
        console.error("Task Creation Error:", e);
        alert("❌ Failed to create task: " + e.message);
    } finally {
        if (btn) btn.disabled = false;
        window.hideGlobalSpinner();
    }
};

/* Store all loaded tasks globally for fast lookup */
window.allTasksCache = {};

/* Populate Active Tasks Table */
window.renderActiveTasksTable = function(tasks) {
    const tbody = document.getElementById('active-tasks-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!tasks || tasks.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400 font-bold">No Active Tasks Found</td></tr>`;
        return;
    }

    tasks.forEach(task => {
        window.allTasksCache[task.id] = task;
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-all";

        const createdDate = task.timestamp ? new Date(task.timestamp).toLocaleString() : (task.createdAt || '-');
        const creator = task.raisedByName || task.createdBy || 'Security';
        const dept = task.assignedRole || task.category || task.department || '-';
        const loc = task.location || task.areaName || task.roomName || '-';

        tr.innerHTML = `
            <td class="p-3 font-bold text-slate-900">${createdDate}</td>
            <td class="p-3 font-black text-slate-900">${creator}</td>
            <td class="p-3 font-bold text-slate-700">${dept}</td>
            <td class="p-3 font-black text-slate-900 bg-slate-100/50 rounded-lg">${loc}</td>
            <td class="p-3"><span class="px-2 py-1 bg-amber-100 text-amber-800 rounded-lg text-[10px] font-black uppercase">${task.status || 'Active'}</span></td>
            <td class="p-3 text-center">
                <button onclick="window.openTaskInspector('${task.id}')" class="px-3 py-1.5 bg-indigo-900 text-white hover:bg-indigo-700 rounded-xl font-black text-xs transition-all flex items-center gap-1 mx-auto">
                    <i class="fa-solid fa-eye"></i> View
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

/* Populate History Tasks Table */
window.renderHistoryTasksTable = function(tasks) {
    const tbody = document.getElementById('history-tasks-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!tasks || tasks.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-400 font-bold">No Task History Found</td></tr>`;
        return;
    }

    tasks.forEach(task => {
        window.allTasksCache[task.id] = task;
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-all";

        const createdDate = task.timestamp ? new Date(task.timestamp).toLocaleString() : (task.createdAt || '-');
        const creator = task.raisedByName || task.createdBy || '-';
        const dept = task.assignedRole || task.category || task.department || '-';
        const loc = task.location || task.areaName || task.roomName || '-';
        const closer = task.solvedByName || task.closedBy || 'Staff';
        const closedDate = task.solvedTimestamp ? new Date(task.solvedTimestamp).toLocaleString() : (task.closedAt || '-');

        tr.innerHTML = `
            <td class="p-3 font-bold text-slate-900">${createdDate}</td>
            <td class="p-3 font-black text-slate-900">${creator}</td>
            <td class="p-3 font-bold text-slate-700">${dept}</td>
            <td class="p-3 font-black text-slate-900 bg-slate-100/50 rounded-lg">${loc}</td>
            <td class="p-3 font-bold text-emerald-700">${closer}</td>
            <td class="p-3 font-bold text-slate-900">${closedDate}</td>
            <td class="p-3 text-center">
                <button onclick="window.openTaskInspector('${task.id}')" class="px-3 py-1.5 bg-indigo-900 text-white hover:bg-indigo-700 rounded-xl font-black text-xs transition-all flex items-center gap-1 mx-auto">
                    <i class="fa-solid fa-eye"></i> View
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

/* Open Task Inspector Modal */
window.openTaskInspector = function(taskId) {
    const task = window.allTasksCache[taskId];
    if (!task) return;

    const createdBy = task.raisedByName || task.createdBy || 'Unknown';
    const createdDate = task.timestamp ? new Date(task.timestamp).toLocaleString() : (task.createdAt || '-');
    const dept = task.assignedRole || task.category || task.department || 'General';
    const loc = task.location || task.areaName || task.roomName || '-';
    const closedBy = task.solvedByName || task.closedBy;
    const closedDate = task.solvedTimestamp ? new Date(task.solvedTimestamp).toLocaleString() : (task.closedAt || '-');
    const desc = task.details || task.description || task.taskDetails || 'No details provided.';
    const remark = task.completionComment || task.rejectionReason || '';
    const material = task.materialUsed || 'N/A';

    document.getElementById('insp-created-by').innerText = `${createdBy}`;
    document.getElementById('insp-created-at').innerText = createdDate;
    document.getElementById('insp-dept').innerText = dept;
    document.getElementById('insp-location').innerText = loc;
    document.getElementById('insp-closed-by').innerText = closedBy ? `${closedBy}` : 'Not Closed Yet';
    document.getElementById('insp-closed-at').innerText = closedDate;
    document.getElementById('insp-desc').innerText = desc;

    // MATERIAL USED DISPLAY
    const matBox = document.getElementById('insp-material-box');
    const matText = document.getElementById('insp-material-text');
    if (matBox && matText) {
        matText.innerText = material;
        if (task.status === 'Closed') matBox.classList.remove('hidden');
        else matBox.classList.add('hidden');
    }

    // PRIVACY-AWARE REMARK VISIBILITY
    const commentBox = document.getElementById('insp-comment-box');
    const commentText = document.getElementById('insp-comment-text');
    if (remark) {
        commentText.innerText = remark;
        commentBox.classList.remove('hidden');
    } else {
        commentBox.classList.add('hidden');
    }

    // Before Image Handling
    const beforeImg = document.getElementById('insp-before-img');
    const noBefore = document.getElementById('insp-no-before');
    const bPhoto = task.beforePhotoUrl || task.photoURL || task.beforePhoto;
    if (bPhoto) {
        beforeImg.src = window.getDirectDriveImageUrl ? window.getDirectDriveImageUrl(bPhoto) : bPhoto;
        beforeImg.classList.remove('hidden');
        noBefore.classList.add('hidden');
    } else {
        beforeImg.classList.add('hidden');
        noBefore.classList.remove('hidden');
    }

    // After Image Handling
    const afterImg = document.getElementById('insp-after-img');
    const noAfter = document.getElementById('insp-no-after');
    const aPhoto = task.afterPhotoUrl || task.completionPhoto || task.afterPhoto;
    if (aPhoto) {
        afterImg.src = window.getDirectDriveImageUrl ? window.getDirectDriveImageUrl(aPhoto) : aPhoto;
        afterImg.classList.remove('hidden');
        noAfter.classList.add('hidden');
    } else {
        afterImg.classList.add('hidden');
        noAfter.classList.remove('hidden');
    }

    document.getElementById('task-inspector-modal').classList.remove('hidden');
};

window.closeTaskInspectorModal = function() {
    document.getElementById('task-inspector-modal').classList.add('hidden');
};

window.loadRoleView = async (staff) => {
    const isActuallyAdmin = localStorage.getItem('isAdminLoggedIn') === 'true';
    const role = (staff?.role || "").toLowerCase().trim();
    const isSecurity = role === 'security';
    const isAdmin = role === 'admin' || isActuallyAdmin;

    const activeContainer = document.getElementById('tasksContainerActive');
    const historyContainer = document.getElementById('tasksContainerHistory');
    const activeTbody = document.getElementById('active-tasks-tbody');
    const historyTbody = document.getElementById('history-tasks-tbody');

    // Check if either card containers or table bodies exist
    if (!activeContainer && !historyContainer && !activeTbody && !historyTbody) return;

    // --- ⚡ LOAD FROM CACHE FIRST ---
    const cachedTasks = localStorage.getItem('cached_tasks');
    if (cachedTasks) {
        try {
            const data = JSON.parse(cachedTasks);
            console.log("⚡ Tasks: Loaded from local cache.");
            processTasksData(data, staff, isAdmin, isSecurity, role, activeContainer, historyContainer, activeTbody, historyTbody);
        } catch(e) { console.warn("⚠️ Tasks: Cache corrupted."); }
    }

    // --- STRICT ROLE-BASED TAB VISIBILITY ---
    const createTabBtn = document.getElementById('tab-btn-create-task') || document.getElementById('tab-btn-create');
    if (createTabBtn) {
        if (isSecurity || isAdmin) {
            createTabBtn.classList.remove('hidden');
            createTabBtn.style.display = 'inline-flex';
        } else {
            createTabBtn.classList.add('hidden');
            createTabBtn.style.display = 'none';

            // DEFAULT VIEW: If on 'create' but unauthorized, jump to 'active'
            if (currentTaskTab === 'create') {
                console.log("🔒 Access Restricted: Switching unauthorized user to Active Tasks view.");
                window.switchTaskTab('active');
            }
        }
    }

    // Toggle Dashboard Create Task Button Visibility
    const dashCreateBtn = document.getElementById('s-dash-create-task-btn');
    if (dashCreateBtn) {
        if (isSecurity) {
            dashCreateBtn.classList.remove('hidden');
        } else {
            dashCreateBtn.classList.add('hidden');
        }
    }

    // Use onValue for real-time status sync
    taskListenerActive = true;
    onValue(ref(db, 'tasks'), (snap) => {
        if (snap.exists()) {
            const data = snap.val();
            localStorage.setItem('cached_tasks', JSON.stringify(data));
            processTasksData(data, staff, isAdmin, isSecurity, role, activeContainer, historyContainer, activeTbody, historyTbody);
        } else {
            const emptyMsg = `<p class="p-8 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">No tasks found.</p>`;
            if (activeContainer) activeContainer.innerHTML = emptyMsg;
            if (historyContainer) historyContainer.innerHTML = emptyMsg;
            if (activeTbody) activeTbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400 font-bold">No Active Tasks Found</td></tr>`;
            if (historyTbody) historyTbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-400 font-bold">No Task History Found</td></tr>`;
        }
    }, (error) => {
        console.warn("⚠️ Task Loading Error:", error);
    });
};

/**
 * HELPER: PROCESSES AND RENDERS TASKS DATA
 */
function processTasksData(data, staff, isAdmin, isSecurity, role, activeContainer, historyContainer, activeTbody, historyTbody) {
    const allTasks = Object.values(data);
    let userTasks = [];

    if (isAdmin) {
        userTasks = allTasks;
    } else if (isSecurity) {
        userTasks = allTasks.filter(t => t.raisedByMobile === staff?.mobile);
    } else {
        userTasks = allTasks.filter(t => {
            const assignedRole = (t.assignedRole || "").toLowerCase().trim();
            return assignedRole === role || (role === 'cleaner leader' && assignedRole === 'cleaner');
        });
    }

    // Update Dashboard Stats for this User
    const total = userTasks.length;
    const pending = userTasks.filter(t => t.status === 'Open' || t.status === 'Accepted').length;
    const completed = userTasks.filter(t => t.status === 'Closed' || t.status === 'Rejected').length;

    if (document.getElementById('total-tasks-count')) document.getElementById('total-tasks-count').innerText = total;
    if (document.getElementById('pending-tasks-count')) document.getElementById('pending-tasks-count').innerText = pending;
    if (document.getElementById('completed-tasks-count')) document.getElementById('completed-tasks-count').innerText = completed;

    const activeTasks = userTasks.filter(t => t.status === 'Open' || t.status === 'Accepted');
    const historyTasks = userTasks.filter(t => t.status === 'Closed' || t.status === 'Rejected');

    // Render Tables (Admin Dashboard)
    if (activeTbody) window.renderActiveTasksTable(activeTasks);
    if (historyTbody) window.renderHistoryTasksTable(historyTasks);

    // Render Cards (Staff Portal)
    const closureAllowedRoles = ['cleaner', 'cleaner leader', 'leader', 'technician', 'security', 'admin', 'housekeeping'];
    const isResolver = closureAllowedRoles.includes(role);
    if (activeContainer) renderTasksList(activeTasks, activeContainer, isResolver, 'active');
    if (historyContainer) renderTasksList(historyTasks, historyContainer, isResolver, 'history');
}

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
                staffSelect.innerHTML = '<option value="">Route to Any Available</option>' +
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

function renderTasksList(tasks, container, isResolver, type) {
    if (tasks.length === 0) {
        container.innerHTML = `<p class="p-8 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">No ${type} tasks found.</p>`;
        return;
    }

    tasks.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const currentUser = window.currentStaff;
    const isAdmin = localStorage.getItem('isAdminLoggedIn') === 'true' || (currentUser?.role || '').toLowerCase() === 'admin';

    container.innerHTML = tasks.map(t => {
        const isHistory = t.status === 'Closed' || t.status === 'Rejected';
        const statusClass = t.status === 'Open' ? 'bg-amber-500' : t.status === 'Closed' ? 'bg-emerald-500' : 'bg-red-500';

        const beforePhoto = t.beforePhotoUrl || t.photoURL || t.beforePhoto || '';
        const afterPhoto = t.afterPhotoUrl || t.completionPhoto || t.afterPhoto || '';

        const isCreator = t.raisedByMobile === currentUser?.mobile;
        const remark = t.completionComment || t.rejectionReason || '';
        const material = t.materialUsed || '';

        return `
            <div class="task-card bg-white p-5 rounded-[2rem] shadow-xl border border-indigo-50 flex flex-col gap-4 fade-in">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="px-2 py-0.5 rounded text-[8px] font-black text-white uppercase ${statusClass}">${t.status}</span>
                            <span class="text-[9px] text-slate-900 font-black uppercase tracking-tighter">${new Date(t.timestamp).toLocaleString()}</span>
                        </div>
                        <h4 class="font-black text-indigo-900 uppercase text-sm leading-tight">${t.location}</h4>
                    </div>

                    <div class="flex gap-2">
                        ${beforePhoto ? `<img src="${window.getDirectDriveImageUrl(beforePhoto)}" class="w-12 h-12 rounded-xl object-cover border-2 border-indigo-50 shadow-sm" onclick="window.openImageZoom('${beforePhoto}')" title="Before Photo">` : ''}
                        ${afterPhoto ? `<img src="${window.getDirectDriveImageUrl(afterPhoto)}" class="w-12 h-12 rounded-xl object-cover border-2 border-emerald-50 shadow-sm" onclick="window.openImageZoom('${afterPhoto}')" title="After Photo">` : ''}
                    </div>
                </div>

                <p class="text-xs text-slate-600 font-medium leading-relaxed">${t.details || t.description || '-'}</p>

                ${material ? `
                    <div class="bg-indigo-50 border border-indigo-100 p-3 rounded-2xl text-[9px] text-indigo-900 font-black uppercase tracking-wider">
                        <i class="fa-solid fa-toolbox mr-1 text-indigo-500"></i> Material: ${material}
                    </div>
                ` : ''}

                ${(isCreator || isAdmin) && remark ? `
                    <div class="bg-amber-50 border border-amber-200 p-3 rounded-2xl text-[10px] text-amber-950 font-bold italic">
                        <i class="fa-solid fa-comment-dots mr-1 text-amber-600"></i> Remark: ${remark}
                    </div>
                ` : ''}

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
            </div>
        `;
    }).join('');
}


console.log("✅ tasks_module.js: v4.3 Clean Architecture Deployed");
