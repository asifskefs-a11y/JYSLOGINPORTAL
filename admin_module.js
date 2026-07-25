import { db } from './firebase_config.js';
import { ref, get, set, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- CORE ADMIN DASHBOARD LOGIC ---
window.showAdminTab = (tabId) => {
    try {
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
    } catch (e) { console.error("Tab switch error:", e); }
};

window.loadAdminDashboard = async () => {
    try {
        if (!document.getElementById('visitor-logs-body')) return;
        const [v, s, staffSnap, userSnap, tasks, assets] = await Promise.all([
            get(ref(db, 'visitors')),
            get(ref(db, 'staff_attendance')),
            get(ref(db, 'staff')),
            get(ref(db, 'users')),
            get(ref(db, 'tasks')),
            get(ref(db, 'assets'))
        ]);

        const staffProfiles = staffSnap.exists() ? staffSnap.val() : {};
        const userProfiles = userSnap.exists() ? userSnap.val() : {};

        let allRecords = [];
        if(v.exists()) Object.values(v.val()).forEach(x => allRecords.push({...x, type: 'visitor'}));
        if(s.exists()) Object.values(s.val()).forEach(x => allRecords.push({...x, type: 'staff'}));

        allRecords.sort((a,b) => new Date(b.date + ' ' + (b.timeIn || '00:00 AM')) - new Date(a.date + ' ' + (a.timeIn || '00:00 AM')));

        window.adminData = allRecords;
        window.renderAdminTable(allRecords, userProfiles, staffProfiles);

        const staffList = document.getElementById('admin-staff-list-body');
        if (staffList) {
            staffList.innerHTML = '';
            if(staffSnap.exists()) Object.values(staffSnap.val()).forEach(x => {
                const initials = (x.name || "JY").split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                const photoUrl = x.profilePicUrl ? window.formatDriveImageUrl(x.profilePicUrl) : "";
                const photoHtml = photoUrl ?
                    `<img src="${photoUrl}" referrerpolicy="no-referrer" class="w-10 h-10 rounded-full object-cover border-2 border-indigo-100 shadow-sm mx-auto" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">` : '';

                staffList.innerHTML += `
                    <tr class="border-b border-gray-50 text-gray-800 hover:bg-slate-50 transition">
                        <td class="p-3 text-center flex justify-center">
                            <div class="relative w-10 h-10">
                                ${photoHtml}
                                <div class="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-xs shadow-sm" style="${photoUrl ? 'display:none;' : 'display:flex;'}">
                                    ${initials}
                                </div>
                            </div>
                        </td>
                        <td class="p-3 font-bold text-indigo-900">${x.name}</td>
                        <td class="p-3 font-mono text-[9px]">${x.adcPassNumber || x.adekPass || "-"}</td>
                        <td class="p-3">${x.branch || "-"}</td>
                        <td class="p-3"><span class="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md text-[9px] font-black uppercase">${x.role}</span></td>
                        <td class="p-3 text-[9px] opacity-70">${x.companyName || x.company || "-"}</td>
                        <td class="p-3 font-mono text-[9px]">${x.mobile}</td>
                        <td class="p-3 text-center">
                            <button onclick="window.deleteStaffAccount('${x.mobile}', '${x.name}')" class="text-red-500 hover:text-red-700 font-bold text-[10px] uppercase underline tracking-tighter">Delete</button>
                        </td>
                    </tr>`;
            });
        }

        const taskBody = document.getElementById('admin-task-list-body');
        if (taskBody) {
            taskBody.innerHTML = '';
            if(tasks.exists()) {
                window.adminTasks = Object.values(tasks.val()).reverse();
                window.adminTasks.forEach(t => {
                    const b = window.getDirectDriveImageUrl(t.beforePhotoUrl || t.beforePhoto || t.taskPhoto);
                    const a = window.getDirectDriveImageUrl(t.afterPhotoUrl || t.afterPhoto);
                    const school = t.assignedSchool || t.schoolName || t.schoolBuilding || "-";
                    const rDT = t.raisedTimestamp ? new Date(t.raisedTimestamp) : null;
                    const cDT = t.solvedTimestamp ? new Date(t.solvedTimestamp) : null;

                    taskBody.innerHTML += `
                        <tr class="hover:bg-gray-50 transition text-gray-800 border-b border-gray-100">
                            <td class="p-2 font-mono text-[9px] opacity-50">${t.id}</td>
                            <td class="p-2 font-bold text-indigo-600">${school}</td>
                            <td class="p-2 font-bold">${t.location}</td>
                            <td class="p-2 italic text-[9px] max-w-[200px] overflow-hidden truncate">${t.details || t.description || "-"}</td>
                            <td class="p-2 opacity-70">${t.assignedRole || t.targetRole || "-"}</td>
                            <td class="p-2">${t.raisedByName || 'Admin'}</td>
                            <td class="p-2 font-mono text-[9px]">${rDT ? rDT.toLocaleDateString() : '-'}</td>
                            <td class="p-2 font-mono text-[9px]">${rDT ? rDT.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-'}</td>
                            <td class="p-2">${t.solvedByName || '-'}</td>
                            <td class="p-2 font-mono text-[9px]">${cDT ? cDT.toLocaleDateString() : '-'}</td>
                            <td class="p-2 font-mono text-[9px]">${cDT ? cDT.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-'}</td>
                            <td class="p-2 font-bold ${t.status === 'Open' ? 'text-blue-500' : (t.status === 'Closed' ? 'text-green-500' : 'text-red-500')}">${t.status}</td>
                            <td class="p-2 italic text-[9px] opacity-60">${t.rejectionReason || 'N/A'}</td>
                            <td class="p-2">
                                <div class="flex gap-2 justify-center items-center">
                                    <div class="text-center">
                                        <p class="text-[8px] font-bold text-gray-400 uppercase mb-1">Before</p>
                                        ${b.includes('http') ? `<img src="${b}" referrerpolicy="no-referrer" class="h-12 w-12 rounded shadow-sm border border-gray-200 cursor-pointer hover:scale-150 transition" onclick="window.openImageZoom('${b}')">` : '<span class="text-[8px] text-gray-300">No Photo</span>'}
                                    </div>
                                    <div class="text-center">
                                        <p class="text-[8px] font-bold text-gray-400 uppercase mb-1">After</p>
                                        ${(t.afterPhotoUrl || t.afterPhoto) ? `<img src="${a}" referrerpolicy="no-referrer" class="h-12 w-12 rounded shadow-sm border border-gray-200 cursor-pointer hover:scale-150 transition" onclick="window.openImageZoom('${a}')">` : '<span class="text-[8px] text-gray-300">No Photo</span>'}
                                    </div>
                                </div>
                            </td>
                        </tr>`;
                });
            }
        }

        if (assets.exists() && window.renderAdminAssetTable) {
            window.allAssets = Object.values(assets.val());
            window.renderAdminAssetTable(window.allAssets);
        }

        // Initialize My Tasks Tracker for Admin
        if (window.initRaisedTasksTracker) {
            window.initRaisedTasksTracker('admin-my-tasks-container');
        }
    } catch (err) { console.error("Admin Load Error:", err); }
};

window.renderAdminTable = (data, userProfiles = {}, staffProfiles = {}) => {
    const staffBody = document.getElementById('staff-attendance-body');
    const visitorBody = document.getElementById('visitor-logs-body');

    if (staffBody) staffBody.innerHTML = '';
    if (visitorBody) visitorBody.innerHTML = '';

    data.forEach(r => {
        const sig = window.getDirectDriveImageUrl(r.checkInSignature || r.checkInSignatureUrl || r.signatureUrl || r.signature);
        const isStaff = r.type === 'staff';
        const timeOutDisplay = (r.checkOutTime || r.timeOut || r.outTime) ? (r.checkOutTime || r.timeOut || r.outTime) : (r.status === 'completed' || r.status === 'checked_out' || r.status === 'SIGNED OUT' ? 'RECORDED' : 'ACTIVE');

        if (isStaff && staffBody) {
            const mobileRaw = r.mobile || r.mobileNumber || r.userId || r.id || "";
            const normalized = mobileRaw.startsWith('0') ? mobileRaw.substring(1) : mobileRaw;

            let profile = userProfiles[mobileRaw] || userProfiles[normalized] ||
                           staffProfiles[mobileRaw] || staffProfiles[normalized];

            if (!profile && mobileRaw) {
                profile = Object.values(userProfiles).find(u => u.adcPassNumber === mobileRaw || u.adekPass === mobileRaw) ||
                          Object.values(staffProfiles).find(u => u.adcPassNumber === mobileRaw || u.adekPass === mobileRaw) || {};
            } else {
                profile = profile || {};
            }

            staffBody.innerHTML += `
                <tr class="hover:bg-gray-50 transition border-b border-gray-100 text-gray-800">
                    <td class="p-3 font-bold text-[8px] opacity-40 uppercase">Staff</td>
                    <td class="p-3 font-bold text-indigo-900">${profile.fullName || profile.name || r.name || "-"}</td>
                    <td class="p-3 font-mono text-[9px]">${mobileRaw}</td>
                    <td class="p-3">${profile.schoolName || profile.branch || r.schoolName || "-"}</td>
                    <td class="p-3">${profile.position || profile.role || r.position || "-"}</td>
                    <td class="p-3">${profile.companyIdNumber || profile.companyId || r.companyId || "-"}</td>
                    <td class="p-3 opacity-60 font-mono">${r.date}</td>
                    <td class="p-3 text-green-600 font-bold">${r.timeIn}</td>
                    <td class="p-3 text-red-600 font-bold">${timeOutDisplay}</td>
                    <td class="p-3 text-center">
                        ${sig ? `<img src="${sig}" referrerpolicy="no-referrer" class="h-8 mx-auto rounded border border-gray-200 cursor-pointer hover:scale-150 transition" onclick="window.openImageZoom('${sig}')">` : '-'}
                    </td>
                </tr>`;
        } else if (!isStaff && visitorBody) {
            visitorBody.innerHTML += `
                <tr class="hover:bg-gray-50 transition border-b border-gray-100 text-gray-800">
                    <td class="p-3 font-bold text-[8px] opacity-40 uppercase">Visitor</td>
                    <td class="p-3 font-mono text-[9px]">${r.id}</td>
                    <td class="p-3 font-bold text-indigo-900">${r.name}</td>
                    <td class="p-3">${r.mobile}</td>
                    <td class="p-3">${r.company}</td>
                    <td class="p-3 italic text-[9px] opacity-70">${r.purpose}</td>
                    <td class="p-3 opacity-60 font-mono">${r.date}</td>
                    <td class="p-3 text-green-600 font-bold">${r.timeIn}</td>
                    <td class="p-3 text-red-600 font-bold">${timeOutDisplay}</td>
                    <td class="p-3"><span class="px-2 py-0.5 rounded text-[8px] font-bold ${r.status === 'active' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}">${(r.status || 'Unknown').toUpperCase()}</span></td>
                    <td class="p-3 text-center">
                        ${sig ? `<img src="${sig}" referrerpolicy="no-referrer" class="h-8 mx-auto rounded border border-gray-200 cursor-pointer hover:scale-150 transition" onclick="window.openImageZoom('${sig}')">` : '-'}
                    </td>
                </tr>`;
        }
    });
};

window.filterStaffTable = () => {
    const term = document.getElementById('staff-search').value.toLowerCase();
    const date = document.getElementById('staff-date-filter').value;
    const filtered = window.adminData.filter(r => {
        if (r.type !== 'staff') return false;
        const matchesTerm = JSON.stringify(r).toLowerCase().includes(term);
        const matchesDate = !date || r.date === new Date(date).toLocaleDateString();
        return matchesTerm && matchesDate;
    });
    // In real app, we'd need to re-fetch profiles or keep them in memory.
    // For this simple fix, we call renderAdminTable with empty objects and it handles fallback.
    window.renderAdminTable(filtered);
};

window.filterVisitorTable = () => {
    const term = document.getElementById('visitor-search').value.toLowerCase();
    const date = document.getElementById('visitor-date-filter').value;
    const filtered = window.adminData.filter(r => {
        if (r.type === 'staff') return false;
        const matchesTerm = JSON.stringify(r).toLowerCase().includes(term);
        const matchesDate = !date || r.date === new Date(date).toLocaleDateString();
        return matchesTerm && matchesDate;
    });
    window.renderAdminTable(filtered);
};

window.deleteStaffAccount = async (mobile, name) => { if(confirm(`Delete account for ${name}?`)) { try { await set(ref(db, 'staff/' + mobile), null); await set(ref(db, 'users/' + mobile), null); alert("Deleted."); window.loadAdminDashboard(); } catch (e) { alert(e.message); } } };

// --- ADD STAFF MODAL LOGIC ---
let addStaffPhotoBase64 = "";

window.openAddStaffModal = () => {
    document.getElementById('add-staff-modal').classList.remove('hidden');
};

window.closeAddStaffModal = () => {
    document.getElementById('add-staff-modal').classList.add('hidden');
    document.getElementById('add-staff-form').reset();
    document.getElementById('adminStaffPhotoPreview').innerHTML = '<i class="fa-solid fa-user text-3xl text-slate-300"></i>';
    addStaffPhotoBase64 = "";
};

window.handleAdminStaffPhotoSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const preview = document.getElementById('adminStaffPhotoPreview');
    preview.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-indigo-600"></i>';
    try {
        addStaffPhotoBase64 = await window.compressImageFile(file, 500, 500, 0.7);
        preview.innerHTML = `<img src="${addStaffPhotoBase64}" class="w-full h-full object-cover">`;
    } catch (err) {
        console.error(err);
        preview.innerHTML = '<i class="fa-solid fa-circle-exclamation text-red-500"></i>';
    }
};

const addStaffForm = document.getElementById('add-staff-form');
if (addStaffForm) {
    addStaffForm.onsubmit = async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('add-staff-submit-btn');
        const name = document.getElementById('add-staff-name').value;
        const mobile = document.getElementById('add-staff-mobile').value;
        const adek = document.getElementById('add-staff-adek').value;
        const companyName = document.getElementById('add-staff-company-name').value;
        const branch = document.getElementById('add-staff-branch').value;
        const role = document.getElementById('add-staff-role').value;
        const companyId = document.getElementById('add-staff-company-id').value;
        const pass = document.getElementById('add-staff-pass').value;

        submitBtn.disabled = true;
        submitBtn.innerText = "UPLOADING & SAVING...";

        try {
            let profilePicUrl = "";
            if (addStaffPhotoBase64) {
                const cleanName = name.replace(/\s+/g, '_');
                const uploadRes = await window.uploadToDrive({
                    type: 'active_asset',
                    folderType: 'Staff_Profile_Photos',
                    fileName: `Profile_${adek}_${cleanName}.jpg`,
                    image: addStaffPhotoBase64
                });
                if (uploadRes.status === 'success') {
                    const rawUrl = uploadRes.fileUrl || uploadRes.signatureUrl;
                    profilePicUrl = window.formatDriveImageUrl ? window.formatDriveImageUrl(rawUrl) : rawUrl;
                }
            }

            const data = {
                id: mobile,
                name: name, fullName: name,
                mobile: mobile, mobileNumber: mobile,
                adcPassNumber: adek, adekPass: adek,
                companyName: companyName, company: companyId,
                companyIdNumber: companyId,
                branch: branch, schoolName: branch,
                role: role, position: role,
                password: pass,
                profilePicUrl: profilePicUrl,
                status: "active",
                createdAt: new Date().toISOString()
            };

            await set(ref(db, 'staff/' + mobile), data);
            await set(ref(db, 'users/' + mobile), data);

            alert("New staff member registered successfully!");
            window.closeAddStaffModal();
            window.loadAdminDashboard();
        } catch (err) {
            alert("Error: " + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = "REGISTER NEW STAFF";
        }
    };
}
