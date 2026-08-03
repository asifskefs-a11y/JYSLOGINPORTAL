import { db } from './firebase_config.js';
import { ref, get, set, update, onValue, query, orderByKey, limitToFirst, limitToLast, startAt, endAt } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- GLOBAL APP CACHE & PAGINATION STATE ---
window.appCache = {
    visitors: [],
    staff_attendance: [],
    staff: {},
    users: {},
    tasks: [],
    assets: [],
    disposedAssets: [],
    transfers: [],
    isInitialized: false
};

window.assetPaginationState = {
    firstKey: null,
    lastKey: null,
    pageSize: 20,
    pageStack: [], // To keep track of previous pages
    isLoading: false
};

// --- CORE ADMIN DASHBOARD LOGIC ---
window.showAdminTab = (tabId) => {
    try {
        console.log("Instant Tab Switch:", tabId);
        const tabs = document.querySelectorAll('.admin-tab-content');
        tabs.forEach(t => {
            t.classList.add('hidden');
            t.style.display = 'none';
        });

        const activeTab = document.getElementById(tabId);
        if (activeTab) {
            activeTab.classList.remove('hidden');
            activeTab.style.display = 'block';
        }

        document.querySelectorAll('.quick-action-btn').forEach(b => b.classList.remove('ring-2', 'ring-indigo-500', 'bg-indigo-50'));
        const activeBtn = document.querySelector(`button[onclick*="'${tabId}'"]`);
        if (activeBtn) activeBtn.classList.add('ring-2', 'ring-indigo-500', 'bg-indigo-50');

        // INSTANT RENDER FROM APP CACHE
        window.renderTabFromAppCache(tabId);
    } catch (e) { console.error("Tab switch error:", e); }
};

window.renderTabFromAppCache = (tabId) => {
    switch(tabId) {
        case 'tab-visitor-logs':
            window.renderPaginatedVisitorLogs();
            break;
        case 'tab-staff-logs':
            window.renderPaginatedStaffLogs();
            break;
        case 'tab-tasks':
            window.renderPaginatedTasks();
            break;
        case 'tab-my-tasks':
            // Already initialized in loadAdminDashboard
            break;
        case 'tab-staff-list':
            window.renderPaginatedStaffDirectory();
            break;
        case 'tab-assets':
            if (window.renderAdminAssetTable) window.renderAdminAssetTable(window.appCache.assets, 'assets');
            break;
        case 'tab-disposal':
            window.renderPaginatedDisposal();
            break;
        case 'tab-transfers':
            window.renderPaginatedTransfers();
            break;
    }
};

// ==========================================================================
// GENERIC CLIENT-SIDE PAGINATION (20 rows per page, "Previous / Next")
// ==========================================================================
const CLIENT_PAGE_SIZE = 20;
window.clientPageState = {};   // { tabKey: currentPageIndexZeroBased }
window.__pgRegistry = {};      // { tabKey: { fullData, renderFn, anchorSelector } }

window.paginateAndRender = (tabKey, fullData, renderFn, anchorSelector) => {
    window.__pgRegistry[tabKey] = { fullData, renderFn, anchorSelector };
    if (window.clientPageState[tabKey] === undefined) window.clientPageState[tabKey] = 0;

    const totalPages = Math.max(1, Math.ceil(fullData.length / CLIENT_PAGE_SIZE));
    if (window.clientPageState[tabKey] >= totalPages) window.clientPageState[tabKey] = totalPages - 1;
    if (window.clientPageState[tabKey] < 0) window.clientPageState[tabKey] = 0;

    const page = window.clientPageState[tabKey];
    const start = page * CLIENT_PAGE_SIZE;
    const pageData = fullData.slice(start, start + CLIENT_PAGE_SIZE);

    renderFn(pageData);
    window.renderClientPaginationControls(tabKey, fullData.length, page, totalPages, anchorSelector);
};

window.__pgNav = (tabKey, newPage) => {
    const reg = window.__pgRegistry[tabKey];
    if (!reg) return;
    window.clientPageState[tabKey] = newPage;
    window.paginateAndRender(tabKey, reg.fullData, reg.renderFn, reg.anchorSelector);
    window.scrollTo(0, 0);
};

window.renderClientPaginationControls = (tabKey, totalCount, page, totalPages, anchorSelector) => {
    const controlsId = `pg-controls-${tabKey}`;
    let container = document.getElementById(controlsId);
    if (!container) {
        const anchor = document.querySelector(anchorSelector);
        if (!anchor) return;
        container = document.createElement('div');
        container.id = controlsId;
        container.className = 'flex justify-between items-center mt-4 bg-slate-50 p-4 rounded-2xl border border-slate-100';
        anchor.after(container);
    }
    const hasPrev = page > 0;
    const hasNext = page < totalPages - 1;
    const start = totalCount === 0 ? 0 : page * CLIENT_PAGE_SIZE + 1;
    const end = Math.min(totalCount, (page + 1) * CLIENT_PAGE_SIZE);

    container.innerHTML = `
        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Showing ${start}-${end} of ${totalCount}
        </div>
        <div class="flex gap-2">
            <button onclick="window.__pgNav('${tabKey}', ${page - 1})" ${!hasPrev ? 'disabled' : ''}
                class="px-6 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all
                ${hasPrev ? 'bg-white text-indigo-600 shadow-sm border border-indigo-100 active:scale-95' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}">
                <i class="fa-solid fa-chevron-left mr-2"></i>Previous
            </button>
            <button onclick="window.__pgNav('${tabKey}', ${page + 1})" ${!hasNext ? 'disabled' : ''}
                class="px-6 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all
                ${hasNext ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}">
                Next<i class="fa-solid fa-chevron-right ml-2"></i>
            </button>
        </div>
    `;
};

// --- Per-tab paginated render wrappers ---
window.renderPaginatedVisitorLogs = () => {
    const all = (window.appCache.allRecordsCombined || []).filter(r => r.type === 'visitor');
    window.paginateAndRender('visitor-logs', all, (slice) => {
        window.renderAdminTable(slice, window.appCache.users, window.appCache.staff);
    }, '#tab-visitor-logs .table-wrapper');
};

window.renderPaginatedStaffLogs = () => {
    const all = (window.appCache.allRecordsCombined || []).filter(r => r.type === 'staff');
    window.paginateAndRender('staff-logs', all, (slice) => {
        window.renderAdminTable(slice, window.appCache.users, window.appCache.staff);
    }, '#tab-staff-logs .table-wrapper');
};

window.renderPaginatedTasks = () => {
    window.paginateAndRender('tasks', window.appCache.tasks || [], (slice) => {
        window.renderTaskTable(slice);
    }, '#tab-tasks .table-wrapper');
};

window.renderPaginatedStaffDirectory = () => {
    const all = Object.values(window.appCache.staff || {});
    window.paginateAndRender('staff-directory', all, (slice) => {
        window.renderStaffDirectory(slice);
    }, '#tab-staff-list .table-wrapper');
};

window.renderPaginatedDisposal = () => {
    if (!window.renderAdminAssetTable) return;
    window.paginateAndRender('disposal', window.appCache.disposedAssets || [], (slice) => {
        window.renderAdminAssetTable(slice, 'disposal');
    }, '#tab-disposal .table-wrapper');
};

window.renderPaginatedTransfers = () => {
    if (!window.renderTransferTable) return;
    window.paginateAndRender('transfers', window.appCache.transfers || [], (slice) => {
        window.renderTransferTable(slice);
    }, '#tab-transfers .table-wrapper');
};

window.loadAdminDashboard = async () => {
    try {
        if (window.appCache.isInitialized) return;
        if (!document.getElementById('visitor-logs-body')) return;

        console.log("Initiating Parallel Background Pre-fetching...");

        onValue(ref(db, 'visitors'), (v) => {
            window.appCache.visitors = v.exists() ? Object.values(v.val()) : [];
            window.syncAppCacheRecords();
        });

        onValue(ref(db, 'staff_attendance'), (s) => {
            window.appCache.staff_attendance = s.exists() ? Object.values(s.val()) : [];
            window.syncAppCacheRecords();
        });

        onValue(ref(db, 'users'), (snap) => {
            window.appCache.users = snap.exists() ? snap.val() : {};
            window.syncAppCacheRecords();
        });

        onValue(ref(db, 'staff'), (snap) => {
            window.appCache.staff = snap.exists() ? snap.val() : {};
            window.syncAppCacheRecords();
            const activeTab = document.querySelector('.admin-tab-content:not(.hidden)');
            if (activeTab && activeTab.id === 'tab-staff-list') window.renderPaginatedStaffDirectory();
        });

        onValue(ref(db, 'tasks'), (snap) => {
            window.appCache.tasks = snap.exists() ? Object.values(snap.val()).reverse() : [];
            window.syncAppCacheRecords();
            const activeTab = document.querySelector('.admin-tab-content:not(.hidden)');
            if (activeTab && activeTab.id === 'tab-tasks') window.renderPaginatedTasks();
        });

        window.fetchAssetsPaginated('initial');

        onValue(ref(db, 'disposed_assets'), (snap) => {
            window.appCache.disposedAssets = snap.exists() ? Object.values(snap.val()) : [];
            const activeTab = document.querySelector('.admin-tab-content:not(.hidden)');
            if (activeTab && activeTab.id === 'tab-disposal') window.renderPaginatedDisposal();
        });

        onValue(ref(db, 'asset_transfers'), (snap) => {
            window.appCache.transfers = snap.exists() ? Object.values(snap.val()) : [];
            window.syncAppCacheRecords();
            const activeTab = document.querySelector('.admin-tab-content:not(.hidden)');
            if (activeTab && activeTab.id === 'tab-transfers') window.renderPaginatedTransfers();
        });

        if (window.initRaisedTasksTracker) window.initRaisedTasksTracker('admin-my-tasks-container');

        window.appCache.isInitialized = true;

    } catch (err) { console.error("Admin Pre-fetch Error:", err); }
};

window.syncAppCacheRecords = () => {
    try {
        let all = [];
        window.appCache.visitors.forEach(x => all.push({...x, type: 'visitor'}));
        window.appCache.staff_attendance.forEach(x => all.push({...x, type: 'staff'}));

        all.sort((a,b) => {
            const dateA = new Date(a.date + ' ' + (a.timeIn || '00:00 AM'));
            const dateB = new Date(b.date + ' ' + (b.timeIn || '00:00 AM'));
            return dateB - dateA;
        });

        window.appCache.allRecordsCombined = all;

        const activeTab = document.querySelector('.admin-tab-content:not(.hidden)');
        if (activeTab && activeTab.id === 'tab-visitor-logs') window.renderPaginatedVisitorLogs();
        if (activeTab && activeTab.id === 'tab-staff-logs') window.renderPaginatedStaffLogs();

        // --- UPDATE LIVE KPI METRICS ---
        const today = new Date().toLocaleDateString('en-US');

        const visitorsToday = window.appCache.visitors.filter(r => r.date === today).length;
        if(document.getElementById('kpi-visitors')) {
            document.getElementById('kpi-visitors').innerText = visitorsToday;
            const bar = document.getElementById('kpi-visitors').closest('.stat-card').querySelector('.progress-bar');
            if (bar) bar.style.width = Math.min(100, (visitorsToday / 50) * 100) + '%';
        }

        const activeTasksCount = window.appCache.tasks.filter(t => t.status === 'Open' || t.status === 'Accepted' || t.status === 'In-Progress').length;
        if(document.getElementById('kpi-tasks')) {
            document.getElementById('kpi-tasks').innerText = activeTasksCount;
            const bar = document.getElementById('kpi-tasks').closest('.stat-card').querySelector('.progress-bar');
            if (bar) bar.style.width = Math.min(100, (activeTasksCount / 20) * 100) + '%';
        }

        const staffPresentCount = window.appCache.staff_attendance.filter(r => r.date === today && (r.status === 'checked_in' || !r.timeOut)).length;
        if(document.getElementById('kpi-staff')) {
            document.getElementById('kpi-staff').innerText = staffPresentCount;
            const bar = document.getElementById('kpi-staff').closest('.stat-card').querySelector('.progress-bar');
            if (bar) bar.style.width = Math.min(100, (staffPresentCount / 30) * 100) + '%';
        }

        const alertsCount = window.appCache.tasks.filter(t => (t.status === 'Open' || t.status === 'Accepted') && (t.priority === 'High' || t.taskPriority === 'High')).length;
        if(document.getElementById('kpi-alerts')) {
            document.getElementById('kpi-alerts').innerText = alertsCount;
            const bar = document.getElementById('kpi-alerts').closest('.stat-card').querySelector('.progress-bar');
            if (bar) bar.style.width = Math.min(100, (alertsCount / 10) * 100) + '%';
        }

    } catch (e) { console.error("Sync Error:", e); }
};

window.renderTaskTable = (taskList) => {
    const taskBody = document.getElementById('admin-task-list-body');
    if (!taskBody) return;
    taskBody.innerHTML = '';
    taskList.forEach(t => {
        const toDirectLink = (url) => {
            if (!url || typeof url !== 'string' || url === "-") return "";
            if (url.startsWith('data:image')) return url;
            const idMatch = url.match(/\/file\/d\/([^\/]+)/) || url.match(/[?&]id=([^&]+)/);
            let fileId = (idMatch && idMatch[1]) ? idMatch[1] : null;
            if (fileId) return `https://drive.google.com/uc?export=view&id=${fileId}`;
            return url;
        };

        const b = toDirectLink(t.before_image || t.beforePhotoUrl || t.beforePhoto || t.taskPhoto || t.task_images_before);
        const a = toDirectLink(t.after_image || t.afterPhotoUrl || t.afterPhoto || t.task_images_after);

        const rDT = t.raisedTimestamp ? new Date(t.raisedTimestamp) : null;
        const cDT = t.solvedTimestamp ? new Date(t.solvedTimestamp) : null;
        taskBody.innerHTML += `
            <tr class="hover:bg-gray-50 transition text-gray-800 border-b border-gray-100 text-[9px]">
                <td class="p-2 font-mono opacity-50">${t.id}</td>
                <td class="p-2 font-bold text-indigo-600">${t.assignedSchool || t.schoolName || "-"}</td>
                <td class="p-2 font-bold">${t.location || "-"}</td>
                <td class="p-2 truncate max-w-[150px] italic">${t.details || t.description || "-"}</td>
                <td class="p-2">${t.assignedRole || t.targetRole || "-"}</td>
                <td class="p-2">${t.raisedByName || 'Admin'}</td>
                <td class="p-2 font-mono">${rDT ? rDT.toLocaleDateString() : '-'}</td>
                <td class="p-2 font-bold ${t.status === 'Open' ? 'text-blue-500' : (t.status === 'Closed' ? 'text-green-500' : 'text-red-500')}">${t.status}</td>
                <td class="p-2 italic opacity-60">${t.rejectionReason || 'N/A'}</td>
                <td class="p-2">
                    <div class="flex gap-1 justify-center items-center">
                        ${(b && b.includes('http')) ? `<img src="${b}" referrerpolicy="no-referrer" class="h-10 w-10 rounded border shadow-sm cursor-pointer hover:scale-150 transition" onclick="window.openImageZoom('${b}')" title="Before">` : '<span class="opacity-20">-</span>'}
                        ${(a && a.includes('http')) ? `<img src="${a}" referrerpolicy="no-referrer" class="h-10 w-10 rounded border shadow-sm border-green-200 cursor-pointer hover:scale-150 transition" onclick="window.openImageZoom('${a}')" title="After">` : '<span class="opacity-20">-</span>'}
                    </div>
                </td>
            </tr>`;
    });
};

window.renderStaffDirectory = (staffData) => {
    const staffListBody = document.getElementById('admin-staff-list-body');
    if (!staffListBody) return;
    staffListBody.innerHTML = '';
    Object.values(staffData).forEach(x => {
        const initials = (x.name || "JY").split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        const photoUrl = x.profilePicUrl ? (window.formatDriveImageUrl ? window.formatDriveImageUrl(x.profilePicUrl) : x.profilePicUrl) : "";
        const photoHtml = photoUrl ?
            `<img src="${photoUrl}" referrerpolicy="no-referrer" class="w-10 h-10 rounded-full object-cover border-2 border-indigo-100 shadow-sm mx-auto" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">` : '';

        staffListBody.innerHTML += `
            <tr class="border-b border-gray-50 text-gray-800 hover:bg-slate-50 transition text-[10px]">
                <td class="p-3 text-center flex justify-center">
                    <div class="relative w-10 h-10">
                        ${photoHtml}
                        <div class="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-xs shadow-sm" style="${photoUrl ? 'display:none;' : 'display:flex;'}">
                            ${initials}
                        </div>
                    </div>
                </td>
                <td class="p-3 font-bold text-indigo-900">${x.name || "-"}</td>
                <td class="p-3 font-mono text-[9px]">${x.adcPassNumber || x.adekPass || "-"}</td>
                <td class="p-3">${x.branch || x.schoolName || "-"}</td>
                <td class="p-3"><span class="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md text-[9px] font-black uppercase">${x.role || x.position || "-"}</span></td>
                <td class="p-3 text-[9px] opacity-70">${x.companyName || x.company || "-"}</td>
                <td class="p-3 font-mono text-[9px]">${x.mobile}</td>
                <td class="p-3 text-center">
                    <div class="flex items-center justify-center gap-2">
                        <button onclick="window.openEditStaffModal('${x.mobile}')" class="text-indigo-600 hover:text-indigo-800 font-bold text-[10px] uppercase underline tracking-tighter">Edit</button>
                        <button onclick="window.deleteStaffAccount('${x.mobile}', '${x.name}')" class="text-red-500 hover:text-red-700 font-bold text-[10px] uppercase underline tracking-tighter">Delete</button>
                    </div>
                </td>
            </tr>`;
    });
};

window.renderAdminTable = (data, userProfiles = {}, staffProfiles = {}) => {
    const staffBody = document.getElementById('staff-attendance-body');
    const visitorBody = document.getElementById('visitor-logs-body');
    if (staffBody) staffBody.innerHTML = '';
    if (visitorBody) visitorBody.innerHTML = '';

    data.forEach(r => {
        let sig = r.checkInSignature || r.checkInSignatureUrl || r.signatureUrl || r.visitorSignature;
        if (sig && sig.includes('http')) sig = window.getDirectDriveImageUrl(sig);

        if (r.type === 'staff' && staffBody) {
            const profile = userProfiles[r.mobile] || staffProfiles[r.mobile] || {};
            staffBody.innerHTML += `
                <tr class="hover:bg-gray-50 transition border-b border-gray-100 text-gray-800 text-[10px]">
                    <td class="p-3 font-bold opacity-40 uppercase">Staff</td>
                    <td class="p-3 font-bold text-indigo-900">${profile.name || r.name || "-"}</td>
                    <td class="p-3 font-mono">${r.mobile}</td>
                    <td class="p-3">${profile.branch || "-"}</td>
                    <td class="p-3">${profile.role || "-"}</td>
                    <td class="p-3 font-mono">${r.date}</td>
                    <td class="p-3 text-green-600 font-bold">${r.timeIn}</td>
                    <td class="p-3 text-red-600 font-bold">${r.timeOut || (r.status === 'checked_in' ? 'ACTIVE' : 'RECORDED')}</td>
                    <td class="p-3 text-center">${sig ? `<img src="${sig}" class="h-8 mx-auto rounded border" onclick="window.openImageZoom('${sig}')">` : '-'}</td>
                </tr>`;
        } else if (r.type === 'visitor' && visitorBody) {
            visitorBody.innerHTML += `
                <tr class="hover:bg-gray-50 transition border-b border-gray-100 text-gray-800 text-[10px]">
                    <td class="p-3 font-bold opacity-40 uppercase">Visitor</td>
                    <td class="p-3 font-mono">${r.id}</td>
                    <td class="p-3 font-bold text-indigo-900">${r.name}</td>
                    <td class="p-3">${r.mobile}</td>
                    <td class="p-3">${r.company}</td>
                    <td class="p-3 truncate max-w-[100px]">${r.purpose}</td>
                    <td class="p-3 font-mono">${r.date}</td>
                    <td class="p-3 text-green-600 font-bold">${r.timeIn}</td>
                    <td class="p-3 text-red-600 font-bold">${r.timeOut || 'ACTIVE'}</td>
                    <td class="p-3 text-center">${sig ? `<img src="${sig}" class="h-8 mx-auto rounded border" onclick="window.openImageZoom('${sig}')">` : '-'}</td>
                </tr>`;
        }
    });
};

// --- ADD STAFF MODAL LOGIC ---
window.addStaffPhotoBase64 = "";

window.openAddStaffModal = () => {
    const modal = document.getElementById('add-staff-modal');
    if (!modal) return;

    modal.innerHTML = `
        <div class="bg-white w-full max-w-lg rounded-[40px] overflow-hidden shadow-2xl p-8 relative max-h-[90vh] overflow-y-auto no-scrollbar">
            <button onclick="window.closeAddStaffModal()" class="absolute right-6 top-6 text-slate-400 hover:text-indigo-600"><i class="fa-solid fa-xmark text-xl"></i></button>

            <div class="text-center mb-6">
                <div class="w-16 h-16 bg-indigo-600 text-white rounded-2xl mx-auto flex items-center justify-center shadow-lg mb-4">
                    <i class="fa-solid fa-user-plus text-2xl"></i>
                </div>
                <h3 class="text-2xl font-black text-indigo-900 uppercase">Register Staff</h3>
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Add new team member</p>
            </div>

            <form id="add-staff-form" class="space-y-4">
                <div class="flex justify-center mb-6">
                    <div class="relative group">
                        <div id="adminStaffPhotoPreview" class="w-24 h-24 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl flex items-center justify-center overflow-hidden">
                            <i class="fa-solid fa-user text-3xl text-slate-300"></i>
                        </div>
                        <input type="file" id="adminStaffPhotoInput" accept="image/*" class="hidden" onchange="window.handleAdminStaffPhotoSelect(event)">
                        <button type="button" onclick="document.getElementById('adminStaffPhotoInput').click()" class="absolute -bottom-2 -right-2 w-8 h-8 bg-indigo-600 text-white rounded-xl shadow-lg flex items-center justify-center hover:bg-indigo-700 transition-all">
                            <i class="fa-solid fa-camera text-xs"></i>
                        </button>
                    </div>
                </div>

                <div class="grid grid-cols-1 gap-4">
                    <input type="text" id="add-staff-name" placeholder="Full Name *" required class="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500">
                    <input type="tel" id="add-staff-mobile" placeholder="Mobile Number *" required class="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500">
                    <input type="text" id="add-staff-adek" placeholder="ADEK Pass Number *" required class="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500">

                    <div class="grid grid-cols-2 gap-4">
                        <input type="text" id="add-staff-company-name" placeholder="Company Name" class="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500">
                        <input type="text" id="add-staff-company-id" placeholder="Company ID" class="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500">
                    </div>

                    <select id="add-staff-branch" required class="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500">
                        <option value="">Select School *</option>
                        <option value="Jern Yafoor School 1">Jern Yafoor School 1</option>
                        <option value="Jern Yafoor School 2">Jern Yafoor School 2</option>
                    </select>

                    <input type="text" id="add-staff-role" placeholder="Position/Role *" required class="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500">
                    <input type="password" id="add-staff-pass" placeholder="Assign Password *" required class="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500">
                </div>

                <button type="submit" id="add-staff-submit-btn" class="w-full py-5 bg-gradient-to-r from-indigo-600 to-indigo-800 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-indigo-500/30 active:scale-[0.98] transition-all mt-4">
                    Complete Registration
                </button>
            </form>
        </div>
    `;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    // Form Submission Logic
    document.getElementById('add-staff-form').onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('add-staff-submit-btn');
        const originalText = btn.innerText;

        try {
            btn.disabled = true;
            btn.innerText = "UPLOADING PHOTO...";

            const name = document.getElementById('add-staff-name').value;
            const mobile = document.getElementById('add-staff-mobile').value;
            const adek = document.getElementById('add-staff-adek').value;
            const companyName = document.getElementById('add-staff-company-name').value;
            const companyId = document.getElementById('add-staff-company-id').value;
            const branch = document.getElementById('add-staff-branch').value;
            const role = document.getElementById('add-staff-role').value;
            const pass = document.getElementById('add-staff-pass').value;

            let profilePicUrl = "";

            if (window.addStaffPhotoBase64) {
                const res = await window.uploadToDrive({
                    type: 'active_asset',
                    folderType: 'Staff_Profile_Photos',
                    fileName: `Profile_${adek}_${mobile}.jpg`,
                    image: window.addStaffPhotoBase64
                });
                if (res.status === 'success') {
                    profilePicUrl = window.formatDriveImageUrl ? window.formatDriveImageUrl(res.fileUrl || res.signatureUrl) : (res.fileUrl || res.signatureUrl);
                }
            }

            btn.innerText = "SAVING DATA...";

            const staffData = {
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
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const updates = {};
            updates[`staff/${mobile}`] = staffData;
            updates[`users/${mobile}`] = staffData;

            await update(ref(db), updates);
            alert("Staff member registered successfully!");
            window.closeAddStaffModal();
        } catch (err) {
            alert("Error: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    };
};

window.closeAddStaffModal = () => {
    const modal = document.getElementById('add-staff-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    window.addStaffPhotoBase64 = "";
};

window.handleAdminStaffPhotoSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const preview = document.getElementById('adminStaffPhotoPreview');
    if (preview) preview.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-indigo-600"></i>';
    try {
        window.addStaffPhotoBase64 = await window.compressImageFile(file, 500, 500, 0.7);
        if (preview) preview.innerHTML = `<img src="${window.addStaffPhotoBase64}" class="w-full h-full object-cover">`;
    } catch (err) {
        if (preview) preview.innerHTML = '<i class="fa-solid fa-user text-3xl text-slate-300"></i>';
    }
};

window.fetchAssetsPaginated = async (direction = 'initial') => {
    if (window.assetPaginationState.isLoading) return;
    window.assetPaginationState.isLoading = true;

    // Add loading indicator to the table body
    const body = document.getElementById('admin-asset-list-body');
    if (body && direction === 'initial') {
        body.innerHTML = `<tr><td colspan="50" class="p-8 text-center"><i class="fa-solid fa-spinner fa-spin text-indigo-600 mr-2"></i>Loading Assets...</td></tr>`;
    }

    let assetQuery;

    try {
        if (direction === 'initial') {
            window.assetPaginationState.pageStack = [];
            assetQuery = query(ref(db, 'assets'), orderByKey(), limitToFirst(window.assetPaginationState.pageSize));
        } else if (direction === 'next' && window.assetPaginationState.lastKey) {
            window.assetPaginationState.pageStack.push(window.assetPaginationState.firstKey);
            assetQuery = query(ref(db, 'assets'), orderByKey(), startAt(window.assetPaginationState.lastKey), limitToFirst(window.assetPaginationState.pageSize + 1));
        } else if (direction === 'prev' && window.assetPaginationState.pageStack.length > 0) {
            const prevKey = window.assetPaginationState.pageStack.pop();
            assetQuery = query(ref(db, 'assets'), orderByKey(), startAt(prevKey), limitToFirst(window.assetPaginationState.pageSize));
        } else {
            window.assetPaginationState.isLoading = false;
            return;
        }

        const snap = await get(assetQuery);
        if (snap.exists()) {
            let data = snap.val();
            let keys = Object.keys(data).sort();

            if (direction === 'next') {
                keys.shift(); // Skip the first key which is the overlap from startAt
                if (keys.length === 0) {
                    alert("No more records found.");
                    window.assetPaginationState.pageStack.pop();
                    window.assetPaginationState.isLoading = false;
                    return;
                }
            }

            window.assetPaginationState.firstKey = keys[0];
            window.assetPaginationState.lastKey = keys[keys.length - 1];

            const paginatedAssets = keys.map(k => data[k]);
            window.appCache.assets = paginatedAssets;

            if (window.renderAdminAssetTable) {
                window.renderAdminAssetTable(paginatedAssets, 'assets');
                window.updatePaginationUI();
            }
        } else {
            if (body) body.innerHTML = `<tr><td colspan="50" class="p-8 text-center text-gray-400">No assets found.</td></tr>`;
        }
    } catch (e) {
        console.error("Pagination Error:", e);
        if (body) body.innerHTML = `<tr><td colspan="50" class="p-8 text-center text-red-500">Error loading assets. Check console.</td></tr>`;
    }
    finally { window.assetPaginationState.isLoading = false; }
};

window.updatePaginationUI = () => {
    let container = document.getElementById('asset-pagination-controls');
    if (!container) {
        const tableWrapper = document.querySelector('#tab-assets .table-wrapper');
        container = document.createElement('div');
        container.id = 'asset-pagination-controls';
        container.className = 'flex justify-between items-center mt-4 bg-slate-50 p-4 rounded-2xl border border-slate-100';
        tableWrapper.after(container);
    }
    const hasPrev = window.assetPaginationState.pageStack.length > 0;
    container.innerHTML = `
        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Showing ${window.appCache.assets.length} Records</div>
        <div class="flex gap-2">
            <button onclick="window.fetchAssetsPaginated('prev')" ${!hasPrev ? 'disabled' : ''} class="px-6 py-2 rounded-xl font-bold text-[10px] uppercase bg-white text-indigo-600 border border-indigo-100 active:scale-95">Previous</button>
            <button onclick="window.fetchAssetsPaginated('next')" class="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold text-[10px] uppercase active:scale-95">Next</button>
        </div>
    `;
};
