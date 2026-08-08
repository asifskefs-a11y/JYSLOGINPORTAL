/**
 * Excel Import — COMPLETE 39 HEADERS
 * ALL headers from Excel file properly mapped and displayed
 */

import { db } from './firebase_config.js';
import { ref, set, update, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================================ */
// HEADER MAPPING - ALL 39 FIELDS                                  */
// ================================================================ */

const ASSET_HEADER_MAPPING = {
    // Core Fields (1-9)
    'Asset Barcode': 'assetBarcode',
    'Serial No.': 'serialNo',
    'Model Description': 'modelDescription',
    'Asset Condition': 'assetCondition',
    'Price Status': 'priceStatus',
    'Asset Unit Cost': 'assetUnitCost',
    'Asset Description': 'assetDescription',
    'Date Place in Service': 'datePlaceInService',
    'Manufacturer': 'manufacturer',

    // Category Fields (10-16)
    'Major Category': 'majorCategory',
    'Minor Category': 'minorCategory',
    'Sub Minor Category': 'subMinorCategory',
    'DOF Major': 'dofMajor',
    'DOF Minor': 'dofMinor',
    'Category': 'category',
    'Classification (Aset Name)': 'classification',

    // Location Fields (17-24)
    'Location Name': 'locationName',
    'School ESIS ID': 'schoolEsisId',
    'School Building Name': 'schoolBuildingName',
    'Room Name': 'roomName',
    'Room No.': 'roomNo',
    'Room Barcode': 'roomBarcode',
    'Floor No.': 'floorNo',
    'Floor Description': 'floorDescription',

    // Status Fields (25-27)
    'Barcode Status': 'barcodeStatus',
    'Asset Status': 'assetStatus',
    'Old School Name': 'oldSchoolName',

    // Transaction Fields (28-32)
    'Transaction No.': 'transactionNo',
    'Asset Useful Life': 'assetUsefulLife',
    'Asset Vendor Name': 'assetVendorName',
    'Old Asset Barcode': 'oldAssetBarcode',
    'Exiting Old Asset Barcode From FAR': 'exitingOldAssetBarcodeFromFAR',

    // Purchase Fields (33-35)
    'PO No.': 'poNo',
    'Invoice No.': 'invoiceNo',
    'DN No.': 'dnNo',

    // Reference Fields (36-39)
    'Remarks': 'remarks',
    'Physical Asset Register No.': 'physicalAssetRegisterNo',
    'Fixed Asset Register No.': 'fixedAssetRegisterNo',
    'Mapping Criteria': 'mappingCriteria'
};

// ================================================================ */
// NORMALIZATION FUNCTIONS                                          */
// ================================================================ */

function normalizeHeader(header) {
    if (!header) return '';
    return String(header).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findMatchingField(excelHeader) {
    if (ASSET_HEADER_MAPPING[excelHeader]) {
        return ASSET_HEADER_MAPPING[excelHeader];
    }

    const normalized = normalizeHeader(excelHeader);
    if (!normalized) return null;

    for (const [key, value] of Object.entries(ASSET_HEADER_MAPPING)) {
        const keyNorm = normalizeHeader(key);
        if (keyNorm === normalized) return value;
    }

    for (const [key, value] of Object.entries(ASSET_HEADER_MAPPING)) {
        const keyNorm = normalizeHeader(key);
        if (normalized.includes(keyNorm) || keyNorm.includes(normalized)) {
            return value;
        }
    }

    return null;
}

// ================================================================ */
// PARSE EXCEL                                                      */
// ================================================================ */

function parseStandardAssetSheet(worksheet) {
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "", blankrows: false });

    if (!jsonData || jsonData.length === 0) {
        throw new Error("The worksheet appears to be empty.");
    }

    const rawHeaders = Object.keys(jsonData[0] || {});
    console.log("📋 Raw Headers Found:", rawHeaders);
    console.log(`📊 Total Headers: ${rawHeaders.length}`);

    const headerMapping = {};
    let mappedCount = 0;

    rawHeaders.forEach((header) => {
        const mappedField = findMatchingField(header);
        if (mappedField) {
            headerMapping[header] = mappedField;
            mappedCount++;
            console.log(`✅ "${header}" → "${mappedField}"`);
        } else {
            console.warn(`⚠️ No mapping for: "${header}"`);
        }
    });

    console.log(`📊 Mapped ${mappedCount}/${rawHeaders.length} headers`);

    const assets = [];
    const skipped = [];

    jsonData.forEach((row, index) => {
        try {
            const assetObj = {};

            rawHeaders.forEach((header) => {
                const mappedField = headerMapping[header];
                let value = row[header];
                if (typeof value === 'string') value = value.trim();

                if (mappedField) {
                    assetObj[mappedField] = value;
                } else {
                    const safeKey = `_${header.replace(/[^a-zA-Z0-9]/g, '_')}`;
                    assetObj[safeKey] = value;
                }
            });

            const barcode = assetObj.assetBarcode;
            if (!barcode) {
                skipped.push({ row: index + 2, reason: "Missing Asset Barcode", data: assetObj });
                return;
            }

            const cleanBarcode = String(barcode).trim().toUpperCase();

            assets.push({
                _id: cleanBarcode,
                _row: index + 2,
                ...assetObj,
                assetBarcode: cleanBarcode
            });

        } catch (error) {
            skipped.push({ row: index + 2, reason: error.message, data: row });
        }
    });

    console.log(`📊 Parsed ${assets.length} assets, ${skipped.length} skipped`);

    return { assets, headers: rawHeaders, mappedCount, totalHeaders: rawHeaders.length, skipped };
}

// ================================================================ */
// SAVE TO FIREBASE - ALL 39 FIELDS                                */
// ================================================================ */

async function saveAssetsToFirebase(assets) {
    if (!assets.length) return { saved: 0, failed: 0 };

    let saved = 0;
    let failed = 0;
    const BATCH_SIZE = 50;

    console.log(`💾 Saving ${assets.length} assets...`);

    for (let i = 0; i < assets.length; i += BATCH_SIZE) {
        const batch = assets.slice(i, i + BATCH_SIZE);
        const updates = {};

        batch.forEach((asset) => {
            const { _id, _row, ...record } = asset;
            const sanitizedId = String(_id).replace(/[.#$\[\];/]/g, "_");

            const completeRecord = {};
            Object.keys(record).forEach(key => {
                completeRecord[key] = record[key] !== undefined && record[key] !== null ? record[key] : '';
            });

            completeRecord.assetBarcode = sanitizedId;
            completeRecord.assetId = sanitizedId;
            completeRecord.importedAt = new Date().toISOString();
            completeRecord.updatedAt = new Date().toISOString();
            completeRecord._version = 1;

            updates[`assets/${sanitizedId}`] = completeRecord;
        });

        try {
            await update(ref(db), updates);
            saved += batch.length;
            showImportProgress(((i + batch.length) / assets.length) * 100, i + batch.length, assets.length);
        } catch (error) {
            console.error(`❌ Batch ${i} failed:`, error);
            failed += batch.length;
            for (const [path, data] of Object.entries(updates)) {
                try {
                    await set(ref(db, path), data);
                    saved++;
                } catch (singleError) {
                    console.error(`❌ Failed to save ${path}:`, singleError);
                    failed++;
                }
            }
        }
    }

    return { saved, failed };
}

// ================================================================ */
// IMPORT HANDLER                                                   */
// ================================================================ */

window.handleAssetImport = function(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel'
    ];

    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls)$/i)) {
        alert('Please select a valid Excel file (.xlsx or .xls)');
        event.target.value = '';
        return;
    }

    if (!confirm(`📤 Import assets from "${file.name}"?`)) {
        event.target.value = '';
        return;
    }

    const modal = document.getElementById('import-progress-modal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
        modal.innerHTML = `
            <div class="bg-white p-8 rounded-[32px] shadow-2xl max-w-sm w-full text-center space-y-6">
                <div class="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full mx-auto flex items-center justify-center">
                    <i class="fa-solid fa-file-import text-3xl animate-pulse"></i>
                </div>
                <div>
                    <h3 class="text-xl font-black text-indigo-900 uppercase">Importing Excel</h3>
                    <p id="import-progress-text" class="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Reading data...</p>
                </div>
                <div class="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div id="import-progress-bar" class="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-500" style="width: 0%"></div>
                </div>
                <div class="flex justify-between text-[10px] font-bold text-indigo-400 uppercase">
                    <span id="import-progress-percent">0% Complete</span>
                    <span id="import-progress-count">0 / 0</span>
                </div>
            </div>
        `;
    }

    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: "array", cellDates: true });

            // Select correct sheet
            let sheetName = "Verified Asset List";
            let worksheet = workbook.Sheets[sheetName];

            if (!worksheet && workbook.SheetNames.length > 1) {
                sheetName = workbook.SheetNames[1];
                worksheet = workbook.Sheets[sheetName];
            }

            if (!worksheet) {
                sheetName = workbook.SheetNames[0];
                worksheet = workbook.Sheets[sheetName];
            }

            console.log(`📊 Processing sheet: "${sheetName}"`);

            const result = parseStandardAssetSheet(worksheet);

            if (result.assets.length === 0) {
                throw new Error(`No assets found in sheet "${sheetName}".`);
            }

            // Render table with ALL headers
            window.renderDynamicAssetTable(result.assets, result.headers);

            // Save to Firebase
            const saveResult = await saveAssetsToFirebase(result.assets);

            showImportProgress(100, result.assets.length, result.assets.length);

            let message = `✅ Import Complete!\n\n`;
            message += `📂 Sheet: "${sheetName}"\n`;
            message += `📂 Total Headers: ${result.totalHeaders}\n`;
            message += `📋 Headers Mapped: ${result.mappedCount}\n`;
            message += `📊 Total Assets: ${result.assets.length}\n`;
            message += `✅ Saved: ${saveResult.saved}\n`;
            message += `❌ Failed: ${saveResult.failed}\n`;
            message += `⚠️ Skipped: ${result.skipped.length}\n\n`;

            alert(message);

            if (window.refreshDashboardData) {
                await window.refreshDashboardData();
            }

        } catch (err) {
            console.error("❌ Excel import failed:", err);
            alert(`❌ Import failed: ${err.message}`);
        } finally {
            if (modal) {
                modal.classList.add('hidden');
                modal.style.display = 'none';
            }
            event.target.value = "";
        }
    };

    reader.readAsArrayBuffer(file);
};

// ================================================================ */
// PROGRESS UI                                                      */
// ================================================================ */

function showImportProgress(percent, current, total) {
    const progressBar = document.getElementById('import-progress-bar');
    const progressText = document.getElementById('import-progress-text');
    const progressPercent = document.getElementById('import-progress-percent');
    const progressCount = document.getElementById('import-progress-count');

    const displayPercent = Math.min(100, percent);

    if (progressBar) progressBar.style.width = `${displayPercent}%`;
    if (progressText) {
        const status = displayPercent < 30 ? 'Reading data...' :
                      displayPercent < 60 ? 'Processing assets...' :
                      displayPercent < 90 ? 'Saving to database...' :
                      'Finalizing...';
        progressText.textContent = status;
    }
    if (progressPercent) progressPercent.textContent = `${displayPercent}% Complete`;
    if (progressCount && current !== undefined && total !== undefined) {
        progressCount.textContent = `${Math.min(current, total)} / ${total}`;
    }
}

// ================================================================ */
// DYNAMIC TABLE RENDERER - SHOW ALL HEADERS                       */
// ================================================================ */

window.renderDynamicAssetTable = function(assets, headers) {
    const tableHeaderContainer = document.getElementById('asset-table-header');
    const tableBodyContainer = document.getElementById('asset-table-body');

    if (!tableHeaderContainer || !tableBodyContainer) {
        console.error("❌ Required table elements missing.");
        return;
    }

    tableHeaderContainer.innerHTML = "";
    tableBodyContainer.innerHTML = "";

    if (!assets || assets.length === 0) {
        tableHeaderContainer.innerHTML = '<tr><th class="p-3">No Data</th></tr>';
        tableBodyContainer.innerHTML = '<tr><td class="p-4 text-center text-gray-400">No assets found.</td></tr>';
        return;
    }

    // SHOW ALL HEADERS
    const allHeaders = headers;
    const displayAssets = assets.slice(0, 20);

    console.log(`📊 Rendering ${allHeaders.length} headers`);

    // Build Header - ALL FIELDS
    let headerHtml = '<tr class="bg-indigo-900 text-white text-left text-[10px] uppercase font-bold sticky top-0 z-20">';
    headerHtml += '<th class="p-3 w-8 sticky left-0 bg-indigo-900 z-30">#</th>';

    allHeaders.forEach((header) => {
        let label = header;
        if (label.length > 20) label = label.substring(0, 17) + '...';
        headerHtml += `<th class="p-3 border-r border-indigo-800/20 shadow-sm text-[9px] whitespace-nowrap min-w-[100px]" title="${header}">${label}</th>`;
    });

    headerHtml += '<th class="p-3 text-center min-w-[100px]">ACTION</th></tr>';
    tableHeaderContainer.innerHTML = headerHtml;

    // Build Body
    let bodyHtml = '';

    displayAssets.forEach((asset, index) => {
        const assetId = asset._id || asset.assetBarcode || `row_${index}`;
        bodyHtml += `<tr class="border-b hover:bg-indigo-50 text-[10px] text-slate-700">`;
        bodyHtml += `<td class="p-3 text-center sticky left-0 bg-white z-10 border-r shadow-sm">${index + 1}</td>`;

        allHeaders.forEach((header) => {
            const mappedField = findMatchingField(header);
            let value = '-';

            if (mappedField && asset[mappedField] !== undefined && asset[mappedField] !== null && asset[mappedField] !== '') {
                value = String(asset[mappedField]);
                if (value.length > 30) value = value.substring(0, 27) + '...';
            } else if (asset[header] !== undefined && asset[header] !== null && asset[header] !== '') {
                value = String(asset[header]);
                if (value.length > 30) value = value.substring(0, 27) + '...';
            }

            bodyHtml += `<td class="p-3 border-r border-slate-100 max-w-[200px] truncate" title="${value}">${value}</td>`;
        });

        bodyHtml += `
            <td class="p-3 text-center">
                <button onclick="window.openEditAssetModal('${assetId}')" class="text-indigo-600 hover:text-indigo-800 p-1">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button onclick="window.deleteAssetRecord('${assetId}')" class="text-red-600 hover:text-red-800 p-1">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        </tr>`;
    });

    tableBodyContainer.innerHTML = bodyHtml;

    const countDisplay = document.getElementById('asset-count-display');
    if (countDisplay) {
        countDisplay.textContent = `Showing ${displayAssets.length} of ${assets.length} assets | ${allHeaders.length} headers`;
    }

    console.log(`✅ Table rendered: ${allHeaders.length} headers`);
};

// ================================================================ */
// DEBUG FUNCTION                                                   */
// ================================================================ */

window.debugExcelHeaders = async (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: "array" });
                const sheetsInfo = workbook.SheetNames.map(name => {
                    const worksheet = workbook.Sheets[name];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                    const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
                    return { name, headers, headerCount: headers.length, rows: jsonData.length };
                });
                resolve({ sheets: sheetsInfo, totalSheets: sheetsInfo.length });
            } catch (err) { reject(err); }
        };
        reader.readAsArrayBuffer(file);
    });
};

console.log("✅ import_module.js loaded (COMPLETE 39 HEADERS)");