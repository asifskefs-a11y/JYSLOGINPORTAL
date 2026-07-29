import { db } from './firebase_config.js';
import { ref, get, set, update, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- GLOBAL APP CACHE ---
window.appCache = {
    visitors: [],
    staff_attendance: [],
    staff: {},
    users: {},
    tasks: [],
    assets: [],
    transfers: [],
    allRecordsCombined: [],
    isInitialized: false
};

// --- CORE ADMIN DASHBOARD LOGIC (HARDENED) ---
window.showAdminTab = (tabId) => {
    try {
        console.log("Hardened Tab Switch:", tabId);
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

        // Update Button Active States
        document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active-tab'));
        // Dynamic lookup by tabId substring to match [onclick*="tabId"]
        const buttons = document.querySelectorAll('.admin-tab-btn');
        buttons.forEach(btn => {
            if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(tabId)) {
                btn.classList.add('active-tab');
            }
        });

        // Trigger Render
        window.renderTabFromAppCache(tabId);
    } catch (e) { console.error("Tab switch error:", e); }
};

window.renderTabFromAppCache = (tabId) => {
    try {
        switch(tabId) {
            case 'tab-visitor-logs':
                window.renderVisitorTable(window.appCache.visitors);
                break;
            case 'tab-staff-logs':
                window.renderStaffAttendanceTable(window.appCache.staff_attendance);
                break;
            case 'tab-tasks':
                if (window.renderTaskTable) window.renderTaskTable(window.appCache.tasks);
                break;
            case 'tab-staff-list':
                if (window.renderStaffDirectory) window.renderStaffDirectory(window.appCache.staff);
                break;
            case 'tab-assets':
            case 'tab-disposal':
                if (window.renderAdminAssetTable) window.renderAdminAssetTable(window.appCache.assets);
                break;
            case 'tab-transfers':
                if (window.renderTransferTable) window.renderTransferTable(window.appCache.transfers);
                break;
        }
    } catch (e) { console.error("Render from cache error:", e); }
};

window.loadAdminDashboard = async () => {
    try {
        console.log("Admin Dashboard: Initializing Hardened Data Listeners...");

        // 1. Visitors Listener
        onValue(ref(db, 'visitors'), (snap) => {
            window.appCache.visitors = snap.exists() ? Object.values(snap.val()).reverse() : [];
            window.renderVisitorTable(window.appCache.visitors);
            window.updateKPIs();
        });

        // 2. Staff Attendance Listener
        onValue(ref(db, 'staff_attendance'), (snap) => {
            window.appCache.staff_attendance = snap.exists() ? Object.values(snap.val()).reverse() : [];
            window.renderStaffAttendanceTable(window.appCache.staff_attendance);
            window.updateKPIs();
        });

        // 3. Tasks Listener
        onValue(ref(db, 'tasks'), (snap) => {
            window.appCache.tasks = snap.exists() ? Object.values(snap.val()).reverse() : [];
            if (window.renderTaskTable) window.renderTaskTable(window.appCache.tasks);
            window.updateKPIs();
        });

        // 4. Assets & Transfers
        onValue(ref(db, 'assets'), (snap) => {
            window.appCache.assets = snap.exists() ? Object.values(snap.val()) : [];
            if (window.renderAdminAssetTable) window.renderAdminAssetTable(window.appCache.assets);
        });

        onValue(ref(db, 'asset_transfers'), (snap) => {
            window.appCache.transfers = snap.exists() ? Object.values(snap.val()) : [];
            if (window.renderTransferTable) window.renderTransferTable(window.appCache.transfers);
        });

        // 5. Staff/Users Directory
        onValue(ref(db, 'staff'), (snap) => {
            window.appCache.staff = snap.exists() ? snap.val() : {};
            if (window.renderStaffDirectory) window.renderStaffDirectory(window.appCache.staff);
        });

        window.appCache.isInitialized = true;
        if (window.initNotificationBell) window.initNotificationBell();
        if (window.checkAndSubscribePush) window.checkAndSubscribePush();

    } catch (err) { console.error("Admin Dashboard Critical Fail:", err); }
};

window.updateKPIs = () => {
    try {
        const vToday = window.appCache.visitors.filter(v => v.date === new Date().toLocaleDateString('en-US')).length;
        const tActive = window.appCache.tasks.filter(t => t.status !== 'Closed' && t.status !== 'Rejected').length;
        const sPresent = window.appCache.staff_attendance.filter(s => s.status === 'checked_in').length;

        const elV = document.getElementById('kpi-visitors');
        const elT = document.getElementById('kpi-tasks');
        const elS = document.getElementById('kpi-staff');

        if (elV) elV.innerText = vToday;
        if (elT) elT.innerText = tActive;
        if (elS) elS.innerText = sPresent;
    } catch (e) { console.warn("KPI Update Fail:", e); }
};

window.renderVisitorTable = (data) => {
    const body = document.getElementById('visitor-logs-body');
    if (!body) return;
    body.innerHTML = '';

    data.forEach(v => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 transition border-b border-gray-50";
        tr.innerHTML = `
            <td class="p-3"><span class="px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded-md font-bold uppercase text-[8px]">Visitor</span></td>
            <td class="p-3 font-mono">${v.id || '-'}</td>
            <td class="p-3 font-bold">${v.name || '-'}</td>
            <td class="p-3">${v.mobile || '-'}</td>
            <td class="p-3 uppercase text-gray-400 font-bold">${v.company || '-'}</td>
            <td class="p-3 italic text-gray-500">${v.purpose || '-'}</td>
            <td class="p-3 font-mono text-gray-400">${v.date || '-'}</td>
            <td class="p-3 font-bold text-green-600">${v.timeIn || '-'}</td>
            <td class="p-3 font-bold text-red-600">${v.timeOut || '-'}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${v.status === 'active' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}">${v.status || 'inactive'}</span></td>
            <td class="p-3 text-center">
                ${v.signatureUrl ? `<img src="${window.getDirectDriveImageUrl(v.signatureUrl)}" class="h-8 w-12 object-contain border rounded bg-white shadow-sm cursor-pointer hover:scale-150 transition" onclick="window.openImageZoom('${v.signatureUrl}')">` : '<i class="fa-solid fa-pen-nib opacity-10"></i>'}
            </td>
        `;
        body.appendChild(tr);
    });
};

window.renderStaffAttendanceTable = (data) => {
    const body = document.getElementById('staff-attendance-body');
    if (!body) return;
    body.innerHTML = '';

    data.forEach(s => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 transition border-b border-gray-50";
        tr.innerHTML = `
            <td class="p-3"><span class="px-2 py-0.5 bg-purple-100 text-purple-600 rounded-md font-bold uppercase text-[8px]">Staff</span></td>
            <td class="p-3 font-bold text-indigo-900">${s.name || '-'}</td>
            <td class="p-3 font-mono text-gray-500">${s.mobile || '-'}</td>
            <td class="p-3 text-[9px] font-bold text-gray-400 uppercase">${s.branch || '-'}</td>
            <td class="p-3 uppercase font-black text-indigo-400">${s.role || '-'}</td>
            <td class="p-3 font-mono text-gray-400">${s.adekPassId || s.adcPassNumber || '-'}</td>
            <td class="p-3 font-mono">${s.date || '-'}</td>
            <td class="p-3 font-bold text-green-600">${s.timeIn || '-'}</td>
            <td class="p-3 font-bold text-red-600">${s.checkOutTime || '-'}</td>
            <td class="p-3 text-center">
                ${s.signatureUrl || s.checkInSignature ? `<img src="${window.getDirectDriveImageUrl(s.signatureUrl || s.checkInSignature)}" class="h-8 w-12 object-contain border rounded bg-white shadow-sm cursor-pointer hover:scale-150 transition" onclick="window.openImageZoom('${s.signatureUrl || s.checkInSignature}')">` : '<i class="fa-solid fa-signature opacity-10"></i>'}
            </td>
        `;
        body.appendChild(tr);
    });
};

// --- INITIALIZATION GATE ---
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    if (path.includes('admin.html')) {
        const isAdmin = localStorage.getItem('isAdminLoggedIn') === 'true';
        if (isAdmin) window.loadAdminDashboard();
    }
});
