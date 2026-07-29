import { db } from './firebase_config.js';
import { ref, get, update, push, set, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

let capturedTaskPhotoBase64 = "";

let currentTaskView = 'active'; // Default view for Staff Dashboard

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
    window.loadRoleView(window.currentStaff);
};

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

            // Stats calculation (Global for that user context)
            const myBaseTasks = allTasks.filter(t => t.assignedUserId === staff.mobile || (t.assignedSchool === staff.branch && t.assignedRole === staff.role));
            total = myBaseTasks.length;
            pending = myBaseTasks.filter(t => t.status === 'Open' || t.status === 'Accepted').length;
            completed = myBaseTasks.filter(t => t.status === 'Closed').length;

            // FILTER LOGIC based on toggle: Active (Open/Accepted) vs History (Closed/Rejected)
            const filteredTasks = myBaseTasks.filter(t => {
                if (currentTaskView === 'active') {
                    return t.status === 'Open' || t.status === 'Accepted';
                } else {
                    return t.status === 'Closed' || t.status === 'Rejected';
                }
            });

            // Sort by most recent
            filteredTasks.sort((a, b) => new Date(b.raisedTimestamp || 0) - new Date(a.raisedTimestamp || 0));

            if(filteredTasks.length > 0) {
                filteredTasks.forEach(t => {
                    const bImg = window.getDirectDriveImageUrl(t.beforePhotoUrl || t.beforePhoto);
                    const aImg = window.getDirectDriveImageUrl(t.afterPhotoUrl || t.afterPhoto);

                    // Metadata Badges
                    const raisedByInfo = `Raised By: ${t.raisedByName || "Admin"} (${t.raisedByRole || "Security"})`;
                    const locationInfo = `School: ${t.assignedSchool || "JYS 1"}`;

                    const isHistory = t.status === 'Closed' || t.status === 'Rejected';

                    taskHtml += `
                        <div class="task-card text-gray-800 ${isHistory ? 'opacity-90' : ''}" style="max-width: 100%; overflow: hidden; box-sizing: border-box;">
                            <div class="task-header">
                                <div>
                                    <h4 style="font-weight:700; font-size:1rem; color:var(--primary-dark);">${t.location}</h4>
                                    <div class="flex flex-wrap gap-2 mt-1">
                                        <span class="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[9px] font-bold rounded border border-indigo-100">${raisedByInfo}</span>
                                        <span class="px-2 py-0.5 bg-slate-50 text-slate-600 text-[9px] font-bold rounded border border-slate-100">${locationInfo}</span>
                                    </div>
                                    <p style="font-size:0.75rem; color:var(--text-gray); margin-top:5px;">${t.timestamp}</p>
                                </div>
                                <span class="badge ${t.status === 'Open' ? 'badge-pending' : (t.status === 'Closed' ? 'badge-completed' : 'bg-red-100 text-red-600')}">${t.status}</span>
                            </div>
                            <p style="font-size:0.85rem; color:var(--primary-dark); margin:12px 0; font-weight:500;">${t.details || t.reason || "Maintenance Required"}</p>
                            <div class="image-preview-container" style="max-width: 100%; overflow: hidden;">
                                <div class="img-box" onclick="window.openImageZoom('${bImg}')" style="max-width: 100%;">
                                    <img src="${bImg}" style="max-width: 100% !important; width: 100%; height: auto; object-fit: contain;">
                                    <span class="img-label">Before</span>
                                </div>
                                ${(t.afterPhotoUrl || t.afterPhoto) ? `
                                <div class="img-box" onclick="window.openImageZoom('${aImg}')" style="max-width: 100%;">
                                    <img src="${aImg}" style="max-width: 100% !important; width: 100%; height: auto; object-fit: contain;">
                                    <span class="img-label">After</span>
                                </div>` : ''}
                            </div>

                            ${!isHistory ? `
                            <div class="task-actions-container" style="display:flex; gap:10px; margin-top:10px; width:100%; flex-wrap: wrap;">
                                <button class="btn btn-task-accept" style="flex:1; min-width: 120px; background:#10b981; color:white; font-weight:700; padding:12px; border-radius:10px; font-size:0.85rem;" onclick="window.closeTaskAction('${t.id}')">Accept & Resolve</button>
                                <button class="btn btn-task-reject" style="flex:1; min-width: 120px; background:#ef4444; color:white; font-weight:700; padding:12px; border-radius:10px; font-size:0.85rem;" onclick="window.openRejectModal('${t.id}')">Reject</button>
                            </div>
                            ` : `
                            <div class="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                <div class="flex justify-between items-center text-[10px]">
                                    <span class="font-bold text-slate-400 uppercase tracking-widest">Audit Trail</span>
                                    <span class="text-slate-500 font-mono">${t.solvedTimestamp ? new Date(t.solvedTimestamp).toLocaleString() : (t.rejectedTimestamp ? new Date(t.rejectedTimestamp).toLocaleString() : '')}</span>
                                </div>
                                <p class="text-[11px] mt-1 font-bold text-slate-700">
                                    ${t.status === 'Closed' ? `Resolved by ${t.solvedByName || 'Staff'}` : `Rejected: ${t.rejectionReason || 'No reason provided'}`}
                                </p>
                            </div>
                            `}
                        </div>`;
                });
            } else {
                taskHtml = `<div class="col-span-full bg-white p-10 rounded-xl text-center text-gray-400 border border-dashed text-gray-800">No ${currentTaskView} tasks found.</div>`;
            }
        }
else {
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

// --- TASK CREATION LOGIC ---
window.handleTaskImageCapture = async (e) => {
    try {
        const file = e.target.files[0];
        if (!file) return;
        const btnText = document.getElementById('cameraBtnText');
        if (btnText) btnText.innerText = "Compressing...";

        // Optimized for reliability: 800px max and lower quality to reduce payload size
        capturedTaskPhotoBase64 = await window.compressImageFile(file, 800, 800, 0.6);

        const preview = document.getElementById('taskPhotoPreview');
        const container = document.getElementById('taskPhotoPreviewContainer');
        if (preview && container) {
            preview.src = capturedTaskPhotoBase64;
            container.classList.remove('hidden');
            container.style.display = 'block'; // Ensure visibility
        }
        if (btnText) btnText.innerText = "Photo Captured ✓";
    } catch (err) { console.error(err); }
};

window.removeTaskPhoto = () => {
    capturedTaskPhotoBase64 = "";
    document.getElementById('cameraInput').value = "";
    document.getElementById('taskPhotoPreviewContainer').classList.add('hidden');
    document.getElementById('cameraBtnText').innerText = "Capture Task Photo";
};

window.filterStaffBySchoolAndRole = async () => {
    const school = (document.getElementById('taskSchoolSelect') || document.getElementById('task-school')).value;
    const role = (document.getElementById('taskRoleSelect') || document.getElementById('task-target')).value;
    const staffSelect = document.getElementById('assignedStaffSelect') || document.getElementById('task-assigned-staff');

    if (!staffSelect) return;
    staffSelect.innerHTML = '<option value="">Loading Staff...</option>';

    try {
        const snap = await get(ref(db, 'users')); // Query users node as requested
        if (snap.exists()) {
            const allUsers = Object.values(snap.val());
            const filtered = allUsers.filter(u => {
                const matchSchool = school ? (u.schoolName === school || u.branch === school) : true;
                const matchRole = role ? (u.position === role || u.role === role) : true;
                return matchSchool && matchRole;
            });

            staffSelect.innerHTML = '<option value="">Assign Specific Staff (Optional)</option>';
            filtered.forEach(u => {
                const name = u.fullName || u.name || "Unknown";
                const mobile = u.mobileNumber || u.mobile || "";
                staffSelect.innerHTML += `<option value="${mobile}" data-name="${name}">${name} (${mobile})</option>`;
            });
            if (filtered.length === 0) staffSelect.innerHTML = '<option value="">No matching staff found</option>';
        } else {
            staffSelect.innerHTML = '<option value="">No users found in database</option>';
        }
    } catch (e) {
        console.error("Filter Staff Error:", e);
        staffSelect.innerHTML = '<option value="">Error loading staff</option>';
    }
};

window.submitNewMaintenanceTask = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    const schoolEl = document.getElementById('taskSchoolSelect') || document.getElementById('task-school');
    const roleEl = document.getElementById('taskRoleSelect') || document.getElementById('task-target');
    const staffSelect = document.getElementById('assignedStaffSelect') || document.getElementById('task-assigned-staff');
    const areaEl = (document.getElementById('areaNameInput') || document.getElementById('task-loc'));
    const detailsEl = (document.getElementById('taskDetailsInput') || document.getElementById('task-desc'));

    const school = schoolEl ? schoolEl.value.trim() : "";
    const role = roleEl ? roleEl.value.trim() : "";
    const area = areaEl ? areaEl.value.trim() : "";
    const details = detailsEl ? detailsEl.value.trim() : "";

    const staffId = staffSelect ? staffSelect.value : "";
    const staffName = staffSelect ? (staffSelect.options[staffSelect.selectedIndex]?.getAttribute('data-name') || "") : "";
    const priority = document.getElementById('task-priority') ? document.getElementById('task-priority').value : "Medium";
    const btn = document.getElementById('submitTaskBtn') || document.getElementById('task-submit-btn');

    const photoInput = document.getElementById('cameraInput') || document.getElementById('task-photo-in');
    const hasPhoto = (photoInput && photoInput.files && photoInput.files.length > 0) || (capturedTaskPhotoBase64 && capturedTaskPhotoBase64 !== "");

    // Robust Validation: Check trimmed strings and explicit photo variable
    if (!school || !role || !area || !details || !hasPhoto) {
        return alert("All fields including School, Role, Area, Details, and Photo are mandatory!");
    }

    btn.disabled = true;
    btn.innerText = "SAVING & ROUTING TASK...";

    try {
        const taskId = "TASK-" + Date.now();

        // 1. Upload photo to Drive with enhanced error handling
        console.log("TASK_DEBUG", "Starting photo upload for:", taskId);
        const uploadRes = await window.uploadToDrive({
            type: 'task_photo',
            fileName: `${taskId}_BEFORE.jpg`,
            image: capturedTaskPhotoBase64
        });

        if (uploadRes.status !== 'success' && !uploadRes.fileUrl) {
            console.error("TASK_ERROR", "Photo upload response failed:", uploadRes);
            throw new Error(uploadRes.message || "Server rejected the photo upload.");
        }

        const taskData = {
            id: taskId,
            assignedSchool: school,
            assignedRole: role,
            assignedUserId: staffId || "all",
            assignedUserName: staffName || "All",
            location: area,
            details: details,
            beforePhotoUrl: uploadRes.fileUrl || uploadRes.signatureUrl,
            status: 'Open',

            // TASK ORIGIN & CREATOR METADATA
            createdById: window.currentStaff ? window.currentStaff.mobile : "admin_system",
            createdByName: window.currentStaff ? window.currentStaff.name : "Admin",
            createdByRole: window.isAdminLoggedIn ? "ADMIN" : (window.currentStaff ? window.currentStaff.role.toUpperCase() : "SYSTEM"),

            raisedByName: window.currentStaff ? window.currentStaff.name : "Security",
            raisedByRole: window.currentStaff ? window.currentStaff.role : "Security",
            raisedTimestamp: new Date().toISOString(),
            timestamp: new Date().toLocaleString()
        };

        await set(ref(db, 'tasks/' + taskId), taskData);

        // --- MULTI-ROLE PUSH TRIGGER (Task Creation) ---
        if (typeof window.triggerMultiRoleNotification === 'function') {
            window.triggerMultiRoleNotification({
                title: "New Task Assigned",
                body: `Area: ${area} | Priority: ${priority}`,
                school: school,
                role: targetRole,
                tag: "new-task",
                icon: "fa-tasks",
                url: "/JYSLOGINPORTAL/staff-login.html"
            });
        }

        alert("Maintenance Task Created Successfully!");

        // Reset form
        document.getElementById('areaNameInput').value = "";
        document.getElementById('taskDetailsInput').value = "";
        window.removeTaskPhoto();
        window.loadRoleView(window.currentStaff);
    } catch (err) {
        alert("Error creating task: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "CREATE & ROUTE TASK";
    }
};

// --- TASK ACTION LOGIC ---
window.openTaskModal = () => {
    try {
        const targetSelect = document.getElementById('task-target');
        const schoolSelect = document.getElementById('task-school');

        if (targetSelect) {
            targetSelect.innerHTML = '<option value="">Target Role</option>';
            const roles = window.isAdminLoggedIn ?
                ['Security', 'RT Technician', 'Cleaner', 'Cleaner Leader', 'Technician'] :
                ['Cleaner Leader', 'RT Technician', 'Technician'];
            roles.forEach(r => targetSelect.innerHTML += `<option value="${r}">${r}</option>`);
        }

        // Ensure school select is visible and reset
        if (schoolSelect) {
            schoolSelect.style.display = "block";
            schoolSelect.value = "";
        }

        const modal = document.getElementById('task-modal');
        if (modal) modal.classList.remove('hidden');
    } catch (e) { console.error("Open task modal error:", e); }
};

window.closeTaskModal = () => {
    const modal = document.getElementById('task-modal');
    if (modal) modal.classList.add('hidden');
    // Reset form fields
    const form = document.getElementById('task-form');
    if (form) form.reset();

    // Clear photo preview
    if (window.removeTaskPhoto) window.removeTaskPhoto();
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

        // --- MULTI-ROLE PUSH TRIGGER (Task Resolution) ---
        if (typeof window.triggerMultiRoleNotification === 'function') {
            window.triggerMultiRoleNotification({
                title: "Task Resolved",
                body: `Task ID: ${taskId} completed by ${window.currentStaff.name}`,
                roles: ["Admin"], // Notify Admins
                tag: "task-resolved",
                icon: "fa-check-circle",
                url: "/JYSLOGINPORTAL/admin.html"
            });
        }

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

// --- MY RAISED TASKS TRACKER (FOR ADMIN & SECURITY) ---
let currentRaisedTaskView = 'active';

window.switchRaisedTaskView = (view) => {
    currentRaisedTaskView = view;
    ['raised-tab-', 'admin-raised-tab-'].forEach(prefix => {
        const activeBtn = document.getElementById(prefix + 'active');
        const historyBtn = document.getElementById(prefix + 'history');
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
    });

    if (window.isAdminLoggedIn) {
        window.initRaisedTasksTracker('admin-my-tasks-container');
    } else {
        window.initRaisedTasksTracker('security-my-tasks-container');
    }
};

window.initRaisedTasksTracker = (containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const user = window.currentStaff || { mobile: "admin_system", role: "ADMIN" };
    const userRole = window.isAdminLoggedIn ? "ADMIN" : (user.role ? user.role.toUpperCase() : "SYSTEM");

    onValue(ref(db, 'tasks'), (snapshot) => {
        if (!snapshot.exists()) {
            container.innerHTML = `<div class="p-6 text-center text-gray-400 italic">No ${currentRaisedTaskView} tasks raised by you yet.</div>`;
            return;
        }

        const allTasks = Object.values(snapshot.val());

        // Filter by Creator
        const myBaseTasks = allTasks.filter(t => {
            const isCreatedByMe = (t.createdById === user.mobile) || (t.raisedByName === user.name);
            const isAdminView = (userRole === "ADMIN");
            return isCreatedByMe || isAdminView;
        });

        // Filter by Status (Active vs History)
        const myFilteredTasks = myBaseTasks.filter(t => {
            if (currentRaisedTaskView === 'active') {
                return t.status === 'Open' || t.status === 'Accepted';
            } else {
                return t.status === 'Closed' || t.status === 'Rejected';
            }
        });

        myFilteredTasks.sort((a, b) => new Date(b.raisedTimestamp || 0) - new Date(a.raisedTimestamp || 0));

        if (myFilteredTasks.length === 0) {
            container.innerHTML = `<div class="p-6 text-center text-gray-400 italic">No ${currentRaisedTaskView} tasks raised by you yet.</div>`;
            return;
        }

        let html = `
            <div class="overflow-x-auto rounded-xl border border-gray-100 bg-white">
                <table class="w-full text-left text-xs">
                    <thead class="bg-slate-50 uppercase font-bold text-indigo-600">
                        <tr>
                            <th class="p-3">Task/Location</th>
                            <th class="p-3">Issue Details</th>
                            <th class="p-3">Assigned To</th>
                            <th class="p-3">Created</th>
                            <th class="p-3 text-center">Status</th>
                            <th class="p-3 text-center">Proof/Reason</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-50">
        `;

        myFilteredTasks.forEach(t => {
            const statusColors = {
                'Open': 'bg-orange-100 text-orange-600',
                'Accepted': 'bg-blue-100 text-blue-600',
                'Closed': 'bg-green-100 text-green-600',
                'Rejected': 'bg-red-100 text-red-600'
            };
            const color = statusColors[t.status] || 'bg-gray-100 text-gray-600';
            const compImg = t.afterPhotoUrl ? window.getDirectDriveImageUrl(t.afterPhotoUrl) : null;
            const beforeImg = (t.beforePhotoUrl || t.beforePhoto || t.taskPhoto) ? window.getDirectDriveImageUrl(t.beforePhotoUrl || t.beforePhoto || t.taskPhoto) : null;

            html += `
                <tr class="hover:bg-slate-50 transition text-gray-800">
                    <td class="p-3">
                        <div class="font-bold text-indigo-900">${t.location}</div>
                    </td>
                    <td class="p-3">
                        <div class="text-[9px] opacity-70 italic max-w-[150px] overflow-hidden truncate">${t.details || t.description || "No details"}</div>
                    </td>
                    <td class="p-3">
                        <div class="font-bold">${t.assignedUserName || "All"}</div>
                        <div class="text-[9px] opacity-60">${t.assignedRole}</div>
                    </td>
                    <td class="p-3 text-[10px] opacity-60">${t.timestamp}</td>
                    <td class="p-3 text-center">
                        <span class="px-2 py-1 rounded-full text-[9px] font-black uppercase ${color}">${t.status}</span>
                    </td>
                    <td class="p-3 text-center">
                        <div class="flex flex-col gap-1 items-center justify-center">
                            ${beforeImg ?
                                `<div>
                                    <p class="text-[7px] font-black text-gray-400 uppercase leading-none mb-1">Before</p>
                                    <img src="${beforeImg}" class="w-8 h-8 rounded border border-slate-200 shadow-sm mx-auto cursor-pointer hover:scale-150 transition" onclick="window.openImageZoom('${beforeImg}')">
                                 </div>` : ''
                            }
                            ${compImg ?
                                `<div>
                                    <p class="text-[7px] font-black text-green-500 uppercase leading-none mb-1">After</p>
                                    <img src="${compImg}" class="w-8 h-8 rounded border border-indigo-100 shadow-sm mx-auto cursor-pointer hover:scale-150 transition" onclick="window.openImageZoom('${compImg}')">
                                 </div>` :
                                (t.rejectionReason ? `<button class="text-red-500 underline text-[9px] font-bold" onclick="alert('Rejection Reason: ${t.rejectionReason}')">View Reason</button>` : (!beforeImg ? '<span class="text-gray-300">-</span>' : ''))
                            }
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table></div>`;
        container.innerHTML = html;
    });
};
