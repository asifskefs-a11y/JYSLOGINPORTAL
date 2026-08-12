/**
 * Excel Import — COMPLETE 39+ HEADERS
 * ---------------------------------------------------------------
 * ALL headers from Excel file properly mapped and displayed
 * ---------------------------------------------------------------
 */

import { db } from './firebase_config.js';
import { ref, set, update, get, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================================ */
// COMPLETE HEADER MAPPING - ALL 39 FIELDS FROM EXCEL              */
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
// ALL 39 FIELDS LIST FOR VERIFICATION                              */
// ================================================================ */

const ALL_EXPECTED_FIELDS = [
    'assetBarcode', 'serialNo', 'modelDescription', 'assetCondition',
    'priceStatus', 'assetUnitCost', 'assetDescription', 'datePlaceInService',
    'manufacturer', 'majorCategory', 'minorCategory', 'subMinorCategory',
    'dofMajor', 'dofMinor', 'category', 'classification',
    'locationName', 'schoolEsisId', 'schoolBuildingName', 'roomName',
    'roomNo', 'roomBarcode', 'floorNo', 'floorDescription',
    'barcodeStatus', 'assetStatus', 'oldSchoolName',
    'transactionNo', 'assetUsefulLife', 'assetVendorName',
    'oldAssetBarcode', 'exitingOldAssetBarcodeFromFAR',
    'poNo', 'invoiceNo', 'dnNo',
    'remarks', 'physicalAssetRegisterNo', 'fixedAssetRegisterNo',
    'mappingCriteria'
];

// ================================================================ */
// HEADER NORMALIZATION - CASE INSENSITIVE + FUZZY MATCH           */
// ================================================================ */

function normalizeHeader(header) {
    if (!header) return '';
    return String(header)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function findMatchingField(excelHeader) {
    // 1. EXACT MATCH
    if (ASSET_HEADER_MAPPING[excelHeader]) {
        return ASSET_HEADER_MAPPING[excelHeader];
    }

    // 2. CASE INSENSITIVE MATCH
    const normalized = normalizeHeader(excelHeader);
    if (!normalized) return null;

    for (const [key, value] of Object.entries(ASSET_HEADER_MAPPING)) {
        const keyNorm = normalizeHeader(key);
        if (keyNorm === normalized) {
            return value;
        }
    }

    // 3. PARTIAL MATCH
    for (const [key, value] of Object.entries(ASSET_HEADER_MAPPING)) {
        const keyNorm = normalizeHeader(key);
        if (normalized.includes(keyNorm) || keyNorm.includes(normalized)) {
            return value;
        }
    }

    return null;
}

// ================================================================ */
// PAGINATION STATE                                                 */
// ================================================================ */

window.paginationState = window.paginationState || {};
window._currentAssets = [];
window._currentHeaders = [];

// ================================================================ */
// CORE PARSER - STANDARD ROW-BASED SHEET                          */
// ================================================================ */

function parseStandardAssetSheet(worksheet) {
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        defval: "",
        blankrows: false
    });

    if (!jsonData || jsonData.length === 0) {
        throw new Error("The worksheet appears to be empty.");
    }

    const rawHeaders = Object.keys(jsonData[0] || {});
    console.log("📋 Raw Headers Found:", rawHeaders);
    console.log(`📊 Total Headers: ${rawHeaders.length}`);

    const headerMapping = {};
    let mappedCount = 0;
    const unmappedHeaders = [];

    rawHeaders.forEach((header) => {
        const mappedField = findMatchingField(header);
        if (mappedField) {
            headerMapping[header] = mappedField;
            mappedCount++;
            console.log(`✅ "${header}" → "${mappedField}"`);
        } else {
            unmappedHeaders.push(header);
            console.warn(`⚠️ No mapping for: "${header}"`);
        }
    });

    if (unmappedHeaders.length > 0) {
        console.warn(`⚠️ ${unmappedHeaders.length} headers unmapped:`, unmappedHeaders);
    }

    console.log(`📊 Mapped ${mappedCount}/${rawHeaders.length} headers`);

    const assets = [];
    const skipped = [];

    jsonData.forEach((row, index) => {
        try {
            const assetObj = {};

            rawHeaders.forEach((header) => {
                const mappedField = headerMapping[header];
                let value = row[header];

                if (typeof value === 'string') {
                    value = value.trim();
                }

                if (mappedField) {
                    assetObj[mappedField] = value;
                } else {
                    const safeKey = `_${header.replace(/[^a-zA-Z0-9]/g, '_')}`;
                    assetObj[safeKey] = value;
                }
            });

            const barcode = assetObj.assetBarcode;
            if (!barcode) {
                skipped.push({
                    row: index + 2,
                    reason: "Missing Asset Barcode",
                    data: assetObj
                });
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
            skipped.push({
                row: index + 2,
                reason: error.message,
                data: row
            });
        }
    });

    console.log(`📊 Parsed ${assets.length} assets, ${skipped.length} skipped`);

    return {
        assets,
        headers: rawHeaders,
        mappedHeaders: headerMapping,
        mappedCount: mappedCount,
        totalHeaders: rawHeaders.length,
        skipped
    };
}

// ================================================================ */
// FIREBASE SAVE - SAVE ALL 39 FIELDS                              */
// ================================================================ */

async function saveAssetsToFirebase(assets) {
    if (!assets.length) {
        console.warn("No assets to save — skipping Firebase write.");
        return { saved: 0, failed: 0 };
    }

    let saved = 0;
    let failed = 0;
    const BATCH_SIZE = 50;

    window.showGlobalSpinner("Saving Batch to Database...");
    console.log(`💾 Saving ${assets.length} assets to Firebase...`);

    for (let i = 0; i < assets.length; i += BATCH_SIZE) {
        const batch = assets.slice(i, i + BATCH_SIZE);
        const updates = {};

        batch.forEach((asset) => {
            const { _id, _row, ...record } = asset;
            const sanitizedId = String(_id).replace(/[.#$\[\];/]/g, "_");

            // Create complete record with ALL fields
            const completeRecord = {};

            // Add all mapped fields
            Object.keys(record).forEach(key => {
                if (record[key] !== undefined && record[key] !== null) {
                    completeRecord[key] = record[key];
                } else {
                    completeRecord[key] = '';
                }
            });

            // Add metadata
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

            const progress = Math.min(100, Math.round(((i + batch.length) / assets.length) * 100));
            showImportProgress(progress, i + batch.length, assets.length);

            console.log(`✅ Batch ${i}-${i + batch.length}: ${batch.length} assets saved`);
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

    window.hideGlobalSpinner();
    return { saved, failed };
}

// ================================================================ */
// FILE INPUT HANDLER                                               */
// ================================================================ */

window.handleAssetImport = function(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const fileNameDisplay = document.getElementById('file-name-display');
    if (fileNameDisplay) fileNameDisplay.textContent = file.name;

    const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel'
    ];

    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls)$/i)) {
        alert('Please select a valid Excel file (.xlsx or .xls)');
        event.target.value = '';
        return;
    }

    const fileSize = (file.size / 1024 / 1024).toFixed(1);
    if (!confirm(`📤 Import assets from "${file.name}"?\n\nFile size: ${fileSize} MB`)) {
        event.target.value = '';
        return;
    }

    const modal = document.getElementById('import-progress-modal');
    window.showGlobalSpinner("Processing Excel File...");

    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: "array", cellDates: true });

            window.showGlobalSpinner("Parsing Sheet Data...");
            // Select correct sheet
            let sheetName = "Verified Asset List";
            let worksheet = workbook.Sheets[sheetName];

            if (!worksheet) {
                const alternatives = ["VerifiedAssetList", "Verified Assets", "Asset List", "Assets", "Sheet2"];
                for (const alt of alternatives) {
                    if (workbook.Sheets[alt]) {
                        sheetName = alt;
                        worksheet = workbook.Sheets[alt];
                        console.log(`📊 Found sheet: "${sheetName}"`);
                        break;
                    }
                }
            }

            if (!worksheet && workbook.SheetNames.length > 1) {
                sheetName = workbook.SheetNames[1];
                worksheet = workbook.Sheets[sheetName];
                console.log(`📊 Using second sheet: "${sheetName}"`);
            }

            if (!worksheet) {
                sheetName = workbook.SheetNames[0];
                worksheet = workbook.Sheets[sheetName];
                console.warn(`⚠️ Using first sheet: "${sheetName}" (fallback)`);
            }

            console.log(`📊 Processing sheet: "${sheetName}"`);

            const result = parseStandardAssetSheet(worksheet);

            console.log(`📊 Total Headers Found: ${result.totalHeaders}`);
            console.log(`📊 Headers Mapped: ${result.mappedCount}`);
            console.log(`📊 Assets Found: ${result.assets.length}`);

            if (result.skipped.length > 0) {
                console.warn(`⚠️ ${result.skipped.length} row(s) skipped:`, result.skipped);
            }

            if (result.assets.length === 0) {
                throw new Error(`No assets found in sheet "${sheetName}". Please make sure the data is in the correct sheet.`);
            }

            window._currentAssets = result.assets;
            window._currentHeaders = result.headers;

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

            if (result.skipped.length > 0) {
                message += `⚠️ ${result.skipped.length} rows skipped due to missing barcode.\n`;
                message += `Check console for details.`;
            }

            alert(message);

            if (window.refreshDashboardData) {
                await window.refreshDashboardData();
            }

            console.log(`✅ Import complete: ${saveResult.saved} asset(s) saved`);

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

    reader.onerror = () => {
        console.error("Failed to read file.");
        alert("Failed to read the selected file.");
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
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

    if (progressBar) {
        progressBar.style.width = `${displayPercent}%`;
    }

    if (progressText) {
        const status = displayPercent < 30 ? 'Reading data...' :
                      displayPercent < 60 ? 'Processing assets...' :
                      displayPercent < 90 ? 'Saving to database...' :
                      'Finalizing...';
        progressText.textContent = status;
    }

    if (progressPercent) {
        progressPercent.textContent = `${displayPercent}% Complete`;
    }

    if (progressCount && current !== undefined && total !== undefined) {
        progressCount.textContent = `${Math.min(current, total)} / ${total}`;
    }
}

// ================================================================ */
// DYNAMIC TABLE RENDERING - SHOW ALL 39 HEADERS                   */
// ================================================================ */

window.renderDynamicAssetTable = function(assets, headers) {
    const tableHeaderContainer = document.getElementById('asset-table-header');
    const tableBodyContainer = document.getElementById('asset-table-body');

    if (!tableHeaderContainer || !tableBodyContainer) {
        console.error("❌ Required table elements missing.");
        return;
    }

    if (!assets || assets.length === 0) {
        tableHeaderContainer.innerHTML = '<tr><th class="p-3">No Data</th></tr>';
        tableBodyContainer.innerHTML = '<tr><td class="p-4 text-center text-gray-400">No assets found.</td></tr>';
        return;
    }

    // FILTER OUT PHOTO/IMAGE FIELDS FROM MAIN TABLE
    const tableHeaders = headers.filter(h => {
        const norm = h.toLowerCase();
        return !norm.includes('photo') && !norm.includes('image') && !norm.includes('url');
    });

    window.adminPaginators.assets.init(assets, (pageItems, startIndex) => {
        tableHeaderContainer.innerHTML = "";
        tableBodyContainer.innerHTML = "";

        // Build Table Header
        let headerHtml = '<tr class="bg-indigo-900 text-white text-left text-[10px] uppercase font-bold sticky top-0 z-20">';
        headerHtml += '<th class="p-3 w-8 sticky left-0 bg-indigo-900 z-30">#</th>';

        tableHeaders.forEach((header) => {
            let label = header;
            if (label.length > 20) {
                label = label.substring(0, 17) + '...';
            }
            headerHtml += `<th class="p-3 border-r border-indigo-800/20 shadow-sm text-[9px] whitespace-nowrap min-w-[100px]" title="${header}">${label}</th>`;
        });

        headerHtml += '<th class="p-3 text-center border-r border-indigo-800/20 shadow-sm min-w-[120px]">ACTION</th></tr>';
        tableHeaderContainer.innerHTML = headerHtml;

        // Build Table Body
        let bodyHtml = '';

        pageItems.forEach((asset, index) => {
            const assetId = asset._id || asset.assetBarcode || `row_${startIndex + index}`;
            bodyHtml += `<tr class="border-b hover:bg-indigo-50 text-[10px] text-slate-700">`;
            bodyHtml += `<td class="p-3 text-center sticky left-0 bg-white z-10 border-r shadow-sm">${startIndex + index + 1}</td>`;

            tableHeaders.forEach((header) => {
                const mappedField = findMatchingField(header);
                let value = '-';

                if (mappedField && asset[mappedField] !== undefined && asset[mappedField] !== null && asset[mappedField] !== '') {
                    value = String(asset[mappedField]);
                } else if (asset[header] !== undefined && asset[header] !== null && asset[header] !== '') {
                    value = String(asset[header]);
                }

                let displayValue = value;
                if (displayValue.length > 30) {
                    displayValue = displayValue.substring(0, 27) + '...';
                }

                bodyHtml += `<td class="p-3 border-r border-slate-100 max-w-[200px] truncate" title="${value}">${displayValue}</td>`;
            });

            bodyHtml += `
                <td class="p-3 text-center whitespace-nowrap sticky right-0 bg-white z-10 border-l shadow-sm">
                    <div class="flex items-center justify-center gap-2">
                        <button type="button" onclick="event.preventDefault(); window.openAssetDetailsModal('${assetId}')" class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center shadow-sm" title="View Details">
                            <i class="fa-solid fa-eye text-xs"></i>
                        </button>
                        <button type="button" onclick="event.preventDefault(); window.openEditAssetModal('${assetId}')" class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center shadow-sm" title="Edit">
                            <i class="fa-solid fa-pen-to-square text-xs"></i>
                        </button>
                        <button type="button" onclick="event.preventDefault(); window.deleteAssetRecord('${assetId}')" class="w-8 h-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-all flex items-center justify-center shadow-sm" title="Delete">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        });

        tableBodyContainer.innerHTML = bodyHtml;

        // Update count display
        const countDisplay = document.getElementById('asset-count-display');
        if (countDisplay) {
            countDisplay.textContent = `Showing ${pageItems.length} of ${assets.length} assets | ${tableHeaders.length} data fields visible`;
        }
    });
};

// ================================================================ */
// VERIFY FIREBASE DATA - CHECK ALL 39 FIELDS                      */
// ================================================================ */

window.verifyFirebaseData = async (barcode) => {
    try {
        const assetRef = ref(db, `assets/${barcode}`);
        const snapshot = await get(assetRef);

        if (snapshot.exists()) {
            const data = snapshot.val();
            const fieldCount = Object.keys(data).length;

            console.log(`📊 Asset ${barcode} has ${fieldCount} fields:`);
            console.log(data);

            // Check which fields are missing
            const missingFields = ALL_EXPECTED_FIELDS.filter(field => {
                return data[field] === undefined || data[field] === null;
            });

            if (missingFields.length === 0) {
                console.log('✅ All 39 fields present!');
            } else {
                console.warn(`⚠️ Missing ${missingFields.length} fields:`, missingFields);
            }

            return {
                barcode: barcode,
                totalFields: fieldCount,
                data: data,
                missingFields: missingFields,
                allPresent: missingFields.length === 0
            };
        } else {
            console.error(`❌ Asset ${barcode} not found`);
            return null;
        }
    } catch (error) {
        console.error('❌ Verification error:', error);
        return null;
    }
};

// ================================================================ */
// DEBUG FUNCTION - CHECK ALL SHEETS AND HEADERS                   */
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

                    return {
                        name: name,
                        headers: headers,
                        headerCount: headers.length,
                        rows: jsonData.length
                    };
                });

                resolve({
                    sheets: sheetsInfo,
                    totalSheets: sheetsInfo.length,
                    recommendedSheet: sheetsInfo.find(s => s.headerCount > 30)?.name || sheetsInfo[0]?.name
                });
            } catch (err) {
                reject(err);
            }
        };
        reader.readAsArrayBuffer(file);
    });
};

// ================================================================ */
// EXPOSE FUNCTIONS TO WINDOW                                      */
// ================================================================ */

window.ASSET_HEADER_MAPPING = ASSET_HEADER_MAPPING;
window.ALL_EXPECTED_FIELDS = ALL_EXPECTED_FIELDS;
window.findMatchingField = findMatchingField;
window.normalizeHeader = normalizeHeader;

console.log("✅ import_module.js loaded (COMPLETE 39 HEADERS)");
console.log(`📋 Total Headers Configured: ${Object.keys(ASSET_HEADER_MAPPING).length}`);
console.log(`📋 All 39 Fields:`, ALL_EXPECTED_FIELDS);