import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, get, update, child, onValue, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBQJbAcwEZLQYLooRydSSgNRvzrXG5Vl24",
    authDomain: "schoollog-f0a04.firebaseapp.com",
    projectId: "schoollog-f0a04",
    storageBucket: "schoollog-f0a04.firebasestorage.app",
    messagingSenderId: "961486864461",
    appId: "1:961486864461:web:62b8742704c55d287f5c04",
    measurementId: "G-G7QEGJTBPE",
    databaseURL: "https://schoollog-f0a04-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const SHEETS_URL = "https://script.google.com/macros/s/AKfycbyr-n_jC830cUR47oPrwZgV89NzKqknvNTobSq0PLA7Bp3BlvrZNKWI1SnusSWwbgwt/exec";

// --- GLOBAL UTILITIES ---
window.getDirectDriveImageUrl = (driveUrl) => {
    if (!driveUrl) return 'https://placehold.co/400x300?text=No+Photo';
    try {
        const idMatch = driveUrl.match(/[-\w]{25,}/);
        if (idMatch && idMatch[0]) return 'https://lh3.googleusercontent.com/d/' + idMatch[0];
    } catch (e) {}
    return driveUrl;
};

window.uploadToDrive = async (payload) => {
    try {
        // --- MULTI-ACCOUNT DUAL-DRIVE ROUTING LOGIC ---
        const type = payload.type || 'task_photo';

        // Configuration for the appearnhub@gmail.com account endpoints
        if (type === 'active_asset' || type === 'disposed_asset') {
            payload.folderType = type;
        }

        payload.type = type;

        const response = await fetch(SHEETS_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            mode: 'cors'
        });
        const result = await response.json();

        console.log("UPLOAD_DEBUG", "Raw JSON Response: " + JSON.stringify(result));

        if (result.status === 'success' || result.fileUrl || result.signatureUrl) {
            return result;
        } else {
            return { status: 'error', message: result.message || "Upload failed" };
        }
    } catch (e) {
        return { status: 'error', message: e.message };
    }
};

window.compressImageFile = async (file, maxWidth = 1200, maxHeight = 1200, quality = 0.7) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > h) { if (w > maxWidth) { h *= maxWidth / w; w = maxWidth; } }
                else { if (h > maxHeight) { w *= maxHeight / h; h = maxHeight; } }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL("image/jpeg", quality));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
};

window.openImageZoom = (url) => { if(!url || url.includes('placeholder')) return; window.open(url, '_blank'); };

// --- GLOBAL NAVIGATION ---
window.showView = (viewId) => {
    try {
        const pageMap = {
            'view-landing': 'index.html',
            'view-visitor': 'visitor.html',
            'view-staff': 'staff-login.html',
            'view-admin-auth': 'admin.html',
            'view-admin-dash': 'admin.html'
        };

        if (pageMap[viewId] && !window.location.pathname.includes(pageMap[viewId])) {
            window.location.href = pageMap[viewId];
            return;
        }

        document.querySelectorAll('.view-section').forEach(s => {
            s.classList.remove('active');
            s.classList.add('hidden');
            s.style.display = 'none';
        });

        const target = document.getElementById(viewId);
        if (target) {
            target.classList.remove('hidden');
            target.classList.add('active');
            target.style.display = 'flex';
        }
        window.scrollTo(0, 0);
        window.dispatchEvent(new CustomEvent('viewChanged', { detail: { viewId } }));
    } catch (e) { console.error("Nav Error:", e); }
};

// --- AUTHENTICATION FLOW ---
window.logoutStaff = () => {
    try {
        localStorage.removeItem('loggedStaff');
        localStorage.removeItem('staff_active_session');
        localStorage.removeItem('isAdminLoggedIn');
        window.location.href = 'index.html';
    } catch (e) { console.error("Logout Error:", e); }
};

window.handleUserLogout = () => {
    window.logoutStaff();
};

window.checkStaffAuth = () => {
    try {
        const saved = localStorage.getItem('loggedStaff');
        if (saved && document.getElementById('staff-dash-area')) {
            renderDashboard(JSON.parse(saved));
        } else if (document.getElementById('staff-auth-area')) {
            document.getElementById('staff-auth-area').classList.remove('hidden');
            document.getElementById('staff-dash-area').classList.add('hidden');
        }
    } catch (e) { console.error("Auth Check Error:", e); }
};

window.toggleStaffTab = (tab) => {
    try {
        const logTab = document.getElementById('s-tab-login');
        const regTab = document.getElementById('s-tab-reg');
        const logForm = document.getElementById('staff-login-form');
        const regForm = document.getElementById('staff-reg-form');

        if (!logTab || !regTab || !logForm || !regForm) return;

        if (tab === 'login') {
            logTab.classList.add('text-indigo-600', 'border-indigo-600');
            logTab.classList.remove('text-gray-400', 'border-transparent');
            regTab.classList.add('text-gray-400', 'border-transparent');
            regTab.classList.remove('text-indigo-600', 'border-indigo-600');
            logForm.classList.remove('hidden');
            regForm.classList.add('hidden');
        } else {
            regTab.classList.add('text-indigo-600', 'border-indigo-600');
            regTab.classList.remove('text-gray-400', 'border-transparent');
            logTab.classList.add('text-gray-400', 'border-transparent');
            logTab.classList.remove('text-indigo-600', 'border-indigo-600');
            regForm.classList.remove('hidden');
            logForm.classList.add('hidden');
        }
    } catch (e) { console.error("Toggle Tab Error:", e); }
};

// --- DASHBOARD RENDERING ---
async function renderDashboard(staff) {
    try {
        if (!staff) return;
        window.currentStaff = staff;

        const authArea = document.getElementById('staff-auth-area');
        const dashArea = document.getElementById('staff-dash-area');
        const logoutBtn = document.getElementById('staff-logout-btn');

        if (authArea) authArea.classList.add('hidden');
        if (dashArea) dashArea.classList.remove('hidden');
        if (logoutBtn) logoutBtn.classList.remove('hidden');

        const initials = (staff.name || "JY").split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        const avatar = document.getElementById('userAvatar');
        const roleDisplay = document.getElementById('s-dash-role-display');
        if (avatar) avatar.innerText = initials;
        if (roleDisplay) roleDisplay.innerText = staff.role || "Staff";

        const cinBtn = document.getElementById('s-checkin-btn');
        const coutBtn = document.getElementById('s-checkout-btn');

        // --- REAL-TIME SESSION SYNC ---
        onValue(ref(db, 'active_staff_sessions/' + staff.mobile), (snapshot) => {
            const sessionObj = snapshot.val();

            if (sessionObj && sessionObj.status === 'checked_in') {
                if (cinBtn) cinBtn.classList.add('hidden');
                if (coutBtn) {
                    coutBtn.classList.remove('hidden');
                    coutBtn.innerText = "Check Out";
                    coutBtn.disabled = false;
                    coutBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                    coutBtn.onclick = () => {
                        window.openPasswordModal("Verify Check-Out", async () => {
                            try {
                                const mobile = staff.mobile;
                                const now = new Date();

                                await set(ref(db, 'active_staff_sessions/' + mobile), null);
                                localStorage.removeItem('staff_active_session');

                                await push(ref(db, 'staff_attendance_logs'), {
                                    mobile: mobile,
                                    name: staff.name,
                                    action: 'checkout',
                                    timestamp: now.toISOString(),
                                    date: now.toLocaleDateString(),
                                    timeOut: now.toLocaleTimeString()
                                });

                                alert("Checked out successfully!");
                            } catch (e) { alert("Checkout error: " + e.message); }
                        });
                    };
                }
                localStorage.setItem('staff_active_session', JSON.stringify(sessionObj));
            } else {
                if (cinBtn) {
                    cinBtn.classList.remove('hidden');
                    cinBtn.onclick = () => {
                        window.openPasswordModal("Verify Check-In", () => {
                            window.openSignatureModal("Staff Check-In Signature", async (sigData) => {
                                try {
                                    const now = new Date();
                                    const res = await window.uploadToDrive({
                                        type: 'signature',
                                        staffName: staff.name,
                                        fileName: `CheckIn_${staff.mobile}_${Date.now()}.png`,
                                        image: sigData
                                    });

                                    const session = {
                                        mobile: staff.mobile,
                                        name: staff.name,
                                        status: 'checked_in',
                                        checkInTimestamp: now.toISOString(),
                                        signatureUrl: res.fileUrl || res.signatureUrl
                                    };

                                    await set(ref(db, 'staff_attendance/' + staff.mobile + '_' + now.getTime()), {
                                        ...session,
                                        date: now.toLocaleDateString(),
                                        timeIn: now.toLocaleTimeString()
                                    });

                                    await set(ref(db, 'active_staff_sessions/' + staff.mobile), session);
                                    localStorage.setItem('staff_active_session', JSON.stringify(session));
                                    alert("Check-In Successful!");
                                } catch (e) { alert("Check-In Error: " + e.message); }
                            });
                        });
                    };
                }
                if (coutBtn) coutBtn.classList.add('hidden');
                localStorage.removeItem('staff_active_session');
            }
        });

        // Add page focus check for immediate refresh
        window.onfocus = () => {
            get(ref(db, 'active_staff_sessions/' + staff.mobile)).then((snapshot) => {
                if (snapshot.exists()) {
                    localStorage.setItem('staff_active_session', JSON.stringify(snapshot.val()));
                }
            });
        };

        const roleNormalized = (staff.role || "").toLowerCase().trim().replace(/ /g, '').replace(/_/g, '');
        const assetAuditAccess = document.getElementById('asset-audit-access');
        const securityArea = document.getElementById('security-task-area');

        // --- ROLE-BASED UI RESTRICTIONS (PERMANENT DOM REMOVAL) ---
        if (roleNormalized !== 'security') {
            if (securityArea) {
                console.log("Removing Security Area for non-security role:", roleNormalized);
                securityArea.remove();
            }
        } else if (securityArea) {
            securityArea.classList.remove('hidden');
            securityArea.style.display = 'block';
        }

        const authorizedRoles = ['cleanerleader', 'rttechnician', 'security', 'admin'];
        if (assetAuditAccess) {
            const isAuth = authorizedRoles.includes(roleNormalized);
            assetAuditAccess.classList.toggle('hidden', !isAuth);
            if (isAuth) {
                assetAuditAccess.setAttribute('style', 'display: block !important; visibility: visible !important; opacity: 1 !important;');
            }
        }

        loadRoleView(staff);
    } catch (e) { console.error("Dashboard Render Error:", e); }
}

// --- DASHBOARD DATA LOADING ---
async function loadRoleView(staff) {
    try {
        const container = document.getElementById('tasksContainer');
        if (!container) return;
        container.innerHTML = `<div class="bg-white/10 p-4 rounded-xl text-center text-xs text-gray-500 text-gray-800">Loading tasks...</div>`;

        const taskSnap = await get(ref(db, 'tasks'));
        let taskHtml = '';
        let total = 0, pending = 0, completed = 0;

        if(taskSnap.exists()) {
            const allTasks = Object.values(taskSnap.val());
            total = allTasks.length;
            pending = allTasks.filter(t => t.status === 'Open').length;
            completed = allTasks.filter(t => t.status === 'Closed').length;

            const filteredTasks = allTasks.filter(t => t.targetRole === staff.role && t.status === 'Open');

            if(filteredTasks.length > 0) {
                filteredTasks.forEach(t => {
                    const bImg = window.getDirectDriveImageUrl(t.beforePhotoUrl || t.beforePhoto);
                    const aImg = window.getDirectDriveImageUrl(t.afterPhotoUrl || t.afterPhoto);
                    taskHtml += `
                        <div class="task-card text-gray-800">
                            <div class="task-header">
                                <div>
                                    <h4 style="font-weight:700; font-size:1rem; color:var(--primary-dark);">${t.location}</h4>
                                    <p style="font-size:0.75rem; color:var(--text-gray);">${t.timestamp}</p>
                                </div>
                                <span class="badge ${t.status === 'Open' ? 'badge-pending' : 'badge-completed'}">${t.status}</span>
                            </div>
                            <p style="font-size:0.85rem; color:var(--primary-dark); margin:12px 0; font-weight:500;">${t.details}</p>
                            <div class="image-preview-container">
                                <div class="img-box" onclick="window.openZoomModal('${bImg}')">
                                    <img src="${bImg}">
                                    <span class="img-label">Before</span>
                                </div>
                                ${(t.afterPhotoUrl || t.afterPhoto) ? `
                                <div class="img-box" onclick="window.openZoomModal('${aImg}')">
                                    <img src="${aImg}">
                                    <span class="img-label">After</span>
                                </div>` : ''}
                            </div>
                            <div style="display:flex; gap:10px; margin-top:10px;">
                                <button class="btn btn-teal" style="flex:1; font-size:0.8rem;" onclick="window.closeTaskAction('${t.id}')">Resolve</button>
                                <button class="btn btn-outline" style="flex:1; font-size:0.8rem;" onclick="window.openRejectModal('${t.id}')">Reject</button>
                            </div>
                        </div>`;
                });
            } else {
                taskHtml = '<div class="col-span-full bg-white p-10 rounded-xl text-center text-gray-400 border border-dashed text-gray-800">No pending tasks for your position.</div>';
            }
        } else {
            taskHtml = '<div class="col-span-full bg-white p-10 rounded-xl text-center text-gray-400 border border-dashed text-gray-800">No tasks found.</div>';
        }

        const statTotal = document.getElementById('statTotal');
        const statPending = document.getElementById('statPending');
        const statCompleted = document.getElementById('statCompleted');
        if (statTotal) statTotal.innerText = total;
        if (statPending) statPending.innerText = pending;
        if (statCompleted) statCompleted.innerText = completed;
        container.innerHTML = taskHtml;
    } catch (e) { console.error("Role View Error:", e); }
}

// --- CORE ADMIN DASHBOARD LOGIC ---
window.showAdminTab = (tabId) => {
    try {
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

        document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active-tab'));
        const activeBtn = document.querySelector(`[onclick*="${tabId}"]`);
        if (activeBtn) activeBtn.classList.add('active-tab');
    } catch (e) { console.error("Tab switch error:", e); }
};

async function loadAdminDashboard() {
    try {
        if (!document.getElementById('admin-table-body')) return;
        const [v, s, staff, tasks, assets] = await Promise.all([
            get(ref(db, 'visitors')),
            get(ref(db, 'staff_attendance')),
            get(ref(db, 'staff')),
            get(ref(db, 'tasks')),
            get(ref(db, 'assets'))
        ]);

        let records = [];
        if(v.exists()) Object.values(v.val()).forEach(x => records.push({...x, type: 'visitor'}));
        if(s.exists()) Object.values(s.val()).forEach(x => records.push({...x, type: 'staff', id: x.mobile}));
        records.sort((a,b) => new Date(b.date + ' ' + (b.timeIn || '00:00 AM')) - new Date(a.date + ' ' + (a.timeIn || '00:00 AM')));
        window.adminData = records;
        renderAdminTable(records);

        const staffList = document.getElementById('admin-staff-list-body');
        if (staffList) {
            staffList.innerHTML = '';
            if(staff.exists()) Object.values(staff.val()).forEach(x => {
                staffList.innerHTML += `<tr class="border-b border-white/5 text-gray-800"><td class="p-3 font-bold">${x.name}</td><td class="p-3">${x.branch}</td><td class="p-3">${x.role}</td><td class="p-3">${x.company}</td><td class="p-3">${x.mobile}</td><td class="p-3 text-center"><button onclick="window.deleteStaffAccount('${x.mobile}', '${x.name}')" class="text-red-500 font-bold text-xs uppercase">Delete</button></td></tr>`;
            });
        }

        const taskBody = document.getElementById('admin-task-list-body');
        if (taskBody) {
            taskBody.innerHTML = '';
            if(tasks.exists()) {
                window.adminTasks = Object.values(tasks.val()).reverse();
                window.adminTasks.forEach(t => {
                    const b = window.getDirectDriveImageUrl(t.beforePhotoUrl || t.beforePhoto);
                    const a = window.getDirectDriveImageUrl(t.afterPhotoUrl || t.afterPhoto);
                    const rDT = t.raisedTimestamp ? new Date(t.raisedTimestamp) : null;
                    const cDT = t.solvedTimestamp ? new Date(t.solvedTimestamp) : null;
                    taskBody.innerHTML += `
                        <tr class="hover:bg-white/5 transition text-gray-800">
                            <td class="p-2 font-mono opacity-50">${t.id}</td>
                            <td class="p-2">${t.schoolBuilding || '-'}</td>
                            <td class="p-2 font-bold">${t.location}</td>
                            <td class="p-2 opacity-70">${t.targetRole}</td>
                            <td class="p-2">${t.raisedByName || 'Admin'}</td>
                            <td class="p-2">${rDT ? rDT.toLocaleDateString() : '-'}</td>
                            <td class="p-2">${rDT ? rDT.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-'}</td>
                            <td class="p-2">${t.solvedByName || '-'}</td>
                            <td class="p-2">${cDT ? cDT.toLocaleDateString() : '-'}</td>
                            <td class="p-2">${cDT ? cDT.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-'}</td>
                            <td class="p-2 font-bold ${t.status === 'Open' ? 'text-blue-400' : (t.status === 'Closed' ? 'text-green-400' : 'text-red-400')}">${t.status}</td>
                            <td class="p-2 italic opacity-60">${t.rejectionReason || 'N/A'}</td>
                            <td class="p-2">
                                <div class="flex gap-1 justify-center">
                                    <img src="${b}" class="h-6 w-6 rounded border border-white/10" onclick="window.openImageZoom('${b}')" onerror="this.style.display='none'">
                                    ${(t.afterPhotoUrl || t.afterPhoto) ? `<img src="${a}" class="h-6 w-6 rounded border border-white/10" onclick="window.openImageZoom('${a}')" onerror="this.style.display='none'">` : ''}
                                </div>
                            </td>
                        </tr>`;
                });
            }
        }

        if (assets.exists() && window.renderAdminAssetTable) {
            window.allAssets = Object.values(assets.val());
            window.renderAdminAssetTable(window.allAssets);
        }
    } catch (err) { console.error("Admin Load Error:", err); }
}

function renderAdminTable(data) {
    const body = document.getElementById('admin-table-body');
    if (!body) return;
    body.innerHTML = '';
    data.forEach(r => {
        const sig = window.getDirectDriveImageUrl(r.signatureUrl || r.signature);
        body.innerHTML += `<tr class="hover:bg-gray-50 transition border-b border-gray-100 text-gray-800"><td class="p-3 uppercase text-[8px] opacity-40">${r.type}</td><td class="p-3">${r.id || r.mobile}</td><td class="p-3 opacity-60">${r.date}</td><td class="p-3 font-bold">${r.name}</td><td class="p-3 text-green-400">${r.timeIn}</td><td class="p-3 text-red-400">${r.timeOut || '-'}</td><td class="p-3 text-center">${sig ? `<img src="${sig}" class="h-6 mx-auto rounded border border-white/10" onerror="this.style.display='none'">` : '-'}</td></tr>`;
    });
}

// --- EXCEL EXPORT MODULE (ISOLATED) ---
window.downloadExcelReport = () => {
    try {
        if (!window.adminData) return alert("No data to export");
        const staffLogs = window.adminData.filter(r => r.type === 'staff').map(r => ({
            "ID / Mobile": r.mobile || r.id || '-',
            "Staff Name": r.name,
            "Company": r.company || '-',
            "Position": r.role || '-',
            "Date": r.date,
            "In-Time": r.timeIn,
            "Out-Time": r.timeOut || '-',
            "Status": r.status,
            "Signature (In)": window.getDirectDriveImageUrl(r.signatureUrl || r.signature),
            "Signature (Out)": window.getDirectDriveImageUrl(r.signatureOutUrl)
        }));
        const visitorLogs = window.adminData.filter(r => r.type === 'visitor').map(r => ({
            "Visitor ID": r.id || '-',
            "Visitor Name": r.name,
            "Mobile": r.mobile || '-',
            "Company": r.company || '-',
            "Purpose of Visit": r.purpose || '-',
            "Date": r.date,
            "In-Time": r.timeIn,
            "Out-Time": r.timeOut || '-',
            "Status": r.status,
            "Signature": window.getDirectDriveImageUrl(r.signatureUrl || r.signature)
        }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(staffLogs), "Staff Attendance");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(visitorLogs), "Visitor Log");
        XLSX.writeFile(wb, `Attendance_Report_${Date.now()}.xlsx`);
    } catch (e) { console.error("Export Error:", e); }
};

window.exportTaskReportExcel = () => {
    try {
        if (!window.adminTasks) return alert("No task data to export");
        let html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head></head>
            <body>
            <table border="1">
                <tr style="background-color: #10b981; color: white; font-weight: bold; height: 40px;">
                    <th>Task ID</th><th>School / Building</th><th>Area / Location</th><th>Assigned Dept / Role</th><th>Raised By</th><th>Raised Date</th><th>Raised Time</th><th>RT Technician</th><th>Closed Date</th><th>Closed Time</th><th>Status</th><th>Rejection Reason</th><th>Before Photo</th><th>After Photo</th>
                </tr>`;

        window.adminTasks.forEach(t => {
            const bImg = window.getDirectDriveImageUrl(t.beforePhotoUrl || t.beforePhoto);
            const aImg = window.getDirectDriveImageUrl(t.afterPhotoUrl || t.afterPhoto);
            const rDT = t.raisedTimestamp ? new Date(t.raisedTimestamp) : null;
            const cDT = t.solvedTimestamp ? new Date(t.solvedTimestamp) : null;
            html += `
                <tr style="height: 80px; vertical-align: middle;">
                    <td>${t.id}</td><td>${t.schoolBuilding || '-'}</td><td>${t.location}</td><td>${t.targetRole}</td><td>${t.raisedByName || 'Admin'}</td>
                    <td>${rDT ? rDT.toLocaleDateString() : '-'}</td><td>${rDT ? rDT.toLocaleTimeString() : '-'}</td><td>${t.solvedByName || '-'}</td>
                    <td>${cDT ? cDT.toLocaleDateString() : '-'}</td><td>${cDT ? cDT.toLocaleTimeString() : '-'}</td>
                    <td style="font-weight: bold;">${t.status}</td><td>${t.rejectionReason || 'N/A'}</td>
                    <td width="100" align="center">${bImg.includes('http') ? `<img src="${bImg}" width="70" height="70">` : 'No Photo'}</td>
                    <td width="100" align="center">${aImg.includes('http') && !aImg.includes('No+Photo') ? `<img src="${aImg}" width="70" height="70">` : 'No Photo'}</td>
                </tr>`;
        });
        html += '</table></body></html>';
        const url = 'data:application/vnd.ms-excel;charset=utf-8,' + encodeURIComponent(html);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Task_Audit_Report_${Date.now()}.xls`;
        link.click();
    } catch (e) { console.error("Task Export Error:", e); }
};

window.downloadMasterAssetReport = async () => {
    try {
        if (!window.allAssets) return alert("No asset data!");
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Master Asset Register');

        // Define EXACT 40 Columns per requirements
        sheet.columns = [
            { header: '1. Asset Barcode', key: 'f1', width: 20 },
            { header: '2. Serial No.', key: 'f2', width: 20 },
            { header: '3. Model Description', key: 'f3', width: 30 },
            { header: '4. Asset Condition', key: 'f4', width: 15 },
            { header: '5. Price Status', key: 'f5', width: 15 },
            { header: '6. Asset Unit Cost', key: 'f6', width: 15 },
            { header: '7. Asset Description', key: 'f7', width: 30 },
            { header: '8. Date Place in Service', key: 'f8', width: 20 },
            { header: '9. Manufacturer', key: 'f9', width: 20 },
            { header: '10. Major Category', key: 'f10', width: 20 },
            { header: '11. Sub Major Category', key: 'f11', width: 20 },
            { header: '12. Sub Minor Category', key: 'f12', width: 20 },
            { header: '13. DOF Major', key: 'f13', width: 15 },
            { header: '14. DOF Minor', key: 'f14', width: 15 },
            { header: '15. Category', key: 'f15', width: 15 },
            { header: '16. Classification [Asset Name]', key: 'f16', width: 20 },
            { header: '17. Location Name', key: 'f17', width: 20 },
            { header: '18. School ESIS ID', key: 'f18', width: 15 },
            { header: '19. School Building Name', key: 'f19', width: 25 },
            { header: '20. Room Name', key: 'f20', width: 20 },
            { header: '21. Room No', key: 'f21', width: 15 },
            { header: '22. Room Barcode', key: 'f22', width: 20 },
            { header: '23. Floor No', key: 'f23', width: 10 },
            { header: '24. Floor Description', key: 'f24', width: 20 },
            { header: '25. Barcode Status', key: 'f25', width: 15 },
            { header: '26. Asset Status', key: 'f26', width: 15 },
            { header: '27. Old School Name', key: 'f27', width: 25 },
            { header: '28. Transaction No', key: 'f28', width: 20 },
            { header: '29. Asset Useful Life', key: 'f29', width: 15 },
            { header: '30. Asset Vendor Name', key: 'f30', width: 25 },
            { header: '31. Old Asset Barcode', key: 'f31', width: 20 },
            { header: '32. FAR Old Asset Barcode', key: 'f32', width: 30 },
            { header: '33. Invoice No', key: 'f33', width: 20 },
            { header: '34. DN No', key: 'f34', width: 20 },
            { header: '35. Remarks', key: 'f35', width: 30 },
            { header: '36. Physical Asset Register No', key: 'f36', width: 25 },
            { header: '37. Fixed Asset Register No', key: 'f37', width: 25 },
            { header: '38. Mapping Criteria', key: 'f38', width: 20 },
            { header: '39. Audit Photo (After)', key: 'f39', width: 40 },
            { header: '40. Disposal Photo (Before)', key: 'f40', width: 40 }
        ];

        window.allAssets.forEach(a => {
            sheet.addRow({
                f1: a.assetBarcode, f2: a.serialNo, f3: a.modelDescription, f4: a.assetCondition, f5: a.priceStatus,
                f6: a.unitCost, f7: a.assetDescription, f8: a.serviceDate, f9: a.manufacturer, f10: a.majorCategory,
                f11: a.subMajorCategory, f12: a.subMinorCategory, f13: a.dofMajor, f14: a.dofMinor, f15: a.category,
                f16: a.classification, f17: a.locationName, f18: a.esisId, f19: a.buildingName, f20: a.roomName,
                f21: a.roomNo, f22: a.currentRoomBarcode, f23: a.floorNo, f24: a.floorDescription, f25: a.barcodeStatus,
                f26: a.assetStatus, f27: a.oldSchoolName, f28: a.transactionNo, f29: a.usefulLife, f30: a.vendorName,
                f31: a.oldBarcode, f32: a.farBarcode, f33: a.invoiceNo, f34: a.dnNo, f35: a.remarks,
                f36: a.physRegNo, f37: a.fixedAssetRegNo, f38: a.mappingCriteria,
                f39: a.initialAuditPhoto || "",
                f40: a.disposalDamagedPhoto || ""
            });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Master_Asset_Register_${Date.now()}.xlsx`);
    } catch (e) { console.error("Asset Export Error:", e); }
};

window.downloadDisposedAssetReport = async () => {
    try {
        const disposed = window.allAssets.filter(a => a.assetStatus === 'Disposed');
        if (!disposed.length) return alert("No disposed assets to export!");

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Asset Disposal List');

        sheet.columns = [
            { header: '1. Asset Barcode', key: 'f1', width: 20 },
            { header: '2. Serial No.', key: 'f2', width: 20 },
            { header: '3. Model Description', key: 'f3', width: 30 },
            { header: '4. Asset Condition', key: 'f4', width: 15 },
            { header: '5. Price Status', key: 'f5', width: 15 },
            { header: '6. Asset Unit Cost', key: 'f6', width: 15 },
            { header: '7. Asset Description', key: 'f7', width: 30 },
            { header: '8. Date Place in Service', key: 'f8', width: 20 },
            { header: '9. Manufacturer', key: 'f9', width: 20 },
            { header: '10. Major Category', key: 'f10', width: 20 },
            { header: '11. Sub Major Category', key: 'f11', width: 20 },
            { header: '12. Sub Minor Category', key: 'f12', width: 20 },
            { header: '13. DOF Major', key: 'f13', width: 15 },
            { header: '14. DOF Minor', key: 'f14', width: 15 },
            { header: '15. Category', key: 'f15', width: 15 },
            { header: '16. Classification [Asset Name]', key: 'f16', width: 20 },
            { header: '17. Location Name', key: 'f17', width: 20 },
            { header: '18. School ESIS ID', key: 'f18', width: 15 },
            { header: '19. School Building Name', key: 'f19', width: 25 },
            { header: '20. Room Name', key: 'f20', width: 20 },
            { header: '21. Room No', key: 'f21', width: 15 },
            { header: '22. Room Barcode', key: 'f22', width: 20 },
            { header: '23. Floor No', key: 'f23', width: 10 },
            { header: '24. Floor Description', key: 'f24', width: 20 },
            { header: '25. Barcode Status', key: 'f25', width: 15 },
            { header: '26. Asset Status', key: 'f26', width: 15 },
            { header: 'Disposal Reason', key: 'reason', width: 30 },
            { header: 'Scrap Location', key: 'loc', width: 25 },
            { header: 'Disposed By', key: 'by', width: 20 },
            { header: 'Disposal Date', key: 'date', width: 15 },
            { header: 'Audit Photo (After)', key: 'photo_before', width: 40 },
            { header: 'Disposal Photo (Before)', key: 'photo_after', width: 40 }
        ];

        disposed.forEach(a => {
            sheet.addRow({
                f1: a.assetBarcode, f2: a.serialNo, f3: a.modelDescription, f4: a.assetCondition, f5: a.priceStatus,
                f6: a.unitCost, f7: a.assetDescription, f8: a.serviceDate, f9: a.manufacturer, f10: a.majorCategory,
                f11: a.subMajorCategory, f12: a.subMinorCategory, f13: a.dofMajor, f14: a.dofMinor, f15: a.category,
                f16: a.classification, f17: a.locationName, f18: a.esisId, f19: a.buildingName, f20: a.roomName,
                f21: a.roomNo, f22: a.currentRoomBarcode, f23: a.floorNo, f24: a.floorDescription, f25: a.barcodeStatus,
                f26: a.assetStatus,
                reason: a.disposalReason || "-",
                loc: a.scrapLocation || "-",
                by: a.disposedBy || "-",
                date: a.disposalDate || "-",
                photo_before: a.initialAuditPhoto || "",
                photo_after: a.disposalDamagedPhoto || ""
            });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Disposed_Assets_Report_${Date.now()}.xlsx`);
    } catch (e) { console.error("Disposal Export Error:", e); }
};

// --- VISITOR SYSTEM ---
let vCanvas, vCtx;
window.initVisitorCanvas = () => {
    vCanvas = document.getElementById('v-sig-pad');
    if (!vCanvas) return;
    vCtx = vCanvas.getContext('2d');
    const getPos = (e) => { const rect = vCanvas.getBoundingClientRect(); return { x: (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left, y: (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top }; };
    const start = (e) => { vCtx.beginPath(); const p = getPos(e); vCtx.moveTo(p.x, p.y); };
    const move = (e) => { e.preventDefault(); const p = getPos(e); vCtx.lineTo(p.x, p.y); vCtx.stroke(); };
    vCanvas.addEventListener('mousedown', start); vCanvas.addEventListener('mousemove', (e) => { if(e.buttons==1) move(e); });
    vCanvas.addEventListener('touchstart', start, {passive: false}); vCanvas.addEventListener('touchmove', move, {passive: false});
    vCanvas.width = vCanvas.parentElement.offsetWidth;
    vCanvas.height = vCanvas.parentElement.offsetHeight;
    vCtx.lineWidth = 2; vCtx.strokeStyle = '#4f46e5';
};

window.clearVisitorSig = () => {
    if (vCtx) vCtx.clearRect(0, 0, vCanvas.width, vCanvas.height);
};

window.checkVisitorSession = () => {
    const active = localStorage.getItem('vActive');
    const signInArea = document.getElementById('v-signin-area');
    const signOutArea = document.getElementById('v-signout-area');
    if(active) {
        const data = JSON.parse(active);
        if (signInArea) signInArea.classList.add('hidden');
        if (signOutArea) {
            signOutArea.classList.remove('hidden');
            const activeName = document.getElementById('v-active-name');
            const activeId = document.getElementById('v-active-id');
            const activeTimeIn = document.getElementById('v-active-timein');
            if (activeName) activeName.innerText = data.name;
            if (activeId) activeId.innerText = data.id;
            if (activeTimeIn) activeTimeIn.innerText = data.timeIn;
        }
    } else {
        if (signInArea) signInArea.classList.remove('hidden');
        if (signOutArea) signOutArea.classList.add('hidden');
        initVisitorForm();
    }
};

function initVisitorForm() {
    const vId = document.getElementById('v-id');
    const vDate = document.getElementById('v-date');
    if (!vId || !vDate) return;
    const now = new Date();
    vId.value = "VIS-" + Math.random().toString(36).substring(2, 7).toUpperCase();
    vDate.value = now.toLocaleDateString('en-US') + " " + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true});
    setTimeout(window.initVisitorCanvas, 50);
}

// --- SIGNATURE PAD ---
let sigCanvas, sigCtx, sigDrawing = false, sigCallback = null;
window.initSigPad = () => {
    sigCanvas = document.getElementById('sig-canvas');
    if (!sigCanvas) return;
    sigCtx = sigCanvas.getContext('2d');
    const getPos = (e) => { const rect = sigCanvas.getBoundingClientRect(); return { x: (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left, y: (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top }; };
    const start = (e) => { sigDrawing = true; sigCtx.beginPath(); const p = getPos(e); sigCtx.moveTo(p.x, p.y); };
    const move = (e) => { if (!sigDrawing) return; e.preventDefault(); const p = getPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); };
    const stop = () => sigDrawing = false;
    sigCanvas.addEventListener('mousedown', start); sigCanvas.addEventListener('mousemove', move); window.addEventListener('mouseup', stop);
    sigCanvas.addEventListener('touchstart', start, {passive: false}); sigCanvas.addEventListener('touchmove', move, {passive: false}); sigCanvas.addEventListener('touchend', stop);
};

window.getCompressedSignature = (canvas) => {
    const offscreen = document.createElement('canvas'); offscreen.width = 300; offscreen.height = 150;
    const ctx = offscreen.getContext('2d'); ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, 300, 150);
    ctx.drawImage(canvas, 0, 0, 300, 150); return offscreen.toDataURL("image/jpeg", 0.3);
};

window.openSignatureModal = (title, callback) => {
    const titleEl = document.getElementById('sig-modal-title');
    const modalEl = document.getElementById('signature-modal');
    if (titleEl) titleEl.innerText = title;
    if (modalEl) modalEl.classList.remove('hidden');
    sigCallback = callback;
    setTimeout(() => {
        if (!sigCanvas) return;
        sigCanvas.width = sigCanvas.parentElement.offsetWidth;
        sigCanvas.height = sigCanvas.parentElement.offsetHeight;
        sigCtx.lineWidth = 3; sigCtx.lineCap = 'round'; sigCtx.strokeStyle = '#4f46e5';
    }, 50);
    if (sigCtx) sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
};

window.closeSignatureModal = () => {
    const modal = document.getElementById('signature-modal');
    if (modal) modal.classList.add('hidden');
};

window.clearSigCanvas = () => {
    if (sigCtx) sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
};

// --- PASSWORD AUTH MODAL ---
let passwordCallback = null;
window.openPasswordModal = (title, callback) => {
    const titleEl = document.getElementById('password-modal-title');
    const modalEl = document.getElementById('password-modal');
    const passInput = document.getElementById('modal-auth-pass');
    const errEl = document.getElementById('password-error');

    if (titleEl) titleEl.innerText = title;
    if (modalEl) modalEl.classList.remove('hidden');
    if (passInput) {
        passInput.value = "";
        passInput.focus();
    }
    if (errEl) errEl.classList.add('hidden');

    passwordCallback = callback;
};

window.closePasswordModal = () => {
    const modalEl = document.getElementById('password-modal');
    if (modalEl) modalEl.classList.add('hidden');
    passwordCallback = null;
};

const passConfirmBtn = document.getElementById('password-confirm-btn');
if (passConfirmBtn) {
    passConfirmBtn.onclick = () => {
        const passInput = document.getElementById('modal-auth-pass');
        const errEl = document.getElementById('password-error');
        if (!passInput) return;

        const entered = passInput.value;
        const actual = window.currentStaff ? window.currentStaff.password : "";

        if (entered === actual && actual !== "") {
            if (passwordCallback) passwordCallback();
            closePasswordModal();
        } else {
            if (errEl) errEl.classList.remove('hidden');
            passInput.value = "";
            passInput.focus();
        }
    };
}

const sigConfirmBtn = document.getElementById('sig-confirm-btn');
if (sigConfirmBtn) {
    sigConfirmBtn.onclick = () => {
        const data = window.getCompressedSignature(sigCanvas);
        if (sigCallback) sigCallback(data); closeSignatureModal();
    };
}

// --- DYNAMIC FIELDS ---
window.loadRegistrationFields = async () => {
    const snap = await get(ref(db, 'appConfig/registrationFields'));
    const container = document.getElementById('dynamic-reg-fields');
    if (!container) return;
    container.innerHTML = '';
    const defaultFields = ["Mobile Number", "ADEK Pass Number", "Company Name"];
    const fields = snap.exists() ? Object.values(snap.val()) : defaultFields;
    fields.forEach(field => { const id = field.toLowerCase().replace(/[^a-z0-9]/g, '-'); container.innerHTML += `<input type="text" id="dyn-reg-${id}" data-field="${field}" placeholder="${field}" required class="w-full p-2 border rounded-lg text-sm dynamic-input">`; });
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Core App Initialization");
    const path = window.location.pathname;

    try {
        const staffLoginForm = document.getElementById('staff-login-form');
        if (staffLoginForm) {
            staffLoginForm.onsubmit = async (e) => {
                e.preventDefault();
                console.log("Login Attempt Started");
                const mobile = document.getElementById('s-log-mobile').value;
                const pass = document.getElementById('s-log-pass').value;
                const submitBtn = e.target.querySelector('button');
                if (submitBtn) submitBtn.disabled = true;
                try {
                    const snap = await get(child(ref(db), 'staff/' + mobile));
                    if (snap.exists() && snap.val().password === pass) {
                        const data = snap.val();
                        const role = (data.role || "").toLowerCase().trim();
                        if (role === 'admin') {
                            localStorage.setItem('isAdminLoggedIn', 'true');
                            window.location.href = 'admin.html';
                            return;
                        }
                        localStorage.setItem('loggedStaff', JSON.stringify(data));
                        renderDashboard(data);
                    } else { alert("Invalid Credentials"); }
                } catch (err) { console.error(err); }
                finally { if (submitBtn) submitBtn.disabled = false; }
            };
        }

        const staffRegForm = document.getElementById('staff-reg-form');
        if (staffRegForm) {
            staffRegForm.onsubmit = async (e) => {
                e.preventDefault();
                console.log("Registration Started");
                const name = document.getElementById('s-reg-name').value;
                const branch = document.getElementById('s-reg-branch').value;
                const role = document.getElementById('s-reg-role').value;
                const company = document.getElementById('s-reg-company').value;
                const pass = document.getElementById('s-reg-pass').value;
                const confirmPass = document.getElementById('s-reg-confirm').value;

                if (pass !== confirmPass) return alert("Passwords do not match!");

                const submitBtn = e.target.querySelector('button');
                submitBtn.disabled = true;

                try {
                    // Gather dynamic fields
                    const dynamicData = {};
                    document.querySelectorAll('.dynamic-input').forEach(input => {
                        dynamicData[input.getAttribute('data-field')] = input.value;
                    });

                    const mobileField = document.querySelector('[data-field="Mobile Number"]');
                    const mobile = mobileField ? mobileField.value : company; // Fallback to company if no mobile field

                    if (!mobile) {
                        submitBtn.disabled = false;
                        return alert("Mobile Number is required for registration.");
                    }

                    const data = {
                        name, branch, role, company, password: pass, mobile,
                        ...dynamicData,
                        createdAt: new Date().toISOString()
                    };

                    await set(ref(db, 'staff/' + mobile), data);
                    alert("Registration successful! Please login.");
                    window.toggleStaffTab('login');
                } catch (err) {
                    console.error(err);
                    alert("Registration failed: " + err.message);
                } finally {
                    submitBtn.disabled = false;
                }
            };
        }

        const adminLoginForm = document.getElementById('admin-login-form');
        if (adminLoginForm) {
            adminLoginForm.onsubmit = (e) => {
                e.preventDefault();
                console.log("Admin Login Started");
                const user = document.getElementById('admin-mobile').value.toLowerCase().trim();
                const pass = document.getElementById('admin-pass').value.trim();
                if (user === 'admin' && pass === '1234') {
                    localStorage.setItem('isAdminLoggedIn', 'true');
                    window.location.href = 'admin.html';
                } else { alert("Denied"); }
            };
        }

        const bindLogout = (id) => {
            const btn = document.getElementById(id);
            if (btn) btn.addEventListener('click', window.logoutStaff);
        };
        bindLogout('staff-logout-btn');
        bindLogout('staff-logout');
        bindLogout('admin-logout-btn');

        const delBtn = document.getElementById('delete-my-account');
        if (delBtn) {
            delBtn.onclick = async () => {
                if (!confirm("Are you sure? This will PERMANENTLY delete your account.")) return;
                try {
                    if (window.currentStaff && window.currentStaff.mobile) {
                        await set(ref(db, 'staff/' + window.currentStaff.mobile), null);
                        window.logoutStaff();
                    }
                } catch (e) { alert("Error deleting account"); }
            };
        }

        const visitorForm = document.getElementById('visitor-form');
        if (visitorForm) {
            visitorForm.onsubmit = async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button[type="submit"]');
                btn.disabled = true; btn.innerText = "Processing...";
                try {
                    const res = await window.uploadToDrive({
                        type: 'signature',
                        department: 'Visitor',
                        staffName: document.getElementById('v-name').value,
                        fileName: `Visitor_Sig_${Date.now()}.png`,
                        image: window.getCompressedSignature(document.getElementById('v-sig-pad'))
                    });

                    if (res.status !== 'success' && !res.signatureUrl) throw new Error(res.message || "Upload failed");
                    const sig = res.signatureUrl || res.fileUrl;

                    const now = new Date();
                    const data = { id: document.getElementById('v-id').value, name: document.getElementById('v-name').value, mobile: document.getElementById('v-mobile').value, company: document.getElementById('v-company').value, purpose: document.getElementById('v-purpose').value, date: now.toLocaleDateString('en-US'), timeIn: now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true}), status: "active", signatureUrl: sig };
                    await set(ref(db, 'visitors/' + data.id), data);
                    localStorage.setItem('vActive', JSON.stringify({id: data.id, name: data.name, timeIn: data.timeIn}));
                    alert("Signed In!"); window.checkVisitorSession();
                } catch (error) { alert("Error: " + error.message); }
                finally { btn.disabled = false; btn.innerText = "Confirm Sign-In"; }
            };
        }

        if (path.includes('admin.html') && localStorage.getItem('isAdminLoggedIn') === 'true') {
            window.isAdminLoggedIn = true;
            document.getElementById('view-admin-auth')?.classList.add('hidden');
            document.getElementById('view-admin-dash')?.classList.remove('hidden');
            loadAdminDashboard();
        }

        if (path.includes('staff-login.html')) {
            window.checkStaffAuth();
            window.loadRegistrationFields();
        }

        if (path.includes('visitor.html')) window.checkVisitorSession();

        window.initSigPad();
        window.initVisitorCanvas();
    } catch (e) { console.error("Init Error:", e); }
});

window.deleteStaffAccount = async (mobile, name) => { if(confirm(`Delete account for ${name}?`)) { try { await set(ref(db, 'staff/' + mobile), null); alert("Deleted."); loadAdminDashboard(); } catch (e) { alert(e.message); } } };

// --- TASK MODAL LOGIC ---
window.openTaskModal = () => {
    try {
        const targetSelect = document.getElementById('task-target');
        if (!targetSelect) return;
        targetSelect.innerHTML = '<option value="">Target Role</option>';
        const roles = window.isAdminLoggedIn ? ['Security', 'RT Technician', 'Cleaner'] : ['Cleaner Leader', 'RT Technician'];
        roles.forEach(r => targetSelect.innerHTML += `<option value="${r}">${r}</option>`);
        const modal = document.getElementById('task-modal');
        if (modal) modal.classList.remove('hidden');
    } catch (e) { console.error("Open task modal error:", e); }
};

window.closeTaskModal = () => {
    const modal = document.getElementById('task-modal');
    if (modal) modal.classList.add('hidden');
};

window.closeTaskAction = async (taskId) => {
    const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*';
    fileInput.onchange = async (e) => {
        if(!e.target.files[0]) return;
        alert("Processing After Photo...");
        const comp = await window.compressImageFile(e.target.files[0]);
        const res = await window.uploadToDrive({
            type: 'task_photo',
            fileName: `After_${taskId}.png`,
            image: comp
        });

        if (res.status !== 'success' && !res.fileUrl) return alert("Upload failed: " + (res.message || "Unknown error"));
        const url = res.fileUrl;

        await update(ref(db, 'tasks/' + taskId), { status: 'Closed', afterPhotoUrl: url, solvedByName: window.currentStaff.name, solvedByRole: window.currentStaff.role, solvedTimestamp: new Date().toISOString() });
        alert("Task Closed!"); loadRoleView(window.currentStaff);
    };
    if (confirm("Take CAMERA PHOTO (OK) or Gallery (Cancel)?")) fileInput.setAttribute('capture', 'environment');
    fileInput.click();
};

window.openRejectModal = (id) => {
    window.activeRejectId = id;
    const modal = document.getElementById('reject-modal');
    if (modal) modal.classList.remove('hidden');
};

window.closeRejectModal = () => {
    const modal = document.getElementById('reject-modal');
    if (modal) modal.classList.add('hidden');
};

window.submitRejection = async () => {
    const reasonEl = document.getElementById('reject-reason');
    const reason = reasonEl ? reasonEl.value : "";
    if(!reason) return alert("Reason required.");
    await update(ref(db, 'tasks/' + window.activeRejectId), { status: 'Rejected', rejectionReason: reason, rejectedByName: window.currentStaff.name, rejectedByRole: window.currentStaff.role, rejectedTimestamp: new Date().toISOString() });
    alert("Rejected."); window.closeRejectModal(); loadRoleView(window.currentStaff);
};
