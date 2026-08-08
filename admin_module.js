import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, get, set, update, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================================ */
// ADMIN DASHBOARD - COMPLETE FIX WITH IMPROVED STAFF DETAIL      */
// ================================================================ */

window.appCache = { assets: [], transfers: [], visitors: [], staff: [], tasks: [], attendance: [] };
window.currentFilteredData = { assets: null, transfers: null, staff: null };
window.paginationState = {};
window.selectedAssetKeys = new Set();

// ================================================================ */
// REFRESH DASHBOARD DATA                                           */
// ================================================================ */

window.refreshDashboardData = async () => {
    try {
        console.log("🔄 Refreshing Admin Data...");
        const [aSnap, tSnap, vSnap, sSnap, taskSnap, attSnap] = await Promise.all([
            get(ref(db, 'assets')),
            get(ref(db, 'asset_transfers')),
            get(ref(db, 'visitors')),
            get(ref(db, 'staff')),
            get(ref(db, 'tasks')),
            get(ref(db, 'staff_attendance'))
        ]);

        window.appCache.assets = aSnap.exists() ? Object.values(aSnap.val()) : [];
        window.appCache.transfers = tSnap.exists() ? Object.values(tSnap.val()) : [];
        window.appCache.visitors = vSnap.exists() ? Object.values(vSnap.val()) : [];
        window.appCache.staff = sSnap.exists() ? Object.values(sSnap.val()) : [];
        window.appCache.tasks = taskSnap.exists() ? Object.values(taskSnap.val()) : [];
        window.appCache.attendance = attSnap.exists() ? Object.values(attSnap.val()) : [];

        console.log(`📊 Staff: ${window.appCache.staff.length}`);
        console.log(`📊 Attendance: ${window.appCache.attendance.length}`);

        window.updateAdminKPIs();

        const activeTab = document.querySelector('.tab-section.active');
        if (activeTab) {
            window.renderTabFromAppCache(activeTab.id);
        } else {
            window.renderTabFromAppCache('tab-staff-logs');
        }

    } catch (e) {
        console.error("❌ Refresh error:", e);
    }
};

// ================================================================ */
// UPDATE KPI                                                       */
// ================================================================ */

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

// ================================================================ */
// TAB RENDERER                                                     */
// ================================================================ */

window.renderTabFromAppCache = (tabId) => {
    console.log(`📋 Rendering tab: ${tabId}`);
    switch (tabId) {
        case 'tab-staff-logs':
            renderStaffAttendance();
            break;
        case 'tab-staff-list':
            renderStaffDirectory();
            break;
        case 'tab-assets':
            renderAssetsTab();
            break;
        case 'tab-transfers':
            renderTransfersTab();
            break;
        case 'tab-disposal':
            renderDisposalTab();
            break;
        case 'tab-visitor-logs':
            renderVisitorLogs();
            break;
        case 'tab-tasks':
            renderGlobalTaskAudit();
            break;
        default:
            break;
    }
};

// ================================================================ */
// FORMAT DATE                                                      */
// ================================================================ */

function formatDate(dateValue) {
    if (!dateValue) return '-';
    if (typeof dateValue === 'string' && dateValue.includes('/')) return dateValue;
    if (typeof dateValue === 'number') {
        try {
            const date = new Date((dateValue - 25569) * 86400 * 1000);
            if (!isNaN(date.getTime())) return date.toLocaleDateString('en-US');
        } catch(e) {}
    }
    if (dateValue instanceof Date) return dateValue.toLocaleDateString('en-US');
    try {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) return date.toLocaleDateString('en-US');
    } catch(e) {}
    return String(dateValue);
}

// ================================================================ */
// GET PROFILE IMAGE - FIXED                                       */
// ================================================================ */

function getProfileImageHtml(url, name, size = 40) {
    if (!url || url === 'N/A' || url === '-' || url === '' || url === 'undefined' || url === 'null') {
        const initial = name ? name.charAt(0).toUpperCase() : 'U';
        return `<div class="staff-photo-container" style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,#4f46e5,#7c3aed);display:flex;align-items:center;justify-content:center;color:white;font-size:${size/2}px;font-weight:900;text-transform:uppercase;flex-shrink:0;">${initial}</div>`;
    }
    const directUrl = window.getDirectDriveImageUrl ? window.getDirectDriveImageUrl(url) : url;
    if (directUrl) {
        return `<div class="staff-photo-container" style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;border:3px solid #e2e8f0;background:#f1f5f9;flex-shrink:0;"><img src="${directUrl}" alt="${name}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='<span style=\\'font-size:${size/2}px;font-weight:900;color:#4f46e5;text-transform:uppercase;\\'>${name ? name.charAt(0).toUpperCase() : 'U'}</span>'"></div>`;
    }
    const initial = name ? name.charAt(0).toUpperCase() : 'U';
    return `<div class="staff-photo-container" style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,#4f46e5,#7c3aed);display:flex;align-items:center;justify-content:center;color:white;font-size:${size/2}px;font-weight:900;text-transform:uppercase;flex-shrink:0;">${initial}</div>`;
}

// ================================================================ */
// RENDER STAFF ATTENDANCE                                          */
// ================================================================ */

function renderStaffAttendance() {
    const body = document.getElementById('staff-attendance-body');
    if (!body) {
        console.error("❌ staff-attendance-body not found");
        return;
    }

    const table = document.querySelector('#tab-staff-logs .table-wrapper table');
    if (table) {
        const thead = table.querySelector('thead');
        if (thead) {
            thead.innerHTML = `
                <tr class="bg-slate-50 uppercase text-emerald-600 font-black text-[9px]">
                    <th class="p-4 text-center w-[60px]">TYPE</th>
                    <th class="p-4 text-left min-w-[160px]">FULL NAME</th>
                    <th class="p-4 text-left min-w-[140px]">COMPANY ID</th>
                    <th class="p-4 text-left min-w-[160px]">COMPANY NAME</th>
                    <th class="p-4 text-left min-w-[140px]">ADEK PASS</th>
                    <th class="p-4 text-left min-w-[140px]">MOBILE</th>
                    <th class="p-4 text-left min-w-[220px]">SCHOOL</th>
                    <th class="p-4 text-left min-w-[120px]">POSITION</th>
                    <th class="p-4 text-left min-w-[120px]">DATE</th>
                    <th class="p-4 text-left min-w-[120px]">IN</th>
                    <th class="p-4 text-left min-w-[120px]">OUT</th>
                    <th class="p-4 text-center min-w-[80px]">SIG</th>
                    <th class="p-4 text-center min-w-[80px]">ACTION</th>
                </tr>
            `;
        }
    }

    const attendanceData = window.appCache.attendance || [];
    const staffData = window.appCache.staff || [];

    if (attendanceData.length === 0) {
        body.innerHTML = `<tr><td colspan="13" class="p-8 text-center text-gray-400">No attendance records found</td></tr>`;
        return;
    }

    attendanceData.sort((a, b) => {
        const dateA = new Date(a.date + ' ' + (a.timeIn || '00:00:00'));
        const dateB = new Date(b.date + ' ' + (b.timeIn || '00:00:00'));
        return dateB - dateA;
    });

    const tableId = 'staff-attendance-body';
    if (!window.paginationState[tableId]) {
        window.paginationState[tableId] = { currentPage: 1, rowsPerPage: 10 };
    }
    const state = window.paginationState[tableId];
    const totalPages = Math.ceil(attendanceData.length / state.rowsPerPage);
    if (state.currentPage > totalPages) state.currentPage = totalPages || 1;

    const start = (state.currentPage - 1) * state.rowsPerPage;
    const paginated = attendanceData.slice(start, start + state.rowsPerPage);

    let bodyHtml = '';

    paginated.forEach((record) => {
        const staffMobile = record.mobile || record.mobileNumber;
        const staff = staffData.find(s => s.mobile === staffMobile || s.mobileNumber === staffMobile);

        const staffName = staff?.fullName || staff?.name || record.name || 'Unknown';
        const staffId = staff?.staffId || staff?.id || record.staffId || record.id || staffMobile || 'N/A';
        const companyName = staff?.companyName || record.companyName || 'Jern Yafoor School';
        const adekPass = staff?.adekPass || staff?.adcPassNumber || record.adekPass || record.adcPassNumber || 'N/A';
        const schoolName = staff?.branch || staff?.school || staff?.schoolName || record.branch || record.school || 'Jern Yafoor School 1';
        const role = staff?.role || staff?.position || record.role || 'Staff';
        const mobile = staffMobile || record.mobile || '-';

        const date = formatDate(record.date || record.checkInDate);
        const timeIn = record.timeIn || record.checkInTime || '-';
        const timeOut = record.checkOutTime || record.outTime || '-';

        const sigUrl = record.signatureUrl || record.checkInSignatureUrl || record.signature;
        const sigHtml = sigUrl ?
            `<img src="${window.getDirectDriveImageUrl(sigUrl)}" class="h-8 w-16 object-contain mx-auto border rounded bg-white cursor-pointer shadow-sm hover:shadow-md transition-all" onclick="window.openImageZoom('${sigUrl}')" title="Click to view signature">` :
            '<span class="text-gray-300 text-[10px]">-</span>';

        bodyHtml += `
            <tr class="border-b hover:bg-indigo-50 transition-colors text-[11px]">
                <td class="p-4 text-center">
                    <span class="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg font-bold text-[9px] uppercase">STAFF</span>
                </td>
                <td class="p-4 font-bold text-indigo-900 whitespace-nowrap">${staffName}</td>
                <td class="p-4 font-mono text-xs font-bold text-indigo-700 whitespace-nowrap">${staffId}</td>
                <td class="p-4 font-semibold text-indigo-700 whitespace-nowrap">${companyName}</td>
                <td class="p-4 font-mono text-xs font-bold text-emerald-600 whitespace-nowrap">${adekPass}</td>
                <td class="p-4 font-mono text-xs whitespace-nowrap">${mobile}</td>
                <td class="p-4 font-semibold text-slate-700 whitespace-nowrap">${schoolName}</td>
                <td class="p-4 uppercase text-[9px] font-bold text-slate-500 whitespace-nowrap">${role}</td>
                <td class="p-4 font-medium whitespace-nowrap">${date}</td>
                <td class="p-4 text-emerald-600 font-bold whitespace-nowrap">${timeIn}</td>
                <td class="p-4 text-red-500 font-bold whitespace-nowrap">${timeOut}</td>
                <td class="p-4 text-center">${sigHtml}</td>
                <td class="p-4 text-center">
                    <button onclick="window.viewStaffDetails('${staffMobile || mobile}')"
                            class="text-indigo-600 hover:text-indigo-800 p-1.5 hover:bg-indigo-50 rounded-lg transition-all">
                        <i class="fa-regular fa-eye text-sm"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    body.innerHTML = bodyHtml;
    setupPaginationUI(tableId, attendanceData.length, state.rowsPerPage);
}

// ================================================================ */
// RENDER STAFF DIRECTORY                                           */
// ================================================================ */

function renderStaffDirectory() {
    const body = document.getElementById('admin-staff-list-body');
    if (!body) {
        console.error("❌ admin-staff-list-body not found");
        return;
    }

    const table = document.querySelector('#tab-staff-list .table-wrapper table');
    if (table) {
        const thead = table.querySelector('thead');
        if (thead) {
            thead.innerHTML = `
                <tr class="bg-slate-50 uppercase text-slate-600 font-black text-[9px]">
                    <th class="p-4 text-center w-[60px]">PHOTO</th>
                    <th class="p-4 text-left min-w-[160px]">FULL NAME</th>
                    <th class="p-4 text-left min-w-[140px]">COMPANY ID</th>
                    <th class="p-4 text-left min-w-[160px]">COMPANY NAME</th>
                    <th class="p-4 text-left min-w-[140px]">ADEK PASS</th>
                    <th class="p-4 text-left min-w-[200px]">SCHOOL</th>
                    <th class="p-4 text-left min-w-[120px]">POSITION</th>
                    <th class="p-4 text-left min-w-[140px]">MOBILE</th>
                    <th class="p-4 text-center min-w-[120px]">ACTION</th>
                </tr>
            `;
        }
    }

    const staffData = window.appCache.staff || [];

    if (staffData.length === 0) {
        body.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-gray-400">No staff members found</td></tr>`;
        return;
    }

    staffData.sort((a, b) => (a.fullName || a.name || '').localeCompare(b.fullName || b.name || ''));

    const tableId = 'admin-staff-list-body';
    if (!window.paginationState[tableId]) {
        window.paginationState[tableId] = { currentPage: 1, rowsPerPage: 10 };
    }
    const state = window.paginationState[tableId];
    const totalPages = Math.ceil(staffData.length / state.rowsPerPage);
    if (state.currentPage > totalPages) state.currentPage = totalPages || 1;

    const start = (state.currentPage - 1) * state.rowsPerPage;
    const paginated = staffData.slice(start, start + state.rowsPerPage);

    let bodyHtml = '';

    paginated.forEach((s) => {
        const name = s.fullName || s.name || 'Unknown';
        const mobile = s.mobile || s.mobileNumber || '-';
        const adek = s.adekPass || s.adcPassNumber || '-';
        const school = s.branch || s.schoolName || s.school || '-';
        const role = s.role || s.position || 'Staff';
        const staffId = s.staffId || s.id || mobile;
        const companyName = s.companyName || 'Jern Yafoor School';
        const profileImg = s.profilePicUrl;

        bodyHtml += `
            <tr class="border-b hover:bg-indigo-50 transition-colors">
                <td class="p-4 text-center">
                    ${getProfileImageHtml(profileImg, name, 40)}
                </td>
                <td class="p-4 font-bold text-indigo-900 whitespace-nowrap">${name}</td>
                <td class="p-4 font-mono text-xs font-bold text-indigo-700 whitespace-nowrap">${staffId}</td>
                <td class="p-4 font-semibold text-indigo-700 whitespace-nowrap">${companyName}</td>
                <td class="p-4 font-mono text-xs font-bold text-emerald-600 whitespace-nowrap">${adek}</td>
                <td class="p-4 text-sm font-medium whitespace-nowrap">${school}</td>
                <td class="p-4 uppercase text-[9px] font-bold text-slate-500 whitespace-nowrap">${role}</td>
                <td class="p-4 font-mono text-xs whitespace-nowrap">${mobile}</td>
                <td class="p-4 text-center">
                    <div class="flex items-center justify-center gap-2">
                        <button onclick="window.viewStaffDetails('${mobile}')"
                                class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center">
                            <i class="fa-regular fa-eye text-xs"></i>
                        </button>
                        <button onclick="window.openEditStaffModal('${mobile}')"
                                class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center">
                            <i class="fa-solid fa-pen-to-square text-xs"></i>
                        </button>
                        <button onclick="window.deleteStaffRecord('${mobile}')"
                                class="w-8 h-8 rounded-lg bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    body.innerHTML = bodyHtml;
    setupPaginationUI(tableId, staffData.length, state.rowsPerPage);
}

// ================================================================ */
// VIEW STAFF DETAILS - IMPROVED MODAL                             */
// ================================================================ */

window.viewStaffDetails = function(mobile) {
    const staffData = window.appCache.staff || [];
    const staff = staffData.find(s => s.mobile === mobile || s.mobileNumber === mobile);

    if (!staff) {
        alert("Staff details not found");
        return;
    }

    const name = staff.fullName || staff.name || 'Unknown';
    const adek = staff.adekPass || staff.adcPassNumber || 'N/A';
    const staffId = staff.staffId || staff.id || mobile || 'N/A';
    const companyName = staff.companyName || 'Jern Yafoor School';
    const school = staff.branch || staff.school || staff.schoolName || 'Unknown';
    const role = staff.role || staff.position || 'Staff';
    const mobileNum = staff.mobile || staff.mobileNumber || 'N/A';
    const profileImg = staff.profilePicUrl;

    const attendanceRecords = window.appCache.attendance.filter(a =>
        a.mobile === mobile || a.mobileNumber === mobile
    );

    let attendanceHtml = '<div class="text-center text-gray-400 text-sm py-4">No attendance records found</div>';
    if (attendanceRecords.length > 0) {
        attendanceHtml = attendanceRecords.slice(0, 5).map(record => {
            const date = formatDate(record.date);
            const timeIn = record.timeIn || '-';
            const timeOut = record.checkOutTime || record.outTime || '-';
            const status = record.status || 'Active';
            return `
                <div class="flex justify-between items-center p-3 border-b border-slate-100 text-xs hover:bg-slate-50 transition-colors">
                    <span class="font-medium text-slate-700">${date}</span>
                    <span class="text-emerald-600 font-bold">${timeIn}</span>
                    <span class="text-red-500 font-bold">${timeOut}</span>
                    <span class="px-2 py-1 rounded-full text-[8px] font-bold ${status === 'checked_in' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">${status === 'checked_in' ? '✅ Present' : '❌ Absent'}</span>
                </div>
            `;
        }).join('');
    }

    // Check if modal exists, if not create it
    let modal = document.getElementById('staff-detail-modal');
    if (!modal) {
        const modalHtml = `
            <div id="staff-detail-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[99999] hidden flex items-center justify-center p-4" style="display:none;">
                <div class="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col animate-scaleIn">
                    <div class="p-5 bg-gradient-to-r from-indigo-600 to-indigo-800 text-white flex justify-between items-center flex-shrink-0">
                        <div class="flex items-center gap-3">
                            <i class="fa-regular fa-user text-xl"></i>
                            <h3 class="text-lg font-black uppercase tracking-tight">Staff Details</h3>
                        </div>
                        <button onclick="document.getElementById('staff-detail-modal').style.display='none'"
                                class="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all">
                            <i class="fa-solid fa-xmark text-xl"></i>
                        </button>
                    </div>
                    <div id="staff-detail-content" class="p-6 overflow-y-auto flex-1"></div>
                    <div class="p-4 bg-slate-50 border-t border-slate-100 flex justify-end flex-shrink-0">
                        <button onclick="document.getElementById('staff-detail-modal').style.display='none'"
                                class="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('staff-detail-modal');
    }

    const content = document.getElementById('staff-detail-content');
    if (content) {
        // Get profile image HTML with larger size for modal
        const profileImgHtml = getProfileImageHtml(profileImg, name, 80);

        content.innerHTML = `
            <div class="flex items-center gap-5 mb-6 pb-6 border-b border-slate-100">
                <div class="flex-shrink-0">
                    ${profileImgHtml}
                </div>
                <div class="flex-1 min-w-0">
                    <h4 class="text-2xl font-black text-indigo-900 truncate">${name}</h4>
                    <div class="flex flex-wrap items-center gap-2 mt-1.5">
                        <span class="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold uppercase">${role}</span>
                        <span class="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-mono font-bold">${adek}</span>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div class="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Company ID</p>
                    <p class="font-mono text-sm font-bold text-indigo-700">${staffId}</p>
                </div>
                <div class="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Company Name</p>
                    <p class="text-sm font-bold text-indigo-900">${companyName}</p>
                </div>
                <div class="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">ADEK Pass</p>
                    <p class="font-mono text-sm font-bold text-emerald-600">${adek}</p>
                </div>
                <div class="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mobile</p>
                    <p class="font-mono text-sm font-bold text-slate-700">${mobileNum}</p>
                </div>
                <div class="bg-slate-50 rounded-xl p-4 border border-slate-100 col-span-2">
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">School</p>
                    <p class="text-sm font-bold text-indigo-900">${school}</p>
                </div>
                <div class="bg-slate-50 rounded-xl p-4 border border-slate-100 col-span-2">
                    <div class="flex items-center justify-between mb-3">
                        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recent Attendance</p>
                        <span class="text-[8px] font-bold text-slate-400">${attendanceRecords.length} records</span>
                    </div>
                    <div class="space-y-1 max-h-48 overflow-y-auto">
                        ${attendanceHtml}
                    </div>
                </div>
            </div>
        `;
    }

    const modalEl = document.getElementById('staff-detail-modal');
    if (modalEl) {
        modalEl.style.display = 'flex';
        // Add animation class
        modalEl.classList.add('active');
    }

    // Add click outside to close
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            this.style.display = 'none';
        }
    });
};

// ================================================================ */
// DELETE STAFF RECORD                                              */
// ================================================================ */

window.deleteStaffRecord = async (mobile) => {
    if (!confirm(`Delete staff member with mobile ${mobile} permanently?`)) return;
    try {
        await remove(ref(db, `staff/${mobile}`));
        await remove(ref(db, `users/${mobile}`));
        window.triggerSuccessPopup("Staff Deleted!");
        window.refreshDashboardData();
    } catch (e) {
        alert("Error: " + e.message);
    }
};

// ================================================================ */
// RENDER VISITOR LOGS                                              */
// ================================================================ */

function renderVisitorLogs() {
    const body = document.getElementById('visitor-logs-body');
    if (!body) return;

    const visitors = window.appCache.visitors || [];
    if (visitors.length === 0) {
        body.innerHTML = `<tr><td colspan="11" class="p-8 text-center text-gray-400">No visitor records found</td></tr>`;
        return;
    }

    visitors.sort((a, b) => new Date(b.date + ' ' + b.timeIn) - new Date(a.date + ' ' + a.timeIn));

    const tableId = 'visitor-logs-body';
    if (!window.paginationState[tableId]) {
        window.paginationState[tableId] = { currentPage: 1, rowsPerPage: 10 };
    }
    const state = window.paginationState[tableId];
    const totalPages = Math.ceil(visitors.length / state.rowsPerPage);
    if (state.currentPage > totalPages) state.currentPage = totalPages || 1;

    const start = (state.currentPage - 1) * state.rowsPerPage;
    const paginated = visitors.slice(start, start + state.rowsPerPage);

    let bodyHtml = '';
    paginated.forEach(v => {
        const sigHtml = v.signatureUrl ?
            `<img src="${window.getDirectDriveImageUrl(v.signatureUrl)}" class="h-8 w-16 object-contain mx-auto border rounded bg-white cursor-pointer" onclick="window.openImageZoom('${v.signatureUrl}')">` :
            "-";
        bodyHtml += `
            <tr>
                <td class="p-4"><span class="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg font-bold text-[10px]">VISITOR</span></td>
                <td class="p-4 font-mono font-bold text-sm">${v.id || "-"}</td>
                <td class="p-4 font-bold text-slate-800">${v.name || "-"}</td>
                <td class="p-4">${v.mobile || "-"}</td>
                <td class="p-4">${v.company || "-"}</td>
                <td class="p-4">${v.purpose || "-"}</td>
                <td class="p-4">${formatDate(v.date) || "-"}</td>
                <td class="p-4 text-emerald-600 font-bold">${v.timeIn || "-"}</td>
                <td class="p-4 text-red-500 font-bold">${v.outTime || "-"}</td>
                <td class="p-4"><span class="status-badge ${v.status === 'SIGNED OUT' ? 'closed' : 'open'}">${v.status || "Active"}</span></td>
                <td class="p-4 text-center">${sigHtml}</td>
            </tr>
        `;
    });

    body.innerHTML = bodyHtml;
    setupPaginationUI(tableId, visitors.length, state.rowsPerPage);
}

// ================================================================ */
// RENDER GLOBAL TASK AUDIT                                         */
// ================================================================ */

function renderGlobalTaskAudit() {
    const body = document.getElementById('admin-task-list-body');
    if (!body) return;

    const tasks = window.appCache.tasks || [];
    if (tasks.length === 0) {
        body.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-gray-400">No tasks found</td></tr>`;
        return;
    }

    tasks.sort((a, b) => new Date(b.raisedTimestamp || 0) - new Date(a.raisedTimestamp || 0));

    const tableId = 'admin-task-list-body';
    if (!window.paginationState[tableId]) {
        window.paginationState[tableId] = { currentPage: 1, rowsPerPage: 10 };
    }
    const state = window.paginationState[tableId];
    const totalPages = Math.ceil(tasks.length / state.rowsPerPage);
    if (state.currentPage > totalPages) state.currentPage = totalPages || 1;

    const start = (state.currentPage - 1) * state.rowsPerPage;
    const paginated = tasks.slice(start, start + state.rowsPerPage);

    let bodyHtml = '';
    paginated.forEach(t => {
        const bImg = window.getDirectDriveImageUrl(t.beforePhotoUrl || t.beforePhoto);
        const aImg = window.getDirectDriveImageUrl(t.afterPhotoUrl || t.afterPhoto);
        bodyHtml += `
            <tr>
                <td class="p-3 font-mono text-indigo-600 font-bold text-xs">${t.id?.split('-')[1] || t.id || "-"}</td>
                <td class="p-3">${t.assignedSchool || "-"}</td>
                <td class="p-3 font-bold">${t.location || "-"}</td>
                <td class="p-3 max-w-[150px] truncate">${t.details || "-"}</td>
                <td class="p-3 uppercase text-[8px] font-black">${t.assignedRole || "-"}</td>
                <td class="p-3"><div class="flex flex-col"><span class="font-bold">${t.raisedByName || "Admin"}</span><span class="text-[7px] opacity-50">${t.timestamp || ""}</span></div></td>
                <td class="p-3 font-bold text-emerald-600">${t.solvedByName || "-"}</td>
                <td class="p-3"><span class="status-badge ${(t.status || 'Open').toLowerCase()}">${t.status || "Open"}</span></td>
                <td class="p-3 italic text-[8px]">${t.rejectionReason || "-"}</td>
                <td class="p-3 text-center"><div class="flex gap-1 justify-center">${bImg ? `<img src="${bImg}" class="h-8 w-8 object-cover rounded border cursor-pointer" onclick="window.openImageZoom('${bImg}')">` : '<span class="text-gray-300 text-[8px]">No</span>'}${t.afterPhotoUrl ? `<img src="${aImg}" class="h-8 w-8 object-cover rounded border border-emerald-200 cursor-pointer" onclick="window.openImageZoom('${aImg}')">` : ''}</div></td>
            </tr>
        `;
    });

    body.innerHTML = bodyHtml;
    setupPaginationUI(tableId, tasks.length, state.rowsPerPage);
}

// ================================================================ */
// RENDER ASSETS TAB                                                */
// ================================================================ */

function renderAssetsTab() {
    const assets = window.currentFilteredData.assets || window.appCache.assets || [];
    const normalizer = window.fieldNormalizer;

    if (!assets || assets.length === 0) {
        document.getElementById('asset-table-body').innerHTML = `
            <tr><td colspan="20" class="p-8 text-center text-gray-400">No assets found</td></tr>
        `;
        document.getElementById('asset-table-header').innerHTML = '';
        return;
    }

    const allKeys = Object.keys(assets[0]).filter(k =>
        !['_id', '_row', '_version', 'importedAt', 'updatedAt', 'assetId', 'profilePicUrl'].includes(k)
    );

    const displayFields = allKeys;

    let headerHtml = `<tr class="bg-indigo-900 text-white text-left text-[10px] uppercase font-bold sticky top-0 z-20">`;
    headerHtml += `<th class="p-3 w-8 sticky left-0 bg-indigo-900 z-30">#</th>`;

    displayFields.forEach(field => {
        const label = normalizer?.getFieldLabel(field) || field.replace(/([A-Z])/g, ' $1').trim();
        headerHtml += `<th class="p-3 border-r border-indigo-800/20 shadow-sm text-[9px] whitespace-nowrap min-w-[120px]" title="${label}">${label.substring(0, 20)}</th>`;
    });

    headerHtml += `<th class="p-3 text-center min-w-[100px]">ACTION</th></tr>`;
    document.getElementById('asset-table-header').innerHTML = headerHtml;

    const tableId = 'asset-table-body';
    if (!window.paginationState[tableId]) {
        window.paginationState[tableId] = { currentPage: 1, rowsPerPage: 10 };
    }
    const state = window.paginationState[tableId];
    const totalPages = Math.ceil(assets.length / state.rowsPerPage);
    if (state.currentPage > totalPages) state.currentPage = totalPages || 1;

    const start = (state.currentPage - 1) * state.rowsPerPage;
    const paginated = assets.slice(start, start + state.rowsPerPage);

    let bodyHtml = '';
    paginated.forEach((asset, index) => {
        const barcode = asset.assetBarcode || asset.barcode || `row_${index}`;
        const globalIndex = start + index + 1;
        bodyHtml += `<tr class="border-b hover:bg-indigo-50 text-[10px] text-slate-700">`;
        bodyHtml += `<td class="p-3 text-center sticky left-0 bg-white z-10 border-r shadow-sm">${globalIndex}</td>`;

        displayFields.forEach(field => {
            let value = asset[field];
            if (value === undefined || value === null || value === '') value = '-';
            if (typeof value === 'string' && value.length > 30) {
                value = value.substring(0, 27) + '...';
            }
            bodyHtml += `<td class="p-3 border-r border-slate-100 max-w-[200px] truncate" title="${asset[field] || '-'}">${value}</td>`;
        });

        bodyHtml += `
            <td class="p-3 text-center">
                <button onclick="window.openEditAssetModal('${barcode}')" class="text-indigo-600 hover:text-indigo-800 p-1">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button onclick="window.deleteAssetRecord('${barcode}')" class="text-red-600 hover:text-red-800 p-1">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        </tr>`;
    });

    document.getElementById('asset-table-body').innerHTML = bodyHtml;

    const countDisplay = document.getElementById('asset-count-display');
    if (countDisplay) {
        countDisplay.textContent = `Showing ${paginated.length} of ${assets.length} assets | ${displayFields.length} fields`;
    }

    setupPaginationUI(tableId, assets.length, state.rowsPerPage);
}

// ================================================================ */
// RENDER TRANSFERS TAB                                             */
// ================================================================ */

function renderTransfersTab() {
    const transfers = window.currentFilteredData.transfers || window.appCache.transfers || [];
    const normalizer = window.fieldNormalizer;

    const body = document.getElementById('transfer-logs-body');
    if (!body) return;

    if (!transfers || transfers.length === 0) {
        body.innerHTML = `<tr><td colspan="24" class="p-8 text-center text-gray-400">No transfers found</td></tr>`;
        return;
    }

    const allKeys = Object.keys(transfers[0]).filter(k =>
        !['_id', '_row', '_version', 'importedAt', 'updatedAt'].includes(k)
    );
    const displayFields = allKeys.slice(0, 15);

    const tableId = 'transfer-logs-body';
    if (!window.paginationState[tableId]) {
        window.paginationState[tableId] = { currentPage: 1, rowsPerPage: 10 };
    }
    const state = window.paginationState[tableId];
    const totalPages = Math.ceil(transfers.length / state.rowsPerPage);
    if (state.currentPage > totalPages) state.currentPage = totalPages || 1;

    const start = (state.currentPage - 1) * state.rowsPerPage;
    const paginated = transfers.slice(start, start + state.rowsPerPage);

    let headerHtml = `<tr class="bg-indigo-50 text-indigo-600 uppercase font-black text-[9px]">`;
    displayFields.forEach(field => {
        const label = normalizer?.getFieldLabel(field) || field.replace(/([A-Z])/g, ' $1').trim();
        headerHtml += `<th class="p-2 whitespace-nowrap min-w-[100px]">${label.substring(0, 15)}</th>`;
    });
    headerHtml += `<th class="p-2 text-center min-w-[80px]">Action</th></tr>`;

    const table = body.closest('table');
    if (table) {
        const thead = table.querySelector('thead');
        if (thead) thead.innerHTML = headerHtml;
    }

    let bodyHtml = '';
    paginated.forEach((transfer) => {
        bodyHtml += `<tr class="border-b hover:bg-slate-50 text-[9px]">`;
        displayFields.forEach(field => {
            let value = transfer[field];
            if (value === undefined || value === null || value === '') value = '-';
            if (typeof value === 'string' && value.length > 25) {
                value = value.substring(0, 22) + '...';
            }
            bodyHtml += `<td class="p-2 max-w-[150px] truncate" title="${transfer[field] || '-'}">${value}</td>`;
        });
        bodyHtml += `
            <td class="p-2 text-center">
                <button onclick="window.revertAssetToRegister('${transfer.assetBarcode || transfer.barcode}')" class="text-indigo-600 hover:text-indigo-800 p-1">
                    <i class="fa-solid fa-rotate-left"></i>
                </button>
            </td>
        </tr>`;
    });

    body.innerHTML = bodyHtml;
    setupPaginationUI(tableId, transfers.length, state.rowsPerPage);
}

// ================================================================ */
// RENDER DISPOSAL TAB                                              */
// ================================================================ */

function renderDisposalTab() {
    const assets = window.appCache.assets || [];
    const disposed = assets.filter(a => a.assetStatus === 'Disposed' || a.disposalReason);

    const body = document.getElementById('admin-disposal-list-body');
    if (!body) return;

    if (!disposed || disposed.length === 0) {
        body.innerHTML = `<tr><td colspan="16" class="p-8 text-center text-gray-400">No disposed assets found</td></tr>`;
        return;
    }

    const tableId = 'admin-disposal-list-body';
    if (!window.paginationState[tableId]) {
        window.paginationState[tableId] = { currentPage: 1, rowsPerPage: 10 };
    }
    const state = window.paginationState[tableId];
    const totalPages = Math.ceil(disposed.length / state.rowsPerPage);
    if (state.currentPage > totalPages) state.currentPage = totalPages || 1;

    const start = (state.currentPage - 1) * state.rowsPerPage;
    const paginated = disposed.slice(start, start + state.rowsPerPage);

    const displayFields = ['assetBarcode', 'assetDescription', 'assetVendorName', 'category', 'disposalReason', 'disposalDate', 'assetCondition'];
    let bodyHtml = '';
    paginated.forEach((asset) => {
        bodyHtml += `<tr class="border-b hover:bg-red-50 text-[9px]">`;
        displayFields.forEach(field => {
            let value = asset[field];
            if (value === undefined || value === null || value === '') value = '-';
            bodyHtml += `<td class="p-2 max-w-[150px] truncate">${value}</td>`;
        });
        bodyHtml += `
            <td class="p-2 text-center">
                <button onclick="window.recoverDisposedAsset('${asset.assetBarcode}')" class="text-emerald-600 hover:text-emerald-800 p-1">
                    <i class="fa-solid fa-rotate-left"></i> Restore
                </button>
            </td>
        </tr>`;
    });

    body.innerHTML = bodyHtml;
    setupPaginationUI(tableId, disposed.length, state.rowsPerPage);
}

// ================================================================ */
// DELETE & RECOVER FUNCTIONS                                       */
// ================================================================ */

window.deleteAssetRecord = async (barcode) => {
    if (!confirm(`Delete asset ${barcode} permanently?`)) return;
    try {
        await remove(ref(db, `assets/${barcode}`));
        window.triggerSuccessPopup("Asset Deleted!");
        window.refreshDashboardData();
    } catch (e) {
        alert(e.message);
    }
};

window.recoverDisposedAsset = async (barcode) => {
    if (!confirm(`Restore ${barcode}?`)) return;
    try {
        await update(ref(db, `assets/${barcode}`), {
            assetStatus: 'Active',
            disposalReason: null,
            disposalDate: null
        });
        window.triggerSuccessPopup("Asset Restored!");
        window.refreshDashboardData();
    } catch (e) {
        alert(e.message);
    }
};

window.revertAssetToRegister = async (barcode) => {
    if (!confirm(`Revert ${barcode} to Asset Register?`)) return;
    try {
        await update(ref(db, `assets/${barcode}`), { assetStatus: 'Active' });
        window.triggerSuccessPopup("Asset Reverted!");
        window.refreshDashboardData();
    } catch (e) {
        alert(e.message);
    }
};

// ================================================================ */
// BULK DELETE ASSETS                                               */
// ================================================================ */

window.bulkDeleteAssets = async () => {
    const selectedCount = window.selectedAssetKeys.size;
    if (selectedCount === 0) return alert("Please select assets to delete.");
    if (!confirm(`⚠️ Delete ${selectedCount} assets?`)) return;

    const btn = document.querySelector('button[onclick="window.bulkDeleteAssets()"]');
    if (!btn) return;

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Deleting...`;

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
    } catch (e) {
        alert("Batch deletion failed: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

// ================================================================ */
// SELECTION HANDLERS                                                */
// ================================================================ */

window.toggleAllAssetCheckboxes = (master) => {
    const isChecked = master.checked;
    const checkboxes = document.querySelectorAll('.asset-checkbox');
    checkboxes.forEach(cb => { cb.checked = isChecked; });
    window.selectedAssetKeys.clear();
    if (isChecked) {
        checkboxes.forEach(cb => window.selectedAssetKeys.add(cb.value));
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

// ================================================================ */
// STAFF REGISTRATION                                               */
// ================================================================ */

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
            <form id="add-staff-form" class="p-6 space-y-4 overflow-y-auto flex-1" onsubmit="window.submitAddStaff(event)">
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
                <div>
                    <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">Company ID *</label>
                    <input type="text" id="staff-company-id" placeholder="e.g. STAFF-2024-001" required class="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-indigo-600 focus:bg-white transition-all">
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-slate-500 uppercase mb-1">Company Name *</label>
                    <input type="text" id="staff-company-name" placeholder="e.g. Jern Yafoor School" required value="Jern Yafoor School" class="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-indigo-600 focus:bg-white transition-all">
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
        reader.onload = (e) => {
            preview.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover">`;
        };
        reader.readAsDataURL(input.files[0]);
    }
};

window.submitAddStaff = async (event) => {
    if (event) event.preventDefault();

    const submitBtn = document.getElementById('add-staff-submit-btn');
    if (!submitBtn) {
        console.error("❌ Submit button not found");
        alert("Submit button not found. Please refresh the page.");
        return;
    }

    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        REGISTERING...
    `;
    submitBtn.classList.add('opacity-70', 'cursor-not-allowed');

    try {
        const fullName = document.getElementById('staff-fullname')?.value.trim();
        const companyId = document.getElementById('staff-company-id')?.value.trim();
        const companyName = document.getElementById('staff-company-name')?.value.trim() || 'Jern Yafoor School';
        const mobile = document.getElementById('staff-mobile')?.value.trim();
        const adek = document.getElementById('staff-adek')?.value.trim();
        const school = document.getElementById('staff-school')?.value;
        const role = document.getElementById('staff-role')?.value;
        const password = document.getElementById('staff-password')?.value;
        const photoInput = document.getElementById('staff-photo-input');

        if (!fullName) throw new Error("Full Name is required");
        if (!companyId) throw new Error("Company ID is required");
        if (!mobile) throw new Error("Mobile Number is required");
        if (!adek) throw new Error("ADEK Pass Number is required");
        if (!password || password.length < 6) throw new Error("Password must be at least 6 characters");

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
                    const uploadRes = await window.uploadToDrive({
                        image: base64Image,
                        category: 'PROFILE_PHOTOS',
                        fileName: `staff_${Date.now()}.png`
                    });
                    if (uploadRes && uploadRes.status === 'success') {
                        profilePicUrl = uploadRes.fileUrl;
                    }
                }
            } catch (imgErr) {
                console.warn("Image upload failed:", imgErr);
            }
        }

        const staffData = {
            staffId: companyId,
            fullName: fullName,
            name: fullName,
            companyName: companyName,
            mobile: mobile,
            mobileNumber: mobile,
            adekPass: adek,
            adcPassNumber: adek,
            branch: school,
            schoolName: school,
            role: role,
            position: role,
            password: password,
            profilePicUrl: profilePicUrl,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await set(ref(db, 'staff/' + mobile), staffData);
        await set(ref(db, 'users/' + mobile), staffData);

        const form = document.getElementById('add-staff-form');
        if (form) form.reset();

        const modal = document.getElementById('add-staff-modal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.add('hidden');
        }

        alert("✅ Staff Registered Successfully!\n\n" +
              "👤 Name: " + fullName + "\n" +
              "🏢 Company: " + companyName + "\n" +
              "🆔 ID: " + companyId);

        window.refreshDashboardData();

    } catch (error) {
        console.error("Registration Error:", error);
        alert("❌ Registration Failed: " + error.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
            submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
        }
    }
};

window.submitEditStaff = async (e, mobile) => {
    e.preventDefault();
    const btn = document.getElementById('edit-staff-submit-btn');
    if (!btn) return;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Updating...';

    try {
        const updates = {
            name: document.getElementById('edit-fullname').value,
            fullName: document.getElementById('edit-fullname').value,
            companyName: document.getElementById('edit-company-name').value,
            staffId: document.getElementById('edit-company-id').value,
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

        if (photoInput.files && photoInput.files[0]) {
            const base64 = await window.compressImageFile(photoInput.files[0], 500, 500, 0.7);
            const uploadRes = await window.uploadToDrive({
                category: UPLOAD_CONFIG.CATEGORIES.PROFILE_PHOTOS,
                fileName: `Profile_${mobile}.jpg`,
                image: base64
            });
            if (uploadRes.status === 'success' && uploadRes.fileUrl) {
                updates.profilePicUrl = uploadRes.fileUrl;
            }
        }

        await update(ref(db, 'staff/' + mobile), updates);
        await update(ref(db, 'users/' + mobile), updates);

        alert("✅ Staff record updated successfully!");
        document.getElementById('edit-staff-modal').classList.add('hidden');
        window.refreshDashboardData();
    } catch (e) {
        console.error("Update Error:", e);
        alert("❌ Update Error: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

window.openEditStaffModal = async (mobile) => {
    const snap = await get(ref(db, 'staff/' + mobile));
    if (!snap.exists()) return alert("Staff not found");
    const s = snap.val();
    const modal = document.getElementById('edit-staff-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    const profileImg = s.profilePicUrl;

    modal.innerHTML = `
        <div class="bg-white w-full max-w-lg rounded-[40px] overflow-hidden shadow-2xl">
            <div class="p-6 bg-indigo-600 text-white flex justify-between items-center">
                <h3 class="text-lg font-bold uppercase tracking-tight">Edit Staff</h3>
                <button onclick="document.getElementById('edit-staff-modal').classList.add('hidden')"><i class="fa-solid fa-xmark text-xl"></i></button>
            </div>
            <form id="edit-staff-form" class="p-8 space-y-4" onsubmit="window.submitEditStaff(event, '${mobile}')">
                <div class="flex items-center gap-4 p-4 bg-slate-50 border-2 rounded-2xl">
                    <div id="edit-staff-photo-preview" class="w-16 h-16 rounded-full bg-slate-200 overflow-hidden flex-shrink-0 border-2 border-white shadow-sm">
                        ${getProfileImageHtml(profileImg, s.name || 'U', 64)}
                    </div>
                    <div class="flex-1">
                        <label class="block text-[10px] font-black text-slate-400 uppercase mb-1">Change Profile Photo</label>
                        <input type="file" id="edit-staff-photo-input" accept="image/*" class="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100" onchange="window.previewStaffPhoto(this, 'edit-staff-photo-preview')">
                    </div>
                </div>
                <input type="text" id="edit-fullname" value="${s.name || ''}" required class="w-full p-4 bg-slate-50 border-2 rounded-2xl">
                <input type="text" id="edit-company-id" value="${s.staffId || ''}" required class="w-full p-4 bg-slate-50 border-2 rounded-2xl">
                <input type="text" id="edit-company-name" value="${s.companyName || 'Jern Yafoor School'}" required class="w-full p-4 bg-slate-50 border-2 rounded-2xl">
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

// ================================================================ */
// PAGINATION SYSTEM                                                */
// ================================================================ */

function setupPaginationUI(tableBodyId, totalRows, rowsPerPage = 10) {
    const paginationMap = {
        'staff-attendance-body': 'staff-attendance-pagination',
        'admin-staff-list-body': 'directory-pagination',
        'visitor-logs-body': 'visitor-logs-pagination',
        'admin-task-list-body': 'tasks-pagination',
        'asset-table-body': 'assets-pagination',
        'admin-disposal-list-body': 'disposal-pagination',
        'transfer-logs-body': 'transfer-pagination'
    };

    const containerId = paginationMap[tableBodyId];
    if (!containerId) return;

    const container = document.getElementById(containerId);
    if (!container) return;

    if (!window.paginationState[tableBodyId]) {
        window.paginationState[tableBodyId] = { currentPage: 1, rowsPerPage: rowsPerPage || 10 };
    }
    const state = window.paginationState[tableBodyId];
    const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

    if (state.currentPage > totalPages) state.currentPage = totalPages;
    if (state.currentPage < 1) state.currentPage = 1;

    if (totalPages <= 1) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    const start = (state.currentPage - 1) * rowsPerPage + 1;
    const end = Math.min(state.currentPage * rowsPerPage, totalRows);

    let pageButtons = '';
    const maxVisible = 5;
    let startPage = Math.max(1, state.currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
        pageButtons += `<button class="pagination-btn" onclick="window.changePageGeneric('${tableBodyId}', 1)">1</button>`;
        if (startPage > 2) pageButtons += `<span class="page-info">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        pageButtons += `<button class="pagination-btn ${i === state.currentPage ? 'active' : ''}" onclick="window.changePageGeneric('${tableBodyId}', ${i})">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) pageButtons += `<span class="page-info">...</span>`;
        pageButtons += `<button class="pagination-btn" onclick="window.changePageGeneric('${tableBodyId}', ${totalPages})">${totalPages}</button>`;
    }

    container.innerHTML = `
        <button class="pagination-btn" onclick="window.changePageGeneric('${tableBodyId}', ${state.currentPage - 1})" ${state.currentPage === 1 ? 'disabled' : ''}>
            <i class="fa-solid fa-chevron-left"></i>
        </button>
        ${pageButtons}
        <button class="pagination-btn" onclick="window.changePageGeneric('${tableBodyId}', ${state.currentPage + 1})" ${state.currentPage === totalPages ? 'disabled' : ''}>
            <i class="fa-solid fa-chevron-right"></i>
        </button>
        <span class="page-info" style="margin-left:8px;font-size:8px;opacity:0.5;">
            ${start}-${end} of ${totalRows}
        </span>
    `;
}

window.changePageGeneric = function(tableBodyId, newPage) {
    const state = window.paginationState[tableBodyId];
    if (!state) return;

    const totalRows = getTotalRowsForTable(tableBodyId);
    const totalPages = Math.max(1, Math.ceil(totalRows / state.rowsPerPage));

    if (newPage < 1 || newPage > totalPages) return;
    state.currentPage = newPage;

    const activeTab = document.querySelector('.tab-section.active')?.id;
    if (activeTab && window.renderTabFromAppCache) {
        window.renderTabFromAppCache(activeTab);
    }
};

function getTotalRowsForTable(tableBodyId) {
    switch (tableBodyId) {
        case 'staff-attendance-body': return window.appCache.attendance?.length || 0;
        case 'admin-staff-list-body': return window.appCache.staff?.length || 0;
        case 'visitor-logs-body': return window.appCache.visitors?.length || 0;
        case 'admin-task-list-body': return window.appCache.tasks?.length || 0;
        case 'asset-table-body': return (window.currentFilteredData.assets || window.appCache.assets)?.length || 0;
        case 'admin-disposal-list-body': {
            const assets = window.appCache.assets || [];
            return assets.filter(a => a.assetStatus === 'Disposed' || a.disposalReason).length || 0;
        }
        case 'transfer-logs-body': return (window.currentFilteredData.transfers || window.appCache.transfers)?.length || 0;
        default: return 0;
    }
}

// ================================================================ */
// PATCH ATTENDANCE WITH COMPANY INFO                              */
// ================================================================ */

window.patchAttendanceWithCompanyInfo = function(staff) {
    if (staff && !staff.companyName) {
        staff.companyName = staff.companyName || 'Jern Yafoor School';
    }
    if (staff && !staff.staffId) {
        staff.staffId = staff.staffId || staff.mobile || 'N/A';
    }
    return staff;
};

const originalCompleteCheckIn = window.completeCheckIn;
if (originalCompleteCheckIn) {
    window.completeCheckIn = async function(staff, sigData) {
        staff = window.patchAttendanceWithCompanyInfo(staff);
        return originalCompleteCheckIn.call(this, staff, sigData);
    };
}

const originalCompleteCheckOut = window.completeCheckOut;
if (originalCompleteCheckOut) {
    window.completeCheckOut = async function(staff) {
        staff = window.patchAttendanceWithCompanyInfo(staff);
        return originalCompleteCheckOut.call(this, staff);
    };
}

// ================================================================ */
// LOAD ADMIN DASHBOARD                                             */
// ================================================================ */

window.loadAdminDashboard = () => {
    window.refreshDashboardData();
};

console.log("✅ admin_module.js loaded (IMPROVED STAFF DETAIL MODAL)");