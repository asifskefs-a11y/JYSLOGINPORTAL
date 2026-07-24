import { db } from './firebase_config.js';
import { ref, get, set } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
        if (!document.getElementById('admin-table-body')) return;
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
        let records = [];
        if(v.exists()) Object.values(v.val()).forEach(x => records.push({...x, type: 'visitor'}));

        if(s.exists()) {
            Object.values(s.val()).forEach(x => {
                const profile = userProfiles[x.mobile] || staffProfiles[x.mobile] || {};
                records.push({
                    ...x,
                    type: 'staff',
                    id: x.mobile,
                    // Merge profile fields with correct mapping
                    fullName: profile.fullName || profile.name || x.name,
                    mobileNumber: profile.mobileNumber || profile.mobile || x.mobile,
                    adcPassNumber: profile.adcPassNumber || profile["ADEK Pass Number"] || profile.adekPass || "-",
                    companyName: profile.companyName || profile["Company Name"] || "-", // Map string name
                    schoolName: profile.schoolName || profile.branch || "-",
                    position: profile.position || profile.role || "-",
                    companyIdNumber: profile.companyIdNumber || profile.companyId || profile.company || "-" // Map ID number
                });
            });
        }

        records.sort((a,b) => new Date(b.date + ' ' + (b.timeIn || '00:00 AM')) - new Date(a.date + ' ' + (a.timeIn || '00:00 AM')));
        window.adminData = records;
        window.renderAdminTable(records);

        const staffList = document.getElementById('admin-staff-list-body');
        if (staffList) {
            staffList.innerHTML = '';
            if(staffSnap.exists()) Object.values(staffSnap.val()).forEach(x => {
                staffList.innerHTML += `<tr class="border-b border-white/5 text-gray-800"><td class="p-3 font-bold">${x.name}</td><td class="p-3">${x.branch}</td><td class="p-3">${x.role}</td><td class="p-3">${x.company}</td><td class="p-3">${x.mobile}</td><td class="p-3 text-center"><button onclick="window.deleteStaffAccount('${x.mobile}', '${x.name}')" class="text-red-500 font-bold text-xs uppercase">Delete</button></td></tr>`;
            });
        }

        const taskBody = document.getElementById('admin-task-list-body');
        if (taskBody) {
            taskBody.innerHTML = '';
            if(tasks.exists()) {
                window.adminTasks = Object.values(tasks.val()).reverse();
                window.adminTasks.forEach(t => {
                    const b = window.getDirectDriveImageUrl(t.beforePhotoUrl || t.beforePhoto);
                    const a = window.getDirectDriveImageUrl(t.afterPhotoUrl || t.afterPhoto);
                    const rDT = t.raisedTimestamp ? new Date(t.raisedTimestamp) : null;
                    const cDT = t.solvedTimestamp ? new Date(t.solvedTimestamp) : null;
                    taskBody.innerHTML += `
                        <tr class="hover:bg-white/5 transition text-gray-800">
                            <td class="p-2 font-mono opacity-50">${t.id}</td>
                            <td class="p-2">${t.schoolBuilding || '-'}</td>
                            <td class="p-2 font-bold">${t.location}</td>
                            <td class="p-2 opacity-70">${t.targetRole}</td>
                            <td class="p-2">${t.raisedByName || 'Admin'}</td>
                            <td class="p-2">${rDT ? rDT.toLocaleDateString() : '-'}</td>
                            <td class="p-2">${rDT ? rDT.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-'}</td>
                            <td class="p-2">${t.solvedByName || '-'}</td>
                            <td class="p-2">${cDT ? cDT.toLocaleDateString() : '-'}</td>
                            <td class="p-2">${cDT ? cDT.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-'}</td>
                            <td class="p-2 font-bold ${t.status === 'Open' ? 'text-blue-400' : (t.status === 'Closed' ? 'text-green-400' : 'text-red-400')}">${t.status}</td>
                            <td class="p-2 italic opacity-60">${t.rejectionReason || 'N/A'}</td>
                            <td class="p-2">
                                <div class="flex gap-1 justify-center">
                                    <img src="${b}" class="h-6 w-6 rounded border border-white/10" onclick="window.openImageZoom('${b}')" onerror="this.style.display='none'">
                                    ${(t.afterPhotoUrl || t.afterPhoto) ? `<img src="${a}" class="h-6 w-6 rounded border border-white/10" onclick="window.openImageZoom('${a}')" onerror="this.style.display='none'">` : ''}
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
    } catch (err) { console.error("Admin Load Error:", err); }
};

window.renderAdminTable = (data) => {
    const body = document.getElementById('admin-table-body');
    if (!body) return;
    body.innerHTML = '';
    data.forEach(r => {
        const sig = window.getDirectDriveImageUrl(r.checkInSignature || r.checkInSignatureUrl || r.signatureUrl || r.signature);
        const isStaff = r.type === 'staff';
        const timeOutDisplay = (r.checkOutTime || r.timeOut) ? (r.checkOutTime || r.timeOut) : (r.status === 'completed' || r.status === 'checked_out' ? 'RECORDED' : 'ACTIVE');

        body.innerHTML += `
            <tr class="hover:bg-gray-50 transition border-b border-gray-100 text-gray-800">
                <td class="p-3 uppercase text-[8px] opacity-40 font-bold">${r.type}</td>
                <td class="p-3">${isStaff ? (r.mobileNumber || r.id) : (r.id || r.mobile)}</td>
                <td class="p-3 font-bold text-indigo-900">${isStaff ? (r.fullName || r.name) : r.name}</td>
                <td class="p-3">${isStaff ? (r.adcPassNumber || "-") : "-"}</td>
                <td class="p-3">${isStaff ? (r.companyName || "-") : r.company}</td>
                <td class="p-3">${isStaff ? (r.schoolName || "-") : "-"}</td>
                <td class="p-3">${isStaff ? (r.position || "-") : "-"}</td>
                <td class="p-3">${isStaff ? (r.companyIdNumber || "-") : "-"}</td>
                <td class="p-3 opacity-60 font-mono">${r.date}</td>
                <td class="p-3 text-green-600 font-bold">${r.timeIn}</td>
                <td class="p-3 text-red-600 font-bold">${timeOutDisplay}</td>
                <td class="p-3 text-center">
                    ${sig ? `<img src="${sig}" class="h-8 mx-auto rounded border border-gray-200 cursor-pointer hover:scale-150 transition" onclick="window.openImageZoom('${sig}')">` : '-'}
                </td>
            </tr>`;
    });
};

window.deleteStaffAccount = async (mobile, name) => { if(confirm(`Delete account for ${name}?`)) { try { await set(ref(db, 'staff/' + mobile), null); alert("Deleted."); window.loadAdminDashboard(); } catch (e) { alert(e.message); } } };
