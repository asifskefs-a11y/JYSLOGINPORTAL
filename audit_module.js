import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, set, get, update, child, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================
// GLOBAL STATE & UTILITIES
// ================================================
let transferPhotoBase64 = "";
let initialAuditPhotoBase64 = "";
let damageAuditPhotoBase64 = "";

window.disposalBeforePhotoBase64 = "";
window.transferBatch = [];

// ================================================
// ✅ NORMALIZED ASSET FETCHING
// ================================================

window.fetchNormalizedAsset = async function(barcode) {
    if (!barcode || barcode.length < 2) return null;

    try {
        const cleanBarcode = barcode.toString().trim().toUpperCase();
        const sanitizedKey = cleanBarcode.replace(/[.#$\[\]/]/g, '_');

        // Try direct lookup
        let snap = await get(child(ref(db), `assets/${sanitizedKey}`));
        let assetData = null;
        let assetKey = null;

        if (snap.exists()) {
            assetData = snap.val();
            assetKey = sanitizedKey;
        } else {
            // Search all assets
            const allSnap = await get(ref(db, 'assets'));
            if (allSnap.exists()) {
                const allAssets = allSnap.val();
                for (const [key, val] of Object.entries(allAssets)) {
                    const barcodeVal = val.assetBarcode || val.barcode || val.assetId || '';
                    if (barcodeVal.toString().toUpperCase() === cleanBarcode) {
                        assetData = val;
                        assetKey = key;
                        break;
                    }
                }
            }
        }

        if (assetData) {
            return {
                barcode: assetData.assetBarcode || assetData.barcode || assetData.assetId || cleanBarcode,
                assetName: assetData.assetName || assetData.name || assetData.asset_description || assetData.description || '-',
                description: assetData.description || assetData.assetDescription || '-',
                serialNo: assetData.serialNo || assetData.serial_number || '-',
                category: assetData.category || assetData.assetCategory || assetData.Classification || '-',
                majorCategory: assetData.majorCategory || assetData.major_category || '-',
                minorCategory: assetData.minorCategory || assetData.minor_category || '-',
                subMinorCategory: assetData.subMinorCategory || assetData.sub_minor_category || '-',
                location: assetData.location || assetData.locationName || assetData.location_name || assetData.room_name || '-',
                building: assetData.building || assetData.schoolBuilding || assetData.school_building || '-',
                roomNo: assetData.roomNo || assetData.room_no || assetData.roomNumber || '-',
                roomName: assetData.roomName || assetData.room_name || '-',
                floorNo: assetData.floorNo || assetData.floor_no || '-',
                floorDescription: assetData.floorDescription || assetData.floor_description || '-',
                vendor: assetData.vendor || assetData.assetVendor || assetData.asset_vendor || assetData.assetVendorName || '-',
                manufacturer: assetData.manufacturer || '-',
                model: assetData.model || assetData.modelDescription || '-',
                dateInService: assetData.dateInService || assetData.serviceDate || '-',
                assetStatus: assetData.assetStatus || assetData.status || 'Active',
                condition: assetData.condition || assetData.assetCondition || 'Good',
                custodian: assetData.custodian || assetData.assignedTo || 'Unassigned',
                department: assetData.department || '-',
                photoUrl: assetData.photoUrl || assetData.photoURL || assetData.auditPhoto || assetData.photo || null,
                importedAt: assetData.importedAt || assetData.createdAt || '-',
                updatedAt: assetData.updatedAt || '-',
                _raw: assetData,
                _key: assetKey
            };
        }
        return null;
    } catch (error) {
        console.error('Error fetching asset:', error);
        return null;
    }
};

// ================================================
// ASSET DISPOSAL - CORE LOGIC
// ================================================

// Helper to map asset data to the strict 14 headers required for Disposal
const mapToDisposalRegistry = (asset) => {
    return {
        "ASSET BARCODE": asset.barcode || "-",
        "ASSET DESCRIPTION": asset.description || asset.assetName || "-",
        "ASSET VENDOR NAME": asset.vendor || "-",
        "CATEGORY": asset.category || "-",
        "DATE PLACE IN SERVICE": asset.dateInService || "-",
        "FLOOR DISCRETION": asset.floorDescription || "-",
        "FLOOR NO": asset.floorNo || "-",
        "LOCATION NAME": asset.location || "-",
        "MAJOR CATEGORY": asset.majorCategory || "-",
        "MINOR CATEGORY": asset.minorCategory || "-",
        "SCHOOL BUILDING NAME": asset.building || "-",
        "ROOM NUMBER": asset.roomNo || "-",
        "ROOM NAME": asset.roomName || "-",
        "SUB MINOR CATEGORY": asset.subMinorCategory || "-",
        "AUDIT PHOTO": asset.photoUrl || "N/A"
    };
};

window.fetchDisposalAssetDetails = async function(barcode) {
    const cleanBarcode = (barcode || '').toString().trim().toUpperCase();

    if (!cleanBarcode || cleanBarcode.length < 2) {
        const previewArea = document.getElementById('disposal-asset-preview');
        if (previewArea) {
            previewArea.innerHTML = `
                <div class="flex items-center justify-center h-full text-slate-400">
                    <span class="text-[10px] font-bold uppercase tracking-widest">Scan barcode to load asset details</span>
                </div>
            `;
        }
        return;
    }

    try {
        const normalizedAsset = await window.fetchNormalizedAsset(cleanBarcode);

        if (normalizedAsset && normalizedAsset.barcode !== '-') {
            const previewArea = document.getElementById('disposal-asset-preview') || document.getElementById('disposal-asset-preview-card');
            const auditPhotoArea = document.getElementById('audit-photo-preview-container') || document.getElementById('disposal-master-photo-container');
            const mirrorImg = document.getElementById('disposal-asset-img-preview');

            // Map to strict headers for mirroring and payload integrity
            const disposalData = mapToDisposalRegistry(normalizedAsset);
            window.activeDisposalAsset = disposalData; // Store for submission

            // Auto-detect staff
            const currentStaff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || '{}');
            const staffName = currentStaff.name || currentStaff.fullName || "Auto-Detected Staff";
            const staffRole = currentStaff.role || currentStaff.designation || "Staff";

            // Populate UI fields
            const disposedByInput = document.getElementById('disposed-by-name') || document.getElementById('disposal-initiated-by');
            if (disposedByInput) disposedByInput.value = (disposedByInput.id === 'disposal-initiated-by') ? `${staffName} (${staffRole})` : staffName;

            const now = new Date();
            const dateEl = document.getElementById('disposal-date') || document.getElementById('disposal-current-date');
            const timeEl = document.getElementById('disposal-time') || document.getElementById('disposal-current-time');
            if (dateEl) dateEl.value = now.toLocaleDateString();
            if (timeEl) timeEl.value = now.toLocaleTimeString();

            // Live Image Mirroring
            if (mirrorImg && disposalData["AUDIT PHOTO"] !== 'N/A') {
                mirrorImg.src = window.getDirectDriveImageUrl ? window.getDirectDriveImageUrl(disposalData["AUDIT PHOTO"]) : disposalData["AUDIT PHOTO"];
                mirrorImg.classList.remove('hidden');
            } else if (mirrorImg) {
                mirrorImg.classList.add('hidden');
            }

            // Render mirror grid (14 Headers)
            if (previewArea) {
                previewArea.innerHTML = `
                    <div class="bg-red-50 border-2 border-red-200 rounded-3xl p-5 space-y-4 text-left shadow-sm animate-fade-in">
                        <div class="flex justify-between items-center border-b border-red-200 pb-3">
                            <div>
                                <span class="text-[9px] font-black uppercase text-red-500 tracking-widest">Master Register Sync</span>
                                <h3 class="text-lg font-black text-gray-900">${disposalData["ASSET BARCODE"]}</h3>
                            </div>
                            <span class="px-3 py-1 text-[10px] font-black uppercase rounded-lg bg-red-100 text-red-700 border border-red-300">VALIDATED</span>
                        </div>
                        <div class="grid grid-cols-2 gap-2 text-[10px]">
                            ${Object.entries(disposalData).filter(([k]) => k !== "AUDIT PHOTO").map(([key, val]) => `
                                <div class="bg-white p-2 rounded-xl border border-red-100">
                                    <span class="text-[8px] font-bold text-gray-400 uppercase block">${key}</span>
                                    <span class="font-black text-gray-800 truncate block">${val}</span>
                                </div>
                            `).join('')}
                        </div>
                        <div class="bg-red-100/60 p-2.5 rounded-2xl border border-red-200 flex justify-between items-center text-xs">
                            <span class="font-bold text-red-800">Initiator:</span>
                            <span class="font-black text-red-900">${staffName} (${staffRole})</span>
                        </div>
                    </div>
                `;
                if (previewArea.classList.contains('preview-card')) {
                    previewArea.className = 'preview-card has-data has-data-red';
                }
            }

            // Master photo display in disposal flow
            if (auditPhotoArea) {
                const photoUrl = disposalData["AUDIT PHOTO"];
                if (photoUrl && photoUrl !== 'N/A' && photoUrl !== '-' && photoUrl !== 'null') {
                    auditPhotoArea.innerHTML = `
                        <div class="text-center w-full">
                            <span class="text-[10px] font-bold text-gray-500 uppercase block mb-1">Master Register Photo</span>
                            <img src="${window.getDirectDriveImageUrl ? window.getDirectDriveImageUrl(photoUrl) : photoUrl}" class="w-full h-32 object-cover rounded-2xl border border-gray-300 shadow-sm mx-auto">
                        </div>`;
                    auditPhotoArea.classList.remove('hidden');
                } else {
                    auditPhotoArea.innerHTML = `
                        <div class="w-full h-32 bg-gray-100 rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-center p-2">
                            <i class="fa-solid fa-image-slash text-gray-400 text-xl mb-1"></i>
                            <span class="text-xs font-bold text-gray-400 uppercase">No Photo Available</span>
                        </div>`;
                    auditPhotoArea.classList.remove('hidden');
                }
            }

            const submitBtn = document.getElementById('submit-disposal-btn') || document.getElementById('disposal-submit-btn');
            if (submitBtn) submitBtn.disabled = false;

        } else {
            const previewArea = document.getElementById('disposal-asset-preview') || document.getElementById('disposal-asset-preview-card');
            if (previewArea) {
                previewArea.innerHTML = `
                    <div class="p-4 bg-red-100 border border-red-300 rounded-2xl text-center">
                        <i class="fa-solid fa-triangle-exclamation text-red-500 text-lg block mb-1"></i>
                        <span class="text-xs font-black text-red-600 uppercase">⚠️ Asset Barcode Not Found: ${cleanBarcode}</span>
                    </div>`;
                if (previewArea.classList.contains('preview-card')) {
                    previewArea.className = 'preview-card error';
                }
            }
            const submitBtn = document.getElementById('submit-disposal-btn') || document.getElementById('disposal-submit-btn');
            if (submitBtn) submitBtn.disabled = true;
        }

    } catch (e) {
        console.error("Error fetching disposal asset details:", e);
    }
};

window.submitAssetDisposal = async () => {
    const barcode = document.getElementById('disposal-barcode-input')?.value?.trim()?.toUpperCase() ||
                    document.getElementById('f1_disposal_barcode_input')?.value?.trim()?.toUpperCase();
    const reason = document.getElementById('disposal-reason-input')?.value?.trim() ||
                   document.getElementById('disposal-reason')?.value?.trim();
    const disposalPhoto = window.disposalBeforePhotoBase64;

    if (!barcode || !reason || !disposalPhoto) {
        return alert("Error: Barcode, Reason, and Proof Photo are all required!");
    }

    window.showGlobalSpinner("Finalizing Disposal...");

    try {
        // 1. Upload Proof Photo
        let proofUrl = "N/A";
        if (window.uploadToDrive) {
            const res = await window.uploadToDrive({
                category: 'DISPOSAL',
                fileName: `DISPOSAL_PROOF_${barcode}_${Date.now()}.jpg`,
                image: disposalPhoto
            });
            proofUrl = res.fileUrl || "N/A";
        }

        // 2. Fetch Initiator Details
        const staff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || '{}');
        const now = new Date();

        // 3. Build Full Payload
        const payload = {
            ...window.activeDisposalAsset, // Includes all normalized headers
            "DISPOSAL REASON": reason,
            "DISPOSAL PHOTO": proofUrl,
            "DISPOSED BY NAME": staff.name || staff.fullName || "Unknown",
            "DISPOSED BY ROLE": staff.role || "Staff",
            "DISPOSAL DATE": now.toLocaleDateString(),
            "DISPOSAL TIME": now.toLocaleTimeString(),
            "STATUS": "DISPOSED",
            "TIMESTAMP": Date.now()
        };

        const sanitizedKey = barcode.replace(/[.#$\[\]/]/g, '_');

        // ✅ MANDATED FIX: Database Migration
        // 4. Save to Disposed Assets Registry (Migration Node)
        await set(ref(db, `disposed_assets/${sanitizedKey}`), payload);

        // 5. Update or Remove from Primary Assets Registry
        // Setting status to DISPOSED as a fallback to removal to maintain referential integrity
        await update(ref(db, `assets/${sanitizedKey}`), {
            assetStatus: 'DISPOSED',
            status: 'DISPOSED',
            isDisposed: true,
            updatedAt: now.toISOString(),
            lastMovement: 'DISPOSAL'
        });

        // 6. Record to Movement Logs
        await push(ref(db, 'movement_logs'), {
            assetBarcode: barcode,
            action: 'ASSET_DISPOSAL',
            performedBy: payload["DISPOSED BY NAME"],
            role: payload["DISPOSED BY ROLE"],
            timestamp: payload.TIMESTAMP,
            date: payload["DISPOSAL DATE"],
            type: 'disposal'
        });

        window.triggerSuccessPopup("Asset Disposed Successfully! ✅");
        window.hideGlobalSpinner();

        // Reset and Refresh
        if (window.resetAssetDisposalForm) window.resetAssetDisposalForm();
        window.showStaffView('staff-dash-area');

    } catch (e) {
        console.error("Disposal Submission Failed:", e);
        alert("Failed to dispose asset: " + e.message);
        window.hideGlobalSpinner();
    }
};

/**
 * ✅ NEW: Unified photo capture handler for disposal with preview
 */
window.handleDisposalPhotoSelect = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const preview = document.getElementById('disposal-photo-preview');
    const previewBox = document.getElementById('disposal-photo-preview-box');
    const placeholder = document.getElementById('no-photo-placeholder');

    const reader = new FileReader();
    reader.onload = function(e) {
        window.disposalBeforePhotoBase64 = e.target.result;
        if (preview) preview.src = e.target.result;
        if (previewBox) previewBox.classList.remove('hidden');
        if (placeholder) placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
};

// Aliases for compatibility
window.handleDisposalBarcodeInput = window.fetchDisposalAssetDetails;
window.submitDisposalRequest = window.submitAssetDisposal;

// ================================================
// ASSET REGISTER SUBMISSION (MASTER)
// ================================================

window.submitAssetAudit = async (event) => {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const barcode = document.getElementById('f1_asset_barcode')?.value.trim().toUpperCase();
    if (!barcode) return alert("Asset Barcode is required!");

    const btn = event?.target?.querySelector('button[type="submit"]');
    const originalBtnHtml = btn ? btn.innerHTML : 'SAVE ASSET REGISTER';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    }

    window.showGlobalSpinner("Saving Asset Register...");

    try {
        const snap = await get(child(ref(db), `assets/${barcode.replace(/[.#$\[\]/]/g, '_')}`));
        const existingData = snap.exists() ? snap.val() : {};

        const data = {
            assetBarcode: barcode,
            serialNo: document.getElementById('f2_serial_no')?.value.trim() || existingData.serialNo || '',
            assetDescription: document.getElementById('f7_asset_desc')?.value.trim() || existingData.assetDescription || '',
            datePlaceInService: document.getElementById('f8_service_date')?.value.trim() || existingData.datePlaceInService || '',
            manufacturer: document.getElementById('f9_manufacturer')?.value.trim() || existingData.manufacturer || '',
            category: document.getElementById('f15_category')?.value.trim() || existingData.category || '',
            classification: document.getElementById('f16_class')?.value.trim() || existingData.classification || '',
            locationName: document.getElementById('f17_location')?.value.trim() || existingData.locationName || '',
            schoolBuildingName: document.getElementById('f19_school_building')?.value.trim() || existingData.schoolBuildingName || '',
            roomName: document.getElementById('f20_room_name')?.value.trim() || existingData.roomName || '',
            roomNo: document.getElementById('f21_room_no')?.value.trim() || existingData.roomNo || '',
            floorNo: document.getElementById('f23_floor_no')?.value.trim() || existingData.floorNo || '',
            floorDescription: document.getElementById('f24_floor_desc')?.value.trim() || existingData.floorDescription || '',
            assetStatus: document.getElementById('f26_asset_stat')?.value.trim() || existingData.assetStatus || '',
            assetVendorName: document.getElementById('f30_vendor')?.value.trim() || existingData.assetVendorName || '',
            updatedAt: new Date().toISOString()
        };

        const photoInput = document.getElementById('f40_audit_photo_input');
        if (photoInput && photoInput.files && photoInput.files[0]) {
            const file = photoInput.files[0];
            const base64 = await window.compressImageFile(file, 800, 800, 0.7);
            if (window.uploadToDrive) {
                const res = await window.uploadToDrive({
                    category: 'ASSET_PHOTOS',
                    fileName: `Asset_${barcode}_${Date.now()}.jpg`,
                    image: base64
                });
                if (res && res.status === 'success' && res.fileUrl) {
                    data.photoURL = res.fileUrl;
                    data.auditPhoto = res.fileUrl;
                }
            }
        }

        const mergedData = { ...existingData, ...data };
        await set(ref(db, 'assets/' + barcode.replace(/[.#$\[\]/]/g, '_')), mergedData);
        window.triggerSuccessPopup("Asset Registered Successfully! ✅");
        window.showStaffView('staff-dash-area');
    } catch (e) {
        console.error("❌ Submission Failed:", e);
        alert("❌ Failed to register asset. Error: " + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
        window.hideGlobalSpinner();
    }
};

// ================================================
// BATCH TRANSFER SYSTEM
// ================================================

window.fetchAssetDetailsByBarcode = async function(barcode) {
    if (typeof window.fetchTransferAssetPreview === 'function') {
        return await window.fetchTransferAssetPreview(barcode);
    }
};

window.fetchTransferAssetPreview = async function(barcode) {
    const cleanBarcode = (barcode || '').toString().trim().toUpperCase();
    const previewArea = document.getElementById('transfer-asset-preview');
    if (!previewArea) return;

    if (!cleanBarcode || cleanBarcode.length < 2) {
        previewArea.innerHTML = '';
        return;
    }

    try {
        const normalizedAsset = await window.fetchNormalizedAsset(cleanBarcode);
        if (normalizedAsset && normalizedAsset.barcode !== '-') {
            previewArea.innerHTML = `
                <div class="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-center gap-4 animate-fade-in">
                    <div class="w-16 h-16 rounded-xl bg-white border flex-shrink-0 overflow-hidden">
                        ${normalizedAsset.photoUrl ? `<img src="${window.getDirectDriveImageUrl(normalizedAsset.photoUrl)}" class="w-full h-full object-cover">` : `<div class="flex items-center justify-center h-full text-slate-300"><i class="fa-solid fa-image"></i></div>`}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-center">
                            <span class="text-[8px] font-black text-indigo-500 uppercase tracking-widest">Asset Details</span>
                            <span class="px-2 py-0.5 rounded-md text-[8px] font-black bg-indigo-100 text-indigo-700 uppercase">${normalizedAsset.assetStatus}</span>
                        </div>
                        <h4 class="text-xs font-black text-slate-900 truncate">${normalizedAsset.assetName || normalizedAsset.description}</h4>
                        <p class="text-[9px] font-bold text-slate-500 uppercase">${normalizedAsset.category} • ${normalizedAsset.location}</p>
                    </div>
                </div>
            `;
        } else {
            previewArea.innerHTML = `
                <div class="bg-red-50 border border-red-100 rounded-2xl p-3 flex items-center gap-2">
                    <i class="fa-solid fa-triangle-exclamation text-red-500"></i>
                    <span class="text-[9px] font-black text-red-600 uppercase">Asset Barcode Not Found</span>
                </div>
            `;
        }
    } catch (e) {
        console.error("Preview error:", e);
    }
};

window.addAssetToBatch = async () => {
    const input = document.getElementById('t_asset_barcode');
    const barcode = input?.value.trim().toUpperCase();
    if (!barcode) return;

    if (window.transferBatch.some(a => a.barcode === barcode)) {
        alert("Asset already in batch!");
        input.value = "";
        return;
    }

    try {
        const normalizedAsset = await window.fetchNormalizedAsset(barcode);
        if (normalizedAsset && normalizedAsset.barcode !== '-') {
            window.transferBatch.push(normalizedAsset);
            window.renderBatchUI();
            input.value = "";
            window.triggerSuccessPopup("Asset Added! 📦");
        } else {
            alert("Asset not found in register!");
        }
    } catch (e) {
        alert("Error looking up asset: " + e.message);
    }
};

window.renderBatchUI = () => {
    const tableBody = document.getElementById('transfer-batch-body');
    if (!tableBody) return;

    if (window.transferBatch.length === 0) {
        tableBody.innerHTML = `<tr id="empty-batch-row"><td colspan="6" class="p-8 text-center text-slate-400 font-bold">No assets added to batch yet.</td></tr>`;
        return;
    }

    tableBody.innerHTML = window.transferBatch.map((asset, index) => `
        <tr class="hover:bg-indigo-50/30 transition-colors border-b border-slate-100 text-[10px]">
            <td class="p-3 text-center font-bold text-slate-400">${index + 1}</td>
            <td class="p-3 font-mono font-bold text-indigo-600">${asset.barcode}</td>
            <td class="p-3 font-bold text-slate-700">${asset.assetName || asset.description}</td>
            <td class="p-3 uppercase font-black text-slate-500">${asset.category}</td>
            <td class="p-3 font-bold text-slate-600">${asset.location}</td>
            <td class="p-3 text-center">
                <div class="flex items-center justify-center gap-2">
                    <button type="button" onclick="window.openAssetPreviewModal(decodeURIComponent('${encodeURIComponent(JSON.stringify(asset))}'))" class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
                        <i class="fa-solid fa-eye text-xs"></i>
                    </button>
                    <button type="button" onclick="window.removeAssetFromBatch(${index})" class="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-600 hover:text-white transition-all shadow-sm">
                        <i class="fa-solid fa-trash-can text-xs"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    const counter = document.getElementById('batch-counter');
    if (counter) counter.innerText = `${window.transferBatch.length} items`;
};

window.removeAssetFromBatch = (index) => {
    window.transferBatch.splice(index, 1);
    window.renderBatchUI();
};

/**
 * ✅ NEW: Handle Transfer Photo Selection & Preview
 */
window.handleTransferPhoto = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const preview = document.querySelector('#t_photo_preview img');
    const container = document.getElementById('t_photo_preview');
    const btnText = document.getElementById('t_photo_btn_text');

    const reader = new FileReader();
    reader.onload = function(e) {
        transferPhotoBase64 = e.target.result;
        if (preview) preview.src = e.target.result;
        if (container) container.classList.remove('hidden');
        if (btnText) btnText.innerText = "Photo Captured ✅";
    };
    reader.readAsDataURL(file);
};

window.removeTransferPhoto = function() {
    transferPhotoBase64 = "";
    const input = document.getElementById('t_photo_capture');
    const container = document.getElementById('t_photo_preview');
    const btnText = document.getElementById('t_photo_btn_text');

    if (input) input.value = '';
    if (container) container.classList.add('hidden');
    if (btnText) btnText.innerText = "Capture Transfer Photo";
};

/**
 * ✅ NEW: Submit Asset Transfer
 */
window.submitAssetTransfer = async function(event) {
    if (event) event.preventDefault();

    if (window.transferBatch.length === 0) {
        alert("Please add at least one asset to the batch.");
        return;
    }

    const collectorName = document.getElementById('t_collector_name')?.value.trim();
    const companyName = document.getElementById('t_company_name')?.value.trim();
    const collectionDate = document.getElementById('t_collection_date')?.value;
    const securityName = document.getElementById('t_security_name')?.value.trim();
    const receiverName = document.getElementById('t_received_name')?.value.trim();

    if (!collectorName || !companyName || !collectionDate || !securityName || !receiverName) {
        alert("Please fill in all required fields.");
        return;
    }

    // Signatures
    const securitySig = window.getCanvasBase64 ? window.getCanvasBase64('t_security_sig') : null;
    const receivedSig = window.getCanvasBase64 ? window.getCanvasBase64('t_received_sig') : null;

    if (!securitySig || securitySig.length < 500) {
        alert("Security signature is required.");
        return;
    }
    if (!receivedSig || receivedSig.length < 500) {
        alert("Receiver signature is required.");
        return;
    }

    window.showGlobalSpinner("Processing Transfer...");

    try {
        let photoUrl = "";
        if (transferPhotoBase64) {
            const res = await window.uploadToDrive({
                category: 'TRANSFERS',
                fileName: `Transfer_${Date.now()}.jpg`,
                image: transferPhotoBase64
            });
            if (res && res.status === 'success') photoUrl = res.fileUrl;
        }

        const staff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || '{}');
        const transferId = "TRF-" + Date.now();

        const transferData = {
            transferId: transferId,
            collectorName,
            companyName,
            collectionDate,
            securityName,
            receiverName,
            staffName: staff.fullName || staff.name || "Unknown",
            staffId: staff.mobile || "N/A",
            timestamp: Date.now(),
            assets: window.transferBatch.map(a => ({
                barcode: a.barcode,
                name: a.assetName || a.description,
                category: a.category,
                previousLocation: a.location
            })),
            transferPhotoUrl: photoUrl,
            securitySignatureUrl: securitySig,
            receivedSignatureUrl: receivedSig,
            status: 'Transferred'
        };

        // Save to transfers node
        await set(ref(db, `asset_transfers/${transferId}`), transferData);

        // Update each asset status and location (if needed, here we just mark as transferred)
        const updates = {};
        for (const asset of window.transferBatch) {
            const assetKey = asset.barcode.replace(/[.#$\[\]/]/g, '_');
            updates[`assets/${assetKey}/assetStatus`] = 'In Transit / Transferred';
            updates[`assets/${assetKey}/lastTransferId`] = transferId;
            updates[`assets/${assetKey}/updatedAt`] = new Date().toISOString();
        }
        await update(ref(db), updates);

        // Record to movement logs
        const logEntry = {
            type: 'transfer',
            transferId: transferId,
            action: 'Asset Batch Transfer',
            count: window.transferBatch.length,
            collector: collectorName,
            staff: transferData.staffName,
            timestamp: Date.now(),
            date: new Date().toLocaleDateString()
        };
        await push(ref(db, 'movement_logs'), logEntry);

        window.triggerSuccessPopup("Batch Transfer Successful! ✅");

        // Reset
        window.transferBatch = [];
        window.renderBatchUI();
        document.getElementById('transfer-form-multi')?.reset();
        window.removeTransferPhoto();
        window.clearSignaturePad('t_security_sig');
        window.clearSignaturePad('t_received_sig');

        window.showStaffView('staff-dash-area');

    } catch (e) {
        console.error("Transfer error:", e);
        alert("Failed to complete transfer: " + e.message);
    } finally {
        window.hideGlobalSpinner();
    }
};

/**
 * ✅ NEW: Load Movement Logs
 */
window.loadMovementLogs = async function() {
    const container = document.getElementById('movement-logs-container');
    if (!container) return;

    container.innerHTML = `
        <div class="text-center py-12 text-slate-400">
            <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 block"></i>
            <span class="font-bold uppercase tracking-widest text-[10px]">Loading activity logs...</span>
        </div>
    `;

    try {
        const snap = await get(ref(db, 'movement_logs'));
        if (snap.exists()) {
            const logsData = snap.val();
            const allLogs = Object.values(logsData);
            // Sort by timestamp descending
            allLogs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            window.allMovementLogs = allLogs; // Cache for filtering
            window.renderMovementLogs(allLogs);
        } else {
            container.innerHTML = `
                <div class="text-center py-12 text-slate-400">
                    <i class="fa-solid fa-clock-rotate-left text-3xl mb-3 block opacity-20"></i>
                    <span class="font-bold uppercase tracking-widest text-[10px]">No activity logs found</span>
                </div>
            `;
        }
    } catch (e) {
        console.error("Error loading movement logs:", e);
        container.innerHTML = `<div class="text-center py-12 text-red-500 font-bold text-xs">Error: ${e.message}</div>`;
    }
};

window.renderMovementLogs = function(logs) {
    const container = document.getElementById('movement-logs-container');
    const searchTerm = document.getElementById('movement-log-search')?.value.toLowerCase() || '';
    const typeFilter = document.getElementById('movement-log-type-filter')?.value || 'all';

    if (!container) return;

    const filtered = logs.filter(log => {
        const matchesType = typeFilter === 'all' || log.type === typeFilter;
        const stringified = JSON.stringify(log).toLowerCase();
        const matchesSearch = stringified.includes(searchTerm);
        return matchesType && matchesSearch;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="text-center py-12 text-slate-400 uppercase font-black text-[10px]">No matching logs found</div>`;
        return;
    }

    container.innerHTML = filtered.map(log => {
        const type = log.type || 'activity';
        const icon = type === 'transfer' ? 'fa-arrow-right-arrow-left text-indigo-500' :
                     type === 'disposal' ? 'fa-trash-can text-red-500' :
                     type === 'audit' ? 'fa-clipboard-check text-emerald-500' :
                     'fa-clock-rotate-left text-slate-400';

        const bgColor = type === 'transfer' ? 'bg-indigo-50 border-indigo-100' :
                        type === 'disposal' ? 'bg-red-50 border-red-100' :
                        type === 'audit' ? 'bg-emerald-50 border-emerald-100' :
                        'bg-slate-50 border-slate-100';

        const dateStr = log.date || new Date(log.timestamp).toLocaleDateString();
        const timeStr = new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

        return `
            <div class="p-4 rounded-2xl border ${bgColor} flex items-center gap-4 transition-all hover:shadow-md">
                <div class="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                    <i class="fa-solid ${icon}"></i>
                </div>
                <div class="flex-1 min-w-0 text-left">
                    <div class="flex justify-between items-start mb-1">
                        <span class="text-[8px] font-black uppercase tracking-widest text-slate-400">${dateStr} • ${timeStr}</span>
                        <span class="px-2 py-0.5 rounded text-[8px] font-black bg-white shadow-sm uppercase">${type}</span>
                    </div>
                    <h4 class="text-xs font-black text-slate-900 uppercase truncate">${log.action || 'Logged Activity'}</h4>
                    <p class="text-[9px] font-bold text-slate-500 uppercase mt-0.5">
                        ${log.assetBarcode ? `Barcode: ${log.assetBarcode} • ` : ''}
                        By: ${log.staff || log.staffName || log.performedBy || 'System'}
                        ${log.count ? ` • ${log.count} Items` : ''}
                    </p>
                </div>
            </div>
        `;
    }).join('');
};

// Bind event listeners for search and filter
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('movement-log-search');
    const typeFilter = document.getElementById('movement-log-type-filter');

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (window.allMovementLogs) window.renderMovementLogs(window.allMovementLogs);
        });
    }

    if (typeFilter) {
        typeFilter.addEventListener('change', () => {
            if (window.allMovementLogs) window.renderMovementLogs(window.allMovementLogs);
        });
    }
});

console.log("✅ audit_module.js ready - v4.8 Deployed");
