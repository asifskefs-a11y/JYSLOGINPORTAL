import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, get, update, push, set, onValue, off } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { PATHS, FirebasePathValidator } from './firebase_path_manager.js';

// ================================================
// TASK MANAGEMENT MODULE (v4.4 - FIXED)
// ================================================

let capturedTaskPhotoBase64 = "";
let capturedAfterPhotoBase64 = "";
let activeTaskIdForClosure = null;
let currentTaskTab = 'create';
let taskListenerActive = false;
let activeTaskListener = null;
let isSubmittingClosure = false;

/* --- PHOTO CAPTURE HANDLERS --- */

window.handleTaskImageCapture = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        window.showGlobalSpinner("Processing Photo...");
        capturedTaskPhotoBase64 = await window.compressImageFile(file);

        const preview = document.getElementById('taskPhotoPreview');
        if (preview) {
            preview.src = capturedTaskPhotoBase64;
            document.getElementById('taskPhotoPreviewContainer').classList.remove('hidden');
        }
        document.getElementById('cameraBtnText').innerText = "Photo Captured ✅";
    } catch (err) {
        console.error("Photo capture error:", err);
        alert("Failed to process photo. Please try again.");
    } finally {
        window.hideGlobalSpinner();
    }
};

window.removeTaskPhoto = () => {
    capturedTaskPhotoBase64 = "";
    const input = document.getElementById('cameraInput');
    if (input) input.value = "";
    const preview = document.getElementById('taskPhotoPreview');
    if (preview) preview.src = "";
    document.getElementById('taskPhotoPreviewContainer')?.classList.add('hidden');
    document.getElementById('cameraBtnText').innerText = "Capture Problem Photo";
};

// ✅ FIXED: After photo capture with validation
window.handleAfterPhotoCaptured = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    window.showGlobalSpinner("Optimizing Proof Photo...");
    try {
        capturedAfterPhotoBase64 = await window.compressImageFile(file, 800, 800, 0.7);

        // Show preview
        const preview = document.getElementById('after-photo-preview');
        const container = document.getElementById('after-photo-preview-container');
        if (preview && container) {
            preview.src = capturedAfterPhotoBase64;
            container.classList.remove('hidden');
            document.getElementById('capture-proof-btn')?.classList.add('hidden');
        }

        // ✅ FIXED: Auto-submit if all requirements are met
        const comment = document.getElementById('closure-comment')?.value?.trim() || '';
        const material = document.getElementById('task-material-used')?.value;
        const otherText = document.getElementById('task-material-other-text')?.value?.trim() || '';

        let isMaterialValid = material && (material !== 'Others' || otherText);

        if (comment && isMaterialValid && !isSubmittingClosure) {
            console.log("🚀 Photo captured & requirements met. Finalizing closure...");
            await window.executeFinalClosure();
        }
    } catch (err) {
        console.error("Photo process error:", err);
        alert("Failed to process photo. Please try again.");
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
        if (otherInput) {
            otherInput.focus();
            otherInput.required = true;
        }
    } else {
        container.classList.add('hidden');
        if (otherInput) {
            otherInput.value = "";
            otherInput.required = false;
        }
    }
};

/* --- TASK ACTIONS (CLOSE / REJECT) --- */

window.closeClosureModal = () => {
    const modal = document.getElementById('close-task-modal');
    if (modal) modal.classList.add('hidden');
    activeTaskIdForClosure = null;
    window.removeAfterPhoto();
    document.getElementById('closure-comment').value = "";
    document.getElementById('task-material-used').value = "";
    window.toggleMaterialOtherInput("");
    isSubmittingClosure = false;
};

// ✅ FIXED: Close task with validation
window.closeTaskAction = async (taskId) => {
    if (!taskId) {
        alert("Invalid task ID.");
        return;
    }

    // Check if task is already closed
    const task = window.allTasksCache[taskId];
    if (task && (task.status === 'Closed' || task.status === 'Rejected')) {
        alert("This task is already closed or rejected.");
        return;
    }

    activeTaskIdForClosure = taskId;
    const modal = document.getElementById('close-task-modal');
    if (modal) {
        modal.classList.remove('hidden');
        // Reset state
        window.removeAfterPhoto();
        document.getElementById('closure-comment').value = "";
        document.getElementById('task-material-used').value = "";
        window.toggleMaterialOtherInput("");
        isSubmittingClosure = false;
        document.getElementById('final-submit-close-btn').disabled = false;
    }
};

// ✅ FIXED: Submit task closure with validation
window.submitTaskClosure = function() {
    // Prevent multiple submissions
    if (isSubmittingClosure) {
        console.warn("⚠️ Closure already in progress");
        return;
    }

    const commentInput = document.getElementById('closure-comment');
    const comment = commentInput ? commentInput.value.trim() : '';
    const matSelect = document.getElementById('task-material-used');
    const material = matSelect ? matSelect.value : '';
    const otherText = document.getElementById('task-material-other-text')?.value?.trim() || '';

    // ✅ FIXED: Validate all required fields
    if (!material) {
        alert("Please select the Material / Action used.");
        matSelect?.focus();
        return;
    }
    if (material === 'Others' && !otherText) {
        alert("Please specify the other material used.");
        document.getElementById('task-material-other-text')?.focus();
        return;
    }
    if (!comment) {
        alert("Please enter a resolution remark.");
        commentInput?.focus();
        return;
    }

    // ✅ FIXED: Validate photo requirement
    if (!capturedAfterPhotoBase64) {
        console.log("📸 No proof photo yet. Opening camera...");
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

// ✅ FIXED: Execute final closure with progress indicator
window.executeFinalClosure = async () => {
    // Prevent duplicate submissions
    if (isSubmittingClosure) return;
    isSubmittingClosure = true;

    const comment = document.getElementById('closure-comment')?.value?.trim() || '';
    const matSelect = document.getElementById('task-material-used');
    const material = matSelect ? matSelect.value : '';
    const otherText = document.getElementById('task-material-other-text')?.value?.trim() || '';
    const taskId = activeTaskIdForClosure;

    // ✅ FIXED: Final validation
    if (!taskId) {
        alert("No task selected for closure.");
        isSubmittingClosure = false;
        return;
    }
    if (!comment) {
        alert("Please enter a resolution remark.");
        isSubmittingClosure = false;
        return;
    }
    if (!capturedAfterPhotoBase64) {
        alert("Please capture a proof photo first.");
        isSubmittingClosure = false;
        return;
    }

    const finalMaterial = material === 'Others' ? `Others: ${otherText}` : material;
    const btn = document.getElementById('final-submit-close-btn');
    const originalText = btn?.innerHTML || 'Capture Photo & Close';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading & Closing...';
    }

    window.showGlobalSpinner("Uploading proof and closing task...");

    try {
        // ✅ FIXED: Upload photo with retry
        let photoUrl = '';
        let uploadSuccess = false;
        let retries = 3;

        while (retries > 0 && !uploadSuccess) {
            try {
                const res = await window.uploadToDrive({
                    category: UPLOAD_CONFIG.CATEGORIES.TASK_PHOTOS,
                    fileName: `Task_After_${taskId}_${Date.now()}.jpg`,
                    image: capturedAfterPhotoBase64
                });
                if (res && res.status === 'success') {
                    photoUrl = res.fileUrl || '';
                    uploadSuccess = true;
                    console.log("✅ Photo uploaded successfully");
                } else {
                    throw new Error(res?.message || "Upload failed");
                }
            } catch (uploadErr) {
                retries--;
                console.warn(`⚠️ Photo upload failed, ${retries} retries left:`, uploadErr);
                if (retries > 0) {
                    await new Promise(r => setTimeout(r, 1000));
                } else {
                    throw new Error("Failed to upload proof photo after multiple attempts");
                }
            }
        }

        // ✅ FIXED: Update task with closure data
        const updateData = {
            status: 'Closed',
            afterPhotoUrl: photoUrl || "",
            completionPhoto: photoUrl || "",
            completionComment: comment,
            materialUsed: finalMaterial || "N/A",
            solvedByName: window.currentStaff?.fullName || window.currentStaff?.name || "User",
            solvedTimestamp: Date.now(),
            closedAt: new Date().toISOString()
        };

        const path = PATHS.TASKS + '/' + taskId;
        if (!FirebasePathValidator.validatePath(path)) throw new Error("Invalid DB Path");
        FirebasePathValidator.logOperation('update', path);

        await update(ref(db, path), updateData);

        window.triggerSuccessPopup("Task Completed & Closed! ✅");
        window.closeClosureModal();

        // ✅ FIXED: Refresh task views
        if (window.loadRoleView) {
            window.loadRoleView(window.currentStaff);
        }

    } catch (err) {
        console.error("Closure error:", err);
        alert("Error closing task: " + err.message);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    } finally {
        isSubmittingClosure = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
        window.hideGlobalSpinner();
    }
};

// ✅ FIXED: Reject task with validation
window.rejectTaskAction = async (taskId) => {
    if (!taskId) {
        alert("Invalid task ID.");
        return;
    }

    const reason = prompt("Please enter reason for rejection:");
    if (!reason || reason.trim() === "") {
        alert("Rejection reason is required.");
        return;
    }

    const path = PATHS.TASKS + '/' + taskId;
    if (!FirebasePathValidator.validatePath(path)) return;
    FirebasePathValidator.logOperation('update', path);

    try {
        await update(ref(db, path), {
            status: 'Rejected',
            rejectionReason: reason.trim(),
            solvedByName: window.currentStaff?.fullName || window.currentStaff?.name || "User",
            solvedTimestamp: Date.now(),
            rejectedAt: new Date().toISOString()
        });
        window.triggerSuccessPopup("Task Rejected.");
        if (window.loadRoleView) {
            window.loadRoleView(window.currentStaff);
        }
    } catch (e) {
        alert("Error rejecting task: " + e.message);
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
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const school = document.getElementById('taskSchoolSelect')?.value;
    const area = document.getElementById('areaNameInput')?.value;
    const details = document.getElementById('taskDetailsInput')?.value;
    const targetRole = document.getElementById('taskRoleSelect')?.value;
    const specificStaff = document.getElementById('assignedStaffSelect')?.value;

    if (!school || !area || !details || !targetRole) {
        alert("Please fill in all required fields.");
        return;
    }

    const btn = document.getElementById('submitTaskBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating Task...';
    }
    window.showGlobalSpinner("Raising Task...");

    try {
        let photoUrl = "";
        if (capturedTaskPhotoBase64) {
            try {
                const res = await window.uploadToDrive({
                    category: UPLOAD_CONFIG.CATEGORIES.TASK_PHOTOS,
                    fileName: `Task_Before_${Date.now()}.jpg`,
                    image: capturedTaskPhotoBase64
                });
                if (res && res.status === 'success') {
                    photoUrl = res.fileUrl || "";
                }
            } catch (uploadErr) {
                console.warn("⚠️ Photo upload failed, continuing without photo:", uploadErr);
            }
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
            createdAt: new Date().toISOString(),
            raisedByMobile: window.currentStaff?.mobile || localStorage.getItem('loggedStaffMobile') || "Unknown",
            raisedByName: window.currentStaff?.fullName || window.currentStaff?.name || "Staff Member"
        };

        const path = PATHS.TASKS + '/' + taskId;
        if (!FirebasePathValidator.validatePath(path) || !FirebasePathValidator.validateSchema(path, data)) {
            throw new Error("Invalid Path or Schema");
        }
        FirebasePathValidator.logOperation('set', path);

        await set(ref(db, path), data);

        window.triggerSuccessPopup("✅ Task Created Successfully!");
        const form = document.getElementById('raise-task-form');
        if (form) form.reset();
        window.removeTaskPhoto();

        // Switch to Active tab to see the new task
        window.switchTaskTab('active');

    } catch (e) {
        console.error("Task Creation Error:", e);
        alert("❌ Failed to create task: " + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-paper-plane text-lg"></i> CREATE & ROUTE TASK';
        }
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
    if (!task) {
        alert("Task not found.");
        return;
    }

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
    if (bPhoto && bPhoto !== 'N/A' && bPhoto !== '-') {
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
    if (aPhoto && aPhoto !== 'N/A' && aPhoto !== '-') {
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

// ✅ FIXED: Load role view with listener cleanup
window.loadRoleView = async (staff) => {
    const isActuallyAdmin = localStorage.getItem('isAdminLoggedIn') === 'true';
    const role = (staff?.role || "").toLowerCase().trim();
    const isSecurity = role === 'security';
    const isAdmin = role === 'admin' || isActuallyAdmin;

    const activeContainer = document.getElementById('tasksContainerActive');
    const historyContainer = document.getElementById('tasksContainerHistory');
    const activeTbody = document.getElementById('active-tasks-tbody');
    const historyTbody = document.getElementById('history-tasks-tbody');

    if (!activeContainer && !historyContainer && !activeTbody && !historyTbody) return;

    // ✅ FIXED: Cleanup old listener before adding new one
    if (activeTaskListener) {
        off(activeTaskListener);
        activeTaskListener = null;
        taskListenerActive = false;
    }

    // --- LOAD FROM CACHE FIRST ---
    const cachedTasks = localStorage.getItem('cached_tasks');
    if (cachedTasks) {
        try {
            const data = JSON.parse(cachedTasks);
            console.log("⚡ Tasks: Loaded from local cache.");
            processTasksData(data, staff, isAdmin, isSecurity, role, activeContainer, historyContainer, activeTbody, historyTbody);
        } catch(e) {
            console.warn("⚠️ Tasks: Cache corrupted.");
        }
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
            if (currentTaskTab === 'create') {
                console.log("🔒 Access Restricted: Switching unauthorized user to Active Tasks view.");
                window.switchTaskTab('active');
            }
        }
    }

    const dashCreateBtn = document.getElementById('s-dash-create-task-btn');
    if (dashCreateBtn) {
        if (isSecurity) {
            dashCreateBtn.classList.remove('hidden');
        } else {
            dashCreateBtn.classList.add('hidden');
        }
    }

    // ✅ FIXED: Use onValue with cleanup
    taskListenerActive = true;
    activeTaskListener = onValue(ref(db, PATHS.TASKS), (snap) => {
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

/* HELPER: PROCESSES AND RENDERS TASKS DATA */
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

    // Update Dashboard Stats
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
        const snap = await get(ref(db, PATHS.STAFF));
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

/**
 * Generic handler for task actions (Reject/Resolve)
 * Using index-based lookup as requested by dynamic indexing requirement.
 */
window.handleTaskAction = (event, index) => {
    try {
        const btn = event.target.closest('button');
        if (!btn) return;

        const action = btn.getAttribute('data-action');
        const container = event.target.closest('[id^="tasksContainer"]') || event.target.closest('.tasks-grid');
        const tasks = container ? container._taskData : null;

        if (!tasks || !tasks[index]) {
            console.error("❌ handleTaskAction: Task not found at index", index);
            return;
        }

        const task = tasks[index];
        if (action === 'reject') {
            window.rejectTaskAction(task.id);
        } else if (action === 'resolve') {
            window.closeTaskAction(task.id);
        }
    } catch (err) {
        console.error("🛑 handleTaskAction Error Boundary:", err);
    }
};

/**
 * Renders a list of tasks into a container with safety checks and indexing.
 */
function renderTasksList(tasks, container, isResolver, type) {
    try {
        // 1. Comprehensive null/undefined checks for tasks parameter
        if (tasks === null || tasks === undefined) {
            console.error(`❌ renderTasksList: tasks parameter is ${tasks}`);
            if (container) container.innerHTML = `<p class="p-4 text-red-500 font-bold">Error: Task data is missing.</p>`;
            return;
        }

        // 2. Validate array length before rendering
        if (!Array.isArray(tasks)) {
            console.error("❌ renderTasksList: tasks is not an array", tasks);
            if (container) container.innerHTML = `<p class="p-4 text-red-500 font-bold">Error: Invalid data format.</p>`;
            return;
        }

        // 4. Add fallback UI if tasks array is empty
        if (tasks.length === 0) {
            if (container) container.innerHTML = `<p class="p-8 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">No ${type} tasks available.</p>`;
            return;
        }

        // Sort tasks by timestamp descending
        const sortedTasks = [...tasks].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        // Safety check for container
        if (!container) {
            console.error("❌ renderTasksList: Container element not found");
            return;
        }

        // Store sorted tasks in container for handleTaskAction
        container._taskData = sortedTasks;

        const currentUser = window.currentStaff;
        const isAdmin = localStorage.getItem('isAdminLoggedIn') === 'true' || (currentUser?.role || '').toLowerCase() === 'admin';

        // Use array.map() with index parameter for rendering
        container.innerHTML = sortedTasks.map((t, index) => {
            const isHistory = t.status === 'Closed' || t.status === 'Rejected';
            const statusClass = t.status === 'Open' ? 'bg-amber-500' : t.status === 'Closed' ? 'bg-emerald-500' : 'bg-red-500';
            const beforePhoto = t.beforePhotoUrl || t.photoURL || t.beforePhoto || '';
            const afterPhoto = t.afterPhotoUrl || t.completionPhoto || t.afterPhoto || '';
            const isCreator = t.raisedByMobile === currentUser?.mobile;
            const remark = t.completionComment || t.rejectionReason || '';
            const material = t.materialUsed || '';

            // 3. Assign unique DOM IDs using index
            // 6. Add event listener parameter passing: onclick="handleTaskAction(event, ${index})"
            return `
                <div id="task-row-${index}" class="task-card bg-white p-5 rounded-[2rem] shadow-xl border border-indigo-50 flex flex-col gap-4 fade-in">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-1">
                                <span class="px-2 py-0.5 rounded text-[8px] font-black text-white uppercase ${statusClass}">${t.status}</span>
                                <span class="text-[9px] text-slate-900 font-black uppercase tracking-tighter">${new Date(t.timestamp).toLocaleString()}</span>
                            </div>
                            <h4 class="font-black text-indigo-900 uppercase text-sm leading-tight">${t.location}</h4>
                        </div>

                        <div class="flex gap-2">
                            ${beforePhoto && beforePhoto !== 'N/A' && beforePhoto !== '-' ? `<img src="${window.getDirectDriveImageUrl(beforePhoto)}" class="w-12 h-12 rounded-xl object-cover border-2 border-indigo-50 shadow-sm" onclick="window.openImageZoom('${beforePhoto}')" title="Before Photo">` : ''}
                            ${afterPhoto && afterPhoto !== 'N/A' && afterPhoto !== '-' ? `<img src="${window.getDirectDriveImageUrl(afterPhoto)}" class="w-12 h-12 rounded-xl object-cover border-2 border-emerald-50 shadow-sm" onclick="window.openImageZoom('${afterPhoto}')" title="After Photo">` : ''}
                        </div>
                    </div>

                    <p class="text-xs text-slate-600 font-medium leading-relaxed">${t.details || t.description || '-'}</p>

                    ${material && material !== 'N/A' ? `
                        <div class="bg-indigo-50 border border-indigo-100 p-3 rounded-2xl text-[9px] text-indigo-900 font-black uppercase tracking-wider">
                            <i class="fa-solid fa-toolbox mr-1 text-indigo-500"></i> Material: ${material}
                        </div>
                    ` : ''}

                    ${(isCreator || isAdmin) && remark ? `
                        <div class="bg-amber-50 border border-amber-200 p-3 rounded-2xl text-[10px] text-amber-950 font-bold italic">
                            <i class="fa-solid fa-comment-dots mr-1 text-amber-600"></i> Remark: ${remark}
                        </div>
                    ` : ''}

                    <div id="task-action-${index}" class="flex items-center justify-between pt-2 border-t border-slate-50">
                        <div class="flex flex-col">
                            <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Raised By</span>
                            <span class="text-[10px] font-bold text-indigo-600">${t.raisedByName}</span>
                        </div>

                        ${!isHistory && isResolver ? `
                            <div class="flex gap-2">
                                <button data-action="reject" onclick="handleTaskAction(event, ${index})" class="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-[9px] font-black uppercase active:scale-95 transition-all">Reject</button>
                                <button data-action="resolve" onclick="handleTaskAction(event, ${index})" class="px-4 py-2 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase shadow-lg shadow-emerald-500/20 active:scale-95 transition-all">Resolve</button>
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
    } catch (err) {
        // 5. Implement error boundary that logs failures without crashing app
        console.error("🛑 renderTasksList Exception Boundary:", err);
        if (container) container.innerHTML = `<p class="p-4 text-red-400 font-medium">Rendering error. Details logged to console.</p>`;
    }
}

console.log("✅ tasks_module.js: v4.5 Optimized Rendering Engine Deployed");
