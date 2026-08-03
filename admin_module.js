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
            renderVisitorLogs(window.appCache.visitors || []);
            break;
        case 'tab-staff-logs':
            renderStaffAttendance(window.appCache.attendance || []);
            break;
        case 'tab-tasks':
            renderGlobalTaskAudit();
            break;
        case 'tab-staff-list':
            renderStaffDirectory();
            break;
        case 'tab-assets':
            if (window.appCache.assets.length === 0) {
                const body = document.getElementById('admin-asset-list-body');
                if (body) {
                    body.innerHTML = `
                        <tr>
                            <td colspan="20" class="p-8 text-center text-gray-400">
                                <i class="fa-solid fa-database text-4xl block mb-4"></i>
                                No assets found in database.
                                <button onclick="window.loadAdminDashboard()" class="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs">
                                    Refresh Data
                                </button>
                            </td>
                        </tr>
                    `;
                }
            } else {
                if (window.renderAdminAssetTable) {
                    window.renderAdminAssetTable(window.appCache.assets, 'assets');
                }
            }
            break;
        case 'tab-disposal':
            if (window.renderAdminAssetTable) {
                const disposed = window.appCache.assets.filter(a => a.assetStatus === 'Disposed' || a.disposalReason);
                window.renderAdminAssetTable(disposed, 'disposal');
            }
            break;
        case 'tab-transfers':
            if (window.renderTransferTable) {
                window.renderTransferTable(window.appCache.transfers);
            }
            break;
        case 'tab-my-tasks':
            if (typeof window.initRaisedTasksTracker === 'function') {
                window.initRaisedTasksTracker('admin-my-tasks-container');
            } else {
                console.warn("⚠️ initRaisedTasksTracker not loaded yet");
            }
            break;
        default:
            console.warn("⚠️ Unknown tab:", tabId);
    }

    // ✅ Pagination triggered after render
    setTimeout(() => {
        if (window.initAllPaginations) window.initAllPaginations();
    }, 200);
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

    data.forEach(v => {
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

    data.forEach(a => {
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
}

function renderGlobalTaskAudit() {
    const body = document.getElementById('admin-task-list-body');
    if (!body) return;
    body.innerHTML = '';

    const tasks = window.appCache.tasks || [];
    tasks.sort((a, b) => new Date(b.raisedTimestamp || 0) - new Date(a.raisedTimestamp || 0));

    if (tasks.length === 0) {
        body.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-gray-400">No tasks found</td></tr>`;
        return;
    }

    tasks.forEach(t => {
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

    staff.forEach(s => {
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
}

// ================================================
// ASSET TABLE RENDER - SINGLE SOURCE OF TRUTH
// ================================================
window.renderAdminAssetTable = (data, targetTable = 'both') => {
    try {
        console.log(`🎨 Rendering asset table: ${targetTable}, Data length: ${data?.length || 0}`);

        const body = document.getElementById('admin-asset-list-body');
        const disposalBody = document.getElementById('admin-disposal-list-body');

        if (!body && !disposalBody) {
            console.warn("⚠️ Asset table bodies not found in DOM");
            return;
        }

        if (body && (targetTable === 'both' || targetTable === 'assets')) {
            body.innerHTML = '';
        }
        if (disposalBody && (targetTable === 'both' || targetTable === 'disposal')) {
            disposalBody.innerHTML = '';
        }

        if (!data || data.length === 0) {
            const emptyMsg = `
                <tr>
                    <td colspan="20" class="p-8 text-center text-gray-400">
                        <i class="fa-solid fa-box-open text-4xl block mb-4"></i>
                        No assets found.
                        <button onclick="window.loadAdminDashboard()" class="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs">
                            Refresh Data
                        </button>
                    </td>
                </tr>
            `;
            if (body && (targetTable === 'both' || targetTable === 'assets')) {
                body.innerHTML = emptyMsg;
            }
            if (disposalBody && (targetTable === 'both' || targetTable === 'disposal')) {
                disposalBody.innerHTML = emptyMsg;
            }
            return;
        }

        const sampleRecord = data[0];
        const dynamicHeaders = Object.keys(sampleRecord).filter(k =>
            !['updatedAt', 'createdAt', 'assetBarcode', 'initialAuditPhotoData',
              'disposalPhotoData', 'assetStatus', 'auditPhotoUrl', 'disposalPhotoUrl',
              'initialAuditPhoto', 'disposalDamagedPhoto', 'audit_photo', 'beforePhotoUrl',
              'afterPhotoUrl', 'photoUrl', 'assetCondition', 'lastAuditTimestamp', 'lastAuditBy'].includes(k)
        );

        if (window.updateAssetTableHeaders && (targetTable === 'both' || targetTable === 'assets')) {
            window.updateAssetTableHeaders(dynamicHeaders);
        }

        data.forEach((a, index) => {
            const isDisposed = a.assetStatus === 'Disposed' || a.disposalReason;

            const barcode = a.assetBarcode ||
                           a['Asset Barcode'] ||
                           a['1. Asset Barcode'] ||
                           a.barcode ||
                           a.id ||
                           a.serialNo ||
                           `ASSET-${index}`;

            const initialPhotoUrl = a.auditPhotoUrl || a.audit_photo || a.beforePhotoUrl ||
                                   a.photoUrl || a.initialAuditPhoto ||
                                   (a.initialAuditPhotoData?.fileUrl);
            const damagePhotoUrl = a.disposalPhotoUrl || a.afterPhotoUrl ||
                                  a.disposalDamagedPhoto ||
                                  (a.disposalPhotoData?.fileUrl);

            const initialPhoto = window.getDirectDriveImageUrl(initialPhotoUrl);
            const damagePhoto = window.getDirectDriveImageUrl(damagePhotoUrl);

            if (isDisposed && disposalBody && (targetTable === 'both' || targetTable === 'disposal')) {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-red-50 border-b text-[11px]";
                tr.innerHTML = `
                    <td class="p-3 font-mono font-bold text-red-600">${barcode}</td>
                    <td class="p-3 font-bold">${a.assetDescription || a.modelDescription || a.classification || '-'}</td>
                    <td class="p-3">${a.vendorName || a.vendor || '-'}</td>
                    <td class="p-3"><span class="px-2 py-0.5 bg-red-50 text-red-600 rounded text-[9px] font-bold">${a.majorCategory || a.category || '-'}</span></td>
                    <td class="p-3">${a.serviceDate || a.datePlaceInService || '-'}</td>
                    <td class="p-3">${a.floorDescription || '-'}</td>
                    <td class="p-3">${a.floorNo || '-'}</td>
                    <td class="p-3 font-bold text-indigo-900">${a.locationName || a.location || '-'}</td>
                    <td class="p-3">${a.manufacturer || '-'}</td>
                    <td class="p-3">${a.modelDescription || a.model || '-'}</td>
                    <td class="p-3 font-mono">${a.roomBarcode || a.currentRoomBarcode || '-'}</td>
                    <td class="p-3">${a.roomName || '-'}</td>
                    <td class="p-3 font-bold">${a.roomNo || a.roomNumber || '-'}</td>
                    <td class="p-3">${a.buildingName || a.schoolBuilding || '-'}</td>
                    <td class="p-3 italic text-red-700 font-medium">${a.disposalReason || '-'}</td>
                    <td class="p-3">
                        <div class="flex flex-col">
                            <span class="font-black text-indigo-900">${a.disposedBy || a.lastAuditBy || '-'}</span>
                            <span class="text-[8px] opacity-40 uppercase">${a.disposalDate || a.lastAuditTimestamp || '-'}</span>
                        </div>
                    </td>
                    <td class="p-3">
                        <div class="flex gap-1 justify-center">
                            ${initialPhotoUrl ? `<img src="${initialPhoto}" class="h-8 w-8 object-cover rounded border" onclick="window.openImageZoom('${initialPhoto}')">` : '-'}
                            ${damagePhotoUrl ? `<img src="${damagePhoto}" class="h-8 w-8 object-cover rounded border border-red-200" onclick="window.openImageZoom('${damagePhoto}')">` : '-'}
                        </div>
                    </td>
                    <td class="p-3 text-center">
                        <button onclick="window.recoverDisposedAsset('${barcode}')" class="text-indigo-600 hover:text-indigo-800 transition" title="Recover Asset">
                            <i class="fa-solid fa-rotate-left"></i>
                        </button>
                    </td>
                `;
                disposalBody.appendChild(tr);
            }
            else if (!isDisposed && body && (targetTable === 'both' || targetTable === 'assets')) {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-indigo-50 border-b text-[11px]";

                let rowHtml = `<td class="p-3 text-center"><input type="checkbox" class="asset-checkbox" value="${barcode}"></td>`;

                dynamicHeaders.forEach(h => {
                    let val = a[h];
                    if (val === undefined || val === null || val === "") val = "-";
                    if (typeof val === 'string' && val.length > 50) val = val.substring(0, 50) + '...';
                    rowHtml += `<td class="p-3">${val}</td>`;
                });

                rowHtml += `
                    <td class="p-3 text-center">
                        ${initialPhotoUrl ? `<img src="${initialPhoto}" class="h-8 w-8 object-cover rounded border mx-auto cursor-pointer hover:scale-110 transition" onclick="window.openImageZoom('${initialPhoto}')">` : '-'}
                    </td>
                    <td class="p-3 text-center">
                        ${damagePhotoUrl ? `<img src="${damagePhoto}" class="h-8 w-8 object-cover rounded border border-red-200 mx-auto cursor-pointer hover:scale-110 transition" onclick="window.openImageZoom('${damagePhoto}')">` : '-'}
                    </td>
                    <td class="p-3 text-center">
                        <div class="flex items-center justify-center gap-2">
                            <button onclick="window.openEditAssetModal('${barcode}')" class="text-indigo-600 hover:text-indigo-800 transition" title="Edit Asset">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button onclick="window.deleteAssetRecord('${barcode}')" class="text-red-600 hover:text-red-800 transition" title="Delete Asset">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </td>
                `;
                tr.innerHTML = rowHtml;
                body.appendChild(tr);
            }
        });

        setTimeout(() => {
            if (window.initAllPaginations) window.initAllPaginations();
        }, 200);

    } catch (e) {
        console.error("❌ Error rendering asset table:", e);
    }
};

// ================================================
// TRANSFER TABLE RENDER
// ================================================
window.renderTransferTable = (transfers) => {
    const body = document.getElementById('transfer-logs-body');
    if (!body) return;
    body.innerHTML = '';

    if (!transfers || transfers.length === 0) {
        body.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-gray-400">No transfer records found</td></tr>';
        return;
    }

    transfers.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).forEach(t => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 border-b text-[11px]";

        const secSig = t.securitySignatureUrl ? `<img src="${window.getDirectDriveImageUrl(t.securitySignatureUrl)}" class="h-8 mx-auto rounded border cursor-pointer" onclick="window.openImageZoom('${t.securitySignatureUrl}')">` : '-';
        const recSig = t.receivedSignatureUrl ? `<img src="${window.getDirectDriveImageUrl(t.receivedSignatureUrl)}" class="h-8 mx-auto rounded border cursor-pointer" onclick="window.openImageZoom('${t.receivedSignatureUrl}')">` : '-';

        tr.innerHTML = `
            <td class="p-3 font-bold text-indigo-900">${t.transferId || t.id || "-"}</td>
            <td class="p-3 font-bold">${t.collectorName || "-"}</td>
            <td class="p-3 font-mono">${t.assetBarcode || "-"}</td>
            <td class="p-3 text-center">
                <div class="flex gap-2 justify-center">
                    <span title="Security">${secSig}</span>
                    <span title="Receiver">${recSig}</span>
                </div>
            </td>
            <td class="p-3 text-center">
                <button onclick="window.completeAssetTransfer('${t.transferId || t.id}')" class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold text-[9px] hover:bg-indigo-700 transition shadow-sm uppercase ${t.status === 'Completed' ? 'opacity-30 cursor-not-allowed' : ''}" ${t.status === 'Completed' ? 'disabled' : ''}>
                    ${t.status === 'Completed' ? 'Done' : 'Complete'}
                </button>
            </td>
        `;
        body.appendChild(tr);
    });
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
// FILTER FUNCTIONS
// ================================================
window.filterVisitorTable = () => {
    const q = document.getElementById('visitor-search')?.value?.toLowerCase() || '';
    const date = document.getElementById('visitor-date-filter')?.value || '';
    const filtered = window.appCache.visitors.filter(v => JSON.stringify(v).toLowerCase().includes(q) && (!date || v.date === new Date(date).toLocaleDateString('en-US')));
    renderVisitorLogs(filtered);
    setTimeout(() => window.initAllPaginations(), 100);
};

window.filterStaffTable = () => {
    const q = document.getElementById('staff-search')?.value?.toLowerCase() || '';
    const date = document.getElementById('staff-date-filter')?.value || '';
    const filtered = window.appCache.attendance.filter(a => JSON.stringify(a).toLowerCase().includes(q) && (!date || a.date === new Date(date).toLocaleDateString('en-US')));
    renderStaffAttendance(filtered);
    setTimeout(() => window.initAllPaginations(), 100);
};

window.filterAssetTable = () => {
    const q = document.getElementById('asset-search')?.value?.toLowerCase() || '';
    const filtered = window.appCache.assets.filter(a => (a.assetStatus !== 'Disposed' && !a.disposalReason) && JSON.stringify(a).toLowerCase().includes(q));
    window.renderAdminAssetTable(filtered, 'assets');
};

window.filterDisposalTable = () => {
    const q = document.getElementById('disposal-search')?.value?.toLowerCase() || '';
    const filtered = window.appCache.assets.filter(a => (a.assetStatus === 'Disposed' || a.disposalReason) && JSON.stringify(a).toLowerCase().includes(q));
    window.renderAdminAssetTable(filtered, 'disposal');
};

window.filterTransferTable = () => {
    const q = document.getElementById('transfer-search')?.value?.toLowerCase() || '';
    const filtered = window.appCache.transfers.filter(t => JSON.stringify(t).toLowerCase().includes(q));
    window.renderTransferTable(filtered);
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
