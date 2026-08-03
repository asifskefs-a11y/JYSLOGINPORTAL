import { db } from './firebase_config.js';
import { ref, get, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- GLOBAL STATE ---
window.appCache = {
    isInitialized: false,
    visitors: [],
    staff: [],
    tasks: [],
    assets: [],
    attendance: [],
    transfers: []
};

// --- DATA AGGREGATOR ---
window.refreshDashboardData = async () => {
    try {
        console.log("Admin: Refreshing Data...");

        const [vSnap, sSnap, tSnap, aSnap, attSnap, trSnap] = await Promise.all([
            get(ref(db, 'visitors')),
            get(ref(db, 'staff')),
            get(ref(db, 'tasks')),
            get(ref(db, 'assets')),
            get(ref(db, 'staff_attendance')),
            get(ref(db, 'asset_transfers'))
        ]);

        window.appCache.visitors = vSnap.exists() ? Object.values(vSnap.val()) : [];
        window.appCache.staff = sSnap.exists() ? Object.values(sSnap.val()) : [];
        window.appCache.tasks = tSnap.exists() ? Object.values(tSnap.val()) : [];
        window.appCache.assets = aSnap.exists() ? Object.values(aSnap.val()) : [];
        window.appCache.attendance = attSnap.exists() ? Object.values(attSnap.val()) : [];
        window.appCache.transfers = trSnap.exists() ? Object.values(trSnap.val()) : [];

        // Export to global for export_module.js
        window.adminData = [
            ...window.appCache.visitors.map(v => ({ ...v, type: 'visitor' })),
            ...window.appCache.attendance.map(s => ({ ...s, type: 'staff' }))
        ];
        window.allAssets = window.appCache.assets;

        window.appCache.isInitialized = true;
        window.updateAdminKPIs();

        // Render current active tab
        const activeTab = document.querySelector('.tab-section.active');
        if (activeTab) window.renderTabFromAppCache(activeTab.id);

    } catch (e) { console.error("Refresh Dashboard Error:", e); }
};

window.loadAdminDashboard = () => {
    window.refreshDashboardData();
};

// --- KPI LOGIC ---
window.updateAdminKPIs = () => {
    try {
        const today = new Date().toLocaleDateString('en-US');

        const visitorsToday = window.appCache.visitors.filter(v => v.date === today).length;
        const activeTasks = window.appCache.tasks.filter(t => t.status === 'Open' || t.status === 'Accepted').length;
        const staffPresent = window.appCache.attendance.filter(a => a.date === today && a.status === 'checked_in').length;
        const urgentAlerts = window.appCache.tasks.filter(t => t.priority === 'High' && t.status !== 'Closed').length;

        const stats = {
            'kpi-visitors': { value: visitorsToday, pct: Math.min(100, (visitorsToday / 50) * 100) },
            'kpi-tasks': { value: activeTasks, pct: Math.min(100, (activeTasks / 20) * 100) },
            'kpi-staff': { value: staffPresent, pct: Math.min(100, (staffPresent / 30) * 100) },
            'kpi-alerts': { value: urgentAlerts, pct: Math.min(100, (urgentAlerts / 10) * 100) }
        };

        if (window.updateKPIStats) window.updateKPIStats(stats);
    } catch (e) { console.error("KPI Error:", e); }
};

// --- TAB RENDERING ENGINE ---
window.renderTabFromAppCache = (tabId) => {
    console.log("Rendering Tab:", tabId);
    switch (tabId) {
        case 'tab-visitor-logs': renderVisitorLogs(); break;
        case 'tab-staff-logs': renderStaffAttendance(); break;
        case 'tab-tasks': renderGlobalTaskAudit(); break;
        case 'tab-staff-list': renderStaffDirectory(); break;
        case 'tab-assets': if (window.renderAdminAssetTable) window.renderAdminAssetTable(window.appCache.assets, 'assets'); break;
        case 'tab-disposal': if (window.renderAdminAssetTable) window.renderAdminAssetTable(window.appCache.assets, 'disposal'); break;
        case 'tab-transfers': if (window.renderTransferTable) window.renderTransferTable(window.appCache.transfers); break;
        case 'tab-my-tasks': if (window.initRaisedTasksTracker) window.initRaisedTasksTracker('admin-my-tasks-container'); break;
    }
};

// --- SPECIFIC RENDERERS ---
function renderVisitorLogs() {
    const body = document.getElementById('visitor-logs-body');
    if (!body) return;
    body.innerHTML = '';

    window.appCache.visitors.sort((a, b) => new Date(b.date + ' ' + b.timeIn) - new Date(a.date + ' ' + a.timeIn));

    window.appCache.visitors.forEach(v => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-4"><span class="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg font-bold">VISITOR</span></td>
            <td class="p-4 font-mono font-bold">${v.id || "-"}</td>
            <td class="p-4 font-bold text-slate-800">${v.name || "-"}</td>
            <td class="p-4">${v.mobile || "-"}</td>
            <td class="p-4">${v.company || "-"}</td>
            <td class="p-4">${v.purpose || "-"}</td>
            <td class="p-4">${v.date || "-"}</td>
            <td class="p-4 text-emerald-600 font-bold">${v.timeIn || "-"}</td>
            <td class="p-4 text-red-500 font-bold">${v.outTime || "-"}</td>
            <td class="p-4"><span class="status-badge ${v.status === 'SIGNED OUT' ? 'closed' : 'open'}">${v.status || "Active"}</span></td>
            <td class="p-4 text-center">
                ${v.signatureUrl ? `<img src="${v.signatureUrl}" class="h-8 w-16 object-contain mx-auto border rounded bg-white" onclick="window.openImageZoom('${v.signatureUrl}')">` : "-"}
            </td>
        `;
        body.appendChild(tr);
    });
    if (window.initAllPaginations) window.initAllPaginations();
}

function renderStaffAttendance() {
    const body = document.getElementById('staff-attendance-body');
    if (!body) return;
    body.innerHTML = '';

    window.appCache.attendance.sort((a, b) => new Date(b.date + ' ' + b.timeIn) - new Date(a.date + ' ' + a.timeIn));

    window.appCache.attendance.forEach(a => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-4"><span class="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg font-bold">STAFF</span></td>
            <td class="p-4 font-bold text-slate-800">${a.name || "-"}</td>
            <td class="p-4">${a.mobile || "-"}</td>
            <td class="p-4">${a.branch || "School 1"}</td>
            <td class="p-4 uppercase text-[9px] font-bold text-slate-400">${a.role || "Staff"}</td>
            <td class="p-4">${a.date || "-"}</td>
            <td class="p-4 text-emerald-600 font-bold">${a.timeIn || "-"}</td>
            <td class="p-4 text-red-500 font-bold">${a.checkOutTime || "-"}</td>
            <td class="p-4 text-center">
                ${a.signatureUrl ? `<img src="${a.signatureUrl}" class="h-8 w-16 object-contain mx-auto border rounded bg-white" onclick="window.openImageZoom('${a.signatureUrl}')">` : "-"}
            </td>
        `;
        body.appendChild(tr);
    });
    if (window.initAllPaginations) window.initAllPaginations();
}

function renderGlobalTaskAudit() {
    const body = document.getElementById('admin-task-list-body');
    if (!body) return;
    body.innerHTML = '';

    window.appCache.tasks.sort((a, b) => new Date(b.raisedTimestamp) - new Date(a.raisedTimestamp));

    window.appCache.tasks.forEach(t => {
        const bImg = window.getDirectDriveImageUrl(t.beforePhotoUrl);
        const aImg = window.getDirectDriveImageUrl(t.afterPhotoUrl);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-3 font-mono text-indigo-600 font-bold">${t.id?.split('-')[1] || "-"}</td>
            <td class="p-3">${t.assignedSchool || "-"}</td>
            <td class="p-3 font-bold">${t.location || "-"}</td>
            <td class="p-3 max-w-[150px] truncate">${t.details || "-"}</td>
            <td class="p-3 uppercase text-[8px] font-black">${t.assignedRole || "-"}</td>
            <td class="p-3">
                <div class="flex flex-col"><span class="font-bold">${t.raisedByName || "Admin"}</span><span class="text-[7px] opacity-50">${t.timestamp || ""}</span></div>
            </td>
            <td class="p-3 font-bold text-emerald-600">${t.solvedByName || "-"}</td>
            <td class="p-3"><span class="status-badge ${t.status?.toLowerCase()}">${t.status || "Open"}</span></td>
            <td class="p-3 italic text-[8px]">${t.rejectionReason || "-"}</td>
            <td class="p-3 text-center">
                <div class="flex gap-1 justify-center">
                    <img src="${bImg}" class="h-8 w-8 object-cover rounded border" onclick="window.openImageZoom('${bImg}')">
                    ${t.afterPhotoUrl ? `<img src="${aImg}" class="h-8 w-8 object-cover rounded border border-emerald-200" onclick="window.openImageZoom('${aImg}')">` : ""}
                </div>
            </td>
        `;
        body.appendChild(tr);
    });
    if (window.initAllPaginations) window.initAllPaginations();
}

function renderStaffDirectory() {
    const body = document.getElementById('admin-staff-list-body');
    if (!body) return;
    body.innerHTML = '';

    window.appCache.staff.forEach(s => {
        const profileImg = window.getDirectDriveImageUrl(s.profilePicUrl);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-4 text-center">
                <div class="w-10 h-10 rounded-full bg-slate-100 border overflow-hidden mx-auto">
                    <img src="${profileImg}" class="w-full h-full object-cover">
                </div>
            </td>
            <td class="p-4 font-bold text-indigo-900">${s.fullName || s.name || "-"}</td>
            <td class="p-4 font-mono">${s.adcPassNumber || s.adekPass || "-"}</td>
            <td class="p-4">${s.branch || s.schoolName || "-"}</td>
            <td class="p-4 uppercase text-[9px] font-black text-slate-400">${s.role || s.position || "-"}</td>
            <td class="p-4 font-mono">${s.mobile || s.mobileNumber || "-"}</td>
            <td class="p-4 text-center">
                <button onclick="window.openEditStaffModal('${s.mobile}')" class="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg"><i class="fa-solid fa-user-pen"></i></button>
            </td>
        `;
        body.appendChild(tr);
    });
    if (window.initAllPaginations) window.initAllPaginations();
}

// --- UTILITIES ---
window.findValueByFuzzyKey = (obj, key) => {
    if (!obj) return null;
    if (obj[key]) return obj[key];
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const k in obj) {
        if (k.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedKey) return obj[k];
    }
    return null;
};

window.updateAssetTableHeaders = (dynamicHeaders) => {
    const head = document.querySelector('#asset-master-table thead tr');
    if (!head) return;

    let html = '<th class="p-4 text-center"><input type="checkbox" onchange="window.toggleAllAssetCheckboxes(this)" class="selectAllAssets"></th>';
    dynamicHeaders.forEach(h => {
        html += `<th class="p-4 whitespace-nowrap">${h}</th>`;
    });
    html += '<th class="p-4 text-center">Audit Photo</th><th class="p-4 text-center">Disposal Photo</th><th class="p-4 text-center">Action</th>';
    head.innerHTML = html;
};

window.handleUserLogout = () => {
    localStorage.removeItem('isAdminLoggedIn');
    window.location.href = 'index.html';
};

window.filterVisitorTable = () => {
    const q = document.getElementById('visitor-search').value.toLowerCase();
    const date = document.getElementById('visitor-date-filter').value;
    // Implementation of real-time filtering from appCache
    const filtered = window.appCache.visitors.filter(v => {
        const matchQ = JSON.stringify(v).toLowerCase().includes(q);
        const matchDate = !date || v.date === new Date(date).toLocaleDateString('en-US');
        return matchQ && matchDate;
    });
    // For simplicity in this module, we re-run renderer with filtered data if needed,
    // but standard approach is usually a search wrapper.
};

window.filterStaffTable = () => {
    const q = document.getElementById('staff-search').value.toLowerCase();
    const date = document.getElementById('staff-date-filter').value;
    const filtered = window.appCache.attendance.filter(a => {
        const matchQ = JSON.stringify(a).toLowerCase().includes(q);
        const matchDate = !date || a.date === new Date(date).toLocaleDateString('en-US');
        return matchQ && matchDate;
    });
};
