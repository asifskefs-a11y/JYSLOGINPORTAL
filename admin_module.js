import { db } from './firebase_config.js';
import { ref, get, set, update, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

window.loadAdminDashboard = async () => {
    try {
        if (!document.getElementById('visitor-logs-body')) return;

        // Attach Listeners for real-time logs
        onValue(ref(db, 'visitors'), (v) => {
            onValue(ref(db, 'staff_attendance'), (s) => {
                onValue(ref(db, 'users'), (userSnap) => {
                    onValue(ref(db, 'staff'), (staffSnap) => {
                        const userProfiles = userSnap.exists() ? userSnap.val() : {};
                        const staffProfiles = staffSnap.exists() ? staffSnap.val() : {};
                        let allRecords = [];
                        if(v.exists()) Object.values(v.val()).forEach(x => allRecords.push({...x, type: 'visitor'}));
                        if(s.exists()) Object.values(s.val()).forEach(x => allRecords.push({...x, type: 'staff'}));
                        allRecords.sort((a,b) => new Date(b.date + ' ' + (b.timeIn || '00:00 AM')) - new Date(a.date + ' ' + (a.timeIn || '00:00 AM')));
                        window.adminData = allRecords;
                        window.renderAdminTable(allRecords, userProfiles, staffProfiles);

                        // Update KPIs
                        const visitorsToday = allRecords.filter(r => r.type === 'visitor' && r.date === new Date().toLocaleDateString('en-US')).length;
                        const staffPresent = allRecords.filter(r => r.type === 'staff' && (r.status === 'checked_in' || !r.timeOut)).length;
                        if(document.getElementById('kpi-visitors')) document.getElementById('kpi-visitors').innerText = visitorsToday;
                        if(document.getElementById('kpi-staff')) document.getElementById('kpi-staff').innerText = staffPresent;
                    });
                });
            });
        });

        // Load Tasks
        onValue(ref(db, 'tasks'), (tasks) => {
            const taskBody = document.getElementById('admin-task-list-body');
            if (taskBody && tasks.exists()) {
                taskBody.innerHTML = '';
                const taskList = Object.values(tasks.val()).reverse();
                taskList.forEach(t => {
                    const b = window.getDirectDriveImageUrl(t.beforePhotoUrl || t.beforePhoto || t.taskPhoto);
                    const a = window.getDirectDriveImageUrl(t.afterPhotoUrl || t.afterPhoto);
                    const rDT = t.raisedTimestamp ? new Date(t.raisedTimestamp) : null;
                    taskBody.innerHTML += `
                        <tr class="hover:bg-gray-50 transition text-gray-800 border-b border-gray-100 text-[9px]">
                            <td class="p-2 font-mono opacity-50">${t.id}</td>
                            <td class="p-2 font-bold text-indigo-600">${t.assignedSchool || "-"}</td>
                            <td class="p-2 font-bold">${t.location}</td>
                            <td class="p-2 truncate max-w-[150px]">${t.details || "-"}</td>
                            <td class="p-2">${t.assignedRole || "-"}</td>
                            <td class="p-2">${t.raisedByName || 'Admin'}</td>
                            <td class="p-2 font-mono">${rDT ? rDT.toLocaleDateString() : '-'}</td>
                            <td class="p-2 font-mono">${rDT ? rDT.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-'}</td>
                            <td class="p-2 font-bold ${t.status === 'Open' ? 'text-blue-500' : 'text-green-500'}">${t.status}</td>
                            <td class="p-2">
                                <div class="flex gap-1 justify-center">
                                    ${b.includes('http') ? `<img src="${b}" class="h-8 w-8 rounded cursor-pointer" onclick="window.openImageZoom('${b}')">` : ''}
                                    ${a.includes('http') ? `<img src="${a}" class="h-8 w-8 rounded cursor-pointer" onclick="window.openImageZoom('${a}')">` : ''}
                                </div>
                            </td>
                        </tr>`;
                });
            }
        });

        // Load Assets
        onValue(ref(db, 'assets'), (assets) => {
            if (assets.exists() && window.renderAdminAssetTable) {
                window.allAssets = Object.values(assets.val());
                window.renderAdminAssetTable(window.allAssets);
            }
        });

        if (window.initRaisedTasksTracker) window.initRaisedTasksTracker('admin-my-tasks-container');

    } catch (err) { console.error("Admin Load Error:", err); }
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
            // This skips any decorative headers in Row 1
            const jsonData = XLSX.utils.sheet_to_json(sheet, { range: 1, defval: "-", raw: false });

            if (!jsonData.length) {
                alert("ERROR: The file contains no data rows in the expected range.");
                modal.classList.add('hidden');
                return;
            }

            const total = jsonData.length;
            cText.innerText = `0 / ${total}`;

            // Construct the final updates map for atomic write
            const allUpdates = {};
            let validCount = 0;

                jsonData.forEach((row, index) => {
                    // 1. DYNAMIC KEY SANITIZATION FUNCTION
                    const sanitizeFirebaseKey = (k) => String(k).replace(/[\.\#\$\/\[\]]/g, '').trim();

                    // 2. EXACT FIELD MAPPING WITH FALLBACKS
                    const bc = row['Asset Barcode'] || row['1. Asset Barcode'] || row['1. ASSET BARCODE'] || Object.values(row)[0];
                    const serial = row['Serial No.'] || row['Serial No'] || row['2. SERIAL NO.'] || row['2. Serial No.'];
                    const model = row['Model Description'] || row['3. MODEL DESCRIPTION'] || row['3. Model Description'];
                    const cond = row['Asset Condition'] || row['4. ASSET CONDITION'] || row['4. Asset Condition'];
                    const priceStat = row['Price Status'] || row['5. PRICE STATUS'] || row['5. Price Status'];
                    const cost = row['Asset Unit Cost'] || row['6. ASSET UNIT COST'] || row['6. Asset Unit Cost'];
                    const desc = row['Asset Description'] || row['7. ASSET DESCRIPTION'] || row['7. Asset Description'];

                    const rawKey = (bc && bc !== "-") ? String(bc) : `ASSET_${Date.now()}_${index}`;
                    const sanitizedKey = sanitizeFirebaseKey(rawKey);

                    const record = {
                        assetBarcode: sanitizedKey,
                        updatedAt: new Date().toISOString()
                    };

                    // 3. DYNAMICALLY SANITIZE ALL EXCEL KEYS
                    Object.keys(row).forEach(h => {
                        const safeKey = sanitizeFirebaseKey(h);
                        const val = row[h];
                        // Ensure all missing/undefined default to "-"
                        record[safeKey] = (val !== undefined && val !== null && String(val).trim() !== "") ? String(val).trim() : "-";
                    });

                    // Ensure primary fields use standard sanitized keys if they were found
                    if (serial && serial !== "-") record[sanitizeFirebaseKey('Serial No.')] = String(serial).trim();
                    if (model && model !== "-") record[sanitizeFirebaseKey('Model Description')] = String(model).trim();
                    if (cond && cond !== "-") record[sanitizeFirebaseKey('Asset Condition')] = String(cond).trim();
                    if (priceStat && priceStat !== "-") record[sanitizeFirebaseKey('Price Status')] = String(priceStat).trim();
                    if (cost && cost !== "-") record[sanitizeFirebaseKey('Asset Unit Cost')] = String(cost).trim();
                    if (desc && desc !== "-") record[sanitizeFirebaseKey('Asset Description')] = String(desc).trim();

                    allUpdates[`assets/${sanitizedKey}`] = record;
                    validCount++;
                });

            // REMOVED STRICT ERROR: Proceed directly to write
            pText.innerText = `Committing ${validCount} records to Firebase...`;
            pBar.style.width = "50%";

            // --- STRICT PROMISE CHAIN ---
            update(ref(db), allUpdates)
                .then(() => {
                    // This block executes ONLY after data is physically saved
                    pBar.style.width = "100%";
                    cText.innerText = `${validCount} / ${total}`;
                    modal.classList.add('hidden');

                    if (typeof window.loadAdminDashboard === 'function') {
                        window.loadAdminDashboard();
                    }

                    // Final confirmation only after DB success
                    alert(`SUCCESS: Physically saved ${validCount} asset records to Firebase Realtime Database!`);
                })
                .catch((error) => {
                    console.error("FIREBASE CRITICAL ERROR:", error);
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

// --- DYNAMIC UI TABLE GENERATION ---
window.updateAssetTableHeaders = (headers) => {
    try {
        const tableHeaderRow = document.querySelector('#asset-master-table thead tr');
        if (!tableHeaderRow) return;

        // Reset and Add Select All
        tableHeaderRow.innerHTML = '<th class="p-3 border-r text-center"><input type="checkbox" id="selectAllAssets" onclick="window.toggleAllAssetCheckboxes(this)"></th>';

        // Add dynamic headers from Excel/Firebase keys
        headers.forEach(h => {
            // Ignore internal technical keys
            if (['updatedAt', 'createdAt', 'assetBarcode', 'initialAuditPhotoData', 'disposalPhotoData'].includes(h)) return;

            const th = document.createElement('th');
            th.className = "p-3 border-r min-w-[150px] uppercase";
            th.innerText = h.replace(/_/g, ' '); // Replace underscores back to spaces for UI
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
    } catch (e) { console.error("Error updating dynamic headers:", e); }
};
