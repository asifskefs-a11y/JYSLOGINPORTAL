import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, get, set, update, remove, onValue, push, query, orderByChild, equalTo, child, off } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================================ */
// ADMIN DASHBOARD CORE MODULE (FIXED v4.7 - REAL-TIME METRICS)     */
// ================================================================ */

window.appCache = {
    isInitialized: false,
    visitors: [],
    contractors: [],
    staff: [], // Staff Directory
    tasks: [],
    assets: [],
    attendance: [], // Staff Attendance Logs
    transfers: [],
    disposalRegistry: [],
    disposalRequests: []
};

window.currentFilteredData = {
    visitors: null,
    contractors: null,
    staff: null,
    tasks: null,
    assets: null,
    disposal: null,
    transfers: null
};

// Selection State for Bulk Actions
window.selectedAssetKeys = new Set();

// Track active listeners for cleanup
let activeListeners = {
    assets: null,
    disposal: null,
    visitors: null,
    contractors: null,
    staff_attendance: null,
    staff_directory: null,
    tasks: null,
    disposal_requests: null
};

// ================================================================ */
// ✅ UTILITIES                                                     */
// ================================================================ */

window.debounce = function(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

window.filterActiveAssets = function(assets) {
    if (!assets || !Array.isArray(assets)) return [];
    return assets.filter(a => {
        if (!a) return false;
        const status = (a.assetStatus || a.status || '').toLowerCase();
        return status !== 'disposed' && status !== 'pending_disposal' && status !== 'scrapped';
    });
};

window.cleanupAdminListeners = function() {
    Object.keys(activeListeners).forEach(key => {
        if (typeof activeListeners[key] === 'function') {
            activeListeners[key](); // Call the Unsubscribe function
            activeListeners[key] = null;
        }
    });
    console.log("🧹 Admin listeners cleaned up");
};

// ================================================================ */
// ✅ REAL-TIME METRICS & KPI LOGIC                                 */
// ================================================================ */

window.updateAdminKPIs = function() {
    console.log("📊 Updating Dashboard KPI Metrics...");

    // 1. Get Today's Date String
    const todayStr = new Date().toLocaleDateString('en-US'); // M/D/YYYY

    const normalizeDate = (d) => {
        if (!d) return "";
        return d.split('/').map(p => parseInt(p)).join('/');
    };

    // 2. Aggregate Metrics

    // VISITORS TODAY
    const visitorsToday = window.appCache.visitors.filter(v => {
        return normalizeDate(v.date) === todayStr;
    }).length;

    // CONTRACTORS TODAY
    const contractorsToday = window.appCache.contractors.filter(c => {
        return normalizeDate(c.date) === todayStr;
    }).length;

    // ACTIVE TASKS
    const activeTasks = window.appCache.tasks.filter(t => {
        const s = (t.status || '').toLowerCase();
        return s !== 'closed' && s !== 'completed' && s !== 'rejected';
    }).length;

    // STAFF PRESENT
    const staffPresent = window.appCache.attendance.filter(a => {
        const s = (a.status || '').toLowerCase();
        return s === 'checked_in';
    }).length;

    // URGENT ALERTS
    const urgentAlerts = window.appCache.tasks.filter(t => {
        const p = (t.priority || '').toLowerCase();
        const s = (t.status || '').toLowerCase();
        return (p === 'high' || p === 'urgent' || p === 'critical') && s !== 'closed' && s !== 'completed';
    }).length;

    // 3. Update DOM Elements
    const safeUpdateText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };

    safeUpdateText('kpi-visitors', visitorsToday);
    safeUpdateText('kpi-contractors', contractorsToday);
    safeUpdateText('kpi-tasks', activeTasks);
    safeUpdateText('kpi-staff', staffPresent);
    safeUpdateText('kpi-alerts', urgentAlerts);

    // 4. Staff Census Breakdown
    const staffDir = window.appCache.staff;
    const totalStaff = staffDir.length;

    const countByRole = (roleKeywords) => {
        return staffDir.filter(s => {
            const role = (s.role || s.position || '').toLowerCase();
            return roleKeywords.some(kw => role.includes(kw));
        }).length;
    };

    const securityCount = countByRole(['security']);
    const cleanerLeaderCount = countByRole(['cleaner leader', 'cleaner_leader', 'leader']);
    const technicianCount = countByRole(['technician', 'tech']);
    const cleanerCount = staffDir.filter(s => {
        const role = (s.role || s.position || '').toLowerCase();
        return role.includes('cleaner') && !role.includes('leader');
    }).length;

    safeUpdateText('cntTotalStaff', totalStaff);
    safeUpdateText('cntSecurity', securityCount);
    safeUpdateText('cntCleanerLeader', cleanerLeaderCount);
    safeUpdateText('cntCleaner', cleanerCount);
    safeUpdateText('cntTechnician', technicianCount);

    // 5. Update Progress Bars
    const updateBar = (id, val, max) => {
        const el = document.getElementById(id);
        if (el) el.style.width = Math.min(100, (val / (max || 1)) * 100) + '%';
    };

    updateBar('bar-visitors', visitorsToday, 50);
    updateBar('bar-contractors', contractorsToday, 20);
    updateBar('bar-tasks', activeTasks, 30);
    updateBar('bar-staff', staffPresent, 30);
    updateBar('bar-alerts', urgentAlerts, 10);
};

// ================================================================ */
// ✅ REAL-TIME DATA LISTENERS                                      */
// ================================================================ */

window.initAdminRealTimeListeners = function() {
    window.cleanupAdminListeners();
    console.log("📡 Initializing Admin Real-Time Firebase Observers...");

    const registerListener = (node, cacheKey, tabId = null, filterFunc = null) => {
        activeListeners[node] = onValue(ref(db, node), (snapshot) => {
            if (snapshot.exists()) {
                const rawData = snapshot.val();
                // ✅ Convert to array while PRESERVING Firebase keys for isolation and editing
                if (rawData && typeof rawData === 'object') {
                    window.appCache[cacheKey] = Object.entries(rawData).map(([key, val]) => {
                        if (val && typeof val === 'object') {
                            return { ...val, firebaseKey: key };
                        }
                        return val;
                    });
                } else {
                    window.appCache[cacheKey] = [];
                }
            } else {
                window.appCache[cacheKey] = [];
            }

            window.updateAdminKPIs();

            // Auto-refresh visible tab if it matches
            const activeTab = document.querySelector('.tab-section.active')?.id;
            if (activeTab === tabId && filterFunc) {
                filterFunc();
            } else if (activeTab === tabId) {
                window.renderTabFromAppCache(tabId);
            }
        });
    };

    registerListener('visitors', 'visitors', 'tab-visitor-logs', window.filterVisitorTable);
    registerListener('contractors', 'contractors', 'tab-contractor-logs', window.filterContractorTable);
    registerListener('staff_attendance', 'attendance', 'tab-staff-logs', window.filterStaffTable);
    registerListener('tasks', 'tasks', 'tab-tasks');
    registerListener('staff', 'staff', 'tab-staff-list', window.filterStaffDirectory);
    registerListener('ASSET_DISPOSAL_REGISTRY', 'disposalRegistry', 'tab-disposal');
    registerListener('asset_disposal_requests', 'disposalRequests', 'tab-disposal', window.filterDisposalTable);
    registerListener('asset_transfers', 'transfers', 'tab-transfers', window.filterTransferTable);

    // Assets needs special handling for local cache
    activeListeners.assets = onValue(ref(db, 'assets'), (snapshot) => {
        if (snapshot.exists()) {
            window.appCache.assets = Object.values(snapshot.val());
            localStorage.setItem('cached_asset_register', JSON.stringify(window.appCache.assets));
            if (document.querySelector('.tab-section.active')?.id === 'tab-assets') {
                window.filterAssetTable();
            }
        }
    });
};

// ================================================================ */
// ✅ DASHBOARD CORE FLOWS                                          */
// ================================================================ */

window.loadAdminDashboard = () => {
    window.initAdminRealTimeListeners();
    window.updateAdminProfileHeader();
    setTimeout(() => {
        window.renderTabFromAppCache('tab-visitor-logs');
        window.appCache.isInitialized = true;
    }, 1000);
};

window.refreshDashboardData = async () => {
    window.loadAdminDashboard();
};

// ================================================================ */
// ✅ RENDER ENGINE                                                 */
// ================================================================ */

window.renderTabFromAppCache = (tabId) => {
    window.showGlobalSpinner("Syncing View...");
    try {
        switch (tabId) {
            case 'tab-visitor-logs': renderVisitorLogs(window.currentFilteredData.visitors || window.appCache.visitors); break;
            case 'tab-contractor-logs': renderContractorLogs(window.currentFilteredData.contractors || window.appCache.contractors); break;
            case 'tab-staff-logs': renderStaffAttendance(window.currentFilteredData.staff || window.appCache.attendance); break;
            case 'tab-tasks': renderGlobalTaskAudit(window.currentFilteredData.tasks || window.appCache.tasks); break;
            case 'tab-staff-list': renderStaffDirectory(window.appCache.staff); break;
            case 'tab-assets': window.filterAssetTable(); break;
            case 'tab-disposal': window.loadAdminDisposalTable(); break;
            case 'tab-transfers': window.renderStandardizedAssetTable(window.currentFilteredData.transfers || window.appCache.transfers, 'transfers'); break;
            case 'tab-settings': if (window.loadGoogleDriveConfig) window.loadGoogleDriveConfig(); break;
        }
    } finally {
        window.hideGlobalSpinner();
    }
};

function renderVisitorLogs(visitors) {
    const body = document.getElementById('visitor-logs-body');
    if (!body) return;
    const data = (visitors || []).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    window.adminPaginators.visitors.init(data, (pageItems, startIndex) => {
        body.innerHTML = pageItems.length ? pageItems.map((v, i) => `
            <tr class="hover:bg-slate-50 transition-colors border-b text-[10px]">
                <td class="p-4 font-black text-indigo-900 uppercase">${v.type || "VISITOR"}</td>
                <td class="p-4 font-mono font-bold">${v.id || "-"}</td>
                <td class="p-4 font-bold text-slate-800">${v.name || "-"}</td>
                <td class="p-4">${v.mobile || "-"}</td>
                <td class="p-4">${v.company || "-"}</td>
                <td class="p-4 truncate max-w-[120px]">${v.purpose || "-"}</td>
                <td class="p-4">${v.date || "-"}</td>
                <td class="p-4 text-emerald-600 font-bold">${v.timeIn || "-"}</td>
                <td class="p-4 text-red-500 font-bold">${v.outTime || "-"}</td>
                <td class="p-4"><span class="status-badge ${v.status === 'SIGNED OUT' ? 'closed' : 'open'}">${v.status || "Active"}</span></td>
                <td class="p-4 text-center">${(v.keyCollected === 'YES' || v.keyCollected === true) ? '🔑 HELD' : '❌ NO'}</td>
                <td class="p-4 text-center">${v.signatureUrl ? `<img src="${v.signatureUrl}" class="h-6 mx-auto rounded border shadow-sm" onclick="window.openImageZoom('${v.signatureUrl}')">` : 'No Sig'}</td>
                <td class="p-4 text-center"><button onclick="window.openDetailedAuditModal('visitor', '${v.id}')" class="text-indigo-600 hover:scale-110"><i class="fa-solid fa-eye"></i></button></td>
            </tr>`).join('') : '<tr><td colspan="13" class="p-8 text-center text-gray-400">No records found</td></tr>';
    });
}

function renderContractorLogs(contractors) {
    const body = document.getElementById('contractor-logs-body');
    if (!body) return;
    const data = (contractors || []).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    window.adminPaginators.contractors.init(data, (pageItems, startIndex) => {
        body.innerHTML = pageItems.length ? pageItems.map((c, i) => `
            <tr class="hover:bg-slate-50 border-b text-[10px]">
                <td class="p-4 font-mono font-bold text-emerald-600">${c.id || "-"}</td>
                <td class="p-4 font-bold text-slate-800">${c.name || "-"}</td>
                <td class="p-4">${c.mobile || "-"}</td>
                <td class="p-4 font-bold text-indigo-600">${c.company || "-"}</td>
                <td class="p-4 truncate max-w-[150px]">${c.purpose || "-"}</td>
                <td class="p-4 font-mono text-slate-500">${c.contractorId || "-"}</td>
                <td class="p-4">${c.date || "-"}</td>
                <td class="p-4 text-emerald-600 font-bold">${c.timeIn || "-"}</td>
                <td class="p-4 text-red-500 font-bold">${c.outTime || "-"}</td>
                <td class="p-4"><span class="status-badge ${c.status === 'SIGNED OUT' ? 'closed' : 'open'}">${c.status || "Active"}</span></td>
                <td class="p-4 text-center">${(c.keyCollected === 'YES' || c.keyCollected === true) ? '🔑 HELD' : '❌ NO'}</td>
                <td class="p-4 text-center">${c.signatureUrl ? `<img src="${c.signatureUrl}" class="h-6 mx-auto rounded border shadow-sm">` : 'No Sig'}</td>
                <td class="p-4 text-center"><button onclick="window.openDetailedAuditModal('contractor', '${c.id}')" class="text-emerald-600 hover:scale-110"><i class="fa-solid fa-eye"></i></button></td>
            </tr>`).join('') : '<tr><td colspan="13" class="p-8 text-center text-gray-400">No records found</td></tr>';
    });
}

function renderStaffAttendance(attendance) {
    const body = document.getElementById('staff-attendance-body');
    if (!body) return;
    const data = (attendance || []).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    window.adminPaginators.attendance.init(data, (pageItems) => {
        body.innerHTML = pageItems.length ? pageItems.map(a => `
            <tr class="hover:bg-slate-50 border-b text-[10px]">
                <td class="p-4 font-black text-indigo-900 uppercase">${a.name || "-"}</td>
                <td class="p-4 font-mono text-slate-500">${a.id || "-"}</td>
                <td class="p-4">${a.mobile || "-"}</td>
                <td class="p-4 font-bold text-indigo-600">${a.companyName || "N/A"}</td>
                <td class="p-4">${a.companyId || "N/A"}</td>
                <td class="p-4 font-bold text-slate-600">${a.branch || a.school || "N/A"}</td>
                <td class="p-4 text-center"><span class="role-badge role-default">${a.role || "-"}</span></td>
                <td class="p-4 font-mono text-slate-400">${a.adekPass || "-"}</td>
                <td class="p-4 font-mono text-slate-400">${a.date || "-"}</td>
                <td class="p-4 text-emerald-600 font-black">${a.timeIn || "-"}</td>
                <td class="p-4 text-red-500 font-black">${a.checkOutTime || "-"}</td>
                <td class="p-4 text-center font-bold">${a.keyStatus || "NONE"}</td>
                <td class="p-4 text-center">${a.signatureUrl ? `<img src="${a.signatureUrl}" class="h-6 mx-auto rounded border shadow-sm" onclick="window.openImageZoom('${a.signatureUrl}')">` : 'No Sig'}</td>
                <td class="p-4 text-center">
                    <button onclick="window.openAttendanceDetailModal('${a.mobile}_${a.timestamp}')" class="text-indigo-600 hover:scale-110 transition-transform">
                        <i class="fa-solid fa-eye text-base"></i>
                    </button>
                </td>
            </tr>`).join('') : '<tr><td colspan="14" class="p-8 text-center text-gray-400">No records found</td></tr>';
    });
}

function renderGlobalTaskAudit(tasks) {
    const body = document.getElementById('admin-task-list-body');
    if (!body) return;
    const data = (tasks || []).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    window.adminPaginators.tasks.init(data, (pageItems) => {
        body.innerHTML = pageItems.length ? pageItems.map(t => `
            <tr class="text-[10px] border-b hover:bg-slate-50 transition-colors cursor-pointer" onclick="window.openTaskInspector('${t.id}')">
                <td class="p-3 font-mono text-indigo-600 font-bold">${t.id || "-"}</td>
                <td class="p-3">${t.assignedSchool || "-"}</td>
                <td class="p-3 font-bold">${t.location || "-"}</td>
                <td class="p-3 truncate max-w-[150px]">${t.details || "-"}</td>
                <td class="p-3 uppercase text-[8px] font-black">${t.assignedRole || "-"}</td>
                <td class="p-3 font-bold">${t.raisedByName || "Admin"}</td>
                <td class="p-3 font-bold text-emerald-600">${t.solvedByName || "-"}</td>
                <td class="p-3"><span class="status-badge ${(t.status || 'Open').toLowerCase()}">${t.status || "Open"}</span></td>
                <td class="p-3 italic text-slate-500">${t.completionComment || t.rejectionReason || "-"}</td>
                <td class="p-3 text-center">
                    <div class="flex items-center justify-center gap-1">
                        ${t.beforePhotoUrl ? '<i class="fa-solid fa-camera text-amber-500" title="Before Photo"></i>' : ''}
                        ${t.afterPhotoUrl ? '<i class="fa-solid fa-camera-retro text-emerald-500" title="After Photo"></i>' : ''}
                    </div>
                </td>
            </tr>`).join('') : '<tr><td colspan="10" class="p-8 text-center text-gray-400">No tasks found</td></tr>';
    });
}

function renderStaffDirectory(staff) {
    const body = document.getElementById('admin-staff-list-body');
    if (!body) return;
    window.adminPaginators.directory.init(staff || [], (pageItems) => {
        body.innerHTML = pageItems.length ? pageItems.map(s => `
            <tr class="hover:bg-slate-50 border-b text-[10px]">
                <td class="p-4 text-center"><img src="${s.profilePicUrl || ''}" class="w-8 h-8 rounded-full border shadow-sm mx-auto" onerror="this.src=window.generateLocalAvatar('${s.fullName || 'U'}')"></td>
                <td class="p-4 font-black text-indigo-900 uppercase">${s.fullName || s.name || "-"}</td>
                <td class="p-4 font-mono text-slate-400">${s.password || "-"}</td>
                <td class="p-4 font-mono text-slate-500">${s.adekPass || "-"}</td>
                <td class="p-4 font-bold text-slate-600">${s.school || s.branch || "-"}</td>
                <td class="p-4 text-center"><span class="role-badge role-default">${s.role || s.position || "-"}</span></td>
                <td class="p-4 font-bold text-slate-700">${s.companyName || "-"}</td>
                <td class="p-4 font-mono text-indigo-600 font-bold">${s.companyId || "-"}</td>
                <td class="p-4 font-mono text-slate-500">${s.mobile || "-"}</td>
                <td class="p-4 text-center"><button onclick="window.openEditStaffModal('${s.firebaseKey || s.mobile}')" class="text-indigo-400 hover:text-indigo-600"><i class="fa-solid fa-user-pen"></i></button></td>
            </tr>`).join('') : '<tr><td colspan="10" class="p-8 text-center text-gray-400">No staff found</td></tr>';
    });
}

// ================================================================ */
// ✅ FILTER LOGIC                                                  */
// ================================================================ */

window.filterVisitorTable = window.debounce(() => {
    const q = document.getElementById('visitor-search')?.value?.toLowerCase() || '';
    const d = document.getElementById('visitor-date-filter')?.value;
    let f = window.appCache.visitors;
    if (q) f = f.filter(v => (v.name||'').toLowerCase().includes(q) || (v.id||'').toLowerCase().includes(q) || (v.mobile||'').includes(q));
    if (d) f = f.filter(v => v.date === new Date(d).toLocaleDateString('en-US'));
    window.currentFilteredData.visitors = f; renderVisitorLogs(f);
}, 300);

window.filterContractorTable = window.debounce(() => {
    const q = document.getElementById('contractor-search')?.value?.toLowerCase() || '';
    const d = document.getElementById('contractor-date-filter')?.value;
    let f = window.appCache.contractors;
    if (q) f = f.filter(c => (c.name||'').toLowerCase().includes(q) || (c.company||'').toLowerCase().includes(q));
    if (d) f = f.filter(c => c.date === new Date(d).toLocaleDateString('en-US'));
    window.currentFilteredData.contractors = f; renderContractorLogs(f);
}, 300);

window.filterStaffTable = window.debounce(() => {
    const q = document.getElementById('staff-search')?.value?.toLowerCase() || '';
    const d = document.getElementById('staff-date-filter')?.value;
    const r = document.getElementById('staff-role-filter')?.value;
    let f = window.appCache.attendance;
    if (q) f = f.filter(a => (a.name||'').toLowerCase().includes(q) || (a.mobile||'').includes(q));
    if (d) f = f.filter(a => a.date === new Date(d).toLocaleDateString());
    if (r && r !== 'all') f = f.filter(a => (a.role||'').toLowerCase().includes(r.replace('_',' ')));
    window.currentFilteredData.staff = f; renderStaffAttendance(f);
}, 300);

window.filterStaffDirectory = () => {
    const q = document.getElementById('directory-search')?.value?.toLowerCase() || '';
    const r = document.getElementById('directory-role-filter')?.value;
    let f = window.appCache.staff;
    if (q) f = f.filter(s => (s.fullName||'').toLowerCase().includes(q) || (s.mobile||'').includes(q));
    if (r && r !== 'all') f = f.filter(s => (s.role||'').toLowerCase().includes(r.replace('_',' ')));
    renderStaffDirectory(f);
};

// ================================================================ */
// ✅ MISC HANDLERS & ASSET MGMT                                    */
// ================================================================ */

window.updateAdminProfileHeader = async () => {
    try {
        const mobile = '961486864461';
        const snap = await get(ref(db, `users/${mobile}`));
        if (snap.exists()) {
            const pic = document.getElementById('adminProfileHeaderPic');
            if (pic && snap.val().profilePicUrl) pic.src = window.getDirectDriveImageUrl(snap.val().profilePicUrl);
        }
    } catch (e) {}
};

window.filterAssetTable = window.debounce(() => {
    const q = document.getElementById('asset-search')?.value?.toLowerCase() || '';
    let f = window.filterActiveAssets(window.appCache.assets || []);
    if (q) f = f.filter(a => Object.values(a).some(v => String(v).toLowerCase().includes(q)));
    window.currentFilteredData.assets = f;
    if (typeof window.renderDynamicAssetTable === 'function') {
        const headers = f.length ? Object.keys(f[0]).filter(k => !['assetId', 'updatedAt', '_raw', '_key'].includes(k)) : [];
        window.renderDynamicAssetTable(f, headers);
    }
}, 300);

// ================================================================ */
// ✅ BULK ACTIONS                                                  */
// ================================================================ */

window.confirmAndDeleteAllAssets = async function() {
    const v = prompt("Type 'DELETE ALL' to confirm:");
    if (v !== "DELETE ALL") return;
    window.showGlobalSpinner("Clearing database...");
    try { await set(ref(db, 'assets'), null); window.appCache.assets = []; alert("Success."); window.filterAssetTable(); }
    catch (e) { alert(e.message); } finally { window.hideGlobalSpinner(); }
};

window.bulkDeleteAssets = async () => {
    if (window.selectedAssetKeys.size === 0) return alert("Select assets.");
    if (!confirm(`Delete ${window.selectedAssetKeys.size} assets?`)) return;
    window.showLoader();
    try {
        const updates = {};
        Array.from(window.selectedAssetKeys).forEach(b => { updates[`assets/${b.replace(/[.#$\[\]/]/g, '_')}`] = null; });
        await update(ref(db), updates);
        window.selectedAssetKeys.clear();
        alert("Deleted.");
    } catch (e) { alert(e.message); } finally { window.hideLoader(); }
};
// ================================================================ */
// ✅ STAFF MANAGEMENT LOGIC (PHOTO + DRIVE + FIREBASE)             */
// ================================================================ */

let staffPhotoBase64 = ""; // Global variable to store selected image

/**
 * 1. Open Modal and Inject HTML Form
 */
window.openAddStaffModal = function() {
    const modal = document.getElementById('add-staff-modal');
    if (!modal) return;

    modal.innerHTML = `
        <div class="bg-white w-full max-w-xl rounded-[40px] overflow-hidden shadow-2xl p-10 relative">
            <div class="flex justify-between items-center mb-8">
                <h3 class="text-2xl font-black text-indigo-900 uppercase tracking-tight">Register New Staff</h3>
                <button onclick="window.closeStaffModal('add')" class="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all">&times;</button>
            </div>

            <form id="add-staff-form" class="space-y-6" onsubmit="event.preventDefault(); window.handleStaffSubmit('add')">

                <!-- ✅ CRITICAL: Hidden field to track unique record key -->
                <input type="hidden" id="staff-db-key" value="">

                <!-- Profile Photo Picker -->
                <div class="flex flex-col items-center mb-6">
                    <div class="relative group">
                        <div class="w-28 h-28 rounded-full bg-slate-100 border-4 border-white shadow-xl overflow-hidden flex items-center justify-center">
                            <img id="staff-photo-preview" src="" class="w-full h-full object-cover hidden">
                            <i id="staff-photo-icon" class="fa-solid fa-camera text-4xl text-slate-300"></i>
                        </div>
                        <input type="file" id="staff-photo-input" accept="image/*" class="absolute inset-0 opacity-0 cursor-pointer" onchange="window.previewStaffPhoto(this)">
                    </div>
                    <p class="text-[10px] font-black text-indigo-500 uppercase mt-3 tracking-widest">Upload Profile Image</p>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <input type="text" id="staff-name" placeholder="Full Name" required class="p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500 text-sm font-bold">
                    <input type="tel" id="staff-mobile" placeholder="Mobile (Login ID)" required class="p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500 text-sm font-bold">
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <input type="text" id="staff-adek" placeholder="ADEK Pass No" required class="p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500 text-sm font-bold">
                    <input type="text" id="staff-pass" placeholder="Login Password" required class="p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500 text-sm font-bold">
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <select id="staff-role" required class="p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500 text-sm font-bold">
                        <option value="">Select Role</option>
                        <option value="Security">Security</option>
                        <option value="Cleaner">Cleaner</option>
                        <option value="Cleaner Leader">Cleaner Leader</option>
                        <option value="Technician">Technician</option>
                        <option value="Gardener">Gardener</option>
                        <option value="Admin">Admin</option>
                    </select>
                    <select id="staff-school" required class="p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500 text-sm font-bold">
                        <option value="">Select School</option>
                        <option value="Jern Yafoor School 1">Jern Yafoor School 1</option>
                        <option value="Jern Yafoor School 2">Jern Yafoor School 2</option>
                    </select>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <input type="text" id="staff-company" placeholder="Company Name" class="p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500 text-sm font-bold">
                    <input type="text" id="staff-comp-id" placeholder="Company ID" class="p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500 text-sm font-bold">
                </div>

                <button type="submit" id="staff-save-btn" class="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-indigo-500/30 active:scale-95 transition-all">
                    Register Staff Member
                </button>
            </form>
        </div>
    `;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    staffPhotoBase64 = ""; // Reset image on open
};

/**
 * 2. Preview Selected Photo
 */
window.previewStaffPhoto = function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('staff-photo-preview');
            const icon = document.getElementById('staff-photo-icon');
            if (preview) {
                preview.src = e.target.result;
                preview.classList.remove('hidden');
                if (icon) icon.classList.add('hidden');
                staffPhotoBase64 = e.target.result; // Store for upload
            }
        };
        reader.readAsDataURL(input.files[0]);
    }
};

/**
 * 3. Handle Submit (Drive Upload + Firebase Save)
 */
window.handleStaffSubmit = async function(type) {
    const btn = document.getElementById('staff-save-btn');
    const mobile = document.getElementById('staff-mobile').value.trim();
    const existingKey = document.getElementById('staff-db-key')?.value || "";

    if (btn) btn.disabled = true;
    window.showGlobalSpinner("Saving Data & Uploading Photo...");

    try {
        let finalPhotoUrl = "";

        // STEP A: Upload to Google Drive if image is selected
        if (staffPhotoBase64 && window.uploadToDrive) {
            const uploadRes = await window.uploadToDrive({
                category: UPLOAD_CONFIG.CATEGORIES.STAFF_PHOTOS || 'STAFF_PHOTOS',
                fileName: `Staff_Profile_${mobile}_${Date.now()}.jpg`,
                image: staffPhotoBase64
            });
            if (uploadRes && uploadRes.status === 'success') {
                finalPhotoUrl = uploadRes.fileUrl;
            }
        }

        // STEP B: Prepare Database Object
        const staffData = {
            fullName: document.getElementById('staff-name').value.trim(),
            mobile: mobile,
            adekPass: document.getElementById('staff-adek').value.trim(),
            password: document.getElementById('staff-pass').value.trim(),
            role: document.getElementById('staff-role').value,
            school: document.getElementById('staff-school').value,
            companyName: document.getElementById('staff-company').value.trim() || "N/A",
            companyId: document.getElementById('staff-comp-id').value.trim() || "N/A",
            updatedAt: Date.now()
        };

        if (finalPhotoUrl) {
            staffData.profilePicUrl = finalPhotoUrl;
        }

        // 🚨 CRITICAL FIX: To prevent overwriting, we use unique keys
        // If existingKey is present, it's an EDIT (update existing node)
        // If existingKey is EMPTY, it's a NEW staff (use push() for unique ID)

        if (existingKey) {
            console.log("💾 Updating existing staff record:", existingKey);
            await update(ref(db, `staff/${existingKey}`), staffData);
        } else {
            console.log("🆕 Creating new unique staff record");
            await push(ref(db, 'staff'), staffData);
        }

        alert("✅ Staff Member Successfully Registered!");
        window.closeStaffModal(type);

        // Refresh the list if the function exists
        if (window.filterStaffDirectory) window.filterStaffDirectory();

    } catch (error) {
        console.error("Staff Save Error:", error);
        alert("❌ Error: " + error.message);
    } finally {
        if (btn) btn.disabled = false;
        window.hideGlobalSpinner();
    }
};

/**
 * 4. Close Modals
 */
window.closeStaffModal = function(type) {
    const modalId = type === 'add' ? 'add-staff-modal' : 'edit-staff-modal';
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

/**
 * 5. Edit Staff Logic (Loads existing data)
 */
window.openEditStaffModal = async function(dbKey) {
    try {
        const snap = await get(ref(db, `staff/${dbKey}`));
        if (!snap.exists()) return alert("Staff record not found.");

        const s = snap.val();
        window.openAddStaffModal(); // Open UI First

        // Update Title and Button text for Edit mode
        const title = document.querySelector('#add-staff-modal h3');
        if (title) title.innerText = "Edit Staff Member";
        const saveBtn = document.getElementById('staff-save-btn');
        if (saveBtn) saveBtn.innerText = "Update Staff Details";

        // Set the hidden database key
        const keyInput = document.getElementById('staff-db-key');
        if (keyInput) keyInput.value = dbKey;

        // Fill Form Fields
        document.getElementById('staff-name').value = s.fullName || s.name || "";
        document.getElementById('staff-mobile').value = s.mobile || "";
        document.getElementById('staff-mobile').readOnly = true; // Mobile cannot be changed
        document.getElementById('staff-adek').value = s.adekPass || "";
        document.getElementById('staff-pass').value = s.password || "";
        document.getElementById('staff-role').value = s.role || "";
        document.getElementById('staff-school').value = s.school || s.branch || "";
        document.getElementById('staff-company').value = s.companyName || "";
        document.getElementById('staff-comp-id').value = s.companyId || "";

        // Load Existing Photo Preview
        if (s.profilePicUrl) {
            const preview = document.getElementById('staff-photo-preview');
            const icon = document.getElementById('staff-photo-icon');
            if (preview) {
                preview.src = window.getDirectDriveImageUrl ? window.getDirectDriveImageUrl(s.profilePicUrl) : s.profilePicUrl;
                preview.classList.remove('hidden');
                if (icon) icon.classList.add('hidden');
            }
        }

    } catch (e) {
        console.error("Edit Staff Load Error:", e);
        alert("Failed to load staff details.");
    }
};
console.log("✅ admin_module.js Deployed - v4.7 Real-time Metrics Engine Active");

// ================================================================ */
// ✅ DETAILED MODAL HANDLERS (FIXED v4.8)                          */
// ================================================================ */

/**
 * 1. Open Attendance Detail Modal (Staff)
 */
window.openAttendanceDetailModal = function(staffKey) {
    if (!staffKey) return;

    // Find record in cache
    const record = window.appCache.attendance.find(a => `${a.mobile}_${a.timestamp}` === staffKey);
    if (!record) {
        alert("Attendance record not found in cache.");
        return;
    }

    const modal = document.getElementById('view-staff-modal');
    if (!modal) return;

    modal.innerHTML = `
        <div class="bg-white w-full max-w-xl rounded-[40px] overflow-hidden shadow-2xl p-8 sm:p-10 relative fade-in">
            <div class="flex justify-between items-center mb-8 border-b border-slate-100 pb-5">
                <div>
                    <h3 class="text-2xl font-black text-indigo-900 uppercase tracking-tight">Attendance Record</h3>
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Detailed Shift Log</p>
                </div>
                <button onclick="document.getElementById('view-staff-modal').classList.add('hidden')" class="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all text-xl">&times;</button>
            </div>

            <div class="space-y-6 text-gray-800">
                <!-- Profile Header -->
                <div class="flex items-center gap-5 bg-indigo-50 p-5 rounded-[2rem] border border-indigo-100 shadow-sm">
                    <div class="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center text-white text-3xl font-black shadow-lg shadow-indigo-200">
                        ${record.name ? record.name.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div class="flex-1 min-w-0">
                        <h4 class="font-black text-indigo-950 uppercase text-lg truncate">${record.name || 'Unknown Staff'}</h4>
                        <div class="flex flex-wrap gap-2 mt-1">
                            <span class="px-3 py-1 bg-indigo-100 text-indigo-700 text-[9px] font-black rounded-lg uppercase">${record.role || 'Staff'}</span>
                            <span class="px-3 py-1 bg-white/60 text-slate-500 text-[9px] font-bold rounded-lg border border-indigo-100">${record.mobile || 'No Mobile'}</span>
                        </div>
                    </div>
                </div>

                <!-- Timing Grid -->
                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-inner">
                        <span class="text-[9px] font-black text-emerald-600 uppercase block mb-1 tracking-wider"><i class="fa-solid fa-right-to-bracket mr-1"></i> Checked In</span>
                        <span class="font-black text-slate-900 text-sm">${record.timeIn || '--:--'}</span>
                    </div>
                    <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-inner">
                        <span class="text-[9px] font-black text-rose-500 uppercase block mb-1 tracking-wider"><i class="fa-solid fa-right-from-bracket mr-1"></i> Checked Out</span>
                        <span class="font-black text-slate-900 text-sm">${record.checkOutTime || '--:--'}</span>
                    </div>
                </div>

                <!-- Info Grid -->
                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                        <span class="text-[9px] font-black text-slate-400 uppercase block mb-1">Date of Shift</span>
                        <span class="font-bold text-slate-700 text-xs">${record.date || '-'}</span>
                    </div>
                    <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                        <span class="text-[9px] font-black text-slate-400 uppercase block mb-1">Key Status</span>
                        <span class="font-black text-indigo-600 text-xs">${record.keyStatus || 'NONE'}</span>
                    </div>
                </div>

                <!-- Signatures -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div class="text-center bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                        <span class="text-[9px] font-black text-indigo-400 uppercase block mb-3 tracking-widest underline decoration-2 underline-offset-4">Entry Signature</span>
                        <div class="h-24 flex items-center justify-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                            ${record.signatureUrl ? `<img src="${window.getDirectDriveImageUrl(record.signatureUrl)}" class="max-h-20 object-contain mix-blend-multiply" onclick="window.openImageZoom('${record.signatureUrl}')">` : '<span class="text-[10px] font-bold text-slate-300 uppercase">No Signature</span>'}
                        </div>
                    </div>
                    <div class="text-center bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                        <span class="text-[9px] font-black text-rose-400 uppercase block mb-3 tracking-widest underline decoration-2 underline-offset-4">Exit Signature</span>
                        <div class="h-24 flex items-center justify-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                            ${record.checkOutSignatureUrl ? `<img src="${window.getDirectDriveImageUrl(record.checkOutSignatureUrl)}" class="max-h-20 object-contain mix-blend-multiply" onclick="window.openImageZoom('${record.checkOutSignatureUrl}')">` : '<span class="text-[10px] font-bold text-slate-300 uppercase">No Signature</span>'}
                        </div>
                    </div>
                </div>
            </div>

            <button onclick="document.getElementById('view-staff-modal').classList.add('hidden')" class="w-full mt-10 py-5 bg-indigo-900 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-indigo-950/20 active:scale-95 transition-all">Close Shift Audit</button>
        </div>
    `;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

// ================================================================ */
// ✅ ASSET MANAGEMENT MODALS & ACTIONS                             */
// ================================================================ */

window.openAssetDetailsModal = async function(barcode) {
    if (!barcode) return;
    const sanitized = barcode.replace(/[.#$\[\]/]/g, '_');

    window.showGlobalSpinner("Loading Asset Details...");
    try {
        const snap = await get(ref(db, `assets/${sanitized}`));
        if (!snap.exists()) {
            alert("Asset not found in database.");
            return;
        }

        const data = snap.val();
        const modal = document.getElementById('asset-details-modal');
        const grid = document.getElementById('dynamic-asset-fields-grid');
        const img = document.getElementById('modal-asset-photo');
        const placeholder = document.getElementById('modal-photo-placeholder');

        if (!modal || !grid) return;

        grid.innerHTML = "";

        // Show Photo if exists
        const photoUrl = data.photoURL || data.photoUrl || data.auditPhoto || data.photo || data.imageUrl;
        if (photoUrl && photoUrl !== 'N/A' && photoUrl !== '-') {
            img.src = window.getDirectDriveImageUrl ? window.getDirectDriveImageUrl(photoUrl) : photoUrl;
            img.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';
        } else {
            img.style.display = 'none';
            if (placeholder) placeholder.style.display = 'flex';
        }

        // Exclude internal keys
        const ignored = ['_id', '_row', '_rawBarcode', '_version', 'importedAt', 'updatedAt', 'assetId', 'locationHistory', 'photoURL', 'photoUrl', 'auditPhoto', 'photo', 'imageUrl'];

        Object.entries(data).forEach(([key, val]) => {
            if (ignored.includes(key)) return;

            const label = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toUpperCase();
            const card = document.createElement('div');
            card.className = "bg-white p-3 rounded-xl border border-slate-100 shadow-sm";
            card.innerHTML = `
                <label class="text-[8px] font-black text-indigo-400 uppercase block mb-1 tracking-wider">${label}</label>
                <span class="text-[10px] font-bold text-slate-700 break-words">${val || '-'}</span>
            `;
            grid.appendChild(card);
        });

        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    } catch (e) {
        console.error("Detail Error:", e);
        alert("Failed to load details.");
    } finally {
        window.hideGlobalSpinner();
    }
};

window.closeAssetDetailsModal = function() {
    const modal = document.getElementById('asset-details-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

window.openEditAssetModal = async function(barcode) {
    if (!barcode) return;
    const sanitized = barcode.replace(/[.#$\[\]/]/g, '_');

    window.showGlobalSpinner("Unlocking Master Record...");
    try {
        const snap = await get(ref(db, `assets/${sanitized}`));
        if (!snap.exists()) return alert("Asset not found in Master Register.");

        const data = snap.val();
        const container = document.getElementById('admin-dynamic-edit-fields');
        const barcodeInput = document.getElementById('edit-barcode');

        if (!container || !barcodeInput) {
            console.error("Editor elements missing in DOM");
            return;
        }

        container.innerHTML = "";
        barcodeInput.value = barcode;

        // Exclude purely internal or read-only keys
        const ignored = ['assetId', 'locationHistory', 'updatedAt', 'importedAt', '_version', '_raw', '_id', '_row', '_rawBarcode', 'profilePicUrl'];

        // Sort keys to maintain a professional, consistent layout
        const keys = Object.keys(data).filter(k => !ignored.includes(k)).sort();

        keys.forEach(key => {
            const val = (data[key] !== undefined && data[key] !== null) ? data[key] : "";
            const label = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toUpperCase();

            const fieldGroup = document.createElement('div');
            fieldGroup.className = 'space-y-1 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm';

            let inputHtml = "";

            // Intelligence: Identify if it should be a select dropdown
            if (key.toLowerCase().includes('condition') || key.toLowerCase().includes('status')) {
                const options = ['Active', 'Existing', 'Good', 'Excellent', 'Fair', 'Poor', 'Damaged', 'Pending_Disposal', 'DISPOSED', 'Scrapped', 'Operational'];
                const currentVal = String(val);

                inputHtml = `<select name="${key}" class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-xs font-bold text-slate-800">`;

                // Add current value if it's unique
                const normalizedOptions = options.map(o => o.toLowerCase());
                if (!normalizedOptions.includes(currentVal.toLowerCase()) && currentVal) {
                    inputHtml += `<option value="${currentVal}" selected>${currentVal.replace(/_/g, ' ')}</option>`;
                }

                options.forEach(opt => {
                    inputHtml += `<option value="${opt}" ${currentVal.toLowerCase() === opt.toLowerCase() ? 'selected' : ''}>${opt.replace(/_/g, ' ')}</option>`;
                });
                inputHtml += `</select>`;
            } else if (key.toLowerCase().includes('date')) {
                inputHtml = `<input type="text" name="${key}" value="${val}" placeholder="YYYY-MM-DD" class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-xs font-bold text-slate-800">`;
            } else {
                // Default to standard text input
                inputHtml = `<input type="text" name="${key}" value="${val}" class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 text-xs font-bold text-slate-800">`;
            }

            fieldGroup.innerHTML = `
                <label class="text-[8px] font-black text-indigo-400 uppercase ml-1 tracking-widest block mb-1">${label}</label>
                ${inputHtml}
            `;
            container.appendChild(fieldGroup);
        });

        const modal = document.getElementById('asset-edit-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
        }
    } catch (e) {
        console.error("Editor Load Error:", e);
        alert("Failed to load comprehensive editor.");
    } finally {
        window.hideGlobalSpinner();
    }
};

// Bind the save button for Comprehensive Asset Edit Modal
document.addEventListener('DOMContentLoaded', () => {
    const saveBtn = document.getElementById('save-asset-edit-btn');
    if (saveBtn) {
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

        newSaveBtn.onclick = async (e) => {
            e.preventDefault();
            const form = document.getElementById('edit-asset-form');
            const barcode = document.getElementById('edit-barcode').value;
            const sanitized = barcode.replace(/[.#$\[\]/]/g, '_');

            if (!form) return;

            const formData = new FormData(form);
            const updates = {};
            formData.forEach((value, key) => {
                updates[key] = value.toString().trim();
            });

            updates.updatedAt = new Date().toISOString();
            updates.lastEditedBy = "Admin";

            window.showGlobalSpinner("Syncing All Properties...");
            try {
                await update(ref(db, `assets/${sanitized}`), updates);
                alert("✅ Master Register Updated Successfully! All changes synced.");
                document.getElementById('asset-edit-modal').classList.add('hidden');

                // Trigger live UI refresh
                if (window.filterAssetTable) window.filterAssetTable();
            } catch (err) {
                console.error("Sync Error:", err);
                alert("Master Sync Failed: " + err.message);
            } finally {
                window.hideGlobalSpinner();
            }
        };
    }
});

window.deleteAssetRecord = async function(barcode) {
    if (!confirm(`Are you sure you want to permanently delete asset ${barcode}?`)) return;

    const sanitized = barcode.replace(/[.#$\[\]/]/g, '_');
    window.showGlobalSpinner("Deleting Record...");
    try {
        await remove(ref(db, `assets/${sanitized}`));
        alert("Record deleted.");
        window.filterAssetTable();
    } catch (e) {
        alert("Delete failed.");
    } finally {
        window.hideGlobalSpinner();
    }
};

// ================================================================ */
// ✅ DISPOSAL & TRANSFER LOGIC                                     */
// ================================================================ */

window.loadAdminDisposalTable = function() {
    const body = document.getElementById('admin-disposal-list-body');
    if (!body) return;

    const data = (window.appCache.disposalRequests || []).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    window.adminPaginators.disposal.init(data, (pageItems) => {
        body.innerHTML = pageItems.length ? pageItems.map(d => `
            <tr class="hover:bg-red-50 border-b text-[10px]">
                <td class="p-3 font-mono font-bold text-red-600">${d.assetBarcode || "-"}</td>
                <td class="p-3 font-bold">${d.assetName || "-"}</td>
                <td class="p-3">${d.assetVendor || "-"}</td>
                <td class="p-3">${d.assetCategory || "-"}</td>
                <td class="p-3">${d.date || "-"}</td>
                <td class="p-3">${d.assetFloor || "-"}</td>
                <td class="p-3">${d.assetFloor || "-"}</td>
                <td class="p-3">${d.assetLocation || "-"}</td>
                <td class="p-3">${d.assetCategory || "-"}</td>
                <td class="p-3">${d.assetCategory || "-"}</td>
                <td class="p-3">${d.assetBuilding || "-"}</td>
                <td class="p-3">${d.assetRoom || "-"}</td>
                <td class="p-3">${d.assetRoom || "-"}</td>
                <td class="p-3">${d.assetCategory || "-"}</td>
                <td class="p-3 text-center">${d.disposalPhotoUrl ? `<img src="${window.getDirectDriveImageUrl(d.disposalPhotoUrl)}" class="h-6 mx-auto rounded shadow-sm" onclick="window.openImageZoom('${d.disposalPhotoUrl}')">` : 'No Photo'}</td>
                <td class="p-3 text-center">
                    <button onclick="window.approveDisposal('${d.requestId}')" class="text-emerald-600 hover:scale-110"><i class="fa-solid fa-check-circle"></i></button>
                    <button onclick="window.rejectDisposal('${d.requestId}')" class="text-red-600 hover:scale-110 ml-2"><i class="fa-solid fa-circle-xmark"></i></button>
                </td>
            </tr>`).join('') : '<tr><td colspan="16" class="p-8 text-center text-gray-400">No pending requests</td></tr>';
    });
};

window.filterDisposalTable = () => {
    const q = document.getElementById('disposal-search')?.value?.toLowerCase() || '';
    let f = window.appCache.disposalRequests;
    if (q) f = f.filter(d => (d.assetName||'').toLowerCase().includes(q) || (d.assetBarcode||'').includes(q));
    window.currentFilteredData.disposal = f;
    window.loadAdminDisposalTable();
};

window.approveDisposal = async function(requestId) {
    if (!confirm("Are you sure you want to APPROVE this disposal? This will move the item to the Permanent Scrap Registry.")) return;

    window.showGlobalSpinner("Processing Approval...");
    try {
        const reqRef = ref(db, `asset_disposal_requests/${requestId}`);
        const snap = await get(reqRef);
        if (!snap.exists()) throw new Error("Request not found.");

        const data = snap.val();
        const barcode = data.assetBarcode;
        const sanitizedBarcode = barcode.replace(/[.#$\[\]/]/g, '_');

        const updates = {};
        // 1. Mark as DISPOSED in master registry
        updates[`assets/${sanitizedBarcode}/assetStatus`] = "DISPOSED";
        updates[`assets/${sanitizedBarcode}/disposedAt`] = Date.now();

        // 2. Add to permanent registry
        updates[`ASSET_DISPOSAL_REGISTRY/${requestId}`] = {
            ...data,
            status: "APPROVED",
            approvedAt: Date.now(),
            approvedBy: "Admin"
        };

        // 3. Remove from pending requests
        updates[`asset_disposal_requests/${requestId}`] = null;

        await update(ref(db), updates);
        alert("✅ Disposal Approved & Registered.");
        window.loadAdminDisposalTable();
    } catch (e) {
        alert("Approval failed: " + e.message);
    } finally {
        window.hideGlobalSpinner();
    }
};

window.rejectDisposal = async function(requestId) {
    const reason = prompt("Enter reason for rejection:");
    if (reason === null) return;

    window.showGlobalSpinner("Processing Rejection...");
    try {
        const reqRef = ref(db, `asset_disposal_requests/${requestId}`);
        const snap = await get(reqRef);
        if (!snap.exists()) throw new Error("Request not found.");

        const data = snap.val();
        const barcode = data.assetBarcode;
        const sanitizedBarcode = barcode.replace(/[.#$\[\]/]/g, '_');

        const updates = {};
        updates[`assets/${sanitizedBarcode}/assetStatus`] = "Active"; // Restore status
        updates[`asset_disposal_requests/${requestId}`] = null;

        // Log rejection in history? (Optional)

        await update(ref(db), updates);
        alert("❌ Disposal Request Rejected.");
        window.loadAdminDisposalTable();
    } catch (e) {
        alert("Rejection failed.");
    } finally {
        window.hideGlobalSpinner();
    }
};

window.deleteTransferLog = async function(key) {
    if (!confirm("Delete this movement log entry permanently?")) return;

    window.showGlobalSpinner("Deleting Log...");
    try {
        await remove(ref(db, `asset_transfers/${key}`));
        alert("Log entry removed.");
        window.filterTransferTable();
    } catch (e) {
        alert("Delete failed.");
    } finally {
        window.hideGlobalSpinner();
    }
};

window.renderStandardizedAssetTable = function(data, type) {
    const body = document.getElementById('transfer-logs-body');
    if (!body) return;

    const sortedData = (data || []).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    window.adminPaginators.transfers.init(sortedData, (pageItems) => {
        body.innerHTML = pageItems.length ? pageItems.map(t => `
            <tr class="hover:bg-slate-50 border-b text-[9px] whitespace-nowrap">
                <td class="p-2 font-mono font-bold">${t.assetBarcode || "-"}</td>
                <td class="p-2">${t.assetDescription || "-"}</td>
                <td class="p-2">${t.assetVendorName || "-"}</td>
                <td class="p-2">${t.category || "-"}</td>
                <td class="p-2">${t.datePlaceInService || "-"}</td>
                <td class="p-2">${t.floorDiscretion || "-"}</td>
                <td class="p-2">${t.floorNo || "-"}</td>
                <td class="p-2">${t.locationName || "-"}</td>
                <td class="p-2">${t.majorCategory || "-"}</td>
                <td class="p-2">${t.minorCategory || "-"}</td>
                <td class="p-2">${t.schoolBuildingName || "-"}</td>
                <td class="p-2">${t.roomNumber || "-"}</td>
                <td class="p-2">${t.roomName || "-"}</td>
                <td class="p-2">${t.subMinorCategory || "-"}</td>
                <td class="p-2 text-center">${t.auditPhoto ? `<img src="${window.getDirectDriveImageUrl(t.auditPhoto)}" class="h-6 mx-auto rounded" onclick="window.openImageZoom('${t.auditPhoto}')">` : '-'}</td>
                <td class="p-2 font-bold">${t.collectorName || "-"}</td>
                <td class="p-2">${t.companyName || "-"}</td>
                <td class="p-2">${t.collectionDate || "-"}</td>
                <td class="p-2">${t.securityName || "-"}</td>
                <td class="p-2">${t.receivedName || "-"}</td>
                <td class="p-2 text-center">${t.securitySig ? `<img src="${t.securitySig}" class="h-5 mx-auto bg-white" onclick="window.openImageZoom('${t.securitySig}')">` : '-'}</td>
                <td class="p-2 text-center">${t.receivedSig ? `<img src="${t.receivedSig}" class="h-5 mx-auto bg-white" onclick="window.openImageZoom('${t.receivedSig}')">` : '-'}</td>
                <td class="p-2 text-center">${t.proofPhoto ? `<img src="${window.getDirectDriveImageUrl(t.proofPhoto)}" class="h-6 mx-auto rounded" onclick="window.openImageZoom('${t.proofPhoto}')">` : '-'}</td>
                <td class="p-2 text-center">
                    <button onclick="window.deleteTransferLog('${t.firebaseKey}')" class="text-red-500 hover:scale-110"><i class="fa-solid fa-trash-can"></i></button>
                </td>
            </tr>`).join('') : '<tr><td colspan="24" class="p-8 text-center text-gray-400">No logs found</td></tr>';
    });
};

// ================================================================ */
// ✅ TASK INSPECTOR                                                */
// ================================================================ */

window.openTaskInspector = function(taskId) {
    const task = window.appCache.tasks.find(t => t.id === taskId);
    if (!task) return;

    const modal = document.getElementById('task-inspector-modal');
    if (!modal) return;

    document.getElementById('insp-created-by').innerText = task.raisedByName || "Admin";
    document.getElementById('insp-created-at').innerText = task.raisedAt || "-";
    document.getElementById('insp-dept').innerText = task.assignedRole || "-";
    document.getElementById('insp-location').innerText = task.location || "-";
    document.getElementById('insp-closed-by').innerText = task.solvedByName || "-";
    document.getElementById('insp-closed-at').innerText = task.closedAt || "-";
    document.getElementById('insp-desc').innerText = task.details || "No description.";

    const matBox = document.getElementById('insp-material-box');
    if (task.completionMaterial) {
        document.getElementById('insp-material-text').innerText = task.completionMaterial;
        matBox.classList.remove('hidden');
    } else matBox.classList.add('hidden');

    const comBox = document.getElementById('insp-comment-box');
    if (task.completionComment || task.rejectionReason) {
        document.getElementById('insp-comment-text').innerText = task.completionComment || task.rejectionReason;
        comBox.classList.remove('hidden');
    } else comBox.classList.add('hidden');

    const beforeImg = document.getElementById('insp-before-img');
    const noBefore = document.getElementById('insp-no-before');
    if (task.beforePhotoUrl) {
        beforeImg.src = window.getDirectDriveImageUrl(task.beforePhotoUrl);
        beforeImg.classList.remove('hidden');
        noBefore.classList.add('hidden');
    } else {
        beforeImg.classList.add('hidden');
        noBefore.classList.remove('hidden');
    }

    const afterImg = document.getElementById('insp-after-img');
    const noAfter = document.getElementById('insp-no-after');
    if (task.afterPhotoUrl) {
        afterImg.src = window.getDirectDriveImageUrl(task.afterPhotoUrl);
        afterImg.classList.remove('hidden');
        noAfter.classList.add('hidden');
    } else {
        afterImg.classList.add('hidden');
        noAfter.classList.remove('hidden');
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

window.closeTaskInspectorModal = function() {
    const modal = document.getElementById('task-inspector-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

window.openDetailedAuditModal = function(type, id) {
    if (!id) return;

    let record = null;
    if (type === 'visitor') {
        record = window.appCache.visitors.find(v => v.id === id);
    } else if (type === 'contractor') {
        record = window.appCache.contractors.find(c => c.id === id);
    }

    if (!record) {
        alert(`${type} record not found in cache.`);
        return;
    }

    const modal = document.getElementById('view-staff-modal');
    if (!modal) return;

    const accentColor = type === 'visitor' ? 'indigo' : 'emerald';
    const accentHex = type === 'visitor' ? '#4f46e5' : '#10b981';

    modal.innerHTML = `
        <div class="bg-white w-full max-w-xl rounded-[40px] overflow-hidden shadow-2xl p-8 sm:p-10 relative fade-in">
            <div class="flex justify-between items-center mb-8 border-b border-slate-100 pb-5">
                <div>
                    <h3 class="text-2xl font-black text-${accentColor}-900 uppercase tracking-tight">${type} Detailed Entry</h3>
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Verification Log</p>
                </div>
                <button onclick="document.getElementById('view-staff-modal').classList.add('hidden')" class="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all text-xl">&times;</button>
            </div>

            <div class="space-y-6 text-gray-800">
                <!-- Identity Card -->
                <div class="flex items-center gap-5 bg-${accentColor}-50 p-5 rounded-[2.5rem] border border-${accentColor}-100 shadow-sm">
                    <div class="w-20 h-20 bg-${accentColor}-600 rounded-[2rem] flex items-center justify-center text-white text-3xl font-black shadow-lg">
                        ${record.name ? record.name.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div class="flex-1 min-w-0">
                        <h4 class="font-black text-slate-900 uppercase text-lg truncate">${record.name || 'Unknown'}</h4>
                        <p class="text-[11px] font-black text-${accentColor}-600 uppercase tracking-widest mt-0.5">${record.company || 'Private Entry'}</p>
                        <div class="flex gap-2 mt-2">
                             <span class="px-2.5 py-0.5 bg-white text-slate-500 text-[8px] font-black rounded-lg border border-${accentColor}-100 uppercase">${record.id || 'N/A'}</span>
                        </div>
                    </div>
                </div>

                <!-- Timing Grid -->
                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                        <span class="text-[9px] font-black text-emerald-600 uppercase block mb-1">Check-In</span>
                        <span class="font-black text-slate-900 text-sm">${record.timeIn || '--:--'}</span>
                    </div>
                    <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                        <span class="text-[9px] font-black text-rose-500 uppercase block mb-1">Check-Out</span>
                        <span class="font-black text-slate-900 text-sm">${record.outTime || '--:--'}</span>
                    </div>
                </div>

                <!-- Purpose Box -->
                <div class="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-inner">
                    <span class="text-[9px] font-black text-indigo-400 uppercase block mb-2 tracking-widest">Purpose of Visit</span>
                    <p class="text-xs font-bold text-slate-700 leading-relaxed">${record.purpose || 'No details provided.'}</p>
                </div>

                <!-- Signature Section -->
                <div class="text-center bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-1 h-full bg-${accentColor}-500"></div>
                    <span class="text-[9px] font-black text-${accentColor}-400 uppercase block mb-4 tracking-[0.3em]">Authorized Signature</span>
                    <div class="h-32 flex items-center justify-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        ${record.signatureUrl ? `<img src="${window.getDirectDriveImageUrl(record.signatureUrl)}" class="max-h-28 object-contain mix-blend-multiply" onclick="window.openImageZoom('${record.signatureUrl}')">` : '<span class="text-xs font-bold text-slate-300 uppercase">Not Provided</span>'}
                    </div>
                </div>
            </div>

            <button onclick="document.getElementById('view-staff-modal').classList.add('hidden')" class="w-full mt-10 py-5 bg-${accentColor}-600 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-xl shadow-${accentColor}-500/20 active:scale-95 transition-all">Close Audit View</button>
        </div>
    `;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};
