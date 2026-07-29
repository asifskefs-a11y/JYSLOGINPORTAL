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
    isInitialized: false
};

// --- CORE ADMIN DASHBOARD LOGIC ---
window.showAdminTab = (tabId) => {
    try {
        console.log("Instant Tab Switch:", tabId);
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

        // INSTANT RENDER FROM APP CACHE
        window.renderTabFromAppCache(tabId);
    } catch (e) { console.error("Tab switch error:", e); }
};

window.renderTabFromAppCache = (tabId) => {
    switch(tabId) {
        case 'tab-visitor-logs':
        case 'tab-staff-logs':
            window.renderAdminTable(window.appCache.allRecordsCombined || [], window.appCache.users, window.appCache.staff);
            break;
        case 'tab-tasks':
            window.renderTaskTable(window.appCache.tasks);
            break;
        case 'tab-my-tasks':
            // Already initialized in loadAdminDashboard
            break;
        case 'tab-staff-list':
            window.renderStaffDirectory(window.appCache.staff);
            break;
        case 'tab-assets':
        case 'tab-disposal':
            if (window.renderAdminAssetTable) window.renderAdminAssetTable(window.appCache.assets);
            break;
        case 'tab-transfers':
            if (window.renderTransferTable) window.renderTransferTable(window.appCache.transfers);
            break;
    }
};

window.loadAdminDashboard = async () => {
    try {
        if (window.appCache.isInitialized) return;
        if (!document.getElementById('visitor-logs-body')) return;

        console.log("Initiating Parallel Background Pre-fetching...");

        // SILENT BACKGROUND LISTENERS
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
            window.renderStaffDirectory(window.appCache.staff);
        });

        onValue(ref(db, 'tasks'), (snap) => {
            window.appCache.tasks = snap.exists() ? Object.values(snap.val()).reverse() : [];
            window.syncAppCacheRecords(); // Ensure KPIs update when tasks change
            window.renderTaskTable(window.appCache.tasks);
        });

        onValue(ref(db, 'assets'), (snap) => {
            window.appCache.assets = snap.exists() ? Object.values(snap.val()) : [];
            window.syncAppCacheRecords(); // For asset-related KPIs if any
            if (window.renderAdminAssetTable) window.renderAdminAssetTable(window.appCache.assets);
        });

        onValue(ref(db, 'asset_transfers'), (snap) => {
            window.appCache.transfers = snap.exists() ? Object.values(snap.val()) : [];
            window.syncAppCacheRecords();
            if (window.renderTransferTable) window.renderTransferTable(window.appCache.transfers);
        });

        if (window.initRaisedTasksTracker) window.initRaisedTasksTracker('admin-my-tasks-container');

        // --- RESTORE ADD NEW STAFF MODAL TOGGLE ---
        const addNewStaffBtn = document.querySelector('button[onclick="openAddStaffModal()"]');
        if (addNewStaffBtn) {
            addNewStaffBtn.onclick = (e) => {
                e.preventDefault();
                console.log("Opening Add Staff Modal...");
                const modal = document.getElementById('add-staff-modal');
                if (modal) {
                    modal.classList.remove('hidden');
                    modal.style.display = 'flex'; // Ensure centered alignment
                }
            };
        }

        // --- RESTORE STAFF FORM SUBMISSION & IMAGE UPLOAD ---
        const staffForm = document.getElementById('add-staff-form');
        if (staffForm) {
            staffForm.onsubmit = async (e) => {
                e.preventDefault();
                console.log("Staff Form Submitted...");

                const submitBtn = document.getElementById('add-staff-submit-btn');
                const originalBtnText = submitBtn.innerText;

                try {
                    submitBtn.disabled = true;
                    submitBtn.innerText = "UPLOADING PHOTO...";

                    const name = document.getElementById('add-staff-name').value;
                    const mobile = document.getElementById('add-staff-mobile').value;
                    const adek = document.getElementById('add-staff-adek').value;
                    const companyName = document.getElementById('add-staff-company-name').value;
                    const branch = document.getElementById('add-staff-branch').value;
                    const role = document.getElementById('add-staff-role').value;
                    const companyId = document.getElementById('add-staff-company-id').value;
                    const pass = document.getElementById('add-staff-pass').value;

                    let profilePicUrl = "";

                    // Check for global base64 variable populated by handleAdminStaffPhotoSelect
                    if (window.addStaffPhotoBase64) {
                        const cleanName = name.replace(/\s+/g, '_');
                        const uploadRes = await window.uploadToDrive({
                            type: 'active_asset',
                            folderType: 'Staff_Profile_Photos',
                            fileName: `Profile_${adek}_${cleanName}.jpg`,
                            image: window.addStaffPhotoBase64
                        });

                        if (uploadRes.status === 'success') {
                            const rawUrl = uploadRes.fileUrl || uploadRes.signatureUrl;
                            profilePicUrl = window.formatDriveImageUrl ? window.formatDriveImageUrl(rawUrl) : rawUrl;
                        }
                    }

                    const data = {
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

                    submitBtn.innerText = "SAVING TO DATABASE...";

                    // Atomic write to both nodes
                    const staffUpdates = {};
                    staffUpdates[`staff/${mobile}`] = data;
                    staffUpdates[`users/${mobile}`] = data;

                    await update(ref(db), staffUpdates);

                    alert("New staff member registered successfully!");

                    // Reset and Close
                    staffForm.reset();
                    if (window.closeAddStaffModal) window.closeAddStaffModal();

                } catch (err) {
                    console.error("Staff Registration Error:", err);
                    alert("Registration Failed: " + err.message);
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.innerText = originalBtnText;
                }
            };
        }

        window.appCache.isInitialized = true;
        if (window.initNotificationBell) window.initNotificationBell();
        if (window.checkAndSubscribePush) window.checkAndSubscribePush();

    } catch (err) { console.error("Admin Pre-fetch Error:", err); }
};

window.syncAppCacheRecords = () => {
    try {
        let all = [];
        window.appCache.visitors.forEach(x => all.push({...x, type: 'visitor'}));
        window.appCache.staff_attendance.forEach(x => all.push({...x, type: 'staff'}));

        // Sorting combined logs
        all.sort((a,b) => {
            const dateA = new Date(a.date + ' ' + (a.timeIn || '00:00 AM'));
            const dateB = new Date(b.date + ' ' + (b.timeIn || '00:00 AM'));
            return dateB - dateA;
        });

        window.appCache.allRecordsCombined = all;

        // Render logs if currently visible
        const activeTab = document.querySelector('.admin-tab:not(.hidden)');
        if (activeTab && (activeTab.id === 'tab-visitor-logs' || activeTab.id === 'tab-staff-logs')) {
            window.renderAdminTable(all, window.appCache.users, window.appCache.staff);
        }

        // --- UPDATE LIVE KPI METRICS ---
        const today = new Date().toLocaleDateString('en-US');

        // 1. Visitors Today
        const visitorsToday = window.appCache.visitors.filter(r => r.date === today).length;
        if(document.getElementById('kpi-visitors')) document.getElementById('kpi-visitors').innerText = visitorsToday;

        // 2. Active Tasks (Open or Accepted)
        const activeTasksCount = window.appCache.tasks.filter(t => t.status === 'Open' || t.status === 'Accepted' || t.status === 'In-Progress').length;
        if(document.getElementById('kpi-tasks')) document.getElementById('kpi-tasks').innerText = activeTasksCount;

        // 3. Staff Present (Checked In and not yet checked out today)
        const staffPresentCount = window.appCache.staff_attendance.filter(r => r.date === today && (r.status === 'checked_in' || !r.timeOut)).length;
        if(document.getElementById('kpi-staff')) document.getElementById('kpi-staff').innerText = staffPresentCount;

        // 4. Alerts (High Priority Open Tasks)
        const alertsCount = window.appCache.tasks.filter(t => (t.status === 'Open' || t.status === 'Accepted') && (t.priority === 'High' || t.taskPriority === 'High')).length;
        if(document.getElementById('kpi-alerts')) document.getElementById('kpi-alerts').innerText = alertsCount;

    } catch (e) { console.error("Sync Error:", e); }
};

window.renderTaskTable = (taskList) => {
    const taskBody = document.getElementById('admin-task-list-body');
    if (!taskBody) return;
    taskBody.innerHTML = '';
    taskList.forEach(t => {
        // --- GOOGLE DRIVE IMAGE URL FORMATTING FIX ---
        const toDirectLink = (url) => {
            if (!url || typeof url !== 'string' || url === "-") return "";
            if (url.startsWith('data:image')) return url;
            try {
                // Task: Transform Google Drive link to direct viewable image link
                // Using drive.google.com/uc?export=view&id= format for maximum cross-origin compatibility
                const idMatch = url.match(/\/file\/d\/([^\/]+)/) ||
                                url.match(/[?&]id=([^&]+)/) ||
                                url.match(/\/open\?id=([^\/&]+)/) ||
                                url.match(/\/uc\?id=([^\/&]+)/);

                let fileId = (idMatch && idMatch[1]) ? idMatch[1] : null;

                if (!fileId && url.length >= 25 && !url.includes('/') && !url.includes('.') && !url.includes(':')) {
                    fileId = url;
                }

                if (fileId) {
                    return `https://drive.google.com/uc?export=view&id=${fileId}`;
                }
            } catch (e) {}
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
                <td class="p-2 font-mono">${rDT ? rDT.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-'}</td>
                <td class="p-2">${t.solvedByName || "-"}</td>
                <td class="p-2 font-mono">${cDT ? cDT.toLocaleDateString() : '-'}</td>
                <td class="p-2 font-mono">${cDT ? cDT.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-'}</td>
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
                    <td class="p-3">${profile.companyIdNumber || "-"}</td>
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
                    <td class="p-3"><span class="px-2 py-0.5 rounded text-[8px] font-bold ${r.status === 'active' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}">${(r.status || 'Unknown').toUpperCase()}</span></td>
                    <td class="p-3 text-center">${sig ? `<img src="${sig}" class="h-8 mx-auto rounded border" onclick="window.openImageZoom('${sig}')">` : '-'}</td>
                </tr>`;
        }
    });
};

// --- INTELLIGENT FIELD MAPPING ---
window.normalizeFieldKey = (k) => k ? String(k).toLowerCase().replace(/^[0-9]+\.\s*/, "").replace(/[^a-z0-9]/g, "").trim() : "";
window.findValueByFuzzyKey = (obj, target) => {
    if (!obj || !target) return "-";
    if (obj[target]) return obj[target];
    const normTarget = window.normalizeFieldKey(target);
    const keys = Object.keys(obj);
    const match = keys.find(k => window.normalizeFieldKey(k) === normTarget);
    return match ? obj[match] : "-";
};

// --- REBUILT ASYNCHRONOUS EXCEL IMPORT (Strict Promise Enforcement) ---
window.handleAssetImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const modal = document.getElementById('import-progress-modal');
    const pText = document.getElementById('import-progress-text');
    const pBar = document.getElementById('import-progress-bar');
    const cText = document.getElementById('import-count-text');

    modal.classList.remove('hidden');
    pText.innerText = "Reading file...";
    pBar.style.width = "0%";

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];

            // Step D: Parse using SheetJS starting from Row 2 (range: 1)
            const jsonData = XLSX.utils.sheet_to_json(sheet, { range: 1, defval: "-", raw: false });

            if (!jsonData.length) {
                alert("ERROR: The file contains no data rows in the expected range.");
                modal.classList.add('hidden');
                return;
            }

            const total = jsonData.length;
            cText.innerText = `0 / ${total}`;

            const allUpdates = {};
            let validCount = 0;

            jsonData.forEach((row, index) => {
                const sanitizeFirebaseKey = (k) => String(k).replace(/[\.\#\$\/\[\]]/g, '').trim();

                const bc = row['Asset Barcode'] || row['1. Asset Barcode'] || row['1. ASSET BARCODE'] || Object.values(row)[0];
                const rawKey = (bc && bc !== "-") ? String(bc) : `ASSET_${Date.now()}_${index}`;
                const sanitizedKey = sanitizeFirebaseKey(rawKey);

                const record = { assetBarcode: sanitizedKey, updatedAt: new Date().toISOString() };

                Object.keys(row).forEach(h => {
                    const safeKey = sanitizeFirebaseKey(h);
                    const val = row[h];
                    record[safeKey] = (val !== undefined && val !== null && String(val).trim() !== "") ? String(val).trim() : "-";
                });

                allUpdates[`assets/${sanitizedKey}`] = record;
                validCount++;
            });

            if (Object.keys(allUpdates).length === 0) {
                alert("ERROR: No valid data found.");
                modal.classList.add('hidden');
                return;
            }

            pText.innerText = `Committing ${validCount} records to Firebase...`;
            pBar.style.width = "50%";

            // --- STRICT PROMISE CHAIN ---
            // Physical write happens here. Alert only inside .then()
            update(ref(db), allUpdates)
                .then(() => {
                    pBar.style.width = "100%";
                    cText.innerText = `${validCount} / ${total}`;
                    modal.classList.add('hidden');

                    if (typeof window.loadAdminDashboard === 'function') {
                        // Clear initialization flag to allow re-fetch
                        window.appCache.isInitialized = false;
                        window.loadAdminDashboard();
                    }

                    alert(`SUCCESS: Physically saved ${validCount} asset records to Firebase Realtime Database!`);
                })
                .catch((error) => {
                    console.error("FIREBASE WRITE ERROR:", error);
                    alert("CRITICAL FIREBASE WRITE ERROR: " + error.message);
                    modal.classList.add('hidden');
                });

        } catch (err) {
            alert("FILE PROCESSING ERROR: " + err.message);
            modal.classList.add('hidden');
        } finally {
            event.target.value = "";
        }
    };
    reader.readAsArrayBuffer(file);
};

// --- ADD STAFF MODAL LOGIC ---
window.addStaffPhotoBase64 = "";

window.openAddStaffModal = () => {
    document.getElementById('add-staff-modal').classList.remove('hidden');
    document.getElementById('add-staff-modal').style.display = 'flex';
};

window.closeAddStaffModal = () => {
    document.getElementById('add-staff-modal').classList.add('hidden');
    document.getElementById('add-staff-modal').style.display = 'none';
    document.getElementById('add-staff-form').reset();
    if(document.getElementById('adminStaffPhotoPreview')) {
        document.getElementById('adminStaffPhotoPreview').innerHTML = '<i class="fa-solid fa-user text-3xl text-slate-300"></i>';
    }
    window.addStaffPhotoBase64 = "";
};

window.handleAdminStaffPhotoSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const preview = document.getElementById('adminStaffPhotoPreview');
    if(preview) preview.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-indigo-600"></i>';
    try {
        window.addStaffPhotoBase64 = await window.compressImageFile(file, 500, 500, 0.7);
        if(preview) preview.innerHTML = `<img src="${window.addStaffPhotoBase64}" class="w-full h-full object-cover">`;
    } catch (err) {
        console.error(err);
        if(preview) preview.innerHTML = '<i class="fa-solid fa-circle-exclamation text-red-500"></i>';
    }
};

// --- DYNAMIC UI TABLE GENERATION ---
window.updateAssetTableHeaders = (headers) => {
    try {
        const tableSelectors = ['#asset-master-table', '#asset-disposal-table'];

        tableSelectors.forEach(selector => {
            const tableHeaderRow = document.querySelector(`${selector} thead tr`);
            if (!tableHeaderRow) return;

            // Reset and Add Select All
            tableHeaderRow.innerHTML = '<th class="p-3 border-r text-center"><input type="checkbox" class="selectAllAssets" onclick="window.toggleAllAssetCheckboxes(this)"></th>';

            // Add dynamic headers from Excel/Firebase keys
            headers.forEach(h => {
                if (['updatedAt', 'createdAt', 'assetBarcode', 'initialAuditPhotoData', 'disposalPhotoData', 'initialAuditPhotoAtDisposal'].includes(h)) return;

                const th = document.createElement('th');
                th.className = "p-3 border-r min-w-[150px] uppercase";
                th.innerText = h.replace(/_/g, ' ');
                tableHeaderRow.appendChild(th);
            });

            // Add static operational columns
            const operationalHeaders = ['Audit Photo', 'Disposal Photo', 'Action'];
            operationalHeaders.forEach(h => {
                const th = document.createElement('th');
                th.className = "p-3 border-r min-w-[120px] text-center uppercase";
                if (h === 'Action') th.className += " text-red-600";
                th.innerText = h;
                tableHeaderRow.appendChild(th);
            });
        });
    } catch (e) { console.error("Error updating dynamic headers:", e); }
};
window.filterTransferTable = () => {
    try {
        const q = document.getElementById('transfer-search').value.toLowerCase();
        const filtered = window.appCache.transfers.filter(t =>
            (t.transferId || "").toLowerCase().includes(q) ||
            (t.assetBarcode || "").toLowerCase().includes(q) ||
            (t.assetName || "").toLowerCase().includes(q) ||
            (t.initiatedBy || "").toLowerCase().includes(q)
        );
        window.renderTransferTable(filtered);
    } catch (e) { console.error(e); }
};

window.exportTransferReport = async () => {
    if (window.appCache.transfers.length === 0) return alert('No data to export');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Asset Transfers');
    sheet.columns = [
        { header: 'Transfer ID', key: 'transferId' },
        { header: 'Barcode', key: 'assetBarcode' },
        { header: 'Asset Name', key: 'assetName' },
        { header: 'Serial No', key: 'serialNo' },
        { header: 'From', key: 'fromLocation' },
        { header: 'To', key: 'toLocation' },
        { header: 'Status', key: 'status' },
        { header: 'Staff', key: 'initiatedBy' },
        { header: 'ADEK ID', key: 'initiatedByAdek' },
        { header: 'Date', key: 'date' },
        { header: 'Time', key: 'time' }
    ];
    window.appCache.transfers.forEach(t => sheet.addRow(t));
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), 'Asset_Transfer_Report.xlsx');
};
