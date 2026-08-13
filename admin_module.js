import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, get, set, update, remove, onValue, push, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================
// ADMIN DASHBOARD CORE MODULE
// ================================================

// Global state within Admin Module scope
window.appCache = {
    isInitialized: false,
    visitors: [],
    contractors: [],
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
    contractors: null,
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

        const [vSnap, cSnap, sSnap, tSnap, aSnap, attSnap, trSnap] = await Promise.all([
            get(ref(db, 'visitors')),
            get(ref(db, 'contractors')),
            get(ref(db, 'staff')),
            get(ref(db, 'tasks')),
            get(ref(db, 'assets')),
            get(ref(db, 'staff_attendance')),
            get(ref(db, 'asset_transfers'))
        ]);

        window.appCache.visitors = vSnap.exists() ? Object.values(vSnap.val()) : [];
        window.appCache.contractors = cSnap.exists() ? Object.values(cSnap.val()) : [];
        window.appCache.staff = sSnap.exists() ? Object.values(sSnap.val()) : [];
        window.appCache.tasks = tSnap.exists() ? Object.values(tSnap.val()) : [];
        window.appCache.assets = aSnap.exists() ? Object.values(aSnap.val()) : [];
        window.appCache.attendance = attSnap.exists() ? Object.values(attSnap.val()) : [];
        window.appCache.transfers = trSnap.exists() ? Object.values(trSnap.val()) : [];

        // Save to local cache for offline/guest Wi-Fi mode
        localStorage.setItem('admin_cache', JSON.stringify(window.appCache));

        // Auto-migrate legacy data from Base64 to Drive
        window.autoMigrateLegacyData();

        window.adminData = [
            ...window.appCache.visitors.map(v => ({ ...v, type: 'visitor' })),
            ...window.appCache.contractors.map(c => ({ ...c, type: 'contractor' })),
            ...window.appCache.attendance.map(s => ({ ...s, type: 'staff' }))
        ];
        window.allAssets = window.appCache.assets;

        window.appCache.isInitialized = true;

        // Ensure currentStaff exists for Task rendering if in Admin mode
        if (localStorage.getItem('isAdminLoggedIn') === 'true' && !window.currentStaff) {
            window.currentStaff = { role: 'admin', name: 'System Admin' };
        }

        window.updateAdminKPIs();
        window.updateAdminProfileHeader();

        const activeTab = document.querySelector('.tab-section.active');
        if (activeTab) {
            window.renderTabFromAppCache(activeTab.id);
        } else {
            window.renderTabFromAppCache('tab-visitor-logs');
        }

    } catch (e) {
        console.warn("⚠️ Restricted Wi-Fi mode: Loading admin dashboard from local cache.");
        const cached = localStorage.getItem('admin_cache');
        if (cached) {
            const data = JSON.parse(cached);
            Object.assign(window.appCache, data);
            window.appCache.isInitialized = true;
            window.updateAdminKPIs();

            const activeTab = document.querySelector('.tab-section.active');
            window.renderTabFromAppCache(activeTab ? activeTab.id : 'tab-visitor-logs');
            window.showWhatsAppToast("⚠️ Offline Mode", "Loaded from local cache.");
        } else {
            console.error("❌ Refresh Dashboard Error:", e);
        }
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

    // 3. Migrate Legacy Logs (visitor_logs -> visitors, contractor_logs -> contractors)
    try {
        const [oldVisSnap, oldConSnap] = await Promise.all([
            get(ref(db, 'visitor_logs')),
            get(ref(db, 'contractor_logs'))
        ]);

        if (oldVisSnap.exists()) {
            console.log("🚚 Migrating legacy visitor_logs...");
            const updates = {};
            Object.entries(oldVisSnap.val()).forEach(([key, val]) => {
                updates[`visitors/${key}`] = val;
                updates[`visitor_logs/${key}`] = null;
            });
            await update(ref(db), updates);
            console.log("✅ Visitor migration complete.");
        }

        if (oldConSnap.exists()) {
            console.log("🚚 Migrating legacy contractor_logs...");
            const updates = {};
            Object.entries(oldConSnap.val()).forEach(([key, val]) => {
                updates[`contractors/${key}`] = val;
                updates[`contractor_logs/${key}`] = null;
            });
            await update(ref(db), updates);
            console.log("✅ Contractor migration complete.");
        }
    } catch (e) { console.error("Migration Error:", e); }
};

const getNormalizedDate = (entry) => {
    let raw = entry.date || '';
    if (!raw && entry.checkInTime && entry.checkInTime.includes('/')) {
        const parts = entry.checkInTime.split(' ');
        if (parts[0].includes('/')) raw = parts[0];
    }
    if (!raw && entry.timestamp) {
        raw = new Date(entry.timestamp).toLocaleDateString('en-US');
    }
    if (!raw) return '';
    // Normalize format to M/D/YYYY by removing leading zeros
    return raw.split('/').map(p => parseInt(p)).join('/');
};

/* 1. REALTIME TOP SUMMARY COUNTERS (STAFF & VISITORS) */
window.initLiveTopCounters = function() {

    // LIVE VISITOR COUNTER
    const visitorsRef = ref(db, 'visitors');
    onValue(visitorsRef, (snapshot) => {
        let totalTodayVisitors = 0;
        const todayStr = new Date().toLocaleDateString('en-US').split('/').map(p => parseInt(p)).join('/');

        if (snapshot.exists()) {
            snapshot.forEach((child) => {
                const data = child.val();
                if (getNormalizedDate(data) === todayStr) {
                    totalTodayVisitors++;
                }
            });
        }

        const updateUI = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        updateUI('top-counter-visitors', totalTodayVisitors);
        updateUI('admin-top-visitor-count', totalTodayVisitors);
        updateUI('summary-visitor-badge', totalTodayVisitors);
        updateUI('kpi-visitors', totalTodayVisitors);
    });

    // LIVE STAFF ATTENDANCE COUNTER
    const staffRef = ref(db, 'staff_attendance');
    onValue(staffRef, (snapshot) => {
        let presentStaffCount = 0;
        const todayStr = new Date().toLocaleDateString('en-US').split('/').map(p => parseInt(p)).join('/');

        if (snapshot.exists()) {
            snapshot.forEach((child) => {
                const data = child.val();
                const status = (data.status || '').toLowerCase();
                if (getNormalizedDate(data) === todayStr && (status === 'checked_in' || status === 'present')) {
                    presentStaffCount++;
                }
            });
        }

        const updateUI = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        updateUI('top-counter-staff', presentStaffCount);
        updateUI('admin-top-staff-count', presentStaffCount);
        updateUI('kpi-staff', presentStaffCount);
    });
};

/* 2. FETCH & RENDER ALL VISITOR RECORDS (INCLUDING PAST ONES) IN ADMIN DASHBOARD */
window.loadAdminVisitorRecords = function() {
    const tableBody = document.getElementById('visitor-logs-body');
    if (!tableBody) return;

    const visitorsRef = ref(db, 'visitors');
    onValue(visitorsRef, (snapshot) => {
        const visitors = [];
        if (snapshot.exists()) {
            snapshot.forEach((child) => {
                visitors.push({ id: child.key, ...child.val() });
            });
        }

        // Use existing render function or user's simple one if preferred.
        // User wants signatures and details properly.
        // The existing renderVisitorLogs is quite comprehensive.
        // I'll ensure it's called with the new data.
        window.appCache.visitors = visitors;
        renderVisitorLogs(visitors);
    });
};

window.loadAdminDashboard = () => {
    window.refreshDashboardData();
    window.initLiveTopCounters();
    window.loadAdminVisitorRecords();
};

// ================================================
// KPI LOGIC
// ================================================
window.updateAdminKPIs = async () => {
    try {
        const todayStr = new Date().toLocaleDateString('en-US').split('/').map(p => parseInt(p)).join('/');
        const visitorsToday = window.appCache.visitors.filter(v => getNormalizedDate(v) === todayStr).length;
        const contractorsToday = window.appCache.contractors.filter(c => getNormalizedDate(c) === todayStr).length;
        const activeTasks = window.appCache.tasks.filter(t => t.status === 'Open' || t.status === 'Accepted').length;

        const staffPresent = window.appCache.attendance.filter(a => {
            const status = (a.status || '').toLowerCase();
            return getNormalizedDate(a) === todayStr && (status === 'checked_in' || status === 'present');
        }).length;

        const urgentAlerts = window.appCache.tasks.filter(t => t.priority === 'High' && t.status !== 'Closed').length;

        const stats = {
            'kpi-visitors': { value: visitorsToday, pct: Math.min(100, (visitorsToday / 50) * 100) },
            'kpi-contractors': { value: contractorsToday, pct: Math.min(100, (contractorsToday / 20) * 100) },
            'kpi-tasks': { value: activeTasks, pct: Math.min(100, (activeTasks / 20) * 100) },
            'kpi-staff': { value: staffPresent, pct: Math.min(100, (staffPresent / 30) * 100) },
            'kpi-alerts': { value: urgentAlerts, pct: Math.min(100, (urgentAlerts / 10) * 100) }
        };
        if (window.updateKPIStats) window.updateKPIStats(stats);

        // TRIGGER DYNAMIC STAFF CENSUS UPDATE
        window.updateStaffCensusCounters(window.appCache.staff);

    } catch (e) { console.error("KPI Error:", e); }
};

window.updateStaffCensusCounters = function(staffList) {
    if (!staffList) return;
    if (!Array.isArray(staffList)) staffList = Object.values(staffList || {});

    let total = staffList.length;
    let securityCount = 0;
    let cleanerLeaderCount = 0;
    let cleanerCount = 0;
    let technicianCount = 0;

    staffList.forEach(staff => {
        const pos = (staff.position || staff.role || '').toString().toUpperCase().trim();
        if (pos.includes('SECURITY')) {
            securityCount++;
        } else if (pos.includes('CLEANER LEADER') || pos === 'LEADER') {
            cleanerLeaderCount++;
        } else if (pos === 'CLEANER') {
            cleanerCount++;
        } else if (pos.includes('TECHNICIAN') || pos.includes('TECH')) {
            technicianCount++;
        }
    });

    // Update UI Elements safely
    if (document.getElementById('cntTotalStaff')) document.getElementById('cntTotalStaff').textContent = total;
    if (document.getElementById('cntSecurity')) document.getElementById('cntSecurity').textContent = securityCount;
    if (document.getElementById('cntCleanerLeader')) document.getElementById('cntCleanerLeader').textContent = cleanerLeaderCount;
    if (document.getElementById('cntCleaner')) document.getElementById('cntCleaner').textContent = cleanerCount;
    if (document.getElementById('cntTechnician')) document.getElementById('cntTechnician').textContent = technicianCount;
};

window.updateAdminProfileHeader = async () => {
    try {
        const adminMobile = '961486864461';
        let adminData = window.appCache.staff.find(s => (s.mobile || s.mobileNumber) === adminMobile);

        if (!adminData) {
            const snap = await get(ref(db, `users/${adminMobile}`));
            if (snap.exists()) adminData = snap.val();
        }

        const profilePic = document.getElementById('adminProfileHeaderPic');
        if (profilePic && adminData && adminData.profilePicUrl) {
            profilePic.src = window.getDirectDriveImageUrl(adminData.profilePicUrl);
        }
    } catch (e) {
        console.error("Error updating admin profile header:", e);
    }
};

async function updateVisitorsTodayCount() {
    try {
        const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const vRef = ref(db, 'visitors');

        onValue(vRef, (snapshot) => {
            let count = 0;
            if (snapshot.exists()) {
                const data = snapshot.val();
                Object.values(data).forEach(visitor => {
                    const vDate = visitor.date;
                    const vTimestamp = visitor.timestamp;
                    let isToday = false;
                    if(vDate) {
                        const d = new Date(vDate);
                        isToday = d.toISOString().split('T')[0] === todayStr;
                    } else if(vTimestamp) {
                        isToday = new Date(vTimestamp).toISOString().split('T')[0] === todayStr;
                    }
                    if (isToday) count++;
                });
            }
            const counterElement = document.getElementById('visitors-today-count') || document.getElementById('visitorsCount');
            if (counterElement) counterElement.innerText = count.toString();
        });
    } catch (err) {
        console.error("Error updating today's visitor count:", err);
    }
}
window.updateVisitorsTodayCount = updateVisitorsTodayCount;

// ================================================
// TAB RENDERING ENGINE
// ================================================
window.renderTabFromAppCache = (tabId) => {
    window.showGlobalSpinner("Loading Dashboard...");
    setTimeout(() => {
        try {
            switch (tabId) {
                case 'tab-visitor-logs': renderVisitorLogs(window.currentFilteredData.visitors || window.appCache.visitors || []); break;
                case 'tab-contractor-logs': renderContractorLogs(window.currentFilteredData.contractors || window.appCache.contractors || []); break;
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
                case 'tab-my-tasks': if (typeof window.switchTaskTab === 'function') window.switchTaskTab('active'); break;
            }
        } finally {
            window.hideGlobalSpinner();
        }
    }, 100);
};

// RENDER FUNCTIONS
function renderVisitorLogs(visitors) {
    const body = document.getElementById('visitor-logs-body');
    if (!body) return;

    // Filter and sort completed entries
    const data = (visitors || [])
        .filter(v => v.status === 'active' || v.status === 'SIGNED OUT')
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    window.adminPaginators.visitors.init(data, (pageItems, startIndex) => {
        body.innerHTML = '';
        if (pageItems.length === 0) {
            body.innerHTML = '<tr><td colspan="12" class="p-8 text-center text-gray-400">No records found</td></tr>';
            return;
        }
        pageItems.forEach((v, index) => {
            const displaySeq = startIndex + index + 1; // Gapless sequence
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition-colors border-b border-gray-100 text-[10px]";

            let keyHtml = `<span class="inline-flex items-center justify-center gap-1 px-3 py-1 text-[9px] font-bold rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 whitespace-nowrap"><span>❌</span> <span>NO KEY</span></span>`;
            if (v.keyCollected === true || v.keyCollected === 'YES') {
                keyHtml = v.status === 'SIGNED OUT'
                    ? `<span class="inline-flex items-center justify-center gap-1 px-3 py-1 text-[9px] font-bold rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 whitespace-nowrap"><span>✅</span> <span>RETURNED</span></span>`
                    : `<span class="inline-flex items-center justify-center gap-1 px-3 py-1 text-[9px] font-bold rounded-full bg-amber-500/15 text-amber-600 border border-amber-500/30 whitespace-nowrap"><span>🔑</span> <span>HELD</span></span>`;
            }

            const sigData = v.signatureUrl || v.signatureData || v.signature || '';
            const isValidSig = sigData && (sigData.startsWith('data:image') || sigData.startsWith('http'));

            const signatureTdHTML = isValidSig
                ? `<img src="${sigData}" class="h-8 w-16 object-contain bg-white rounded border border-slate-600 mx-auto cursor-pointer shadow-sm hover:scale-105 transition-transform" onclick="window.openImageZoom('${sigData}')" alt="Sig">`
                : `<span class="text-xs text-slate-400 italic">No Sig</span>`;

            tr.innerHTML = `
                <td class="p-4 font-black text-indigo-900">#${displaySeq}</td>
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
                <td class="p-4 text-center">${signatureTdHTML}</td>
            `;
            body.appendChild(tr);
        });
    });
}

function renderContractorLogs(contractors) {
    const body = document.getElementById('contractor-logs-body');
    if (!body) return;

    // Filter and sort completed entries
    const data = (contractors || [])
        .filter(c => c.status === 'active' || c.status === 'SIGNED OUT')
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    // Ensure we have a paginator for contractors if not already initialized
    if (!window.adminPaginators.contractors) {
        window.adminPaginators.contractors = new TablePaginator('contractor-logs-pagination');
    }

    window.adminPaginators.contractors.init(data, (pageItems, startIndex) => {
        body.innerHTML = '';
        if (pageItems.length === 0) {
            body.innerHTML = '<tr><td colspan="11" class="p-8 text-center text-gray-400">No contractor records found</td></tr>';
            return;
        }
        pageItems.forEach((c, index) => {
            const displaySeq = startIndex + index + 1; // Gapless sequence
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition-colors border-b border-gray-100 text-[10px]";

            let keyHtml = `<span class="inline-flex items-center justify-center gap-1 px-3 py-1 text-[9px] font-bold rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 whitespace-nowrap"><span>❌</span> <span>NO KEY</span></span>`;
            if (c.keyCollected === true || c.keyCollected === 'YES') {
                keyHtml = c.status === 'SIGNED OUT'
                    ? `<span class="inline-flex items-center justify-center gap-1 px-3 py-1 text-[9px] font-bold rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 whitespace-nowrap"><span>✅</span> <span>RETURNED</span></span>`
                    : `<span class="inline-flex items-center justify-center gap-1 px-3 py-1 text-[9px] font-bold rounded-full bg-amber-500/15 text-amber-600 border border-amber-500/30 whitespace-nowrap"><span>🔑</span> <span>HELD</span></span>`;
            }

            const sigData = c.signatureUrl || c.signatureData || c.signature || '';
            const isValidSig = sigData && (sigData.startsWith('data:image') || sigData.startsWith('http'));

            const signatureTdHTML = isValidSig
                ? `<img src="${sigData}" class="h-8 w-16 object-contain bg-white rounded border border-slate-600 mx-auto cursor-pointer shadow-sm hover:scale-105 transition-transform" onclick="window.openImageZoom('${sigData}')" alt="Sig">`
                : `<span class="text-xs text-slate-400 italic">No Sig</span>`;

            tr.innerHTML = `
                <td class="p-4 font-black text-indigo-900">#${displaySeq}</td>
                <td class="p-4 font-mono font-bold text-emerald-600">${c.id || "-"}</td>
                <td class="p-4 font-bold text-slate-800">${c.name || "-"}</td>
                <td class="p-4">${c.mobile || "-"}</td>
                <td class="p-4 font-bold text-indigo-600">${c.company || "-"}</td>
                <td class="p-4 max-w-[150px] truncate">${c.purpose || "-"}</td>
                <td class="p-4 font-mono text-slate-500">${c.contractorId || "-"}</td>
                <td class="p-4">${c.date || "-"}</td>
                <td class="p-4 text-emerald-600 font-bold">${c.timeIn || "-"}</td>
                <td class="p-4 text-red-500 font-bold">${c.outTime || "-"}</td>
                <td class="p-4"><span class="status-badge ${c.status === 'SIGNED OUT' ? 'closed' : 'open'}">${c.status || "Active"}</span></td>
                <td class="p-4 text-center">${keyHtml}</td>
                <td class="p-4 text-center">${signatureTdHTML}</td>
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
            body.innerHTML = '<tr><td colspan="14" class="p-8 text-center text-gray-400">No records found</td></tr>';
            return;
        }

        pageItems.forEach(a => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition-colors border-b border-gray-100 text-[10px]";

            const sig = a.signatureUrl || a.signatureData || a.signature || '';
            const sigHTML = (sig && sig.length > 30)
                ? `<img src="${sig}" class="w-12 h-7 object-contain bg-white rounded border border-slate-600 mx-auto cursor-pointer shadow-sm hover:scale-105" onclick="window.openImageZoom('${sig}')" alt="Sig">`
                : `<span class="text-xs text-slate-400 italic">No Sig</span>`;

            let keyHtml = `<span class="inline-flex items-center justify-center gap-1 px-3 py-1 text-[9px] font-bold rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 whitespace-nowrap"><span>❌</span> <span>NO KEY</span></span>`;
            if (a.keyStatus === 'HELD' || a.keyStatus === 'ISSUED_PENDING_RETURN') {
                keyHtml = `<span class="inline-flex items-center justify-center gap-1 px-3 py-1 text-[9px] font-bold rounded-full bg-amber-500/15 text-amber-600 border border-amber-500/30 whitespace-nowrap"><span>🔑</span> <span>HELD</span></span>`;
            } else if (a.keyStatus === 'RETURNED' || a.keyStatus === 'RETURNED_VERIFIED') {
                keyHtml = `<span class="inline-flex items-center justify-center gap-1 px-3 py-1 text-[9px] font-bold rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 whitespace-nowrap"><span>✅</span> <span>RETURNED</span></span>`;
            }

            const role = (a.role || a.position || '').toLowerCase();
            let roleClass = 'role-default';
            if (role.includes('security')) roleClass = 'role-security';
            else if (role.includes('leader')) roleClass = 'role-cleaner-leader';
            else if (role.includes('tech')) roleClass = 'role-technician';

            tr.innerHTML = `
                <td class="p-4 font-black text-indigo-900 uppercase">${a.name || "-"}</td>
                <td class="p-4 font-mono font-bold text-slate-500">${a.companyId || "-"}</td>
                <td class="p-4 font-mono text-slate-500">${a.mobile || "-"}</td>
                <td class="p-4 font-bold text-indigo-600 uppercase truncate max-w-[120px]">${a.companyName || "N/A"}</td>
                <td class="p-4 font-mono text-indigo-400">${a.companyId || "N/A"}</td>
                <td class="p-4 font-bold text-slate-600 truncate max-w-[120px]">${a.branch || a.school || "N/A"}</td>
                <td class="p-4 text-center"><span class="role-badge ${roleClass}">${a.role || a.position || "-"}</span></td>
                <td class="p-4 font-mono font-bold text-slate-500">${a.adekPass || "-"}</td>
                <td class="p-4 text-slate-400 font-bold whitespace-nowrap">${a.date || "-"}</td>
                <td class="p-4 text-emerald-600 font-black">${a.timeIn || "-"}</td>
                <td class="p-4 text-red-500 font-black">${a.checkOutTime || "-"}</td>
                <td class="p-4 text-center">${keyHtml}</td>
                <td class="p-4 text-center">${sigHTML}</td>
                <td class="p-4 text-center sticky-action-col">
                    <button onclick="window.openAttendanceDetailModal('${a.mobile}_${a.timestamp}')" class="p-2 text-indigo-300 hover:text-white hover:bg-indigo-600/50 rounded-lg transition-all cursor-pointer">
                        <i class="fa-solid fa-eye text-base"></i>
                    </button>
                </td>
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
        if (pageItems.length === 0) { body.innerHTML = '<tr><td colspan="10" class="p-8 text-center text-gray-400">No tasks found</td></tr>'; return; }
        pageItems.forEach(t => {
            const bImg = window.getDirectDriveImageUrl(t.beforePhotoUrl || t.beforePhoto);
            const aImg = window.getDirectDriveImageUrl(t.afterPhotoUrl || t.afterPhoto);
            const tr = document.createElement('tr');
            tr.innerHTML = `<td class="p-3 font-mono text-indigo-600 font-bold">${t.id?.split('-')[1] || t.id || "-"}</td><td class="p-3">${t.assignedSchool || "-"}</td><td class="p-3 font-bold">${t.location || "-"}</td><td class="p-3 max-w-[150px] truncate">${t.details || "-"}</td><td class="p-3 uppercase text-[8px] font-black">${t.assignedRole || "-"}</td><td class="p-3"><div class="flex flex-col"><span class="font-bold">${t.raisedByName || "Admin"}</span><span class="text-[7px] opacity-50">${t.timestamp || ""}</span></div></td><td class="p-3 font-bold text-emerald-600">${t.solvedByName || "-"}</td><td class="p-3"><span class="status-badge ${(t.status || 'Open').toLowerCase()}">${t.status || "Open"}</span></td><td class="p-3 italic text-[8px]">${t.rejectionReason || "-"}</td><td class="p-3 text-center"><div class="flex gap-1 justify-center">${bImg.includes('http') ? `<img src="${bImg}" class="h-8 w-8 object-cover rounded border cursor-pointer" onclick="window.openImageZoom('${bImg}')">` : '<span class="text-gray-300 text-[8px]">No</span>'}${t.afterPhotoUrl ? `<img src="${aImg}" class="h-8 w-8 object-cover rounded border border-emerald-200 cursor-pointer" onclick="window.openImageZoom('${aImg}')">` : ''}</div></td>`;
            body.appendChild(tr);
        });
    });
}

function renderStaffDirectory(staff) {
    const body = document.getElementById('admin-staff-list-body');
    if (!body) return;
    window.adminPaginators.directory.init(staff || [], (pageItems) => {
        body.innerHTML = '';
        if (pageItems.length === 0) { body.innerHTML = '<tr><td colspan="10" class="p-8 text-center text-gray-400">No staff members found</td></tr>'; return; }
        pageItems.forEach(s => {
            const profileImg = window.getDirectDriveImageUrl(s.profilePicUrl);
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition-colors border-b border-gray-100 text-[10px]";

            const role = (s.role || s.position || '').toLowerCase();
            let roleClass = 'role-default';
            if (role.includes('security')) roleClass = 'role-security';
            else if (role.includes('leader')) roleClass = 'role-cleaner-leader';
            else if (role.includes('tech')) roleClass = 'role-technician';

            tr.innerHTML = `
                <td class="p-4 text-center">
                    <div class="w-10 h-10 rounded-full bg-slate-100 border overflow-hidden mx-auto shadow-sm">
                        <img src="${profileImg}" class="w-full h-full object-cover" onerror="this.src='https://ui-avatars.com/api/?name=${(s.fullName || s.name || 'U').replace(/ /g, '+')}&background=4f46e5&color=fff&size=40'">
                    </div>
                </td>
                <td class="p-4 font-black text-indigo-900 uppercase">${s.fullName || s.name || "-"}</td>
                <td class="p-4 font-mono font-bold text-slate-400">${s.password || "-"}</td>
                <td class="p-4 font-mono font-bold text-slate-500">${s.adekPass || s.adcPassNumber || "-"}</td>
                <td class="p-4 font-bold text-slate-600 truncate max-w-[120px]">${s.branch || s.school || "-"}</td>
                <td class="p-4 text-center"><span class="role-badge ${roleClass}">${s.role || s.position || "-"}</span></td>
                <td class="p-4 font-bold text-slate-700 truncate max-w-[120px]">${s.companyName || "-"}</td>
                <td class="p-4 font-mono text-indigo-600 font-bold">${s.companyId || "-"}</td>
                <td class="p-4 font-mono font-bold text-slate-500">${s.mobile || "-"}</td>
                <td class="p-4 text-center sticky-action-col">
                    <div class="flex items-center justify-center gap-2">
                        <button onclick="window.openStaffProfileModal('${s.mobile}')" class="p-2 text-indigo-300 hover:text-white hover:bg-indigo-600/50 rounded-lg transition-all cursor-pointer" title="View Profile"><i class="fa-solid fa-eye text-base"></i></button>
                        <button onclick="window.openEditStaffModal('${s.mobile}')" class="p-2 text-indigo-400 hover:text-indigo-600 transition-colors" title="Edit Staff"><i class="fa-solid fa-user-pen"></i></button>
                    </div>
                </td>`;
            body.appendChild(tr);
        });
    });
}

function renderTransferLogs(transfers) {
    const body = document.getElementById('transfer-logs-body');
    if (!body) return;
    body.innerHTML = '';
    transfers.sort((a,b) => b.timestamp - a.timestamp).forEach(t => {
        const tr = document.createElement('tr');
        const isPending = t.status === 'Pending';
        tr.innerHTML = `
            <td class="p-4">${t.assetBarcode}</td>
            <td class="p-4">${t.collectorName}</td>
            <td class="p-4 font-bold ${isPending ? 'text-amber-600' : 'text-emerald-600'}">${t.status}</td>
            <td class="p-4">
                ${isPending ? `
                    <div class="flex gap-2">
                        <button onclick="window.approveTransfer('${t.transferId}')" class="bg-emerald-600 text-white px-3 py-1 rounded">Approve</button>
                        <button onclick="window.rejectTransfer('${t.transferId}')" class="bg-red-600 text-white px-3 py-1 rounded">Reject</button>
                    </div>
                ` : 'N/A'}
            </td>
        `;
        body.appendChild(tr);
    });
}

window.renderStandardizedAssetTable = (data, target) => {
    const body = target === 'disposal' ? document.getElementById('admin-disposal-list-body') : document.getElementById('transfer-logs-body');
    if (!body) return;
    const getVal = (val) => (val === undefined || val === null || val === "" || val === "N/A" || val === "undefined") ? '-' : val;
    const filtered = (data || []).filter(t => target === 'disposal' ? t.assetStatus === 'Disposed' : ['Transferred', 'In-Transit', 'Completed', 'Pending'].includes(t.status || t.assetStatus));
    filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const paginator = target === 'disposal' ? window.adminPaginators.disposal : window.adminPaginators.transfers;
    paginator.init(filtered, (pageItems) => {
        body.innerHTML = '';
        if (pageItems.length === 0) { body.innerHTML = '<tr><td colspan="26" class="p-8 text-center text-gray-400">No records found</td></tr>'; return; }
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
                        <button onclick="window.openTransferDetailsModal('${t.transferId || t.id}')" class="p-2 text-indigo-400 hover:text-white hover:bg-indigo-600/50 rounded-lg transition-all cursor-pointer" title="View Details"><i class="fa-solid fa-eye text-base"></i></button>
                        <button onclick="window.revertAssetToRegister('${barcode}', '${t.transferId || ''}')" class="bg-indigo-50 text-indigo-600 px-2 py-1.5 rounded-lg font-bold text-[8px] hover:bg-indigo-600 hover:text-white transition shadow-sm uppercase flex items-center gap-1"><i class="fa-solid fa-rotate-left"></i> Revert</button>
                        ${t.status === 'Pending' ? `
                            <button onclick="window.approveTransfer('${t.transferId}')" class="bg-emerald-600 text-white px-2 py-1.5 rounded-lg font-bold text-[8px] hover:bg-emerald-700 transition shadow-sm uppercase">Approve</button>
                        ` : ''}
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
    let html = '<th class="p-4 text-center sticky left-0 bg-slate-50 z-20 border-b-2 border-r shadow-sm"><input type="checkbox" onchange="window.toggleAllAssetCheckboxes(this)" class="selectAllAssets"></th>';
    dynamicHeaders.forEach(h => {
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
            <div class="p-5 bg-slate-800 text-white flex justify-between items-center flex-shrink-0">
                <h3 class="text-base font-bold uppercase tracking-wider flex items-center gap-2">
                    <i class="fa-solid fa-user-plus text-indigo-400"></i> Add New Staff
                </h3>
                <button type="button" onclick="document.getElementById('add-staff-modal').style.display='none'; document.getElementById('add-staff-modal').classList.add('hidden');" class="w-8 h-8 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-colors">
                    <i class="fa-solid fa-xmark text-lg"></i>
                </button>
            </div>
            <form id="add-staff-form" class="p-6 space-y-4 overflow-y-auto flex-1" onsubmit="event.preventDefault(); event.stopPropagation(); if(window.submitAddStaff) window.submitAddStaff(event); return false;">
                <div class="flex items-center gap-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                    <div id="add-staff-photo-preview" class="w-16 h-16 rounded-full bg-slate-200 overflow-hidden flex-shrink-0 border-2 border-white shadow-md flex items-center justify-center">
                        <i class="fa-solid fa-user text-slate-400 text-2xl"></i>
                    </div>
                    <div class="flex-1">
                        <label class="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Profile Photo (Optional)</label>
                        <input type="file" id="staff-photo-input" accept="image/*" class="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 cursor-pointer" onchange="window.previewStaffPhoto(this, 'add-staff-photo-preview')">
                    </div>
                </div>
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
        reader.onload = (e) => { preview.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover">`; };
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
        if (photoInput && photoInput.files && photoInput.files[0]) {
            try {
                const file = photoInput.files[0];
                const base64Image = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.readAsDataURL(file);
                });
                if (window.uploadToDrive) {
                    const uploadRes = await window.uploadToDrive({ image: base64Image, category: 'PROFILE_PHOTOS', fileName: `staff_${Date.now()}.png` });
                    if (uploadRes && uploadRes.status === 'success') profilePicUrl = uploadRes.fileUrl;
                }
            } catch (imgErr) { console.error("⚠️ Image upload process crashed:", imgErr); }
        }
        const staffId = 'STAFF_' + Date.now();
        const staffData = { staffId, fullName, mobile, adekPass: adek, school, branch: school, role, position: role, companyName, companyId, password, profilePicUrl, createdAt: new Date().toISOString() };

        // CRITICAL FIX: Use staffId as unique key to prevent overwriting same-role staff
        await set(ref(db, 'staff/' + staffId), staffData);
        // Also update users node if needed for auth, using mobile or staffId?
        // Typically users node uses mobile for login lookup.
        await set(ref(db, 'users/' + mobile), staffData);
        alert("✅ Staff Registered Successfully!");
        document.getElementById('add-staff-form')?.reset();
        const modal = document.getElementById('add-staff-modal');
        if (modal) { modal.style.display = 'none'; modal.classList.add('hidden'); }
        window.refreshDashboardData();
    } catch (error) { console.error("❌ Registration Error:", error); alert("Registration Failed: " + error.message); } finally { if (submitBtn) submitBtn.disabled = false; }
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
                <input type="text" id="edit-fullname" value="${s.fullName || s.name || ''}" required class="w-full p-4 bg-slate-50 border-2 rounded-2xl">
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
        fullName: document.getElementById('edit-fullname').value,
        adekPass: document.getElementById('edit-adek').value,
        branch: document.getElementById('edit-school').value,
        role: document.getElementById('edit-role').value,
        position: document.getElementById('edit-role').value,
        updatedAt: new Date().toISOString()
    };
    const newPass = document.getElementById('edit-password').value;
    if (newPass) updates.password = newPass;
    const photoInput = document.getElementById('edit-staff-photo-input');
    try {
        if (photoInput.files && photoInput.files[0]) {
            const base64 = await window.compressImageFile(photoInput.files[0], 500, 500, 0.7);
            const uploadRes = await window.uploadToDrive({ category: UPLOAD_CONFIG.CATEGORIES.PROFILE_PHOTOS, fileName: `Profile_${mobile}.jpg`, image: base64 });
            if (uploadRes.status === 'success' && uploadRes.fileUrl) updates.profilePicUrl = uploadRes.fileUrl;
        }
        await update(ref(db, 'staff/' + mobile), updates);
        await update(ref(db, 'users/' + mobile), updates);
        alert("✅ Staff record updated successfully!");
        document.getElementById('edit-staff-modal').classList.add('hidden');
        window.refreshDashboardData();
    } catch (e) { console.error("Update Error:", e); alert("❌ Update Error: " + e.message); } finally { window.hideLoader(); }
};

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
            <div class="p-6 bg-gradient-to-r from-indigo-600 to-indigo-800 text-white flex justify-between items-center flex-shrink-0">
                <div><h3 class="text-xl font-black uppercase tracking-tight">Staff Profile</h3><p class="text-[10px] text-white/60 font-bold uppercase tracking-widest mt-1">Full Detailed Identity</p></div>
                <button onclick="document.getElementById('view-staff-modal').classList.add('hidden');" class="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"><i class="fa-solid fa-xmark text-lg"></i></button>
            </div>
            <div class="p-8 overflow-y-auto flex-1 bg-slate-50">
                <div class="flex flex-col md:flex-row gap-8 items-start">
                    <div class="w-full md:w-48 flex-shrink-0">
                        <div class="w-48 h-48 rounded-[32px] overflow-hidden border-4 border-white shadow-xl bg-white mx-auto"><img src="${profileImg}" class="w-full h-full object-cover" onerror="this.src='https://ui-avatars.com/api/?name=${(s.fullName || s.name || 'U').replace(/ /g, '+')}&background=4f46e5&color=fff&size=192'"></div>
                    </div>
                    <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div class="bg-white p-4 rounded-2xl border shadow-sm"><label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">Full Name</label><p class="text-sm font-black text-indigo-900">${s.fullName || s.name || "-"}</p></div>
                        <div class="bg-white p-4 rounded-2xl border shadow-sm"><label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">Staff ID</label><p class="text-sm font-black text-slate-700 font-mono">${s.companyId || "-"}</p></div>
                        <div class="bg-white p-4 rounded-2xl border shadow-sm"><label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">Mobile Number</label><p class="text-sm font-black text-slate-700 font-mono">${s.mobile || "-"}</p></div>
                        <div class="bg-white p-4 rounded-2xl border shadow-sm"><label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">ADEK Pass</label><p class="text-sm font-black text-slate-700 font-mono">${s.adekPass || "-"}</p></div>
                        <div class="bg-white p-4 rounded-2xl border shadow-sm"><label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">Assigned School</label><p class="text-sm font-black text-slate-700">${s.branch || s.school || "-"}</p></div>
                        <div class="bg-white p-4 rounded-2xl border shadow-sm"><label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">Designation / Role</label><p class="text-sm font-black text-slate-700 uppercase">${s.role || s.position || "-"}</p></div>
                        <div class="bg-white p-4 rounded-2xl border shadow-sm"><label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">Company Name</label><p class="text-sm font-black text-slate-700">${s.companyName || "-"}</p></div>
                        <div class="bg-white p-4 rounded-2xl border shadow-sm"><label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">Company ID</label><p class="text-sm font-black text-slate-700 font-mono">${s.companyId || "-"}</p></div>
                    </div>
                </div>
            </div>
            <div class="p-6 border-t bg-white flex justify-end"><button onclick="document.getElementById('view-staff-modal').classList.add('hidden');" class="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase shadow-lg active:scale-95 transition-all">Close</button></div>
        </div>
    `;
};

window.openAttendanceDetailModal = async (id) => {
    window.showGlobalSpinner("Loading details...");
    try {
        const [mobile, ts] = id.split('_');
        const snap = await get(ref(db, 'staff_attendance'));
        if (!snap.exists()) throw new Error("Record not found.");
        const all = Object.values(snap.val());
        const data = all.find(a => a.mobile === mobile && String(a.timestamp) === ts);
        if (!data) throw new Error("Record not found.");

        let modal = document.getElementById('view-staff-modal');
        modal.classList.remove('hidden'); modal.style.display = 'flex';

        const profileImg = window.getDirectDriveImageUrl(data.signatureUrl);
        const getVal = (v) => v || '-';
        let keyStatusHtml = '<span class="text-slate-400 font-bold">❌ NO KEY</span>';
        if (data.keyStatus === 'HELD') keyStatusHtml = '<span class="text-amber-500 font-bold">🔑 KEY HELD</span>';
        else if (data.keyStatus === 'RETURNED' || data.keyStatus === 'RETURNED_VERIFIED') keyStatusHtml = '<span class="text-emerald-500 font-bold">✅ KEY RETURNED</span>';

        modal.innerHTML = `
            <div class="bg-white w-full max-w-2xl rounded-[40px] overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] fade-in">
                <div class="p-6 bg-emerald-600 text-white flex justify-between items-center">
                    <div><h3 class="text-xl font-black uppercase tracking-tight">Attendance Detail</h3><p class="text-[10px] text-white/60 font-bold uppercase mt-1">ID: ${id}</p></div>
                    <button onclick="document.getElementById('view-staff-modal').classList.add('hidden');"><i class="fa-solid fa-xmark text-lg"></i></button>
                </div>
                <div class="p-8 overflow-y-auto flex-1 bg-slate-50">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div class="space-y-4">
                            <h4 class="text-emerald-600 font-black text-xs uppercase tracking-widest border-b pb-2">Identity Info</h4>
                            <div class="p-4 bg-white rounded-2xl border shadow-sm flex flex-col gap-3 text-gray-800">
                                <div><label class="text-[8px] font-black text-slate-400 uppercase block">Name</label><p class="text-sm font-black text-indigo-900">${getVal(data.name)}</p></div>
                                <div><label class="text-[8px] font-black text-slate-400 uppercase block">Mobile</label><p class="text-xs font-bold text-slate-700">${getVal(data.mobile)}</p></div>
                                <div><label class="text-[8px] font-black text-slate-400 uppercase block">Company</label><p class="text-xs font-bold text-slate-700">${getVal(data.companyName)}</p></div>
                                <div><label class="text-[8px] font-black text-slate-400 uppercase block">Role</label><p class="text-xs font-bold text-slate-700">${getVal(data.role)}</p></div>
                                <div><label class="text-[8px] font-black text-slate-400 uppercase block">ADEK Pass</label><p class="text-xs font-bold text-slate-700 font-mono">${getVal(data.adekPass)}</p></div>
                            </div>
                        </div>
                        <div class="space-y-4">
                            <h4 class="text-emerald-600 font-black text-xs uppercase tracking-widest border-b pb-2">Logistics</h4>
                            <div class="p-4 bg-white rounded-2xl border shadow-sm flex flex-col gap-3 text-gray-800">
                                <div><label class="text-[8px] font-black text-slate-400 uppercase block">Location</label><p class="text-xs font-bold text-slate-700">${getVal(data.branch)}</p></div>
                                <div><label class="text-[8px] font-black text-slate-400 uppercase block">Date</label><p class="text-xs font-bold text-slate-700 font-mono">${getVal(data.date)}</p></div>
                                <div class="grid grid-cols-2 gap-2">
                                    <div><label class="text-[8px] font-black text-slate-400 uppercase block">Time In</label><p class="text-xs font-black text-emerald-600">${getVal(data.timeIn)}</p></div>
                                    <div><label class="text-[8px] font-black text-slate-400 uppercase block">Time Out</label><p class="text-xs font-black text-red-500">${getVal(data.checkOutTime)}</p></div>
                                </div>
                                <div><label class="text-[8px] font-black text-slate-400 uppercase block">Key Status</label>${keyStatusHtml}</div>
                            </div>
                        </div>
                        <div class="col-span-full space-y-2 text-center">
                            <label class="text-[8px] font-black text-slate-400 uppercase block">Digital Verification</label>
                            <div class="h-40 bg-white rounded-3xl border flex items-center justify-center p-4 overflow-hidden"><img src="${profileImg}" class="max-w-full max-h-full object-contain cursor-pointer" onclick="window.openImageZoom('${profileImg}')" onerror="this.src='https://placehold.co/400x200/f1f5f9/64748b?text=No+Sig'"></div>
                        </div>
                    </div>
                    <!-- NEW VERIFICATION CONTAINER -->
                    <div class="mt-4 p-3 bg-slate-900/50 rounded-xl border border-slate-700/50 text-center">
                        <p class="text-xs font-semibold text-slate-400 mb-2 uppercase">Verification Signature</p>
                        <img src="${profileImg}" class="max-h-24 mx-auto object-contain bg-white rounded-lg p-1 shadow-inner" alt="Verification Signature" onclick="window.openImageZoom('${profileImg}')">
                    </div>
                </div>
                <div class="p-6 border-t bg-white flex justify-end"><button onclick="document.getElementById('view-staff-modal').classList.add('hidden');" class="px-8 py-3 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase shadow-lg active:scale-95 transition-all">Close View</button></div>
            </div>
        `;
    } catch (e) { alert("Error: " + e.message); } finally { window.hideGlobalSpinner(); }
};

window.openStaffProfileModal = async (mobile) => {
    window.showGlobalSpinner("Loading Profile...");
    try {
        const snap = await get(ref(db, 'staff/' + mobile));
        if (!snap.exists()) throw new Error("Staff record not found");
        const s = snap.val();

        let modal = document.getElementById('view-staff-modal');
        modal.classList.remove('hidden'); modal.style.display = 'flex';
        const profileImg = window.getDirectDriveImageUrl(s.profilePicUrl);

        modal.innerHTML = `
            <div class="bg-white w-full max-w-2xl rounded-[40px] overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] fade-in">
                <div class="p-6 bg-indigo-600 text-white flex justify-between items-center">
                    <div><h3 class="text-xl font-black uppercase tracking-tight">Staff Profile</h3><p class="text-[10px] text-white/60 font-bold uppercase mt-1">Mobile: ${mobile}</p></div>
                    <button onclick="document.getElementById('view-staff-modal').classList.add('hidden');"><i class="fa-solid fa-xmark text-lg"></i></button>
                </div>
                <div class="p-8 overflow-y-auto flex-1 bg-slate-50">
                    <div class="flex flex-col md:flex-row gap-8 items-start">
                        <div class="w-full md:w-48 flex-shrink-0">
                            <div class="w-48 h-48 rounded-[32px] overflow-hidden border-4 border-white shadow-xl bg-white mx-auto"><img src="${profileImg}" class="w-full h-full object-cover" onerror="this.src='https://ui-avatars.com/api/?name=${(s.fullName || s.name || 'U').replace(/ /g, '+')}&background=4f46e5&color=fff&size=192'"></div>
                        </div>
                        <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 text-gray-800">
                            <div class="bg-white p-4 rounded-2xl border shadow-sm"><label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">Full Name</label><p class="text-sm font-black text-indigo-900">${s.fullName || s.name || "-"}</p></div>
                            <div class="bg-white p-4 rounded-2xl border shadow-sm"><label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">Mobile Number</label><p class="text-sm font-black text-slate-700 font-mono">${s.mobile || "-"}</p></div>
                            <div class="bg-white p-4 rounded-2xl border shadow-sm"><label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">Company Name</label><p class="text-sm font-black text-slate-700">${s.companyName || "-"}</p></div>
                            <div class="bg-white p-4 rounded-2xl border shadow-sm"><label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">Company ID</label><p class="text-sm font-black text-slate-700 font-mono">${s.companyId || "-"}</p></div>
                            <div class="bg-white p-4 rounded-2xl border shadow-sm"><label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">Position / Role</label><p class="text-sm font-black text-slate-700 uppercase">${s.role || s.position || "-"}</p></div>
                            <div class="bg-white p-4 rounded-2xl border shadow-sm"><label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">ADEK Pass</label><p class="text-sm font-black text-slate-700 font-mono">${s.adekPass || "-"}</p></div>
                            <div class="bg-white p-4 rounded-2xl border shadow-sm col-span-full"><label class="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">Account Password</label><p class="text-sm font-black text-indigo-600 font-mono">${s.password || "-"}</p></div>
                        </div>
                    </div>
                </div>
                <div class="p-6 border-t bg-white flex justify-end"><button onclick="document.getElementById('view-staff-modal').classList.add('hidden');" class="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase shadow-lg active:scale-95 transition-all">Close Profile</button></div>
            </div>
        `;
    } catch (e) { alert("Error: " + e.message); } finally { window.hideGlobalSpinner(); }
};

window.filterVisitorTable = () => {
    const query = document.getElementById('visitor-search')?.value.toLowerCase();
    const date = document.getElementById('visitor-date-filter')?.value;
    let filtered = window.appCache.visitors;
    if (query) filtered = filtered.filter(v => (v.name || '').toLowerCase().includes(query) || (v.id || '').toLowerCase().includes(query) || (v.mobile || '').includes(query));
    if (date) filtered = filtered.filter(v => v.date === new Date(date).toLocaleDateString('en-US'));
    window.currentFilteredData.visitors = filtered; renderVisitorLogs(filtered);
};

window.filterContractorTable = () => {
    const query = document.getElementById('contractor-search')?.value.toLowerCase();
    const date = document.getElementById('contractor-date-filter')?.value;
    let filtered = window.appCache.contractors;
    if (query) filtered = filtered.filter(c => (c.name || '').toLowerCase().includes(query) || (c.contractorId || '').toLowerCase().includes(query) || (c.mobile || '').includes(query) || (c.company || '').toLowerCase().includes(query));
    if (date) filtered = filtered.filter(c => c.date === new Date(date).toLocaleDateString('en-US'));
    window.currentFilteredData.contractors = filtered; renderContractorLogs(filtered);
};

window.openDetailedAuditModal = async (type, id) => {
    window.showGlobalSpinner("Loading details...");
    try {
        const dbPath = type === 'contractor' ? 'contractor_logs' : 'visitors';
        const snap = await get(ref(db, `${dbPath}/${id}`));
        if (!snap.exists()) throw new Error("Record not found.");
        const data = snap.val();

        let modal = document.getElementById('view-staff-modal'); // Reusing staff modal
        modal.classList.remove('hidden'); modal.style.display = 'flex';

        const sigImg = window.getDirectDriveImageUrl(data.signatureUrl);
        const getVal = (v) => v || '-';
        let keyStatusHtml = '<span class="text-slate-400 font-bold">❌ NO KEY</span>';
        if (data.keyCollected === 'YES' || data.keyCollected === true) {
            keyStatusHtml = data.status === 'SIGNED OUT' ? '<span class="text-emerald-500 font-bold">✅ KEY RETURNED</span>' : '<span class="text-amber-500 font-bold">🔑 KEY HELD</span>';
        }

        const headerColor = type === 'contractor' ? 'bg-emerald-600' : 'bg-indigo-600';

        modal.innerHTML = `
            <div class="bg-white w-full max-w-2xl rounded-[40px] overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] fade-in text-gray-800">
                <div class="p-6 ${headerColor} text-white flex justify-between items-center">
                    <div><h3 class="text-xl font-black uppercase tracking-tight">${type} Detail</h3><p class="text-[10px] text-white/60 font-bold uppercase mt-1">ID: ${id}</p></div>
                    <button onclick="document.getElementById('view-staff-modal').classList.add('hidden');"><i class="fa-solid fa-xmark text-lg"></i></button>
                </div>
                <div class="p-8 overflow-y-auto flex-1 bg-slate-50">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div class="space-y-4">
                            <h4 class="${type === 'contractor' ? 'text-emerald-600' : 'text-indigo-600'} font-black text-xs uppercase tracking-widest border-b pb-2">Personal Info</h4>
                            <div class="p-4 bg-white rounded-2xl border shadow-sm flex flex-col gap-3">
                                <div><label class="text-[8px] font-black text-slate-400 uppercase block">Name</label><p class="text-sm font-black text-indigo-900">${getVal(data.name)}</p></div>
                                <div><label class="text-[8px] font-black text-slate-400 uppercase block">Mobile</label><p class="text-xs font-bold text-slate-700">${getVal(data.mobile)}</p></div>
                                <div><label class="text-[8px] font-black text-slate-400 uppercase block">Company</label><p class="text-xs font-bold text-slate-700">${getVal(data.company)}</p></div>
                                ${type === 'contractor' ? `<div><label class="text-[8px] font-black text-slate-400 uppercase block">Badge No</label><p class="text-xs font-bold text-slate-700 font-mono">${getVal(data.contractorId)}</p></div>` : ''}
                            </div>
                        </div>
                        <div class="space-y-4">
                            <h4 class="${type === 'contractor' ? 'text-emerald-600' : 'text-indigo-600'} font-black text-xs uppercase tracking-widest border-b pb-2">Visit Details</h4>
                            <div class="p-4 bg-white rounded-2xl border shadow-sm flex flex-col gap-3">
                                <div><label class="text-[8px] font-black text-slate-400 uppercase block">Purpose</label><p class="text-xs font-bold text-slate-700">${getVal(data.purpose)}</p></div>
                                <div><label class="text-[8px] font-black text-slate-400 uppercase block">Date</label><p class="text-xs font-bold text-slate-700 font-mono">${getVal(data.date)}</p></div>
                                <div class="grid grid-cols-2 gap-2">
                                    <div><label class="text-[8px] font-black text-slate-400 uppercase block">Time In</label><p class="text-xs font-black text-emerald-600">${getVal(data.timeIn)}</p></div>
                                    <div><label class="text-[8px] font-black text-slate-400 uppercase block">Time Out</label><p class="text-xs font-black text-red-500">${getVal(data.outTime)}</p></div>
                                </div>
                                <div><label class="text-[8px] font-black text-slate-400 uppercase block">Key Status</label>${keyStatusHtml}</div>
                            </div>
                        </div>
                        <div class="col-span-full space-y-2 text-center">
                            <label class="text-[8px] font-black text-slate-400 uppercase block">Digital Signature</label>
                            <div class="h-40 bg-white rounded-3xl border flex items-center justify-center p-4 overflow-hidden"><img id="modalSignaturePreview" src="${sigImg}" class="max-w-full max-h-full object-contain cursor-pointer" onclick="window.openImageZoom('${sigImg}')" onerror="this.src='https://placehold.co/400x200/f1f5f9/64748b?text=No+Sig'"></div>
                        </div>
                    </div>
                    <!-- NEW VERIFICATION CONTAINER -->
                    <div class="mt-4 p-3 bg-slate-900/50 rounded-xl border border-slate-700/50 text-center">
                        <p class="text-xs font-semibold text-slate-400 mb-2 uppercase">Verification Signature</p>
                        <img src="${sigImg}" class="max-h-24 mx-auto object-contain bg-white rounded-lg p-1 shadow-inner" alt="Verification Signature" onclick="window.openImageZoom('${sigImg}')">
                    </div>
                </div>
                <div class="p-6 border-t bg-white flex justify-end"><button onclick="document.getElementById('view-staff-modal').classList.add('hidden');" class="px-8 py-3 ${headerColor} text-white rounded-xl font-black text-xs uppercase shadow-lg active:scale-95 transition-all">Close</button></div>
            </div>
        `;
    } catch (e) { alert("Error: " + e.message); } finally { window.hideGlobalSpinner(); }
};

window.filterStaffTable = () => {
    const query = document.getElementById('staff-search')?.value.toLowerCase();
    const date = document.getElementById('staff-date-filter')?.value;
    const role = document.getElementById('staff-role-filter')?.value;
    let filtered = window.appCache.attendance;
    if (query) filtered = filtered.filter(a => (a.name || '').toLowerCase().includes(query) || (a.mobile || '').includes(query));
    if (date) filtered = filtered.filter(a => a.date === new Date(date).toLocaleDateString());
    if (role) filtered = filtered.filter(a => (a.role || a.position || '').toLowerCase().includes(role));
    window.currentFilteredData.staff = filtered; renderStaffAttendance(filtered);
};

window.filterAssetTable = () => {
    const query = document.getElementById('asset-search')?.value.toLowerCase();
    let filtered = window.appCache.assets;
    if (query) filtered = filtered.filter(a => Object.values(a).some(val => String(val).toLowerCase().includes(query)));
    window.currentFilteredData.assets = filtered;
    const detectedHeaders = filtered.length > 0 ? Object.keys(filtered[0]).filter(k => !['assetId', 'updatedAt', 'profilePicUrl', '_importBatch', '_forceId', '_importSource'].includes(k)) : [];
    window.renderDynamicAssetTable(filtered, detectedHeaders);
};

window.filterDisposalTable = () => {
    const query = document.getElementById('disposal-search')?.value.toLowerCase();
    let filtered = window.appCache.assets.filter(a => a.assetStatus === 'Disposed');
    if (query) filtered = filtered.filter(a => Object.values(a).some(val => String(val).toLowerCase().includes(query)));
    window.currentFilteredData.disposal = filtered; window.renderStandardizedAssetTable(filtered, 'disposal');
};

window.filterTransferTable = () => {
    const query = document.getElementById('transfer-search')?.value.toLowerCase();
    let filtered = window.appCache.transfers;
    if (query) filtered = filtered.filter(t => Object.values(t).some(val => String(val).toLowerCase().includes(query)));
    window.currentFilteredData.transfers = filtered; window.renderStandardizedAssetTable(filtered, 'transfers');
};

// ================================================
// DYNAMIC ASSET DETAILS MODAL (👁️ VIEW FEATURE)
// ================================================
window.openAssetDetailsModal = async function(assetIdentifier) {
    if (!assetIdentifier) {
        alert("❌ Error: Invalid or Missing Asset Identifier.");
        return;
    }

    if (typeof window.showGlobalSpinner === 'function') {
        window.showGlobalSpinner("Fetching Asset Details...");
    }

    try {
        let asset = null;

        // Fetch from Firebase (Direct ID lookup or Barcode query fallback)
        const directSnap = await get(ref(db, `assets/${assetIdentifier}`));

        if (directSnap.exists()) {
            asset = directSnap.val();
        } else {
            const assetsRef = ref(db, 'assets');
            const barcodeQuery = query(assetsRef, orderByChild('assetBarcode'), equalTo(assetIdentifier));
            const querySnap = await get(barcodeQuery);

            if (querySnap.exists()) {
                const data = querySnap.val();
                const firstKey = Object.keys(data)[0];
                asset = data[firstKey];
            }
        }

        if (asset) {
            // 1. RENDER PHOTO
            const photoUrl = asset.photoURL || asset.photoUrl || asset.auditPhoto || asset.photo || asset['Photo Link'];
            const imgEl = document.getElementById('modal-asset-photo');
            const placeholderEl = document.getElementById('modal-photo-placeholder');

            if (imgEl && photoUrl && String(photoUrl).trim() !== '') {
                imgEl.src = window.getDirectDriveImageUrl ? window.getDirectDriveImageUrl(photoUrl) : photoUrl;
                imgEl.style.display = 'inline-block';
                if (placeholderEl) placeholderEl.style.display = 'none';
            } else if (imgEl) {
                imgEl.style.display = 'none';
                if (placeholderEl) placeholderEl.style.display = 'block';
            }

            // 2. DYNAMICALLY RENDER ALL EXCEL HEADERS AND VALUES
            const gridContainer = document.getElementById('dynamic-asset-fields-grid');
            if (gridContainer) {
                gridContainer.innerHTML = ''; // Clear previous fields

                // Filter out photo keys from text list if needed, or keep all
                const ignoredKeys = ['photoURL', 'photoUrl', 'photo', 'auditPhoto', 'id', 'firebaseKey', '_importBatch', '_forceId', '_importSource', 'updatedAt'];

                // Get all object keys (headers)
                Object.keys(asset).forEach(key => {
                    if (ignoredKeys.includes(key)) return;

                    const rawValue = asset[key];
                    const displayValue = (rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== '')
                        ? String(rawValue)
                        : '-';

                    // Convert key format (e.g., 'assetBarcode' -> 'ASSET BARCODE')
                    const formattedHeader = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toUpperCase().trim();

                    // Create Dynamic Card
                    const fieldCard = document.createElement('div');

                    // Distinct soft background with clear border for each box
                    fieldCard.className = 'bg-slate-50 p-3.5 rounded-2xl border border-slate-300 shadow-sm hover:border-indigo-400 hover:bg-white transition-all';

                    fieldCard.innerHTML = `
                        <!-- HEADER LABEL: Bright Indigo / Medium Size / Uppercase -->
                        <label class="text-[10px] font-black text-indigo-600 uppercase tracking-wider block mb-1 truncate" title="${formattedHeader}">
                            ${formattedHeader}
                        </label>

                        <!-- DETAIL VALUE: Deep Slate Dark / Larger Bold Text -->
                        <span class="text-sm font-black text-slate-900 break-words block leading-tight">
                            ${displayValue}
                        </span>
                    `;
                    gridContainer.appendChild(fieldCard);
                });
            }

            // 3. DISPLAY MODAL
            const modalEl = document.getElementById('asset-details-modal');
            if (modalEl) {
                modalEl.classList.remove('hidden');
                modalEl.classList.add('flex');
                modalEl.style.display = 'flex';
            }
        } else {
            alert("❌ Asset record not found in database.");
        }
    } catch (error) {
        console.error("Error loading dynamic asset details:", error);
        alert("❌ Failed to load asset details.");
    } finally {
        if (typeof window.hideGlobalSpinner === 'function') {
            window.hideGlobalSpinner();
        }
    }
};

window.closeAssetDetailsModal = function() {
    const modalEl = document.getElementById('asset-details-modal');
    if (modalEl) {
        modalEl.classList.add('hidden');
        modalEl.classList.remove('flex');
        modalEl.style.display = 'none';
    }
};

window.printAssetCard = (barcode) => {
    window.open(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${barcode}`, '_blank');
};

// ================================================
// DYNAMIC ASSET FORM HANDLERS
// ================================================
window.openEditAssetModal = async (barcode) => {
    window.showGlobalSpinner("Loading Asset Details...");
    try {
        const snap = await get(ref(db, 'assets/' + barcode));
        if (!snap.exists()) return alert("Asset not found");
        const asset = snap.val();

        const modal = document.getElementById('asset-edit-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.style.display = 'flex';

        // DYNAMIC FORM GENERATION
        let fieldsHtml = '';
        const fields = window.ALL_EXPECTED_FIELDS || [];

        fields.forEach(field => {
            const label = field.replace(/([A-Z])/g, ' $1').toUpperCase();
            fieldsHtml += `
                <div class="form-group mb-3">
                    <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">${label}</label>
                    <input type="text" id="edit-field-${field}" value="${asset[field] || ''}" class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500">
                </div>
            `;
        });

        // INJECT PHOTO FIELD
        fieldsHtml += `
            <div class="form-group mt-6 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                <label class="block text-[10px] font-black text-indigo-600 uppercase mb-2">📸 Asset Photo / Proof</label>
                <input type="file" id="asset-photo-upload" accept="image/*" capture="environment" class="w-full text-[10px] text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer">
                ${(asset.photoURL || asset.auditPhoto) ? `
                    <div class="mt-3 flex items-center gap-3">
                        <img src="${window.getDirectDriveImageUrl(asset.photoURL || asset.auditPhoto)}" class="h-16 w-16 object-cover rounded-xl border-2 border-white shadow-sm">
                        <span class="text-[8px] font-bold text-slate-400 uppercase">Existing Photo</span>
                    </div>
                ` : ''}
            </div>
        `;

        modal.innerHTML = `
            <div class="bg-white w-full max-w-2xl rounded-[40px] overflow-hidden shadow-2xl flex flex-col max-h-[90vh] fade-in">
                <div class="p-6 bg-indigo-900 text-white flex justify-between items-center flex-shrink-0">
                    <div>
                        <h3 class="text-xl font-black uppercase tracking-tight">Edit Asset Master</h3>
                        <p class="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mt-1">Barcode: ${barcode}</p>
                    </div>
                    <button onclick="document.getElementById('asset-edit-modal').classList.add('hidden'); document.getElementById('asset-edit-modal').style.display='none';" class="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                        <i class="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>
                <form id="edit-asset-dynamic-form" class="p-8 overflow-y-auto flex-1 bg-slate-50 space-y-1">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                        ${fieldsHtml}
                    </div>
                    <div class="pt-6 pb-2">
                        <button type="submit" id="save-asset-btn" class="w-full py-5 bg-gradient-to-r from-indigo-600 to-indigo-800 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-indigo-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3">
                            <i class="fa-solid fa-cloud-arrow-up text-lg"></i> Save Combined Data
                        </button>
                    </div>
                </form>
            </div>
        `;

        document.getElementById('edit-asset-dynamic-form').onsubmit = async (e) => {
            e.preventDefault();
            await window.submitAssetEdit(barcode);
        };

    } catch (err) {
        alert("Error loading asset: " + err.message);
    } finally {
        window.hideGlobalSpinner();
    }
};

window.submitAssetEdit = async (barcode) => {
    const btn = document.getElementById('save-asset-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    }

    window.showGlobalSpinner("Uploading & Saving Combined Data...");

    try {
        const data = {};
        const fields = window.ALL_EXPECTED_FIELDS || [];

        fields.forEach(field => {
            const input = document.getElementById(`edit-field-${field}`);
            if (input) data[field] = input.value.trim();
        });

        // 1. HANDLE PHOTO UPLOAD (FIRST) - DIRECT TO GOOGLE DRIVE
        const photoInput = document.getElementById('asset-photo-upload');
        if (photoInput && photoInput.files && photoInput.files[0]) {
            try {
                console.log("📸 Uploading photo to Google Drive...");
                const file = photoInput.files[0];
                const base64 = await window.compressImageFile(file, 800, 800, 0.7);

                if (window.uploadToDrive) {
                    const res = await window.uploadToDrive({
                        category: UPLOAD_CONFIG.CATEGORIES.ASSET_PHOTOS || 'ASSET_PHOTOS',
                        fileName: `Asset_${barcode}_${Date.now()}.jpg`,
                        image: base64
                    });
                    if (res && res.status === 'success' && res.fileUrl) {
                        data.photoURL = res.fileUrl;
                        data.auditPhoto = res.fileUrl;
                        console.log("✅ Drive upload complete:", res.fileUrl);
                    }
                }
            } catch (driveErr) {
                console.error("⚠️ Drive upload failed:", driveErr);
            }
        }

        // 2. SAVE TO DATABASE (ONLY AFTER UPLOAD ATTEMPT)
        data.updatedAt = new Date().toISOString();
        data.assetBarcode = barcode;

        await update(ref(db, 'assets/' + barcode), data);
        console.log("✅ Database record updated.");

        window.triggerSuccessPopup("Asset Data & Photo Updated! ✅");

        const modal = document.getElementById('asset-edit-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }

        if (window.refreshDashboardData) window.refreshDashboardData();

    } catch (error) {
        console.error("❌ Submission Error:", error);
        alert("❌ Failed to save asset data. Please check connection and try again.\nError: " + error.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up text-lg"></i> Save Combined Data';
        }
        window.hideGlobalSpinner();
    }
};

window.filterStaffDirectory = () => {
    const query = document.getElementById('directory-search')?.value.toLowerCase();
    const school = document.getElementById('directory-school-filter')?.value;
    const role = document.getElementById('directory-role-filter')?.value;
    let filtered = window.appCache.staff;
    if (query) filtered = filtered.filter(s => (s.fullName || s.name || '').toLowerCase().includes(query) || (s.mobile || '').includes(query) || (s.companyId || '').toLowerCase().includes(query));
    if (school) filtered = filtered.filter(s => (s.branch || s.school) === school);
    if (role) filtered = filtered.filter(s => (s.role || s.position || '').toLowerCase().includes(role));
    renderStaffDirectory(filtered);
};

console.log("✅ admin_module.js finalized");
