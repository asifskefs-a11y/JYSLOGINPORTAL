import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, get, set, update, remove, onValue, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================
// ADMIN DASHBOARD CORE MODULE
// ================================================

// Global state within Admin Module scope
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
        window.showGlobalSpinner("Fetching Remote Data...");

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

    } catch (e) {
        console.error("❌ Refresh Dashboard Error:", e);
    } finally {
        window.hideGlobalSpinner();
    }
};

window.autoMigrateLegacyData = async () => {
    // 1. Migrate Transfers
    const transfers = window.appCache.transfers;
    if (transfers && transfers.length > 0) {
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
                        const res = await window.uploadToDrive({ folderCategory: f.cat, fileName: `${f.name}_${t.assetBarcode}_${Date.now()}.png`, image: val });
                        if (res.status === 'success') { updates[f.key] = res.fileUrl; migrationCount++; }
                    } catch (err) {}
                }
            }
            if (Object.keys(updates).length > 0) {
                const trId = t.transferId || t.id;
                if (trId) await update(ref(db, `asset_transfers/${trId}`), updates);
            }
        }
        if (migrationCount > 0) console.log(`✅ Migrated ${migrationCount} legacy transfer items to Drive.`);
    }

    // 2. Migrate Staff Profiles
    const staffList = window.appCache.staff;
    if (staffList && staffList.length > 0) {
        let staffMigrationCount = 0;
        for (const s of staffList) {
            const val = s.profilePicUrl || s.photoUrl;
            if (val && typeof val === 'string' && val.startsWith('data:image')) {
                try {
                    const res = await window.uploadToDrive({
                        folderCategory: UPLOAD_CONFIG.CATEGORIES.PROFILE_PHOTOS,
                        fileName: `Migrated_Profile_${s.mobile || s.adekPass}_${Date.now()}.jpg`,
                        image: val
                    });
                    if (res.status === 'success') {
                        const updates = { profilePicUrl: res.fileUrl };
                        const mobile = s.mobile || s.mobileNumber;
                        if (mobile) {
                            await update(ref(db, `staff/${mobile}`), updates);
                            await update(ref(db, `users/${mobile}`), updates);
                            staffMigrationCount++;
                        }
                    }
                } catch (err) {}
            }
        }
        if (staffMigrationCount > 0) console.log(`✅ Migrated ${staffMigrationCount} legacy staff profiles to Drive.`);
    }
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
    window.showGlobalSpinner("Loading Dashboard...");
    setTimeout(() => {
        try {
            switch (tabId) {
                case 'tab-visitor-logs': renderVisitorLogs(window.currentFilteredData.visitors || window.appCache.visitors || []); break;
                case 'tab-staff-logs': renderStaffAttendance(window.currentFilteredData.staff || window.appCache.attendance || []); break;
                case 'tab-tasks': renderGlobalTaskAudit(window.currentFilteredData.tasks || window.appCache.tasks || []); break;
                case 'tab-staff-list': renderStaffDirectory(window.appCache.staff || []); break;
                case 'tab-assets':
                    const assets = window.currentFilteredData.assets || window.appCache.assets || [];
                    const detectedHeaders = assets.length > 0 ? Object.keys(assets[0]).filter(k => !['assetId', 'updatedAt', 'profilePicUrl', '_importBatch', '_forceId', '_importSource'].includes(k)) : [];
                    window.renderDynamicAssetTable(assets, detectedHeaders);
                    break;
                case 'tab-disposal': window.renderStandardizedAssetTable(window.currentFilteredData.disposal || window.appCache.assets.filter(a => a.assetStatus === 'Disposed'), 'disposal'); break;
                case 'tab-transfers': window.renderStandardizedAssetTable(window.currentFilteredData.transfers || window.appCache.transfers || [], 'transfers'); break;
                case 'tab-settings': window.loadGoogleDriveConfig(); break;
                case 'tab-my-tasks': if (typeof window.initRaisedTasksTracker === 'function') window.initRaisedTasksTracker('admin-my-tasks-container'); break;
            }
        } finally {
            window.hideGlobalSpinner();
        }
    }, 100);
};

// ================================================
// RENDER FUNCTIONS
// ================================================
function renderVisitorLogs(visitors) {
    const body = document.getElementById('visitor-logs-body');
    if (!body) return;

    const data = (visitors || []).sort((a, b) => new Date(b.date + ' ' + b.timeIn) - new Date(a.date + ' ' + a.timeIn));

    window.adminPaginators.visitors.init(data, (pageItems) => {
        body.innerHTML = '';
        if (pageItems.length === 0) {
            body.innerHTML = '<tr><td colspan="12" class="p-8 text-center text-gray-400">No records found</td></tr>';
            return;
        }

        pageItems.forEach(v => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition-colors border-b border-gray-100 text-[10px]";

            const sigHtml = v.signatureUrl ? `<img src="${window.getDirectDriveImageUrl(v.signatureUrl)}" class="h-8 w-16 object-contain mx-auto border rounded bg-white cursor-pointer" onclick="window.openImageZoom('${v.signatureUrl}')">` : "-";

            let keyHtml = '<span class="text-slate-300">❌ NO</span>';
            if (v.keyCollected === true || v.keyCollected === 'YES') {
                keyHtml = v.status === 'SIGNED OUT' ? '<span class="text-emerald-500 font-bold">✅ RETURNED</span>' : '<span class="text-amber-500 font-bold">🔑 HELD</span>';
            }

            tr.innerHTML = `
                <td class="p-4"><span class="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg font-bold">VISITOR</span></td>
                <td class="p-4 font-mono font-bold">${v.id || "-"}</td>
                <td class="p-4 font-bold text-slate-800">${v.name || "-"}</td>
                <td class="p-4">${v.mobile || "-"}</td>
                <td class="p-4">${v.company || "-"}</td>
                <td class="p-4 max-w-[120px] truncate">${v.purpose || "-"}</td>
                <td class="p-4">${v.date || "-"}</td>
                <td class="p-4 text-emerald-600 font-bold">${v.timeIn || "-"}</td>
                <td class="p-4 text-red-500 font-bold">${v.outTime || "-"}</td>
                <td class="p-4"><span class="status-badge ${v.status === 'SIGNED OUT' ? 'closed' : 'open'}">${v.status || "Active"}</span></td>
                <td class="p-4 text-center">${keyHtml}</td>
                <td class="p-4 text-center sticky-action-col bg-white">
                    <button onclick="window.openDetailedAuditModal('visitor', '${v.id}')" class="btn-eye-view mx-auto">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </td>
            `;
            body.appendChild(tr);
        });
    });
}

function renderStaffAttendance(attendance) {
    const body = document.getElementById('staff-attendance-body');
    if (!body) return;

    const data = (attendance || []).sort((a, b) => new Date(b.date + ' ' + (b.timeIn || '00:00')) - new Date(a.date + ' ' + (a.timeIn || '00:00')));

    window.adminPaginators.attendance.init(data, (pageItems) => {
        body.innerHTML = '';
        if (pageItems.length === 0) {
            body.innerHTML = '<tr><td colspan="10" class="p-8 text-center text-gray-400">No records found</td></tr>';
            return;
        }

        pageItems.forEach(a => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition-colors border-b border-gray-100 text-[10px]";

            const sigHtml = a.signatureUrl ? `<img src="${window.getDirectDriveImageUrl(a.signatureUrl)}" class="h-8 w-16 object-contain mx-auto border rounded bg-white cursor-pointer" onclick="window.openImageZoom('${a.signatureUrl}')">` : "-";

            let keyHtml = '<span class="px-2 py-1 bg-slate-100 text-slate-400 rounded-lg font-bold">❌ NONE</span>';
            if (a.keyStatus === 'HELD' || a.keyStatus === 'ISSUED_PENDING_RETURN') {
                const time = a.keyCollectTime ? new Date(a.keyCollectTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
                keyHtml = `<span class="px-2 py-1 bg-amber-50 text-amber-600 rounded-lg font-bold">🔑 HELD (${time})</span>`;
            } else if (a.keyStatus === 'RETURNED' || a.keyStatus === 'RETURNED_VERIFIED') {
                keyHtml = `<span class="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg font-bold">🔑 RETURNED (VERIFIED)</span>`;
            }

            tr.innerHTML = `
                <td class="p-4">
                    <div class="flex flex-col">
                        <span class="font-black text-indigo-900 uppercase">${a.name || "-"}</span>
                        <span class="text-[8px] font-bold text-slate-400 font-mono">${a.mobile || "-"}</span>
                    </div>
                </td>
                <td class="p-4">
                    <span class="font-black text-indigo-900 uppercase">${a.companyName || "N/A"}</span>
                    <span class="text-[8px] font-bold text-slate-400 block font-mono">ID: ${a.companyId || "N/A"}</span>
                </td>
                <td class="p-4">
                    <div class="flex flex-col gap-1">
                        <span class="font-bold text-slate-100 text-xs bg-slate-800/80 px-2 py-0.5 rounded w-fit">${a.branch || "School 1"}</span>
                        <span class="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider bg-emerald-950/60 px-2 py-0.5 rounded w-fit border border-emerald-800/50">${a.role || "Staff"}</span>
                    </div>
                </td>
                <td class="p-4 font-mono font-bold text-slate-500">${a.adekPass || "-"}</td>
                <td class="p-4 font-bold text-slate-400">${a.date || "-"}</td>
                <td class="p-4 text-emerald-600 font-black">${a.timeIn || "-"}</td>
                <td class="p-4 text-red-500 font-black">${a.checkOutTime || "-"}</td>
                <td class="p-4 text-center">${keyHtml}</td>
                <td class="p-4 text-center sticky-action-col bg-white">
                    <button onclick="window.openDetailedAuditModal('attendance', '${a.mobile}_${a.timestamp}')" class="btn-eye-view mx-auto">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </td>
                <td class="p-4 text-center">${sigHtml}</td>
            `;
            body.appendChild(tr);
        });
    });
}

function renderGlobalTaskAudit(tasks) {
    const body = document.getElementById('admin-task-list-body');
    if (!body) return;

    const data = (tasks || []).sort((a, b) => new Date(b.raisedTimestamp || 0) - new Date(a.raisedTimestamp || 0));

    window.adminPaginators.tasks.init(data, (pageItems) => {
        body.innerHTML = '';
        if (pageItems.length === 0) {
            body.innerHTML = '<tr><td colspan="10" class="p-8 text-center text-gray-400">No tasks found</td></tr>';
            return;
        }

        pageItems.forEach(t => {
            const bImg = window.getDirectDriveImageUrl(t.beforePhotoUrl || t.beforePhoto);
            const aImg = window.getDirectDriveImageUrl(t.afterPhotoUrl || t.afterPhoto);
            const tr = document.createElement('tr');
            tr.innerHTML = `<td class="p-3 font-mono text-indigo-600 font-bold">${t.id?.split('-')[1] || t.id || "-"}</td><td class="p-3">${t.assignedSchool || "-"}</td><td class="p-3 font-bold">${t.location || "-"}</td><td class="p-3 max-w-[150px] truncate">${t.details || "-"}</td><td class="p-3 uppercase text-[8px] font-black">${t.assignedRole || "-"}</td><td class="p-3"><div class="flex flex-col"><span class="font-bold">${t.raisedByName || "Admin"}</span><span class="text-[7px] opacity-50">${t.timestamp || ""}</span></div></td><td class="p-3 font-bold text-emerald-600">${t.solvedByName || "-"}</td><td class="p-3"><span class="status-badge ${(t.status || 'Open').toLowerCase()}">${t.status || "Open"}</span></td><td class="p-3 italic text-[8px]">${t.rejectionReason || "-"}</td><td class="p-3 text-center"><div class="flex gap-1 justify-center">${bImg.includes('http') ? `<img src="${bImg}" class="h-8 w-8 object-cover rounded border cursor-pointer" onclick="window.openImageZoom('${bImg}')">` : '<span class="text-gray-300 text-[8px]">No</span>'}${t.afterPhotoUrl ? `<img src="${aImg}" class="h-8 w-8 object-cover rounded border border-emerald-200 cursor-pointer" onclick="window.openImageZoom('${aImg}')">` : ''}</div></td>`;
            body.appendChild(tr);
        });
    });
}

// ================================================
// STAFF MANAGEMENT - DATA ALIGNMENT FIX
// ================================================
function renderStaffDirectory(staff) {
    const body = document.getElementById('admin-staff-list-body');
    if (!body) return;

    window.adminPaginators.directory.init(staff || [], (pageItems) => {
        body.innerHTML = '';
        if (pageItems.length === 0) {
            body.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-gray-400">No staff members found</td></tr>';
            return;
        }

        pageItems.forEach(s => {
            const profileImg = window.getDirectDriveImageUrl(s.profilePicUrl);
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition-colors border-b border-gray-100 text-[10px]";

            tr.innerHTML = `
                <td class="p-4 text-center">
                    <div class="w-10 h-10 rounded-full bg-slate-100 border overflow-hidden mx-auto shadow-sm">
                        <img src="${profileImg}" class="w-full h-full object-cover" onerror="this.src='https://ui-avatars.com/api/?name=${(s.fullName || s.name || 'U').replace(/ /g, '+')}&background=4f46e5&color=fff&size=40'">
                    </div>
                </td>
                <td class="p-4 font-black text-indigo-900 uppercase">${s.fullName || s.name || "-"}</td>
                <td class="p-4 font-mono font-bold text-slate-500">${s.password || "-"}</td>
                <td class="p-4 font-bold text-slate-600">${s.branch || s.school || "-"}</td>
                <td class="p-4 text-[10px] font-black uppercase text-indigo-400">${s.role || s.position || "-"}</td>
                <td class="p-4 font-bold text-slate-700">${s.companyName || "-"}</td>
                <td class="p-4 font-mono text-indigo-600 font-bold">${s.companyId || "-"}</td>
                <td class="p-4 font-mono font-bold text-slate-500">${s.mobile || "-"}</td>
                <td class="p-4 text-center sticky-action-col bg-white">
                    <div class="flex items-center justify-center gap-2">
                        <button onclick="window.openDetailedAuditModal('staff', '${s.mobile}')" class="btn-eye-view" title="View Profile"><i class="fa-solid fa-eye"></i></button>
                        <button onclick="window.openEditStaffModal('${s.mobile}')" class="p-2 text-indigo-400 hover:text-indigo-600 transition-colors" title="Edit Staff"><i class="fa-solid fa-user-pen"></i></button>
                    </div>
                </td>`;
            body.appendChild(tr);
        });
    });
}

// ============================================================
// DYNAMIC TABLE RENDERER
// ============================================================
// Redundant implementation in import_module.js is primary, but we'll ensure consistency here.
// Note: This function is also defined in import_module.js to handle post-import rendering.
window.renderAdminAssetTable = (data, targetTable = 'both') => {
    // Legacy fallback to support existing calls if any
    const headers = data.length > 0 ? Object.keys(data[0]).filter(k => !['assetId', 'updatedAt', 'profilePicUrl', '_importBatch', '_forceId', '_importSource'].includes(k)) : [];
    if (window.renderDynamicAssetTable) window.renderDynamicAssetTable(data, headers);
};

window.renderStandardizedAssetTable = (data, target) => {
    const body = target === 'disposal' ? document.getElementById('admin-disposal-list-body') : document.getElementById('transfer-logs-body');
    if (!body) return;

    const getVal = (val) => (val === undefined || val === null || val === "" || val === "N/A" || val === "undefined") ? '-' : val;
    const filtered = (data || []).filter(t => target === 'disposal' ? t.assetStatus === 'Disposed' : ['Transferred', 'In-Transit', 'Completed'].includes(t.status || t.assetStatus));
    filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const paginator = target === 'disposal' ? window.adminPaginators.disposal : window.adminPaginators.transfers;

    paginator.init(filtered, (pageItems) => {
        body.innerHTML = '';
        if (pageItems.length === 0) {
            body.innerHTML = '<tr><td colspan="26" class="p-8 text-center text-gray-400">No records found</td></tr>';
            return;
        }

        pageItems.forEach(t => {
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
            tr.innerHTML = `
                <td class="p-2 font-mono font-bold text-indigo-600">${getVal(barcode)}</td>
                <td class="p-2 max-w-[120px] truncate font-medium">${getVal(t.assetDescription || t.description)}</td>
                <td class="p-2">${getVal(t.assetVendorName || t.vendor)}</td>
                <td class="p-2"><span class="px-2 py-0.5 bg-slate-100 rounded text-[8px] font-bold">${getVal(t.category)}</span></td>
                <td class="p-2">${getVal(t.datePlaceInService || t.serviceDate)}</td>
                <td class="p-2 max-w-[100px] truncate">${getVal(t.floorDiscretion || t.floorDesc)}</td>
                <td class="p-2 text-center">${getVal(t.floorNo)}</td>
                <td class="p-2 font-bold text-slate-700">${getVal(t.locationName || t.location)}</td>
                <td class="p-2">${getVal(t.majorCategory)}</td>
                <td class="p-2">${getVal(t.minorCategory || t.classification)}</td>
                <td class="p-2 max-w-[120px] truncate">${getVal(t.schoolBuildingName || t.building)}</td>
                <td class="p-2 font-bold">${getVal(t.roomNumber || t.roomNo)}</td>
                <td class="p-2 max-w-[100px] truncate">${getVal(t.roomName)}</td>
                <td class="p-2">${getVal(t.subMinorCategory)}</td>
                <td class="p-2 text-center">${photoHtml}</td>
                <td class="p-2 font-bold text-indigo-900">${getVal(t.collectorName)}</td>
                <td class="p-2">${getVal(t.companyName)}</td>
                <td class="p-2 font-mono">${getVal(t.date)}</td>
                <td class="p-2">${getVal(t.securityName)}</td>
                <td class="p-2">${getVal(t.receiverName)}</td>
                <td class="p-2 text-center">${secSigHtml}</td>
                <td class="p-2 text-center">${recSigHtml}</td>
                <td class="p-2 text-center">${proofHtml}</td>
                <td class="p-2 text-center">
                    <div class="flex items-center justify-center gap-2">
                        <button onclick="window.openTransferDetailsModal('${t.transferId || t.id}')" class="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="View Details"><i class="fa-solid fa-eye"></i></button>
                        <button onclick="window.revertAssetToRegister('${barcode}', '${t.transferId || ''}')" class="bg-indigo-50 text-indigo-600 px-2 py-1.5 rounded-lg font-bold text-[8px] hover:bg-indigo-600 hover:text-white transition shadow-sm uppercase flex items-center gap-1"><i class="fa-solid fa-rotate-left"></i> Revert</button>
                        ${target === 'transfers' && t.status !== 'Completed' && t.status !== 'Reverted' ? `<button onclick="window.completeAssetTransfer('${t.transferId}')" class="bg-emerald-600 text-white px-2 py-1.5 rounded-lg font-bold text-[8px] hover:bg-emerald-700 transition shadow-sm uppercase">Done</button>` : ''}
                    </div>
                </td>`;
            body.appendChild(tr);
        });
    });
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
    if (!url || !url.startsWith('https://script.google.com/')) return alert("Invalid URL.");

    window.showLoader();
    try {
        await set(ref(db, UPLOAD_CONFIG.DRIVE_CONFIG_PATH), url);
        window.driveConfigCache.invalidate();
        alert("✅ Google Drive Link Updated Successfully!");
        window.loadGoogleDriveConfig();
    } catch (e) { alert("Failed to save config: " + e.message); }
    finally { window.hideLoader(); }
};

// ================================================
// BULK DELETE & RECOVERY
// ================================================
window.bulkDeleteAssets = async () => {
    const selectedCount = window.selectedAssetKeys.size;
    if (selectedCount === 0) return alert("Please select assets to delete.");
    if (!confirm(`⚠️ Delete ${selectedCount} assets?`)) return;

    window.showLoader();
    try {
        const barcodes = Array.from(window.selectedAssetKeys);
        const BATCH_SIZE = 400;
        for (let i = 0; i < barcodes.length; i += BATCH_SIZE) {
            const chunk = barcodes.slice(i, i + BATCH_SIZE);
            const updates = {};
            chunk.forEach(barcode => { updates[`assets/${barcode}`] = null; });
            await update(ref(db), updates);
        }
        window.triggerSuccessPopup(`${selectedCount} Assets Deleted!`);
        window.selectedAssetKeys.clear();
        await window.refreshDashboardData();
    } catch (e) { alert("Batch deletion failed: " + e.message); }
    finally { window.hideLoader(); }
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

    // BUILD DYNAMIC HEADER (<thead>) - NO HARDCODING
    let html = '<th class="p-4 text-center sticky left-0 bg-slate-50 z-20 border-b-2 border-r shadow-sm"><input type="checkbox" onchange="window.toggleAllAssetCheckboxes(this)" class="selectAllAssets"></th>';

    dynamicHeaders.forEach(h => {
        // Human-friendly header formatting (e.g. assetDescription or _Room_Number -> Asset Description / Room Number)
        let label = h.replace(/^_+/, '').replace(/_/g, ' ');
        label = label.charAt(0).toUpperCase() + label.slice(1).replace(/([A-Z])/g, ' $1').trim();

        html += `<th class="p-4 whitespace-nowrap text-[10px] font-black uppercase text-indigo-600 border-b-2 border-r shadow-sm">${label}</th>`;
    });

    html += '<th class="p-4 text-center border-b-2 shadow-sm">Action</th>';
    head.innerHTML = html;
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
        <div class="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">

            <!-- Header -->
            <div class="p-5 bg-slate-800 text-white flex justify-between items-center flex-shrink-0">
                <h3 class="text-base font-bold uppercase tracking-wider flex items-center gap-2">
                    <i class="fa-solid fa-user-plus text-indigo-400"></i> Add New Staff
                </h3>
                <button type="button" onclick="document.getElementById('add-staff-modal').style.display='none'; document.getElementById('add-staff-modal').classList.add('hidden');" class="w-8 h-8 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-colors">
                    <i class="fa-solid fa-xmark text-lg"></i>
                </button>
            </div>

            <!-- Form Body (Scrollable for smaller screens) -->
            <form id="add-staff-form" class="p-6 space-y-4 overflow-y-auto flex-1" onsubmit="event.preventDefault(); event.stopPropagation(); if(window.submitAddStaff) window.submitAddStaff(event); return false;">

                <!-- Profile Photo Upload Block -->
                <div class="flex items-center gap-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                    <div id="add-staff-photo-preview" class="w-16 h-16 rounded-full bg-slate-200 overflow-hidden flex-shrink-0 border-2 border-white shadow-md flex items-center justify-center">
                        <i class="fa-solid fa-user text-slate-400 text-2xl"></i>
                    </div>
                    <div class="flex-1">
                        <label class="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Profile Photo (Optional)</label>
                        <input type="file" id="staff-photo-input" accept="image/*" class="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 cursor-pointer" onchange="window.previewStaffPhoto(this, 'add-staff-photo-preview')">
                    </div>
                </div>

                <!-- Form Inputs -->
                <div>
                    <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">Full Name *</label>
                    <input type="text" id="staff-fullname" placeholder="Enter Full Name" required class="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-indigo-600 focus:bg-white transition-all">
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">Mobile Number *</label>
                        <input type="tel" id="staff-mobile" placeholder="e.g. 0501234567" required class="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-indigo-600 focus:bg-white transition-all">
                    </div>
                    <div>
                        <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">ADEK Pass Number *</label>
                        <input type="text" id="staff-adek" placeholder="ADEK-2024-001" required class="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-indigo-600 focus:bg-white transition-all">
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">Assigned School *</label>
                        <select id="staff-school" required class="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-indigo-600 focus:bg-white transition-all">
                            <option value="Jern Yafoor School 1">Jern Yafoor School 1</option>
                            <option value="Jern Yafoor School 2">Jern Yafoor School 2</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">Staff Role *</label>
                        <select id="staff-role" required class="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-indigo-600 focus:bg-white transition-all">
                            <option value="Cleaner">Cleaner</option>
                            <option value="Cleaner Leader">Cleaner Leader</option>
                            <option value="Security">Security</option>
                            <option value="Technician">Technician</option>
                            <option value="Admin">Admin</option>
                        </select>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">Company Name</label>
                        <input type="text" id="staff-company-name" placeholder="Enter Company Name" class="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-indigo-600 focus:bg-white transition-all">
                    </div>
                    <div>
                        <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">Company ID</label>
                        <input type="text" id="staff-company-id" placeholder="Enter Company ID" class="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-indigo-600 focus:bg-white transition-all">
                    </div>
                </div>

                <div>
                    <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">Password *</label>
                    <input type="password" id="staff-password" placeholder="Set Access Password" required minlength="6" class="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-indigo-600 focus:bg-white transition-all">
                </div>

                <!-- Submit Button -->
                <div class="pt-2">
                    <button type="submit" id="add-staff-submit-btn" class="w-full py-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white rounded-xl font-bold uppercase tracking-wider shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2">
                        <i class="fa-solid fa-check"></i> Register Staff
                    </button>
                </div>
            </form>
        </div>
    `;
};

window.previewStaffPhoto = (input, previewId) => {
    const preview = document.getElementById(previewId);
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover">`;
        };
        reader.readAsDataURL(input.files[0]);
    }
};

async function submitAddStaff(event) {
    if (event) event.preventDefault();
    const submitBtn = document.getElementById('add-staff-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
        const fullName = document.getElementById('staff-fullname')?.value.trim();
        const mobile = document.getElementById('staff-mobile')?.value.trim();
        const adek = document.getElementById('staff-adek')?.value.trim();
        const school = document.getElementById('staff-school')?.value;
        const role = document.getElementById('staff-role')?.value;
        const companyName = document.getElementById('staff-company-name')?.value.trim();
        const companyId = document.getElementById('staff-company-id')?.value.trim();
        const password = document.getElementById('staff-password')?.value;
        const photoInput = document.getElementById('staff-photo-input');

        let profilePicUrl = "";

        // DEBUG LOGS
        console.log("🛠️ submitAddStaff Triggered");
        console.log("📱 Mobile:", mobile);
        console.log("📸 Photo Input Element:", photoInput);

        // Attempt Google Drive Upload Safely
        if (photoInput && photoInput.files && photoInput.files[0]) {
            console.log("📸 Image File Detected:", photoInput.files[0]);
            try {
                const file = photoInput.files[0];
                const base64Image = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.readAsDataURL(file);
                });

                console.log("📦 Base64 Generated (first 50 chars):", base64Image.substring(0, 50));

                if (window.uploadToDrive) {
                    console.log("🚀 Calling window.uploadToDrive...");
                    const uploadRes = await window.uploadToDrive({
                        image: base64Image,
                        category: 'PROFILE_PHOTOS',
                        fileName: `staff_${Date.now()}.png`
                    });
                    console.log("🚀 Drive Result:", uploadRes);
                    if (uploadRes && uploadRes.status === 'success') {
                        profilePicUrl = uploadRes.fileUrl;
                    } else {
                        console.warn("❌ uploadToDrive returned failure status:", uploadRes);
                    }
                } else {
                    console.error("❌ window.uploadToDrive is NOT defined!");
                }
            } catch (imgErr) {
                console.error("⚠️ Image upload process crashed:", imgErr);
            }
        } else {
            console.log("❓ No photo selected or photoInput missing.");
        }

        // Generate Staff ID & Payload
        const staffId = 'STAFF_' + Date.now();
        const staffData = {
            staffId: staffId,
            fullName: fullName,
            mobile: mobile,
            adekPass: adek,
            school: school,
            branch: school,
            role: role,
            position: role,
            companyName: companyName,
            companyId: companyId,
            password: password,
            profilePicUrl: profilePicUrl,
            createdAt: new Date().toISOString()
        };

        console.log("💾 Saving to Firebase:", staffData);

        // Save directly to Firebase Realtime Database
        await set(ref(db, 'staff/' + mobile), staffData);
        await set(ref(db, 'users/' + mobile), staffData);

        alert("✅ Staff Registered Successfully!");
        document.getElementById('add-staff-form')?.reset();
        const modal = document.getElementById('add-staff-modal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.add('hidden');
        }
        window.refreshDashboardData();

    } catch (error) {
        console.error("❌ Registration Error:", error);
        alert("Registration Failed: " + error.message);
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

window.submitAddStaff = submitAddStaff;

window.openEditStaffModal = async (mobile) => {
    const snap = await get(ref(db, 'staff/' + mobile));
    if (!snap.exists()) return alert("Staff not found");
    const s = snap.val();
    const modal = document.getElementById('edit-staff-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    const profileImg = window.getDirectDriveImageUrl(s.profilePicUrl);

    modal.innerHTML = `
        <div class="bg-white w-full max-w-lg rounded-[40px] overflow-hidden shadow-2xl">
            <div class="p-6 bg-indigo-600 text-white flex justify-between items-center">
                <h3 class="text-lg font-bold uppercase tracking-tight">Edit Staff</h3>
                <button onclick="document.getElementById('edit-staff-modal').classList.add('hidden')"><i class="fa-solid fa-xmark text-xl"></i></button>
            </div>
            <form id="edit-staff-form" class="p-8 space-y-4" onsubmit="event.preventDefault(); event.stopPropagation(); if(window.submitEditStaff) window.submitEditStaff(event, '${mobile}'); return false;">
                <div class="flex items-center gap-4 p-4 bg-slate-50 border-2 rounded-2xl">
                    <div id="edit-staff-photo-preview" class="w-16 h-16 rounded-full bg-slate-200 overflow-hidden flex-shrink-0 border-2 border-white shadow-sm">
                        <img src="${profileImg}" class="w-full h-full object-cover" onerror="this.src='https://ui-avatars.com/api/?name=${s.name || 'U'}&background=4f46e5&color=fff&size=64'">
                    </div>
                    <div class="flex-1">
                        <label class="block text-[10px] font-black text-slate-400 uppercase mb-1">Change Profile Photo</label>
                        <input type="file" id="edit-staff-photo-input" accept="image/*" class="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100" onchange="window.previewStaffPhoto(this, 'edit-staff-photo-preview')">
                    </div>
                </div>
                <input type="text" id="edit-fullname" value="${s.name || ''}" required class="w-full p-4 bg-slate-50 border-2 rounded-2xl">
                <input type="text" id="edit-adek" value="${s.adekPass || s.adcPassNumber || ''}" required class="w-full p-4 bg-slate-50 border-2 rounded-2xl">
                <select id="edit-school" class="w-full p-4 bg-slate-50 border-2 rounded-2xl">
                    <option value="Jern Yafoor School 1" ${s.branch==='Jern Yafoor School 1'?'selected':''}>Jern Yafoor School 1</option>
                    <option value="Jern Yafoor School 2" ${s.branch==='Jern Yafoor School 2'?'selected':''}>Jern Yafoor School 2</option>
                </select>
                <select id="edit-role" class="w-full p-4 bg-slate-50 border-2 rounded-2xl">
                    <option value="Cleaner" ${s.role==='Cleaner'?'selected':''}>Cleaner</option>
                    <option value="Cleaner Leader" ${s.role==='Cleaner Leader'?'selected':''}>Cleaner Leader</option>
                    <option value="Security" ${s.role==='Security'?'selected':''}>Security</option>
                    <option value="Technician" ${s.role==='Technician'?'selected':''}>Technician</option>
                    <option value="Admin" ${s.role==='Admin'?'selected':''}>Admin</option>
                </select>
                <input type="password" id="edit-password" placeholder="New Password (Optional)" class="w-full p-4 bg-slate-50 border-2 rounded-2xl">
                <button type="submit" id="edit-staff-submit-btn" class="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest">Update Staff</button>
            </form>
        </div>
    `;
};

window.submitEditStaff = async (e, mobile) => {
    e.preventDefault();
    window.showLoader();

    const updates = {
        name: document.getElementById('edit-fullname').value,
        fullName: document.getElementById('edit-fullname').value,
        adekPass: document.getElementById('edit-adek').value,
        adcPassNumber: document.getElementById('edit-adek').value,
        branch: document.getElementById('edit-school').value,
        schoolName: document.getElementById('edit-school').value,
        role: document.getElementById('edit-role').value,
        position: document.getElementById('edit-role').value,
        updatedAt: new Date().toISOString()
    };

    const newPass = document.getElementById('edit-password').value;
    if (newPass) updates.password = newPass;

    const photoInput = document.getElementById('edit-staff-photo-input');

    try {
        // 1. ASYNC UPLOAD WITH STRICT VALIDATION
        if (photoInput.files && photoInput.files[0]) {
            const base64 = await window.compressImageFile(photoInput.files[0], 500, 500, 0.7);
            const uploadRes = await window.uploadToDrive({
                category: UPLOAD_CONFIG.CATEGORIES.PROFILE_PHOTOS,
                fileName: `Profile_${mobile}.jpg`,
                image: base64
            });

            if (uploadRes.status === 'success' && uploadRes.fileUrl) {
                updates.profilePicUrl = uploadRes.fileUrl;
            } else {
                console.warn("⚠️ Drive Sync failed for edit, proceeding with other updates.");
            }
        }

        // 2. PRESERVE EXISTING DATA
        // Firebase update() will only update the fields provided in the object.
        // Since profilePicUrl is NOT in the 'updates' object unless a new photo was uploaded,
        // the existing URL in the database is automatically preserved.

        // 3. DATABASE TARGET CONFIRMATION
        await update(ref(db, 'staff/' + mobile), updates);
        await update(ref(db, 'users/' + mobile), updates);

        alert("✅ Staff record updated successfully!");
        document.getElementById('edit-staff-modal').classList.add('hidden');
        window.refreshDashboardData();
    } catch (e) {
        console.error("Update Error:", e);
        alert("❌ Update Error: " + e.message);
    } finally {
        window.hideLoader();
    }
};

/**
 * EYE BUTTON - VIEW STAFF PROFILE POPUP
 */
window.openStaffDetailsModal = async (mobile) => {
    const snap = await get(ref(db, 'staff/' + mobile));
    if (!snap.exists()) return alert("Staff record not found");
    const s = snap.val();
    const modal = document.getElementById('view-staff-modal');
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    const profileImg = window.getDirectDriveImageUrl(s.profilePicUrl);

    modal.innerHTML = `
        <div class="bg-white w-full max-w-2xl rounded-[40px] overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] fade-in">
            <!-- Modal Header -->
            <div class="p-6 bg-gradient-to-r from-indigo-600 to-indigo-800 text-white flex justify-between items-center flex-shrink-0">
                <div>
                    <h3 class="text-xl font-black uppercase tracking-tight">Staff Profile</h3>
                    <p class="text-[10px] text-white/60 font-bold uppercase tracking-widest mt-1">Full Detailed Identity</p>
                </div>
                <button onclick="document.getElementById('view-staff-modal').classList.add('hidden'); document.getElementById('view-staff-modal').style.display='none';" class="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                    <i class="fa-solid fa-xmark text-lg"></i>
                </button>
            </div>

            <!-- Modal Body -->
            <div class="p-8 overflow-y-auto flex-1 bg-slate-50">
                <div class="flex flex-col md:flex-row gap-8 items-start">
                    <!-- Photo Column -->
                    <div class="w-full md:w-48 flex-shrink-0">
                        <div class="w-48 h-48 rounded-[32px] overflow-hidden border-4 border-white shadow-xl bg-white mx-auto">
                            <img src="${profileImg}" class="w-full h-full object-cover" onerror="this.src='https://ui-avatars.com/api/?name=${s.fullName || s.name || 'U'}&background=4f46e5&color=fff&size=192'">
                        </div>
                        <div class="mt-4 text-center">
                            <span class="px-4 py-1.5 bg-emerald-100 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">
                                <i class="fa-solid fa-circle text-[6px] mr-1 animate-pulse"></i> Active Profile
                            </span>
                        </div>
                    </div>

                    <!-- Details Column -->
                    <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div class="detail-item bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1 block">Full Name</label>
                            <p class="text-sm font-black text-indigo-900">${s.fullName || s.name || "-"}</p>
                        </div>
                        <div class="detail-item bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1 block">Staff ID</label>
                            <p class="text-sm font-black text-slate-700 font-mono">${s.staffId || "-"}</p>
                        </div>
                        <div class="detail-item bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1 block">Mobile Number</label>
                            <p class="text-sm font-black text-slate-700 font-mono">${s.mobile || "-"}</p>
                        </div>
                        <div class="detail-item bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1 block">ADEK Pass No.</label>
                            <p class="text-sm font-black text-slate-700 font-mono">${s.adekPass || s.adcPassNumber || "-"}</p>
                        </div>
                        <div class="detail-item bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1 block">Assigned School</label>
                            <p class="text-sm font-black text-slate-700">${s.branch || s.school || "-"}</p>
                        </div>
                        <div class="detail-item bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1 block">Designation / Role</label>
                            <p class="text-sm font-black text-slate-700 uppercase">${s.role || s.position || "-"}</p>
                        </div>
                        <div class="detail-item bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1 block">Company Name</label>
                            <p class="text-sm font-black text-slate-700">${s.companyName || "-"}</p>
                        </div>
                        <div class="detail-item bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1 block">Company ID</label>
                            <p class="text-sm font-black text-slate-700 font-mono">${s.companyId || "-"}</p>
                        </div>
                        <div class="detail-item bg-white p-4 rounded-2xl border border-slate-100 shadow-sm col-span-full">
                            <label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1 block">Profile Created At</label>
                            <p class="text-xs font-bold text-slate-400 italic">${s.createdAt ? new Date(s.createdAt).toLocaleString() : "-"}</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal Footer -->
            <div class="p-6 border-t bg-white flex justify-end">
                <button onclick="document.getElementById('view-staff-modal').classList.add('hidden'); document.getElementById('view-staff-modal').style.display='none';" class="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-200 active:scale-95 transition-all">
                    Close Profile
                </button>
            </div>
        </div>
    `;
};

/**
 * EYE BUTTON - VIEW TRANSFER DETAILS MODAL
 */
window.openTransferDetailsModal = async (transferId) => {
    const snap = await get(ref(db, 'asset_transfers/' + transferId));
    if (!snap.exists()) return alert("Transfer record not found");
    const t = snap.val();
    const modal = document.getElementById('view-transfer-modal');
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    const getVal = (val) => (val === undefined || val === null || val === "" || val === "N/A" || val === "undefined") ? '-' : val;

    modal.innerHTML = `
        <div class="bg-white w-full max-w-3xl rounded-[40px] overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] fade-in">
            <div class="p-6 bg-gradient-to-r from-indigo-600 to-indigo-800 text-white flex justify-between items-center flex-shrink-0">
                <div>
                    <h3 class="text-xl font-black uppercase tracking-tight">Transfer Details</h3>
                    <p class="text-[10px] text-white/60 font-bold uppercase tracking-widest mt-1">Full Transaction Log</p>
                </div>
                <button onclick="document.getElementById('view-transfer-modal').classList.add('hidden'); document.getElementById('view-transfer-modal').style.display='none';" class="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                    <i class="fa-solid fa-xmark text-lg"></i>
                </button>
            </div>

            <div class="p-8 overflow-y-auto flex-1 bg-slate-50">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <!-- Section: Asset Info -->
                    <div class="space-y-4">
                        <h4 class="text-indigo-600 font-black text-xs uppercase tracking-widest border-b pb-2">Asset Metadata</h4>
                        <div class="grid grid-cols-2 gap-3">
                            <div class="p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                                <label class="text-[8px] font-black text-slate-400 block uppercase">Barcode</label>
                                <p class="text-xs font-black text-indigo-900 font-mono">${getVal(t.assetBarcode || t.barcode)}</p>
                            </div>
                            <div class="p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                                <label class="text-[8px] font-black text-slate-400 block uppercase">Category</label>
                                <p class="text-xs font-bold text-slate-700">${getVal(t.category)}</p>
                            </div>
                            <div class="p-3 bg-white rounded-xl border border-slate-100 shadow-sm col-span-2">
                                <label class="text-[8px] font-black text-slate-400 block uppercase">Description</label>
                                <p class="text-xs font-bold text-slate-700">${getVal(t.assetDescription || t.description)}</p>
                            </div>
                            <div class="p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                                <label class="text-[8px] font-black text-slate-400 block uppercase">Model</label>
                                <p class="text-xs font-bold text-slate-700">${getVal(t.modelDescription || t.model)}</p>
                            </div>
                            <div class="p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                                <label class="text-[8px] font-black text-slate-400 block uppercase">Condition</label>
                                <p class="text-xs font-bold text-slate-700">${getVal(t.assetCondition || t.condition)}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Section: Personnel & Location -->
                    <div class="space-y-4">
                        <h4 class="text-indigo-600 font-black text-xs uppercase tracking-widest border-b pb-2">Transaction Info</h4>
                        <div class="grid grid-cols-2 gap-3">
                            <div class="p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                                <label class="text-[8px] font-black text-slate-400 block uppercase">Collector</label>
                                <p class="text-xs font-black text-indigo-900">${getVal(t.collectorName)}</p>
                            </div>
                            <div class="p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                                <label class="text-[8px] font-black text-slate-400 block uppercase">Security/Sender</label>
                                <p class="text-xs font-bold text-slate-700">${getVal(t.securityName)}</p>
                            </div>
                            <div class="p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                                <label class="text-[8px] font-black text-slate-400 block uppercase">Receiver</label>
                                <p class="text-xs font-bold text-slate-700">${getVal(t.receiverName)}</p>
                            </div>
                            <div class="p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                                <label class="text-[8px] font-black text-slate-400 block uppercase">Status</label>
                                <p class="text-xs font-black text-emerald-600 uppercase">${getVal(t.status)}</p>
                            </div>
                            <div class="p-3 bg-white rounded-xl border border-slate-100 shadow-sm col-span-2">
                                <label class="text-[8px] font-black text-slate-400 block uppercase">From Location</label>
                                <p class="text-xs font-bold text-slate-700">${getVal(t.locationName || t.location)} | ${getVal(t.schoolBuildingName || t.building)}</p>
                            </div>
                            <div class="p-3 bg-white rounded-xl border border-slate-100 shadow-sm col-span-2">
                                <label class="text-[8px] font-black text-slate-400 block uppercase">Timestamp</label>
                                <p class="text-xs font-bold text-slate-700">${getVal(t.date)} | ${t.timestamp ? new Date(t.timestamp).toLocaleTimeString() : '-'}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Section: Media -->
                    <div class="col-span-full grid grid-cols-3 gap-4 mt-4">
                        <div class="space-y-2">
                            <label class="text-[8px] font-black text-slate-400 block uppercase text-center">Audit Photo</label>
                            <div class="h-32 bg-white rounded-2xl border-2 border-slate-100 overflow-hidden shadow-sm">
                                <img src="${window.getDirectDriveImageUrl(t.auditPhoto || t.photoUrl)}" class="w-full h-full object-cover cursor-pointer" onclick="window.openImageZoom('${t.auditPhoto || t.photoUrl}')" onerror="this.src='https://placehold.co/200x200/e2e8f0/64748b?text=No+Photo'">
                            </div>
                        </div>
                        <div class="space-y-2">
                            <label class="text-[8px] font-black text-slate-400 block uppercase text-center">Security Sig</label>
                            <div class="h-32 bg-white rounded-2xl border-2 border-slate-100 overflow-hidden shadow-sm flex items-center justify-center p-2">
                                <img src="${window.getDirectDriveImageUrl(t.securitySignatureUrl)}" class="max-w-full max-h-full object-contain cursor-pointer" onclick="window.openImageZoom('${t.securitySignatureUrl}')" onerror="this.src='https://placehold.co/200x200/e2e8f0/64748b?text=No+Sig'">
                            </div>
                        </div>
                        <div class="space-y-2">
                            <label class="text-[8px] font-black text-slate-400 block uppercase text-center">Receiver Sig</label>
                            <div class="h-32 bg-white rounded-2xl border-2 border-slate-100 overflow-hidden shadow-sm flex items-center justify-center p-2">
                                <img src="${window.getDirectDriveImageUrl(t.receivedSignatureUrl)}" class="max-w-full max-h-full object-contain cursor-pointer" onclick="window.openImageZoom('${t.receivedSignatureUrl}')" onerror="this.src='https://placehold.co/200x200/e2e8f0/64748b?text=No+Sig'">
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="p-6 border-t bg-white flex justify-end">
                <button onclick="document.getElementById('view-transfer-modal').classList.add('hidden'); document.getElementById('view-transfer-modal').style.display='none';" class="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all">
                    Close Details
                </button>
            </div>
        </div>
    `;
};

window.filterVisitorTable = () => {
    const query = document.getElementById('visitor-search')?.value.toLowerCase();
    const date = document.getElementById('visitor-date-filter')?.value;

    let filtered = window.appCache.visitors;
    if (query) {
        filtered = filtered.filter(v =>
            (v.name || '').toLowerCase().includes(query) ||
            (v.id || '').toLowerCase().includes(query) ||
            (v.mobile || '').includes(query)
        );
    }
    if (date) {
        filtered = filtered.filter(v => v.date === new Date(date).toLocaleDateString('en-US'));
    }

    window.currentFilteredData.visitors = filtered;
    renderVisitorLogs(filtered);
};

window.filterStaffTable = () => {
    const query = document.getElementById('staff-search')?.value.toLowerCase();
    const date = document.getElementById('staff-date-filter')?.value;

    let filtered = window.appCache.attendance;
    if (query) {
        filtered = filtered.filter(a =>
            (a.name || '').toLowerCase().includes(query) ||
            (a.mobile || '').includes(query)
        );
    }
    if (date) {
        filtered = filtered.filter(a => a.date === new Date(date).toLocaleDateString());
    }

    window.currentFilteredData.staff = filtered;
    renderStaffAttendance(filtered);
};

window.filterAssetTable = () => {
    const query = document.getElementById('asset-search')?.value.toLowerCase();
    let filtered = window.appCache.assets;

    if (query) {
        filtered = filtered.filter(a =>
            Object.values(a).some(val => String(val).toLowerCase().includes(query))
        );
    }

    window.currentFilteredData.assets = filtered;
    const detectedHeaders = filtered.length > 0 ? Object.keys(filtered[0]).filter(k => !['assetId', 'updatedAt', 'profilePicUrl', '_importBatch', '_forceId', '_importSource'].includes(k)) : [];
    window.renderDynamicAssetTable(filtered, detectedHeaders);
};

window.filterDisposalTable = () => {
    const query = document.getElementById('disposal-search')?.value.toLowerCase();
    let filtered = window.appCache.assets.filter(a => a.assetStatus === 'Disposed');

    if (query) {
        filtered = filtered.filter(a =>
            Object.values(a).some(val => String(val).toLowerCase().includes(query))
        );
    }

    window.currentFilteredData.disposal = filtered;
    window.renderStandardizedAssetTable(filtered, 'disposal');
};

window.filterTransferTable = () => {
    const query = document.getElementById('transfer-search')?.value.toLowerCase();
    let filtered = window.appCache.transfers;

    if (query) {
        filtered = filtered.filter(t =>
            Object.values(t).some(val => String(val).toLowerCase().includes(query))
        );
    }

    window.currentFilteredData.transfers = filtered;
    window.renderStandardizedAssetTable(filtered, 'transfers');
};

/**
 * UNIVERSAL FLOATING EYE BUTTON MODAL
 */
window.openDetailedAuditModal = async (type, id) => {
    window.showGlobalSpinner("Loading details...");

    try {
        let data = null;
        let title = "Record Details";
        let modal = document.getElementById('view-staff-modal'); // Re-use profile modal
        if (!modal) return;

        if (type === 'attendance') {
            const [mobile, ts] = id.split('_');
            const snap = await get(ref(db, 'staff_attendance'));
            if (snap.exists()) {
                const all = Object.values(snap.val());
                data = all.find(a => a.mobile === mobile && String(a.timestamp) === ts);
            }
            title = "Attendance Detail";
        } else if (type === 'visitor') {
            const snap = await get(ref(db, 'visitors/' + id));
            data = snap.exists() ? snap.val() : null;
            title = "Visitor Detail";
        } else if (type === 'staff') {
            const snap = await get(ref(db, 'staff/' + id));
            data = snap.exists() ? snap.val() : null;
            title = "Staff Profile";
        }

        if (!data) throw new Error("Record not found.");

        modal.classList.remove('hidden');
        modal.style.display = 'flex';

        const profileImg = window.getDirectDriveImageUrl(data.profilePicUrl || data.signatureUrl);
        const getVal = (v) => v || '-';

        // Format Key Status
        let keyStatusHtml = '<span class="text-slate-400 font-bold">❌ NO KEY</span>';
        if (data.keyStatus === 'HELD' || data.keyCollected === true || data.keyCollected === 'YES') {
            keyStatusHtml = '<span class="text-amber-500 font-bold">🔑 KEY HELD</span>';
        } else if (data.keyStatus === 'RETURNED') {
            keyStatusHtml = '<span class="text-emerald-500 font-bold">✅ KEY RETURNED</span>';
        }

        modal.innerHTML = `
            <div class="bg-white w-full max-w-2xl rounded-[40px] overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] fade-in">
                <div class="p-6 bg-gradient-to-r from-indigo-600 to-indigo-800 text-white flex justify-between items-center flex-shrink-0">
                    <div>
                        <h3 class="text-xl font-black uppercase tracking-tight">${title}</h3>
                        <p class="text-[10px] text-white/60 font-bold uppercase tracking-widest mt-1">Audit Log ID: ${id}</p>
                    </div>
                    <button onclick="document.getElementById('view-staff-modal').classList.add('hidden'); document.getElementById('view-staff-modal').style.display='none';" class="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                        <i class="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>

                <div class="p-8 overflow-y-auto flex-1 bg-slate-50">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div class="space-y-4">
                            <h4 class="text-indigo-600 font-black text-xs uppercase tracking-widest border-b pb-2">Identity Info</h4>
                            <div class="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-3">
                                <div><label class="text-[8px] font-black text-slate-400 uppercase block">Full Name</label><p class="text-sm font-black text-indigo-900">${getVal(data.name || data.fullName)}</p></div>
                                <div><label class="text-[8px] font-black text-slate-400 uppercase block">Mobile / ID</label><p class="text-xs font-bold text-slate-700 font-mono">${getVal(data.mobile || data.id)}</p></div>
                                <div><label class="text-[8px] font-black text-slate-400 uppercase block">Organization / Company</label><p class="text-xs font-bold text-slate-700">${getVal(data.company || data.companyName)}</p></div>
                                <div><label class="text-[8px] font-black text-slate-400 uppercase block">ADEK Pass / Designation</label><p class="text-xs font-bold text-slate-700 font-mono">${getVal(data.adekPass || data.role)}</p></div>
                            </div>
                        </div>

                        <div class="space-y-4">
                            <h4 class="text-indigo-600 font-black text-xs uppercase tracking-widest border-b pb-2">Logistics & Security</h4>
                            <div class="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-3">
                                <div><label class="text-[8px] font-black text-slate-400 uppercase block">Current Location</label><p class="text-xs font-bold text-slate-700">${getVal(data.branch || data.school || 'N/A')}</p></div>
                                <div><label class="text-[8px] font-black text-slate-400 uppercase block">Log Date</label><p class="text-xs font-bold text-slate-700 font-mono">${getVal(data.date)}</p></div>
                                <div class="grid grid-cols-2 gap-2">
                                    <div><label class="text-[8px] font-black text-slate-400 uppercase block">Time In</label><p class="text-xs font-black text-emerald-600">${getVal(data.timeIn)}</p></div>
                                    <div><label class="text-[8px] font-black text-slate-400 uppercase block">Time Out</label><p class="text-xs font-black text-red-500">${getVal(data.checkOutTime || data.outTime)}</p></div>
                                </div>
                                <div><label class="text-[8px] font-black text-slate-400 uppercase block">Key Handover Status</label>${keyStatusHtml}</div>
                            </div>
                        </div>

                        <div class="col-span-full space-y-2">
                            <label class="text-[8px] font-black text-slate-400 uppercase block text-center">Visual Verification (Signature / Photo)</label>
                            <div class="h-40 bg-white rounded-3xl border-2 border-slate-100 flex items-center justify-center p-4 overflow-hidden shadow-inner">
                                <img src="${profileImg}" class="max-w-full max-h-full object-contain cursor-pointer transition-transform hover:scale-110" onclick="window.openImageZoom('${profileImg}')" onerror="this.src='https://placehold.co/400x200/f1f5f9/64748b?text=No+Signature+Available'">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="p-6 border-t bg-white flex justify-end">
                    <button onclick="document.getElementById('view-staff-modal').classList.add('hidden'); document.getElementById('view-staff-modal').style.display='none';" class="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all">Close View</button>
                </div>
            </div>
        `;

    } catch (e) {
        alert("Error: " + e.message);
    } finally {
        window.hideGlobalSpinner();
    }
};

console.log("✅ admin_module.js re-initialized");

