import { db } from './firebase_config.js';
import { ref, get, set, update, remove, onValue, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================
// GLOBAL STATE
// ================================================
window.appCache = {
    isInitialized: false,
    visitors: [],
    staff: [],
    tasks: [],
    assets: [],
    attendance: [],
    transfers: []
};

// NEW: Stores the currently filtered results for pagination
window.currentFilteredData = {
    visitors: null,
    staff: null,
    tasks: null,
    assets: null,
    disposal: null,
    transfers: null
};

// ================================================
// DATA AGGREGATOR
// ================================================
window.refreshDashboardData = async () => {
    try {
        console.log("🔄 Admin: Refreshing Data...");

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

        // ✅ Set window.adminData for export
        window.adminData = [
            ...window.appCache.visitors.map(v => ({ ...v, type: 'visitor' })),
            ...window.appCache.attendance.map(s => ({ ...s, type: 'staff' }))
        ];
        window.allAssets = window.appCache.assets;

        window.appCache.isInitialized = true;
        window.updateAdminKPIs();

        const activeTab = document.querySelector('.tab-section.active');
        if (activeTab) {
            window.renderTabFromAppCache(activeTab.id);
        } else {
            window.renderTabFromAppCache('tab-visitor-logs');
        }

    } catch (e) {
        console.error("❌ Refresh Dashboard Error:", e);
    }
};

window.loadAdminDashboard = () => {
    window.refreshDashboardData();
};

// ================================================
// KPI LOGIC
// ================================================
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

// ================================================
// TAB RENDERING ENGINE
// ================================================
window.renderTabFromAppCache = (tabId) => {
    console.log("🎨 Rendering Tab:", tabId);

    switch (tabId) {
        case 'tab-visitor-logs':
            renderVisitorLogs(window.currentFilteredData.visitors || window.appCache.visitors || []);
            break;
        case 'tab-staff-logs':
            renderStaffAttendance(window.currentFilteredData.staff || window.appCache.attendance || []);
            break;
        case 'tab-tasks':
            renderGlobalTaskAudit(window.currentFilteredData.tasks || window.appCache.tasks || []);
            break;
        case 'tab-staff-list':
            renderStaffDirectory(window.appCache.staff || []);
            break;
        case 'tab-assets':
            const assetData = window.currentFilteredData.assets || window.appCache.assets || [];
            if (assetData.length === 0 && window.appCache.assets.length === 0) {
                const body = document.getElementById('admin-asset-list-body');
                if (body) body.innerHTML = `<tr><td colspan="20" class="p-8 text-center text-gray-400"><i class="fa-solid fa-database text-4xl block mb-4"></i>No assets found.</td></tr>`;
            } else {
                window.renderAdminAssetTable(assetData, 'assets');
            }
            break;
        case 'tab-disposal':
            const disposalData = window.currentFilteredData.disposal || window.appCache.assets.filter(a => a.assetStatus === 'Disposed' || a.disposalReason);
            window.renderAdminAssetTable(disposalData, 'disposal');
            break;
        case 'tab-transfers':
            window.renderTransferTable(window.currentFilteredData.transfers || window.appCache.transfers || []);
            break;
        case 'tab-my-tasks':
            if (typeof window.initRaisedTasksTracker === 'function') {
                window.initRaisedTasksTracker('admin-my-tasks-container');
            }
            break;
    }
};

// ================================================
// RENDER FUNCTIONS
// ================================================

function renderVisitorLogs(visitors) {
    const body = document.getElementById('visitor-logs-body');
    if (!body) return;
    body.innerHTML = '';

    const data = visitors || window.appCache.visitors || [];
    data.sort((a, b) => new Date(b.date + ' ' + b.timeIn) - new Date(a.date + ' ' + a.timeIn));

    if (data.length === 0) {
        body.innerHTML = `<tr><td colspan="11" class="p-8 text-center text-gray-400">No visitor records found</td></tr>`;
        return;
    }

    // Lazy Rendering Logic
    const tableId = 'visitor-logs-body';
    if (!window.paginationState[tableId]) window.paginationState[tableId] = { currentPage: 1, rowsPerPage: 20 };
    const state = window.paginationState[tableId];
    const start = (state.currentPage - 1) * state.rowsPerPage;
    const pageData = data.slice(start, start + state.rowsPerPage);

    pageData.forEach(v => {
        const tr = document.createElement('tr');
        const sigHtml = v.signatureUrl
            ? `<img src="${window.getDirectDriveImageUrl(v.signatureUrl)}" class="h-8 w-16 object-contain mx-auto border rounded bg-white cursor-pointer" onclick="window.openImageZoom('${v.signatureUrl}')">`
            : "-";
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
            <td class="p-4 text-center">${sigHtml}</td>
        `;
        body.appendChild(tr);
    });

    if (window.setupPaginationUI) window.setupPaginationUI(tableId, data.length);
}

function renderStaffAttendance(attendance) {
    const body = document.getElementById('staff-attendance-body');
    if (!body) return;
    body.innerHTML = '';

    const data = attendance || window.appCache.attendance || [];
    data.sort((a, b) => new Date(b.date + ' ' + b.timeIn) - new Date(a.date + ' ' + a.timeIn));

    if (data.length === 0) {
        body.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-gray-400">No attendance records found</td></tr>`;
        return;
    }

    // Lazy Rendering Logic
    const tableId = 'staff-attendance-body';
    if (!window.paginationState[tableId]) window.paginationState[tableId] = { currentPage: 1, rowsPerPage: 20 };
    const state = window.paginationState[tableId];
    const start = (state.currentPage - 1) * state.rowsPerPage;
    const pageData = data.slice(start, start + state.rowsPerPage);

    pageData.forEach(a => {
        const tr = document.createElement('tr');
        const sigHtml = a.signatureUrl
            ? `<img src="${window.getDirectDriveImageUrl(a.signatureUrl)}" class="h-8 w-16 object-contain mx-auto border rounded bg-white cursor-pointer" onclick="window.openImageZoom('${a.signatureUrl}')">`
            : "-";
        tr.innerHTML = `
            <td class="p-4"><span class="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg font-bold">STAFF</span></td>
            <td class="p-4 font-bold text-slate-800">${a.name || "-"}</td>
            <td class="p-4">${a.mobile || "-"}</td>
            <td class="p-4">${a.branch || a.schoolBranch || "School 1"}</td>
            <td class="p-4 uppercase text-[9px] font-bold text-slate-400">${a.role || a.position || "Staff"}</td>
            <td class="p-4">${a.date || "-"}</td>
            <td class="p-4 text-emerald-600 font-bold">${a.timeIn || "-"}</td>
            <td class="p-4 text-red-500 font-bold">${a.checkOutTime || a.outTime || "-"}</td>
            <td class="p-4 text-center">${sigHtml}</td>
        `;
        body.appendChild(tr);
    });

    if (window.setupPaginationUI) window.setupPaginationUI(tableId, data.length);
}

function renderGlobalTaskAudit(tasks) {
    const body = document.getElementById('admin-task-list-body');
    if (!body) return;
    body.innerHTML = '';

    const data = tasks || window.appCache.tasks || [];
    data.sort((a, b) => new Date(b.raisedTimestamp || 0) - new Date(a.raisedTimestamp || 0));

    if (data.length === 0) {
        body.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-gray-400">No tasks found</td></tr>`;
        return;
    }

    // Lazy Rendering Logic
    const tableId = 'admin-task-list-body';
    if (!window.paginationState[tableId]) window.paginationState[tableId] = { currentPage: 1, rowsPerPage: 20 };
    const state = window.paginationState[tableId];
    const start = (state.currentPage - 1) * state.rowsPerPage;
    const pageData = data.slice(start, start + state.rowsPerPage);

    pageData.forEach(t => {
        const bImg = window.getDirectDriveImageUrl(t.beforePhotoUrl || t.beforePhoto);
        const aImg = window.getDirectDriveImageUrl(t.afterPhotoUrl || t.afterPhoto);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-3 font-mono text-indigo-600 font-bold">${t.id?.split('-')[1] || t.id || "-"}</td>
            <td class="p-3">${t.assignedSchool || t.schoolName || "-"}</td>
            <td class="p-3 font-bold">${t.location || "-"}</td>
            <td class="p-3 max-w-[150px] truncate">${t.details || t.description || "-"}</td>
            <td class="p-3 uppercase text-[8px] font-black">${t.assignedRole || t.targetRole || "-"}</td>
            <td class="p-3">
                <div class="flex flex-col"><span class="font-bold">${t.raisedByName || t.createdByName || "Admin"}</span><span class="text-[7px] opacity-50">${t.timestamp || t.raisedTimestamp || ""}</span></div>
            </td>
            <td class="p-3 font-bold text-emerald-600">${t.solvedByName || "-"}</td>
            <td class="p-3"><span class="status-badge ${(t.status || 'Open').toLowerCase()}">${t.status || "Open"}</span></td>
            <td class="p-3 italic text-[8px]">${t.rejectionReason || "-"}</td>
            <td class="p-3 text-center">
                <div class="flex gap-1 justify-center">
                    ${bImg && bImg.includes('http') ? `<img src="${bImg}" class="h-8 w-8 object-cover rounded border cursor-pointer" onclick="window.openImageZoom('${bImg}')">` : '<span class="text-gray-300 text-[8px]">No</span>'}
                    ${t.afterPhotoUrl ? `<img src="${aImg}" class="h-8 w-8 object-cover rounded border border-emerald-200 cursor-pointer" onclick="window.openImageZoom('${aImg}')">` : ''}
                </div>
            </td>
        `;
        body.appendChild(tr);
    });

    if (window.setupPaginationUI) window.setupPaginationUI(tableId, data.length);
}

function renderStaffDirectory() {
    const body = document.getElementById('admin-staff-list-body');
    if (!body) return;
    body.innerHTML = '';

    const staff = window.appCache.staff || [];

    if (staff.length === 0) {
        body.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-gray-400">No staff members found</td></tr>`;
        return;
    }

    // Lazy Rendering Logic
    const tableId = 'admin-staff-list-body';
    if (!window.paginationState[tableId]) window.paginationState[tableId] = { currentPage: 1, rowsPerPage: 20 };
    const state = window.paginationState[tableId];
    const start = (state.currentPage - 1) * state.rowsPerPage;
    const pageData = staff.slice(start, start + state.rowsPerPage);

    pageData.forEach(s => {
        const profileImg = window.getDirectDriveImageUrl(s.profilePicUrl);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-4 text-center">
                <div class="w-10 h-10 rounded-full bg-slate-100 border overflow-hidden mx-auto">
                    <img src="${profileImg}" class="w-full h-full object-cover" onerror="this.src='https://ui-avatars.com/api/?name=${s.fullName || s.name || 'U'}&background=4f46e5&color=fff&size=40'">
                </div>
            </td>
            <td class="p-4 font-bold text-indigo-900">${s.fullName || s.name || "-"}</td>
            <td class="p-4 font-mono">${s.adcPassNumber || s.adekPass || "-"}</td>
            <td class="p-4">${s.branch || s.schoolName || "-"}</td>
            <td class="p-4 uppercase text-[9px] font-black text-slate-400">${s.role || s.position || "-"}</td>
            <td class="p-4 font-mono">${s.mobile || s.mobileNumber || "-"}</td>
            <td class="p-4 text-center">
                <button onclick="window.openEditStaffModal('${s.mobile || s.mobileNumber}')" class="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg"><i class="fa-solid fa-user-pen"></i></button>
            </td>
        `;
        body.appendChild(tr);
    });

    if (window.setupPaginationUI) window.setupPaginationUI(tableId, staff.length);
}

// ================================================
// ASSET TABLE RENDER - SINGLE SOURCE OF TRUTH (Lazy Rendering)
// ================================================
window.renderAdminAssetTable = (data, targetTable = 'both') => {
    try {
        const body = document.getElementById('admin-asset-list-body');
        const disposalBody = document.getElementById('admin-disposal-list-body');

        if (body && (targetTable === 'both' || targetTable === 'assets')) body.innerHTML = '';
        if (disposalBody && (targetTable === 'both' || targetTable === 'disposal')) disposalBody.innerHTML = '';

        if (!data || data.length === 0) {
            const emptyMsg = `<tr><td colspan="30" class="p-8 text-center text-gray-400"><i class="fa-solid fa-box-open text-4xl block mb-4"></i>No data found.</td></tr>`;
            if (body && (targetTable === 'both' || targetTable === 'assets')) body.innerHTML = emptyMsg;
            if (disposalBody && (targetTable === 'both' || targetTable === 'disposal')) disposalBody.innerHTML = emptyMsg;
            return;
        }

        // Logic to slice data for current page
        const tableId = (targetTable === 'disposal') ? 'admin-disposal-list-body' : 'admin-asset-list-body';
        if (!window.paginationState[tableId]) window.paginationState[tableId] = { currentPage: 1, rowsPerPage: 20 };
        const state = window.paginationState[tableId];
        const start = (state.currentPage - 1) * state.rowsPerPage;
        const pageData = data.slice(start, start + state.rowsPerPage);

        const sampleRecord = data[0];
        const dynamicHeaders = Object.keys(sampleRecord).filter(k =>
            !['updatedAt', 'createdAt', 'assetBarcode', 'initialAuditPhotoData', 'disposalPhotoData', 'assetStatus', 'auditPhotoUrl', 'disposalPhotoUrl', 'initialAuditPhoto', 'disposalDamagedPhoto', 'audit_photo', 'beforePhotoUrl', 'afterPhotoUrl', 'photoUrl', 'assetCondition', 'lastAuditTimestamp', 'lastAuditBy'].includes(k)
        );

        if (window.updateAssetTableHeaders && (targetTable === 'both' || targetTable === 'assets')) {
            window.updateAssetTableHeaders(dynamicHeaders);
        }

        pageData.forEach((a, index) => {
            const isDisposed = a.assetStatus === 'Disposed' || a.disposalReason;
            const barcode = a.assetBarcode || a['Asset Barcode'] || a.barcode || `ASSET-${index}`;
            const initialPhoto = window.getDirectDriveImageUrl(a.auditPhotoUrl || a.audit_photo || a.beforePhotoUrl || a.photoUrl || a.initialAuditPhoto);
            const damagePhoto = window.getDirectDriveImageUrl(a.disposalPhotoUrl || a.afterPhotoUrl || a.disposalDamagedPhoto);

            if (isDisposed && disposalBody && (targetTable === 'both' || targetTable === 'disposal')) {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-red-50 border-b text-[11px]";
                tr.innerHTML = `
                    <td class="p-3 font-mono font-bold text-red-600">${barcode}</td>
                    <td class="p-3 font-bold">${a.assetDescription || a.modelDescription || '-'}</td>
                    <td class="p-3">${a.vendorName || '-'}</td>
                    <td class="p-3"><span class="px-2 py-0.5 bg-red-50 text-red-600 rounded text-[9px] font-bold">${a.majorCategory || '-'}</span></td>
                    <td class="p-3">${a.serviceDate || '-'}</td>
                    <td class="p-3">${a.floorDescription || '-'}</td>
                    <td class="p-3 text-center">${a.floorNo || '-'}</td>
                    <td class="p-3 font-bold text-indigo-900">${a.locationName || '-'}</td>
                    <td class="p-3">${a.manufacturer || '-'}</td>
                    <td class="p-3">${a.modelDescription || '-'}</td>
                    <td class="p-3 font-mono">${a.roomBarcode || '-'}</td>
                    <td class="p-3">${a.roomName || '-'}</td>
                    <td class="p-3 font-bold">${a.roomNo || '-'}</td>
                    <td class="p-3">${a.buildingName || '-'}</td>
                    <td class="p-3 italic text-red-700 font-medium">${a.disposalReason || '-'}</td>
                    <td class="p-3">
                        <div class="flex flex-col"><span class="font-black text-indigo-900">${a.disposedBy || '-'}</span><span class="text-[8px] opacity-40 uppercase">${a.disposalDate || '-'}</span></div>
                    </td>
                    <td class="p-3 text-center">
                        <div class="flex gap-1 justify-center">
                            <img src="${initialPhoto}" class="h-8 w-8 object-cover rounded border" onclick="window.openImageZoom('${initialPhoto}')">
                            <img src="${damagePhoto}" class="h-8 w-8 object-cover rounded border" onclick="window.openImageZoom('${damagePhoto}')">
                        </div>
                    </td>
                    <td class="p-3 text-center">
                        <button onclick="window.recoverDisposedAsset('${barcode}')" class="text-indigo-600 hover:text-indigo-800 transition"><i class="fa-solid fa-rotate-left"></i></button>
                    </td>
                `;
                disposalBody.appendChild(tr);
            }
            else if (!isDisposed && body && (targetTable === 'both' || targetTable === 'assets')) {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-indigo-50 border-b text-[11px]";
                let rowHtml = `<td class="p-3 text-center"><input type="checkbox" class="asset-checkbox" value="${barcode}"></td>`;
                dynamicHeaders.forEach(h => { rowHtml += `<td class="p-3">${a[h] || "-"}</td>`; });
                rowHtml += `
                    <td class="p-3 text-center"><img src="${initialPhoto}" class="h-8 w-8 object-cover rounded border" onclick="window.openImageZoom('${initialPhoto}')"></td>
                    <td class="p-3 text-center"><img src="${damagePhoto}" class="h-8 w-8 object-cover rounded border" onclick="window.openImageZoom('${damagePhoto}')"></td>
                    <td class="p-3 text-center">
                        <div class="flex items-center justify-center gap-2">
                            <button onclick="window.openEditAssetModal('${barcode}')" class="text-indigo-600 hover:text-indigo-800"><i class="fa-solid fa-pen-to-square"></i></button>
                            <button onclick="window.deleteAssetRecord('${barcode}')" class="text-red-600 hover:text-red-800"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </td>
                `;
                tr.innerHTML = rowHtml;
                body.appendChild(tr);
            }
        });

        // Trigger pagination UI update without hiding rows (since only 20 exist)
        if (window.setupPaginationUI) {
            window.setupPaginationUI(tableId, data.length);
        }

    } catch (e) { console.error("❌ Error rendering asset table:", e); }
};

// =========================================================
// RENDER TRANSFER TABLE - 26 COLUMNS (ADMIN VIEW v3.5.1)
// =========================================================

window.renderTransferTable = (transfers) => {
    const body = document.getElementById('transfer-logs-body');
    if (!body) return;
    body.innerHTML = '';

    if (!transfers || transfers.length === 0) {
        body.innerHTML = `<tr><td colspan="26" class="p-8 text-center text-gray-400">No transfer records found</td></tr>`;
        return;
    }

    transfers.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    // Lazy Rendering Logic
    const tableId = 'transfer-logs-body';
    if (!window.paginationState[tableId]) window.paginationState[tableId] = { currentPage: 1, rowsPerPage: 20 };
    const state = window.paginationState[tableId];
    const start = (state.currentPage - 1) * state.rowsPerPage;
    const pageData = transfers.slice(start, start + state.rowsPerPage);

    pageData.forEach(t => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-indigo-50 transition-colors border-b border-gray-100 text-[9px]";

        const secSig = t.securitySignatureUrl
            ? `<img src="${window.getDirectDriveImageUrl(t.securitySignatureUrl)}" class="h-8 mx-auto rounded border cursor-pointer hover:scale-150 transition" onclick="window.openImageZoom('${t.securitySignatureUrl}')">`
            : '-';
        const recSig = t.receivedSignatureUrl
            ? `<img src="${window.getDirectDriveImageUrl(t.receivedSignatureUrl)}" class="h-8 mx-auto rounded border cursor-pointer hover:scale-150 transition" onclick="window.openImageZoom('${t.receivedSignatureUrl}')">`
            : '-';
        const auditPhoto = t.auditPhotoAfter
            ? `<img src="${window.getDirectDriveImageUrl(t.auditPhotoAfter)}" class="h-8 w-8 object-cover rounded border cursor-pointer hover:scale-150 transition" onclick="window.openImageZoom('${t.auditPhotoAfter}')">`
            : '-';
        const transferPhoto = t.transferPhotoUrl
            ? `<img src="${window.getDirectDriveImageUrl(t.transferPhotoUrl)}" class="h-8 w-8 object-cover rounded border cursor-pointer hover:scale-150 transition" onclick="window.openImageZoom('${t.transferPhotoUrl}')">`
            : '-';

        tr.innerHTML = `
            <td class="p-2 font-mono font-bold text-indigo-600">${t.assetBarcode || '-'}</td>
            <td class="p-2 max-w-[120px] truncate font-medium">${t.assetDescription || '-'}</td>
            <td class="p-2">${t.assetVendorName || '-'}</td>
            <td class="p-2"><span class="px-2 py-0.5 bg-slate-100 rounded text-[8px] font-bold">${t.category || '-'}</span></td>
            <td class="p-2 text-[8px]">${t.datePlaceInService || '-'}</td>
            <td class="p-2 max-w-[80px] truncate">${t.floorDescription || '-'}</td>
            <td class="p-2 text-center">${t.floorNo || '-'}</td>
            <td class="p-2 font-bold text-slate-700">${t.locationName || '-'}</td>
            <td class="p-2">${t.manufacturer || '-'}</td>
            <td class="p-2 max-w-[80px] truncate">${t.modelDescription || '-'}</td>
            <td class="p-2 font-mono text-[8px]">${t.roomBarcode || '-'}</td>
            <td class="p-2 max-w-[80px] truncate">${t.roomName || '-'}</td>
            <td class="p-2 font-bold">${t.roomNumber || '-'}</td>
            <td class="p-2 max-w-[100px] truncate">${t.schoolBuildingName || '-'}</td>
            <td class="p-3 text-center">${auditPhoto}</td>
            <td class="p-2 font-black text-indigo-900">${t.collectorFullName || t.collectorName || '-'}</td>
            <td class="p-2 font-bold">${t.companyName || '-'}</td>
            <td class="p-2 max-w-[100px] truncate italic text-[8px]">${t.reasonForCollection || '-'}</td>
            <td class="p-2 font-mono text-[8px]">${t.dateOfCollection || t.date || '-'}</td>
            <td class="p-2">${t.companyLandlineNo || '-'}</td>
            <td class="p-2 font-mono text-[8px]">${t.assetSerialNo || '-'}</td>
            <td class="p-2">
                <span class="px-2 py-1 rounded-full font-black text-[7px] uppercase ${t.reasonForTransfer === 'Repair/Maintenance' ? 'bg-amber-50 text-amber-700' : t.reasonForTransfer === 'Replacement' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}">
                    ${t.reasonForTransfer || '-'}
                </span>
            </td>
            <td class="p-2 text-center">${secSig}</td>
            <td class="p-2 text-center">${recSig}</td>
            <td class="p-2 text-center">${transferPhoto}</td>
            <td class="p-2 text-center">
                ${t.status === 'Completed'
                    ? '<span class="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[8px] font-black uppercase">Done</span>'
                    : `<button onclick="window.completeAssetTransfer('${t.transferId || t.id}')"
                            class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold text-[8px] hover:bg-indigo-700 transition shadow-sm uppercase">
                        Complete
                    </button>`
                }
            </td>
        `;
        body.appendChild(tr);
    });

    if (window.setupPaginationUI) window.setupPaginationUI(tableId, transfers.length);
};

// ================================================
// FIXED: ASSET EDIT & MODAL BINDING
// ================================================
window.openEditAssetModal = (barcode) => {
    const modal = document.getElementById('asset-edit-modal');
    if (!modal) return;
    document.getElementById('edit-barcode').value = barcode;

    const asset = window.appCache.assets.find(a => (a.assetBarcode || a['Asset Barcode'] || a.barcode) === barcode);
    if (asset) {
        document.getElementById('edit-description').value = asset.assetDescription || asset.modelDescription || '';
        document.getElementById('edit-condition').value = asset.assetCondition || 'Good';
        document.getElementById('edit-location').value = asset.locationName || asset.location || '';
        document.getElementById('edit-room').value = asset.roomNo || asset.roomNumber || '';
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    // ✅ Bind save button inside modal open function
    const saveBtn = document.getElementById('save-asset-edit-btn');
    if (saveBtn) {
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        newSaveBtn.onclick = window.saveAssetEdit;
    }
};

window.saveAssetEdit = async () => {
    const barcode = document.getElementById('edit-barcode').value;
    const btn = document.getElementById('save-asset-edit-btn');
    const originalText = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    try {
        const updates = {
            assetDescription: document.getElementById('edit-description').value.trim(),
            assetCondition: document.getElementById('edit-condition').value,
            locationName: document.getElementById('edit-location').value.trim(),
            roomNo: document.getElementById('edit-room').value.trim(),
            updatedAt: new Date().toISOString()
        };
        await update(ref(db, 'assets/' + barcode), updates);
        alert(`✅ Asset ${barcode} updated!`);
        document.getElementById('asset-edit-modal').classList.add('hidden');
        window.refreshDashboardData();
    } catch (e) { alert("Error: " + e.message); }
    finally { btn.disabled = false; btn.innerHTML = originalText; }
};

// ================================================
// FILTER FUNCTIONS (Lag-Free & Optimized)
// ================================================
let searchTimer;
const debounceSearch = (func) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(func, 300);
};

window.filterVisitorTable = () => {
    debounceSearch(() => {
        const q = document.getElementById('visitor-search')?.value?.toLowerCase() || '';
        const date = document.getElementById('visitor-date-filter')?.value || '';
        const filtered = window.appCache.visitors.filter(v =>
            (v.name?.toLowerCase().includes(q) || v.id?.toLowerCase().includes(q) || v.mobile?.includes(q) || v.company?.toLowerCase().includes(q)) &&
            (!date || v.date === new Date(date).toLocaleDateString('en-US'))
        );
        window.currentFilteredData.visitors = q || date ? filtered : null;
        if (window.paginationState['visitor-logs-body']) window.paginationState['visitor-logs-body'].currentPage = 1;
        renderVisitorLogs(filtered);
    });
};

window.filterStaffTable = () => {
    debounceSearch(() => {
        const q = document.getElementById('staff-search')?.value?.toLowerCase() || '';
        const date = document.getElementById('staff-date-filter')?.value || '';
        const filtered = window.appCache.attendance.filter(a =>
            (a.name?.toLowerCase().includes(q) || a.mobile?.includes(q) || a.role?.toLowerCase().includes(q)) &&
            (!date || a.date === new Date(date).toLocaleDateString('en-US'))
        );
        window.currentFilteredData.staff = q || date ? filtered : null;
        if (window.paginationState['staff-attendance-body']) window.paginationState['staff-attendance-body'].currentPage = 1;
        renderStaffAttendance(filtered);
    });
};

window.filterAssetTable = () => {
    debounceSearch(() => {
        const q = document.getElementById('asset-search')?.value?.toLowerCase() || '';
        const filtered = window.appCache.assets.filter(a => {
            const isDisposed = a.assetStatus === 'Disposed' || a.disposalReason;
            if (isDisposed) return false;
            return (
                a.assetBarcode?.toLowerCase().includes(q) ||
                a['Asset Barcode']?.toLowerCase().includes(q) ||
                a.assetDescription?.toLowerCase().includes(q) ||
                a.modelDescription?.toLowerCase().includes(q) ||
                a.serialNo?.toLowerCase().includes(q) ||
                a.locationName?.toLowerCase().includes(q)
            );
        });
        window.currentFilteredData.assets = q ? filtered : null;
        if (window.paginationState['admin-asset-list-body']) window.paginationState['admin-asset-list-body'].currentPage = 1;
        window.renderAdminAssetTable(filtered, 'assets');
    });
};

window.filterDisposalTable = () => {
    debounceSearch(() => {
        const q = document.getElementById('disposal-search')?.value?.toLowerCase() || '';
        const filtered = window.appCache.assets.filter(a => {
            const isDisposed = a.assetStatus === 'Disposed' || a.disposalReason;
            if (!isDisposed) return false;
            return (
                a.assetBarcode?.toLowerCase().includes(q) ||
                a.assetDescription?.toLowerCase().includes(q) ||
                a.disposalReason?.toLowerCase().includes(q)
            );
        });
        window.currentFilteredData.disposal = q ? filtered : null;
        if (window.paginationState['admin-disposal-list-body']) window.paginationState['admin-disposal-list-body'].currentPage = 1;
        window.renderAdminAssetTable(filtered, 'disposal');
    });
};

window.filterTransferTable = () => {
    debounceSearch(() => {
        const q = document.getElementById('transfer-search')?.value?.toLowerCase() || '';
        const filtered = window.appCache.transfers.filter(t =>
            t.assetBarcode?.toLowerCase().includes(q) ||
            t.collectorName?.toLowerCase().includes(q) ||
            t.transferId?.toLowerCase().includes(q)
        );
        window.currentFilteredData.transfers = q ? filtered : null;
        if (window.paginationState['transfer-logs-body']) window.paginationState['transfer-logs-body'].currentPage = 1;
        window.renderTransferTable(filtered);
    });
};

// ================================================
// STAFF MANAGEMENT
// ================================================
window.openAddStaffModal = () => {
    const modal = document.getElementById('add-staff-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="bg-white w-full max-w-lg rounded-[40px] overflow-hidden shadow-2xl">
            <div class="p-6 bg-slate-800 text-white flex justify-between items-center">
                <h3 class="text-lg font-bold uppercase tracking-tight">Add New Staff</h3>
                <button onclick="document.getElementById('add-staff-modal').classList.add('hidden')"><i class="fa-solid fa-xmark text-xl"></i></button>
            </div>
            <form id="add-staff-form" class="p-8 space-y-4" onsubmit="window.submitAddStaff(event)">
                <input type="text" id="staff-fullname" placeholder="Full Name" required class="w-full p-4 bg-slate-50 border-2 rounded-2xl">
                <input type="tel" id="staff-mobile" placeholder="Mobile Number" required class="w-full p-4 bg-slate-50 border-2 rounded-2xl">
                <input type="text" id="staff-adek" placeholder="ADEK Pass Number" required class="w-full p-4 bg-slate-50 border-2 rounded-2xl">
                <select id="staff-school" class="w-full p-4 bg-slate-50 border-2 rounded-2xl">
                    <option value="Jern Yafoor School 1">School 1</option>
                    <option value="Jern Yafoor School 2">School 2</option>
                </select>
                <select id="staff-role" class="w-full p-4 bg-slate-50 border-2 rounded-2xl">
                    <option value="Cleaner">Cleaner</option>
                    <option value="Cleaner Leader">Cleaner Leader</option>
                    <option value="Security">Security</option>
                    <option value="Technician">Technician</option>
                    <option value="Admin">Admin</option>
                </select>
                <input type="password" id="staff-password" placeholder="Password" required class="w-full p-4 bg-slate-50 border-2 rounded-2xl">
                <button type="submit" class="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest">Register Staff</button>
            </form>
        </div>
    `;
};

window.submitAddStaff = async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('staff-fullname').value.trim();
    const mobile = document.getElementById('staff-mobile').value.trim();
    const adekPass = document.getElementById('staff-adek').value.trim();
    const school = document.getElementById('staff-school').value;
    const role = document.getElementById('staff-role').value;
    const password = document.getElementById('staff-password').value.trim();

    try {
        const staffData = { name: fullName, mobile, adekPass, branch: school, role, password, createdAt: new Date().toISOString() };
        await set(ref(db, 'staff/' + mobile), staffData);
        await set(ref(db, 'users/' + mobile), staffData);
        alert(`✅ Staff ${fullName} registered!`);
        document.getElementById('add-staff-modal').classList.add('hidden');
        window.refreshDashboardData();
    } catch (e) { alert("Error: " + e.message); }
};

window.openEditStaffModal = async (mobile) => {
    const snap = await get(ref(db, 'staff/' + mobile));
    if (!snap.exists()) return alert("Staff not found");
    const s = snap.val();
    const modal = document.getElementById('edit-staff-modal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="bg-white w-full max-w-lg rounded-[40px] overflow-hidden shadow-2xl">
            <div class="p-6 bg-indigo-600 text-white flex justify-between items-center">
                <h3 class="text-lg font-bold uppercase tracking-tight">Edit Staff</h3>
                <button onclick="document.getElementById('edit-staff-modal').classList.add('hidden')"><i class="fa-solid fa-xmark text-xl"></i></button>
            </div>
            <form id="edit-staff-form" class="p-8 space-y-4" onsubmit="window.submitEditStaff(event, '${mobile}')">
                <input type="text" id="edit-fullname" value="${s.name || ''}" required class="w-full p-4 bg-slate-50 border-2 rounded-2xl">
                <input type="text" id="edit-adek" value="${s.adekPass || ''}" required class="w-full p-4 bg-slate-50 border-2 rounded-2xl">
                <select id="edit-school" class="w-full p-4 bg-slate-50 border-2 rounded-2xl">
                    <option value="Jern Yafoor School 1" ${s.branch==='Jern Yafoor School 1'?'selected':''}>School 1</option>
                    <option value="Jern Yafoor School 2" ${s.branch==='Jern Yafoor School 2'?'selected':''}>School 2</option>
                </select>
                <select id="edit-role" class="w-full p-4 bg-slate-50 border-2 rounded-2xl">
                    <option value="Cleaner" ${s.role==='Cleaner'?'selected':''}>Cleaner</option>
                    <option value="Security" ${s.role==='Security'?'selected':''}>Security</option>
                    <option value="Admin" ${s.role==='Admin'?'selected':''}>Admin</option>
                </select>
                <input type="password" id="edit-password" placeholder="New Password (Optional)" class="w-full p-4 bg-slate-50 border-2 rounded-2xl">
                <button type="submit" class="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest">Update Staff</button>
            </form>
        </div>
    `;
};

window.submitEditStaff = async (e, mobile) => {
    e.preventDefault();
    const updates = { name: document.getElementById('edit-fullname').value, adekPass: document.getElementById('edit-adek').value, branch: document.getElementById('edit-school').value, role: document.getElementById('edit-role').value, updatedAt: new Date().toISOString() };
    const newPass = document.getElementById('edit-password').value;
    if (newPass) updates.password = newPass;
    try {
        await update(ref(db, 'staff/' + mobile), updates);
        await update(ref(db, 'users/' + mobile), updates);
        alert("✅ Staff updated!");
        document.getElementById('edit-staff-modal').classList.add('hidden');
        window.refreshDashboardData();
    } catch (e) { alert("Error: " + e.message); }
};

// ================================================
// UTILITIES & EXPORTS
// ================================================
window.findValueByFuzzyKey = (obj, key) => {
    if (!obj || typeof obj !== 'object') return null;
    if (obj[key]) return obj[key];
    const nk = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const k in obj) if (k.toLowerCase().replace(/[^a-z0-9]/g, '') === nk) return obj[k];
    return null;
};

window.updateAssetTableHeaders = (dynamicHeaders) => {
    const head = document.querySelector('#asset-master-table thead tr');
    if (!head) return;
    let html = '<th class="p-4 text-center"><input type="checkbox" onchange="window.toggleAllAssetCheckboxes(this)" class="selectAllAssets"></th>';
    dynamicHeaders.forEach(h => { html += `<th class="p-4 whitespace-nowrap">${h}</th>`; });
    html += '<th class="p-4 text-center">Audit</th><th class="p-4 text-center">Damage</th><th class="p-4 text-center">Action</th>';
    head.innerHTML = html;
};

window.handleUserLogout = () => { localStorage.removeItem('isAdminLoggedIn'); window.location.href = 'index.html'; };

// Export Wrappers (Link to export_module.js)
window.downloadExcelReport = () => { if (typeof window._downloadExcelReport === 'function') window._downloadExcelReport(); else alert("Module Loading..."); };
window.exportTaskReportExcel = () => { if (typeof window._exportTaskReportExcel === 'function') window._exportTaskReportExcel(); else alert("Module Loading..."); };
window.downloadMasterAssetReport = () => { if (typeof window._downloadMasterAssetReport === 'function') window._downloadMasterAssetReport(); else alert("Module Loading..."); };
window.downloadDisposedAssetReport = () => { if (typeof window._downloadDisposedAssetReport === 'function') window._downloadDisposedAssetReport(); else alert("Module Loading..."); };
window.exportTransferReport = () => { if (typeof window._exportTransferReport === 'function') window._exportTransferReport(); else alert("Module Loading..."); };

console.log("✅ admin_module.js loaded (FINAL)");
