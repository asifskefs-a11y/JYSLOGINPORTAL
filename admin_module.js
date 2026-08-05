import { db, UPLOAD_CONFIG } from './firebase_config.js';
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

// Selection State for Bulk Actions
window.selectedAssetKeys = new Set();

// Stores the currently filtered results for pagination
window.currentFilteredData = {
    visitors: null,
    staff: null,
    tasks: null,
    assets: null,
    disposal: null,
    transfers: null
};

// ================================================
// SELECTION HANDLERS
// ================================================
window.toggleAllAssetCheckboxes = (master) => {
    const isChecked = master.checked;
    const checkboxes = document.querySelectorAll('.asset-checkbox');

    checkboxes.forEach(cb => { cb.checked = isChecked; });

    const currentData = window.currentFilteredData.assets || window.appCache.assets || [];
    const activeAssets = currentData.filter(a => {
        const status = (a.assetStatus || '').toLowerCase();
        return !['disposed', 'transferred', 'in-transit', 'completed'].includes(status) && !a.disposalReason;
    });

    if (isChecked) {
        activeAssets.forEach(a => {
            const barcode = a.assetBarcode || a['Asset Barcode'] || a.barcode;
            if (barcode) window.selectedAssetKeys.add(barcode);
        });
    } else {
        window.selectedAssetKeys.clear();
    }
    window.updateBulkDeleteUI();
};

window.handleAssetCheckboxChange = (checkbox) => {
    const barcode = checkbox.value;
    if (checkbox.checked) {
        window.selectedAssetKeys.add(barcode);
    } else {
        window.selectedAssetKeys.delete(barcode);
        const master = document.querySelector('.selectAllAssets');
        if (master) master.checked = false;
    }
    window.updateBulkDeleteUI();
};

window.updateBulkDeleteUI = () => {
    const count = window.selectedAssetKeys.size;
    const btn = document.querySelector('button[onclick="window.bulkDeleteAssets()"]');
    if (btn) {
        btn.innerHTML = count > 0 ? `<i class="fa-solid fa-trash-can mr-2"></i> Delete Selected (${count})` : 'Bulk Delete';
        btn.classList.toggle('bg-red-600', count > 0);
        btn.classList.toggle('bg-red-500', count === 0);
    }
};

// ================================================
// DATA AGGREGATOR & SYNC
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

        // Auto-migrate legacy data from Base64 to Drive
        window.autoMigrateLegacyData();

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

    } catch (e) { console.error("❌ Refresh Dashboard Error:", e); }
};

window.autoMigrateLegacyData = async () => {
    const transfers = window.appCache.transfers;
    if (!transfers || transfers.length === 0) return;

    let migrationCount = 0;
    for (const t of transfers) {
        const updates = {};
        const fields = [
            { key: 'securitySignatureUrl', cat: UPLOAD_CONFIG.CATEGORIES.ASSET_TRANSFER_SIGNATURES, name: 'Migrated_Sig_Sec' },
            { key: 'receivedSignatureUrl', cat: UPLOAD_CONFIG.CATEGORIES.ASSET_TRANSFER_SIGNATURES, name: 'Migrated_Sig_Rec' },
            { key: 'transferPhotoUrl', cat: UPLOAD_CONFIG.CATEGORIES.ASSET_TRANSFER_PHOTOS, name: 'Migrated_Proof' }
        ];

        for (const f of fields) {
            const val = t[f.key];
            if (val && typeof val === 'string' && val.startsWith('data:image')) {
                try {
                    const res = await window.uploadToDrive({ category: f.cat, fileName: `${f.name}_${t.assetBarcode}_${Date.now()}.png`, image: val });
                    if (res.status === 'success') { updates[f.key] = res.fileUrl; migrationCount++; }
                } catch (err) {}
            }
        }
        if (Object.keys(updates).length > 0) {
            const trId = t.transferId || t.id;
            if (trId) await update(ref(db, `asset_transfers/${trId}`), updates);
        }
    }
    if (migrationCount > 0) console.log(`✅ Migrated ${migrationCount} legacy items to Drive.`);
};

window.loadAdminDashboard = () => { window.refreshDashboardData(); };

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
    switch (tabId) {
        case 'tab-visitor-logs': renderVisitorLogs(window.currentFilteredData.visitors || window.appCache.visitors || []); break;
        case 'tab-staff-logs': renderStaffAttendance(window.currentFilteredData.staff || window.appCache.attendance || []); break;
        case 'tab-tasks': renderGlobalTaskAudit(window.currentFilteredData.tasks || window.appCache.tasks || []); break;
        case 'tab-staff-list': renderStaffDirectory(window.appCache.staff || []); break;
        case 'tab-assets': window.renderAdminAssetTable(window.currentFilteredData.assets || window.appCache.assets || [], 'assets'); break;
        case 'tab-disposal': window.renderStandardizedAssetTable(window.currentFilteredData.disposal || window.appCache.assets.filter(a => a.assetStatus === 'Disposed'), 'disposal'); break;
        case 'tab-transfers': window.renderStandardizedAssetTable(window.currentFilteredData.transfers || window.appCache.transfers || [], 'transfers'); break;
        case 'tab-settings': window.loadGoogleDriveConfig(); break;
        case 'tab-my-tasks': if (typeof window.initRaisedTasksTracker === 'function') window.initRaisedTasksTracker('admin-my-tasks-container'); break;
    }
};

// ================================================
// RENDER FUNCTIONS
// ================================================
function renderVisitorLogs(visitors) {
    const body = document.getElementById('visitor-logs-body');
    if (!body) return;
    body.innerHTML = '';
    const data = visitors || [];
    data.sort((a, b) => new Date(b.date + ' ' + b.timeIn) - new Date(a.date + ' ' + a.timeIn));
    if (data.length === 0) { body.innerHTML = `<tr><td colspan="11" class="p-8 text-center text-gray-400">No records found</td></tr>`; return; }
    const tableId = 'visitor-logs-body';
    if (!window.paginationState[tableId]) window.paginationState[tableId] = { currentPage: 1, rowsPerPage: 20 };
    const state = window.paginationState[tableId];
    const start = (state.currentPage - 1) * state.rowsPerPage;
    data.slice(start, start + state.rowsPerPage).forEach(v => {
        const tr = document.createElement('tr');
        const sigHtml = v.signatureUrl ? `<img src="${window.getDirectDriveImageUrl(v.signatureUrl)}" class="h-8 w-16 object-contain mx-auto border rounded bg-white cursor-pointer" onclick="window.openImageZoom('${v.signatureUrl}')">` : "-";
        tr.innerHTML = `<td class="p-4"><span class="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg font-bold">VISITOR</span></td><td class="p-4 font-mono font-bold">${v.id || "-"}</td><td class="p-4 font-bold text-slate-800">${v.name || "-"}</td><td class="p-4">${v.mobile || "-"}</td><td class="p-4">${v.company || "-"}</td><td class="p-4">${v.purpose || "-"}</td><td class="p-4">${v.date || "-"}</td><td class="p-4 text-emerald-600 font-bold">${v.timeIn || "-"}</td><td class="p-4 text-red-500 font-bold">${v.outTime || "-"}</td><td class="p-4"><span class="status-badge ${v.status === 'SIGNED OUT' ? 'closed' : 'open'}">${v.status || "Active"}</span></td><td class="p-4 text-center">${sigHtml}</td>`;
        body.appendChild(tr);
    });
    if (window.setupPaginationUI) window.setupPaginationUI(tableId, data.length);
}

function renderStaffAttendance(attendance) {
    const body = document.getElementById('staff-attendance-body');
    if (!body) return;
    body.innerHTML = '';
    const data = attendance || [];
    data.sort((a, b) => new Date(b.date + ' ' + b.timeIn) - new Date(a.date + ' ' + a.timeIn));
    if (data.length === 0) { body.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-gray-400">No records found</td></tr>`; return; }
    const tableId = 'staff-attendance-body';
    if (!window.paginationState[tableId]) window.paginationState[tableId] = { currentPage: 1, rowsPerPage: 20 };
    const state = window.paginationState[tableId];
    const start = (state.currentPage - 1) * state.rowsPerPage;
    data.slice(start, start + state.rowsPerPage).forEach(a => {
        const tr = document.createElement('tr');
        const sigHtml = a.signatureUrl ? `<img src="${window.getDirectDriveImageUrl(a.signatureUrl)}" class="h-8 w-16 object-contain mx-auto border rounded bg-white cursor-pointer" onclick="window.openImageZoom('${a.signatureUrl}')">` : "-";
        tr.innerHTML = `<td class="p-4"><span class="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg font-bold">STAFF</span></td><td class="p-4 font-bold text-slate-800">${a.name || "-"}</td><td class="p-4">${a.mobile || "-"}</td><td class="p-4">${a.branch || "School 1"}</td><td class="p-4 uppercase text-[9px] font-bold text-slate-400">${a.role || "Staff"}</td><td class="p-4">${a.date || "-"}</td><td class="p-4 text-emerald-600 font-bold">${a.timeIn || "-"}</td><td class="p-4 text-red-500 font-bold">${a.checkOutTime || "-"}</td><td class="p-4 text-center">${sigHtml}</td>`;
        body.appendChild(tr);
    });
    if (window.setupPaginationUI) window.setupPaginationUI(tableId, data.length);
}

function renderGlobalTaskAudit(tasks) {
    const body = document.getElementById('admin-task-list-body');
    if (!body) return;
    body.innerHTML = '';
    const data = tasks || [];
    data.sort((a, b) => new Date(b.raisedTimestamp || 0) - new Date(a.raisedTimestamp || 0));
    if (data.length === 0) { body.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-gray-400">No tasks found</td></tr>`; return; }
    const tableId = 'admin-task-list-body';
    if (!window.paginationState[tableId]) window.paginationState[tableId] = { currentPage: 1, rowsPerPage: 20 };
    const state = window.paginationState[tableId];
    const start = (state.currentPage - 1) * state.rowsPerPage;
    data.slice(start, start + state.rowsPerPage).forEach(t => {
        const bImg = window.getDirectDriveImageUrl(t.beforePhotoUrl || t.beforePhoto);
        const aImg = window.getDirectDriveImageUrl(t.afterPhotoUrl || t.afterPhoto);
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="p-3 font-mono text-indigo-600 font-bold">${t.id?.split('-')[1] || t.id || "-"}</td><td class="p-3">${t.assignedSchool || "-"}</td><td class="p-3 font-bold">${t.location || "-"}</td><td class="p-3 max-w-[150px] truncate">${t.details || "-"}</td><td class="p-3 uppercase text-[8px] font-black">${t.assignedRole || "-"}</td><td class="p-3"><div class="flex flex-col"><span class="font-bold">${t.raisedByName || "Admin"}</span><span class="text-[7px] opacity-50">${t.timestamp || ""}</span></div></td><td class="p-3 font-bold text-emerald-600">${t.solvedByName || "-"}</td><td class="p-3"><span class="status-badge ${(t.status || 'Open').toLowerCase()}">${t.status || "Open"}</span></td><td class="p-3 italic text-[8px]">${t.rejectionReason || "-"}</td><td class="p-3 text-center"><div class="flex gap-1 justify-center">${bImg.includes('http') ? `<img src="${bImg}" class="h-8 w-8 object-cover rounded border cursor-pointer" onclick="window.openImageZoom('${bImg}')">` : '<span class="text-gray-300 text-[8px]">No</span>'}${t.afterPhotoUrl ? `<img src="${aImg}" class="h-8 w-8 object-cover rounded border border-emerald-200 cursor-pointer" onclick="window.openImageZoom('${aImg}')">` : ''}</div></td>`;
        body.appendChild(tr);
    });
    if (window.setupPaginationUI) window.setupPaginationUI(tableId, data.length);
}

function renderStaffDirectory(staff) {
    const body = document.getElementById('admin-staff-list-body');
    if (!body) return;
    body.innerHTML = '';
    const data = staff || [];
    if (data.length === 0) { body.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-gray-400">No staff members found</td></tr>`; return; }
    const tableId = 'admin-staff-list-body';
    if (!window.paginationState[tableId]) window.paginationState[tableId] = { currentPage: 1, rowsPerPage: 20 };
    const state = window.paginationState[tableId];
    const start = (state.currentPage - 1) * state.rowsPerPage;
    data.slice(start, start + state.rowsPerPage).forEach(s => {
        const profileImg = window.getDirectDriveImageUrl(s.profilePicUrl);
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="p-4 text-center"><div class="w-10 h-10 rounded-full bg-slate-100 border overflow-hidden mx-auto"><img src="${profileImg}" class="w-full h-full object-cover" onerror="this.src='https://ui-avatars.com/api/?name=${s.fullName || s.name || 'U'}&background=4f46e5&color=fff&size=40'"></div></td><td class="p-4 font-bold text-indigo-900">${s.fullName || s.name || "-"}</td><td class="p-4 font-mono">${s.adcPassNumber || s.adekPass || "-"}</td><td class="p-4">${s.branch || "-"}</td><td class="p-4 uppercase text-[9px] font-black text-slate-400">${s.role || "-"}</td><td class="p-4 font-mono">${s.mobile || "-"}</td><td class="p-4 text-center"><button onclick="window.openEditStaffModal('${s.mobile}')" class="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg"><i class="fa-solid fa-user-pen"></i></button></td>`;
        body.appendChild(tr);
    });
    if (window.setupPaginationUI) window.setupPaginationUI(tableId, data.length);
}

// ================================================
// ASSET TABLE RENDER
// ================================================
window.renderAdminAssetTable = (data, targetTable = 'both') => {
    try {
        const body = document.getElementById('admin-asset-list-body');
        if (body && (targetTable === 'both' || targetTable === 'assets')) body.innerHTML = '';
        if (!data || data.length === 0) {
            const emptyMsg = `<tr><td colspan="30" class="p-8 text-center text-gray-400"><i class="fa-solid fa-box-open text-4xl block mb-4"></i>No data found.</td></tr>`;
            if (body && (targetTable === 'both' || targetTable === 'assets')) body.innerHTML = emptyMsg;
            return;
        }
        const tableId = 'admin-asset-list-body';
        if (!window.paginationState[tableId]) window.paginationState[tableId] = { currentPage: 1, rowsPerPage: 20 };
        const state = window.paginationState[tableId];
        const start = (state.currentPage - 1) * state.rowsPerPage;
        const pageData = data.slice(start, start + state.rowsPerPage);

        const sample = data[0];
        const dynamicHeaders = Object.keys(sample).filter(k => !['updatedAt', 'createdAt', 'assetBarcode', 'initialAuditPhotoData', 'disposalPhotoData', 'assetStatus', 'auditPhotoUrl', 'disposalPhotoUrl', 'photoUrl', 'assetCondition', 'lastAuditTimestamp', 'lastAuditBy', 'lastTransferId', 'lastDisposalTimestamp'].includes(k));
        if (window.updateAssetTableHeaders && (targetTable === 'both' || targetTable === 'assets')) window.updateAssetTableHeaders(dynamicHeaders);

        const getVal = (val) => (val === undefined || val === null || val === "" || val === "N/A" || val === "undefined") ? '-' : val;

        pageData.forEach((a, index) => {
            const status = (a.assetStatus || '').toLowerCase();
            const isHidden = ['disposed', 'transferred', 'in-transit', 'completed'].includes(status) || a.disposalReason;
            if (!isHidden) {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-indigo-50 border-b text-[11px]";
                const barcode = a.assetBarcode || a.barcode || `ASSET-${index}`;
                const isSelected = window.selectedAssetKeys.has(barcode);
                let rowHtml = `<td class="p-3 text-center"><input type="checkbox" class="asset-checkbox" value="${barcode}" onchange="window.handleAssetCheckboxChange(this)" ${isSelected ? 'checked' : ''}></td>`;
                dynamicHeaders.forEach(h => { rowHtml += `<td class="p-3">${getVal(a[h])}</td>`; });
                const photo = window.getDirectDriveImageUrl(a.auditPhotoUrl || a.photoUrl);
                rowHtml += `<td class="p-3 text-center"><img src="${photo}" class="h-8 w-8 object-cover rounded border cursor-pointer" onclick="window.openImageZoom('${photo}')"></td><td class="p-3 text-center">-</td><td class="p-3 text-center"><div class="flex items-center justify-center gap-2"><button onclick="window.openEditAssetModal('${barcode}')" class="text-indigo-600 hover:text-indigo-800"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteAssetRecord('${barcode}')" class="text-red-600 hover:text-red-800"><i class="fa-solid fa-trash-can"></i></button></div></td>`;
                tr.innerHTML = rowHtml;
                body.appendChild(tr);
            }
        });
        if (window.setupPaginationUI) window.setupPaginationUI(tableId, data.length);
        window.updateBulkDeleteUI();
    } catch (e) { console.error("❌ Asset Table Error:", e); }
};

window.renderStandardizedAssetTable = (data, target) => {
    const body = target === 'disposal' ? document.getElementById('admin-disposal-list-body') : document.getElementById('transfer-logs-body');
    if (!body) return;
    body.innerHTML = '';
    const getVal = (val) => (val === undefined || val === null || val === "" || val === "N/A" || val === "undefined") ? '-' : val;
    const filtered = data.filter(t => target === 'disposal' ? t.assetStatus === 'Disposed' : ['Transferred', 'In-Transit', 'Completed'].includes(t.status || t.assetStatus));
    if (filtered.length === 0) { body.innerHTML = `<tr><td colspan="26" class="p-8 text-center text-gray-400">No records found</td></tr>`; return; }
    filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const tableId = body.id;
    if (!window.paginationState[tableId]) window.paginationState[tableId] = { currentPage: 1, rowsPerPage: 20 };
    const state = window.paginationState[tableId];
    const start = (state.currentPage - 1) * state.rowsPerPage;
    filtered.slice(start, start + state.rowsPerPage).forEach(t => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-colors border-b border-gray-100 text-[9px]";
        const photo = t.auditPhoto || t.disposalPhotoUrl || t.auditPhotoUrl || t.photoUrl;
        const photoHtml = (photo && photo !== 'N/A' && photo !== '-') ? `<img src="${window.getDirectDriveImageUrl(photo)}" class="h-8 w-8 object-cover rounded border cursor-pointer hover:scale-150 transition" onclick="window.openImageZoom('${photo}')">` : '<span class="px-2 py-0.5 bg-gray-50 text-gray-400 border border-gray-100 rounded-[4px] text-[7px] font-bold uppercase whitespace-nowrap">No Photo</span>';
        const proof = t.transferPhotoUrl || t.afterPhotoUrl;
        const proofHtml = (proof && proof !== 'N/A' && proof !== '-') ? `<img src="${window.getDirectDriveImageUrl(proof)}" class="h-8 w-8 object-cover rounded border cursor-pointer hover:scale-150 transition" onclick="window.openImageZoom('${proof}')">` : '<span class="px-2 py-0.5 bg-gray-50 text-gray-400 border border-gray-100 rounded-[4px] text-[7px] font-bold uppercase whitespace-nowrap">No Proof</span>';
        const secSig = t.securitySignatureUrl;
        const secSigHtml = (secSig && secSig !== 'N/A' && secSig !== '-') ? `<img src="${window.getDirectDriveImageUrl(secSig)}" class="h-8 mx-auto rounded border cursor-pointer hover:scale-150 transition" onclick="window.openImageZoom('${secSig}')">` : '<span class="px-2 py-0.5 bg-gray-50 text-gray-400 border border-gray-100 rounded-[4px] text-[7px] font-bold uppercase whitespace-nowrap">No Sig</span>';
        const recSig = t.receivedSignatureUrl;
        const recSigHtml = (recSig && recSig !== 'N/A' && recSig !== '-') ? `<img src="${window.getDirectDriveImageUrl(recSig)}" class="h-8 mx-auto rounded border cursor-pointer hover:scale-150 transition" onclick="window.openImageZoom('${recSig}')">` : '<span class="px-2 py-0.5 bg-gray-50 text-gray-400 border border-gray-100 rounded-[4px] text-[7px] font-bold uppercase whitespace-nowrap">No Sig</span>';
        const barcode = t.assetBarcode || t.barcode || '-';
        tr.innerHTML = `<td class="p-2 font-mono font-bold text-indigo-600">${getVal(barcode)}</td><td class="p-2 max-w-[120px] truncate font-medium">${getVal(t.assetDescription || t.description)}</td><td class="p-2">${getVal(t.assetVendorName || t.vendorName)}</td><td class="p-2"><span class="px-2 py-0.5 bg-slate-100 rounded text-[8px] font-bold">${getVal(t.category)}</span></td><td class="p-2">${getVal(t.datePlaceInService || t.serviceDate)}</td><td class="p-2 max-w-[100px] truncate">${getVal(t.floorDiscretion || t.floorDescription)}</td><td class="p-2 text-center">${getVal(t.floorNo)}</td><td class="p-2 font-bold text-slate-700">${getVal(t.locationName || t.location)}</td><td class="p-2">${getVal(t.majorCategory)}</td><td class="p-2">${getVal(t.minorCategory || t.classification)}</td><td class="p-2 max-w-[120px] truncate">${getVal(t.schoolBuildingName || t.buildingName)}</td><td class="p-2 font-bold">${getVal(t.roomNumber || t.roomNo)}</td><td class="p-2 max-w-[100px] truncate">${getVal(t.roomName)}</td><td class="p-2">${getVal(t.subMinorCategory || t.roomBarcode)}</td><td class="p-2 text-center">${photoHtml}</td><td class="p-2 font-bold text-indigo-900">${getVal(t.collectorFullName || t.collectorName)}</td><td class="p-2">${getVal(t.companyName)}</td><td class="p-2 font-mono">${getVal(t.dateOfCollection || t.date)}</td><td class="p-2">${getVal(t.securityName || t.createdByName)}</td><td class="p-2">${getVal(t.receiverName || t.collectorFullName)}</td><td class="p-2 text-center">${secSigHtml}</td><td class="p-2 text-center">${recSigHtml}</td><td class="p-2 text-center">${proofHtml}</td><td class="p-2 text-center"><div class="flex items-center justify-center gap-2"><button onclick="window.revertAssetToRegister('${barcode}', '${t.transferId || ''}')" class="bg-indigo-50 text-indigo-600 px-2 py-1.5 rounded-lg font-bold text-[8px] hover:bg-indigo-600 hover:text-white transition shadow-sm uppercase flex items-center gap-1"><i class="fa-solid fa-rotate-left"></i> Revert</button>${target === 'transfers' && t.status !== 'Completed' && t.status !== 'Reverted' ? `<button onclick="window.completeAssetTransfer('${t.transferId}')" class="bg-emerald-600 text-white px-2 py-1.5 rounded-lg font-bold text-[8px] hover:bg-emerald-700 transition shadow-sm uppercase">Done</button>` : ''}</div></td>`;
        body.appendChild(tr);
    });
    if (window.setupPaginationUI) window.setupPaginationUI(tableId, filtered.length);
};

// ================================================
// SYSTEM CONFIGURATION: GOOGLE DRIVE
// ================================================
window.loadGoogleDriveConfig = async () => {
    const input = document.getElementById('driveUrlInput');
    const statusText = document.getElementById('driveStatusText');
    const statusDot = document.getElementById('driveStatusDot');
    if (!input || !statusText || !statusDot) return;
    try {
        statusText.innerText = "Status: Fetching...";
        const config = await window.driveConfigCache.getConfig(true);
        if (config && config.url) {
            input.value = config.url;
            statusText.innerText = config.enabled ? "Status: Connected" : "Status: Disabled";
            statusDot.className = config.enabled ? "w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" : "w-2 h-2 rounded-full bg-amber-500";
        } else {
            statusText.innerText = "Status: Not Configured";
            statusDot.className = "w-2 h-2 rounded-full bg-slate-300";
        }
    } catch (e) { statusText.innerText = "Status: Error Loading"; }
};

window.saveGoogleDriveConfig = async () => {
    const url = document.getElementById('driveUrlInput')?.value.trim();
    const btn = document.getElementById('saveDriveUrlBtn');
    if (!url || !url.startsWith('https://script.google.com/')) return alert("Invalid URL.");
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    try {
        await set(ref(db, UPLOAD_CONFIG.DRIVE_CONFIG_PATH), url);
        window.driveConfigCache.invalidate();
        alert("✅ Google Drive Link Updated Successfully!");
        window.loadGoogleDriveConfig();
    } catch (e) { alert("Failed to save config: " + e.message); }
    finally { btn.disabled = false; btn.innerHTML = originalText; }
};

// ================================================
// BULK DELETE & RECOVERY
// ================================================
window.bulkDeleteAssets = async () => {
    const selectedCount = window.selectedAssetKeys.size;
    if (selectedCount === 0) return alert("Please select assets to delete.");
    if (!confirm(`⚠️ Delete ${selectedCount} assets?`)) return;
    const btn = document.querySelector('button[onclick="window.bulkDeleteAssets()"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    try {
        const barcodes = Array.from(window.selectedAssetKeys);
        const BATCH_SIZE = 400;
        for (let i = 0; i < barcodes.length; i += BATCH_SIZE) {
            const chunk = barcodes.slice(i, i + BATCH_SIZE);
            const updates = {};
            chunk.forEach(barcode => { updates[`assets/${barcode}`] = null; });
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Deleting...`;
            await update(ref(db), updates);
        }
        window.triggerSuccessPopup(`${selectedCount} Assets Deleted!`);
        window.selectedAssetKeys.clear();
        await window.refreshDashboardData();
    } catch (e) { alert("Batch deletion failed: " + e.message); }
    finally { btn.disabled = false; btn.innerHTML = originalText; }
};

window.deleteAssetRecord = async (barcode) => {
    if (!confirm(`Delete asset ${barcode}?`)) return;
    try { await remove(ref(db, `assets/${barcode}`)); window.triggerSuccessPopup("Asset Deleted!"); window.refreshDashboardData(); } catch (e) { alert(e.message); }
};

window.recoverDisposedAsset = async (barcode) => {
    if (!confirm(`Restore ${barcode}?`)) return;
    try { await update(ref(db, `assets/${barcode}`), { assetStatus: 'Active', disposalReason: null, disposalDate: null }); window.triggerSuccessPopup("Asset Restored!"); window.refreshDashboardData(); } catch (e) { alert(e.message); }
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
window.downloadExcelReport = () => { if (typeof window._downloadExcelReport === 'function') window._downloadExcelReport(); else alert("Module Loading..."); };
window.exportTaskReportExcel = () => { if (typeof window._exportTaskReportExcel === 'function') window._exportTaskReportExcel(); else alert("Module Loading..."); };
window.downloadMasterAssetReport = () => { if (typeof window._downloadMasterAssetReport === 'function') window._downloadMasterAssetReport(); else alert("Module Loading..."); };
window.downloadDisposedAssetReport = () => { if (typeof window._downloadDisposedAssetReport === 'function') window._downloadDisposedAssetReport(); else alert("Module Loading..."); };
window.exportTransferReport = () => { if (typeof window._exportTransferReport === 'function') window._exportTransferReport(); else alert("Module Loading..."); };
console.log("✅ admin_module.js re-initialized");
