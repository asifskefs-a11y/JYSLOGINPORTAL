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

window.fetchAuditAssetDetails = async function(barcode) {
    if (!barcode || barcode.length < 2) return;

    try {
        const normalizedAsset = await window.fetchNormalizedAsset(barcode);
        if (normalizedAsset && normalizedAsset.barcode !== '-') {
            // Auto-populate form fields
            const fieldMappings = {
                'f2_serial_no': normalizedAsset.serialNo || '',
                'f3_model_desc': normalizedAsset.modelDescription || normalizedAsset.model || '',
                'f4_asset_cond': normalizedAsset.condition || normalizedAsset.assetCondition || '',
                'f7_asset_desc': normalizedAsset.assetDescription || normalizedAsset.description || '',
                'f9_manufacturer': normalizedAsset.manufacturer || '',
                'f10_major_cat': normalizedAsset.majorCategory || '',
                'f12_sub_minor': normalizedAsset.subMinorCategory || '',
                'f15_category': normalizedAsset.category || '',
                'f16_class': normalizedAsset.minorCategory || normalizedAsset.classification || '',
                'f17_location': normalizedAsset.location || normalizedAsset.locationName || 'Abu Dhabi',
                'f19_school_building': normalizedAsset.schoolBuildingName || normalizedAsset.building || '',
                'f20_room_name': normalizedAsset.roomName || '',
                'f21_room_no': normalizedAsset.roomNo || normalizedAsset.roomNumber || '',
                'f23_floor_no': normalizedAsset.floorNo || '',
                'f24_floor_desc': normalizedAsset.floorDescription || normalizedAsset.floorDiscretion || '',
                'f30_vendor': normalizedAsset.vendor || normalizedAsset.assetVendorName || '',
                'f26_asset_stat': (normalizedAsset.assetStatus === 'Active' || normalizedAsset.assetStatus === 'Existing') ? 'Existing' : 'Not Existing',
                'f8_service_date': normalizedAsset.dateInService || normalizedAsset.datePlaceInService || '',
                'f36_phys_reg_no': normalizedAsset.physicalAssetRegisterNo || ''
            };

            Object.keys(fieldMappings).forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field) field.value = fieldMappings[fieldId];
            });

            // Set hidden barcode
            const hiddenBarcode = document.getElementById('a_asset_barcode_val');
            if (hiddenBarcode) hiddenBarcode.value = normalizedAsset.barcode;
        }
    } catch (e) {
        console.error("Audit lookup error:", e);
    }
};

// ================================================
// ASSET DISPOSAL - CORE LOGIC
// ================================================

// Helper to map asset data to the strict Admin headers (Handles both camelCase for Transfer and UPPER CASE for legacy Disposal)
const mapAssetToAdminRecord = (asset) => {
    return {
        // Required 14-15 Fields for Admin Tables (Explicit Mapping)
        assetBarcode: asset.barcode || asset.assetBarcode || "-",
        assetDescription: asset.description || asset.assetName || asset.assetDescription || "-",
        assetVendorName: asset.vendor || asset.assetVendor || asset.assetVendorName || "-",
        category: asset.category || asset.assetCategory || "-",
        datePlaceInService: asset.dateInService || asset.datePlaceInService || "-",
        floorDiscretion: asset.floorDescription || asset.floorDiscretion || "-",
        floorNo: asset.floorNo || "-",
        locationName: asset.location || asset.locationName || "-",
        majorCategory: asset.majorCategory || "-",
        minorCategory: asset.minorCategory || "-",
        schoolBuildingName: asset.building || asset.schoolBuildingName || "-",
        roomNumber: asset.roomNo || asset.roomNumber || "-",
        roomName: asset.roomName || "-",
        subMinorCategory: asset.subMinorCategory || "-",
        auditPhoto: asset.photoUrl || asset.auditPhoto || "N/A",

        // Extended metadata
        serialNo: asset.serialNo || "-",
        modelDescription: asset.model || "-",
        assetCondition: asset.condition || "-",
        assetStatus: asset.assetStatus || "Active",
        department: asset.department || "-",
        cost: asset._raw?.assetUnitCost || asset._raw?.cost || "-",
        specifications: asset._raw?.specifications || asset._raw?.remarks || "-",
        warrantyExpiry: asset._raw?.warrantyExpiry || asset._raw?.assetUsefulLife || "-",

        // Legacy compatibility (UPPER CASE)
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

const mapToDisposalRegistry = (asset) => {
    return mapAssetToAdminRecord(asset);
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
                const finalUrl = window.getDirectDriveImageUrl ? window.getDirectDriveImageUrl(disposalData["AUDIT PHOTO"]) : disposalData["AUDIT PHOTO"];
                mirrorImg.src = 'https://placehold.co/400x300/e2e8f0/64748b?text=...';
                window.getOrCacheImage(finalUrl).then(src => {
                    mirrorImg.src = src;
                    mirrorImg.classList.remove('hidden');
                });
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
                    const finalUrl = window.getDirectDriveImageUrl ? window.getDirectDriveImageUrl(photoUrl) : photoUrl;
                    auditPhotoArea.innerHTML = `
                        <div class="text-center w-full">
                            <span class="text-[10px] font-bold text-gray-500 uppercase block mb-1">Master Register Photo</span>
                            <img src="https://placehold.co/400x300/e2e8f0/64748b?text=..." id="disposal-master-photo-img" class="w-full h-32 object-cover rounded-2xl border border-gray-300 shadow-sm mx-auto">
                        </div>`;
                    auditPhotoArea.classList.remove('hidden');
                    window.getOrCacheImage(finalUrl).then(src => {
                        const img = document.getElementById('disposal-master-photo-img');
                        if (img) img.src = src;
                    });
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
    const destination = document.getElementById('disposal-destination-input')?.value?.trim();
    const disposalPhoto = window.disposalBeforePhotoBase64;

    if (!barcode) return alert("Error: Asset Barcode is required!");
    if (!reason) return alert("Error: Reason of Disposal is required!");
    if (!destination) return alert("Error: Disposal Destination is required!");
    if (!disposalPhoto) return alert("Error: Proof Photo is required!");

    try {
        const sanitizedKey = barcode.replace(/[.#$\[\]/]/g, '_');

        // 1. Upload Proof Photo
        let proofUrl = "N/A";
        if (window.uploadToDrive) {
            const res = await window.uploadToDrive({
                category: 'ASSET_LOGS',
                documentType: 'DisposalScrap',
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
            "DISPOSAL DESTINATION": destination,
            "DISPOSAL PHOTO": proofUrl,
            "DISPOSED BY NAME": staff.name || staff.fullName || "Unknown",
            "DISPOSED BY ROLE": staff.role || "Staff",
            "DISPOSAL DATE": now.toLocaleDateString(),
            "DISPOSAL TIME": now.toLocaleTimeString(),
            "STATUS": "DISPOSED",
            "TIMESTAMP": Date.now()
        };

        // ✅ MANDATED FIX: Database Migration (Atomic Update)
        const updates = {};

        // 4. Save to Disposed Assets Registry
        updates[`disposed_assets/${sanitizedKey}`] = payload;

        // 5. Update Master Assets Registry (Archive & Remove from Active view)
        updates[`assets/${sanitizedKey}/assetStatus`] = 'DISPOSED';
        updates[`assets/${sanitizedKey}/status`] = 'DISPOSED';
        updates[`assets/${sanitizedKey}/isDisposed`] = true;
        updates[`assets/${sanitizedKey}/isArchived`] = true;
        updates[`assets/${sanitizedKey}/deletedFromMaster`] = true;
        updates[`assets/${sanitizedKey}/isAvailable`] = false;
        updates[`assets/${sanitizedKey}/updatedAt`] = now.toISOString();
        updates[`assets/${sanitizedKey}/lastMovement`] = 'DISPOSAL';

        // 6. Record to Movement Logs
        const logId = push(ref(db, 'movement_logs')).key;
        updates[`movement_logs/${logId}`] = {
            assetBarcode: barcode,
            action: 'ASSET_DISPOSAL',
            performedBy: payload["DISPOSED BY NAME"],
            role: payload["DISPOSED BY ROLE"],
            timestamp: payload.TIMESTAMP,
            date: payload["DISPOSAL DATE"],
            type: 'disposal',
            proofPhoto: proofUrl,
            auditPhoto: payload.auditPhoto || "N/A"
        };

        await update(ref(db), updates);

        // ✅ Cache Sync: Update local app cache immediately
        if (window.appCache && Array.isArray(window.appCache.assets)) {
            window.appCache.assets = window.appCache.assets.map(a => {
                if (a.barcode === barcode || a.assetBarcode === barcode) {
                    return { ...a, status: 'DISPOSED', assetStatus: 'DISPOSED', isDisposed: true, isArchived: true, deletedFromMaster: true, isAvailable: false };
                }
                return a;
            });
        }
        // Re-trigger Master Table Filter & Render
        if (typeof window.filterAssetTable === 'function') window.filterAssetTable();

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
            modelDescription: document.getElementById('f3_model_desc')?.value.trim() || existingData.modelDescription || '',
            assetCondition: document.getElementById('f4_asset_cond')?.value.trim() || existingData.assetCondition || '',
            priceStatus: document.getElementById('f5_price_stat')?.value.trim() || existingData.priceStatus || '',
            assetUnitCost: document.getElementById('f6_unit_cost')?.value.trim() || existingData.assetUnitCost || '',
            assetDescription: document.getElementById('f7_asset_desc')?.value.trim() || existingData.assetDescription || '',
            datePlaceInService: document.getElementById('f8_service_date')?.value.trim() || existingData.datePlaceInService || '',
            manufacturer: document.getElementById('f9_manufacturer')?.value.trim() || existingData.manufacturer || '',
            majorCategory: document.getElementById('f10_major_cat')?.value.trim() || existingData.majorCategory || '',
            subMajorCategory: document.getElementById('f11_sub_major')?.value.trim() || existingData.subMajorCategory || '',
            subMinorCategory: document.getElementById('f12_sub_minor')?.value.trim() || existingData.subMinorCategory || '',
            dofMajor: document.getElementById('f13_dof_major')?.value.trim() || existingData.dofMajor || '',
            dofMinor: document.getElementById('f14_dof_minor')?.value.trim() || existingData.dofMinor || '',
            category: document.getElementById('f15_category')?.value.trim() || existingData.category || '',
            classification: document.getElementById('f16_class')?.value.trim() || existingData.classification || '',
            locationName: document.getElementById('f17_location')?.value.trim() || existingData.locationName || '',
            schoolBuildingName: document.getElementById('f19_school_building')?.value.trim() || existingData.schoolBuildingName || '',
            roomName: document.getElementById('f20_room_name')?.value.trim() || existingData.roomName || '',
            roomNo: document.getElementById('f21_room_no')?.value.trim() || existingData.roomNo || '',
            roomBarcode: document.getElementById('f22_room_barcode')?.value.trim() || existingData.roomBarcode || '',
            floorNo: document.getElementById('f23_floor_no')?.value.trim() || existingData.floorNo || '',
            floorDescription: document.getElementById('f24_floor_desc')?.value.trim() || existingData.floorDescription || '',
            barcodeStatus: document.getElementById('f25_barcode_stat')?.value.trim() || existingData.barcodeStatus || '',
            assetStatus: document.getElementById('f26_asset_stat')?.value.trim() || existingData.assetStatus || '',
            oldSchoolName: document.getElementById('f27_old_school')?.value.trim() || existingData.oldSchoolName || '',
            transactionNo: document.getElementById('f28_trans_no')?.value.trim() || existingData.transactionNo || '',
            assetUsefulLife: document.getElementById('f29_useful_life')?.value.trim() || existingData.assetUsefulLife || '',
            assetVendorName: document.getElementById('f30_vendor')?.value.trim() || existingData.assetVendorName || '',
            oldAssetBarcode: document.getElementById('f31_old_barcode')?.value.trim() || existingData.oldAssetBarcode || '',
            exitingOldAssetBarcodeFromFAR: document.getElementById('f32_far_barcode')?.value.trim() || existingData.exitingOldAssetBarcodeFromFAR || '',
            invoiceNo: document.getElementById('f33_invoice_no')?.value.trim() || existingData.invoiceNo || '',
            dnNo: document.getElementById('f34_dn_no')?.value.trim() || existingData.dnNo || '',
            remarks: document.getElementById('f35_remarks')?.value.trim() || existingData.remarks || '',
            physicalAssetRegisterNo: document.getElementById('f36_phys_reg_no')?.value.trim() || existingData.physicalAssetRegisterNo || '',
            fixedAssetRegisterNo: document.getElementById('f37_fixed_reg_no')?.value.trim() || existingData.fixedAssetRegisterNo || '',
            mappingCriteria: document.getElementById('f38_mapping')?.value.trim() || existingData.mappingCriteria || '',
            updatedAt: new Date().toISOString()
        };

        const photoInput = document.getElementById('f40_audit_photo_input');
        if (photoInput && photoInput.files && photoInput.files[0]) {
            const file = photoInput.files[0];
            const base64 = await window.compressImageFile(file, 800, 800, 0.7);
            if (window.uploadToDrive) {
                const res = await window.uploadToDrive({
                    category: 'ASSET_LOGS',
                    documentType: 'AuditPhoto',
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
    // REMOVED MIRROR RENDERING AS REQUESTED
    return;
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
            // ✅ MANDATED FIX: Full 14-15 Field Data Normalization
            const adminRecord = mapAssetToAdminRecord(normalizedAsset);
            window.transferBatch.push({
                ...normalizedAsset,
                ...adminRecord,
                // Ensure core keys are present for both templates
                barcode: normalizedAsset.barcode,
                assetName: adminRecord.assetDescription,
                location: adminRecord.locationName
            });

            window.renderBatchUI();
            input.value = "";
            window.triggerSuccessPopup("Asset Added! 📦");

            // Force focus reflow for mobile screen stability
            const batchContainer = document.getElementById('asset-batch-container');
            if (batchContainer) batchContainer.focus();
        } else {
            alert("Asset not found in register!");
        }
    } catch (e) {
        alert("Error looking up asset: " + e.message);
    }
};

window.renderBatchUI = () => {
    const tableBody = document.getElementById('transfer-batch-body');
    const mobileCards = document.getElementById('batch-mobile-cards');
    const emptyTable = document.getElementById('empty-batch-row');

    if (!tableBody) return;

    // 1. Check if batch is empty
    if (window.transferBatch.length === 0) {
        tableBody.innerHTML = `<tr id="empty-batch-row"><td colspan="8" class="p-8 text-center text-slate-400 font-bold">No assets added to batch yet.</td></tr>`;
        if (mobileCards) {
            mobileCards.innerHTML = `
                <div class="empty-state-card border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center text-slate-400 bg-slate-50/50">
                    <i class="fa-solid fa-box-open text-2xl text-slate-300 mb-1"></i>
                    <span class="block text-xs font-semibold">No assets added to batch yet.</span>
                </div>`;
        }
        return;
    }

    // 2. Clear empty states if data exists
    if (emptyTable) emptyTable.style.display = 'none';

    // 3. Render Desktop Table Rows
    tableBody.innerHTML = window.transferBatch.map((asset, index) => `
        <tr class="hover:bg-indigo-50/30 transition-colors border-b border-slate-100 text-[10px]">
            <td class="p-3 text-center font-bold text-slate-400">${index + 1}</td>
            <td class="p-3 font-mono font-bold text-indigo-600">${asset.barcode}</td>
            <td class="p-3 font-bold text-slate-700">${asset.assetName || asset.description}</td>
            <td class="p-3 font-bold text-slate-500">${asset.serialNo || '-'}</td>
            <td class="p-3 uppercase font-black text-slate-500">${asset.category}</td>
            <td class="p-3 font-bold text-slate-500">${asset.vendor || '-'}</td>
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

    // 4. Render Mobile Cards (Crucial Fix for Responsive Mirror)
    if (mobileCards) {
        mobileCards.innerHTML = window.transferBatch.map((asset, index) => `
            <div class="asset-mirror-item bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3 animate-fade-in relative overflow-hidden">
                <div class="absolute top-0 left-0 w-1.5 h-full bg-indigo-600"></div>
                <div class="flex justify-between items-start">
                    <div class="space-y-1">
                        <span class="text-[8px] font-black text-indigo-500 uppercase tracking-widest">Asset #${index + 1}</span>
                        <h4 class="text-xs font-black text-slate-900 uppercase">${asset.assetName || asset.description}</h4>
                        <p class="font-mono text-[10px] font-bold text-indigo-600">${asset.barcode}</p>
                    </div>
                    <div class="flex gap-2">
                        <button type="button" onclick="window.openAssetPreviewModal(decodeURIComponent('${encodeURIComponent(JSON.stringify(asset))}'))" class="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center active:scale-90 transition-all">
                            <i class="fa-solid fa-eye text-sm"></i>
                        </button>
                        <button type="button" onclick="window.removeAssetFromBatch(${index})" class="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center active:scale-90 transition-all">
                            <i class="fa-solid fa-trash-can text-sm"></i>
                        </button>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-3 pt-2 border-t border-slate-50">
                    <div class="space-y-0.5">
                        <span class="text-[8px] font-bold text-slate-400 uppercase">Serial No</span>
                        <p class="text-[9px] font-black text-slate-700">${asset.serialNo || '-'}</p>
                    </div>
                    <div class="space-y-0.5">
                        <span class="text-[8px] font-bold text-slate-400 uppercase">Category</span>
                        <p class="text-[9px] font-black text-slate-700 uppercase">${asset.category || '-'}</p>
                    </div>
                    <div class="space-y-0.5">
                        <span class="text-[8px] font-bold text-slate-400 uppercase">Vendor</span>
                        <p class="text-[9px] font-black text-slate-700 truncate">${asset.vendor || '-'}</p>
                    </div>
                    <div class="space-y-0.5">
                        <span class="text-[8px] font-bold text-slate-400 uppercase">Location</span>
                        <p class="text-[9px] font-black text-slate-700 truncate">${asset.location || '-'}</p>
                    </div>
                </div>
            </div>
        `).join('');
    }

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

    // FEEDBACK: Show spinner immediately while we validate
    if (typeof window.showGlobalSpinner === 'function') window.showGlobalSpinner("Validating Transfer...");

    const collectorName = document.getElementById('t_collector_name')?.value.trim();
    const companyName = document.getElementById('t_company_name')?.value.trim();
    const collectionDate = document.getElementById('t_collection_date')?.value;
    const destinationLocation = document.getElementById('t_destination_location')?.value?.trim() || document.getElementById('t_to_location')?.value?.trim();
    const securityName = document.getElementById('t_security_name')?.value?.trim() || "N/A";
    const receiverName = document.getElementById('t_received_name')?.value?.trim() || "N/A";

    // Detailed Validation
    const failValidation = (msg) => {
        if (typeof window.hideGlobalSpinner === 'function') window.hideGlobalSpinner();
        alert(msg);
        return false;
    };

    if (!collectorName) return failValidation("Missing Field: Collector Name");
    if (!companyName) return failValidation("Missing Field: Company Name");
    if (!collectionDate) return failValidation("Missing Field: Collection Date");
    if (!destinationLocation) return failValidation("Missing Field: Destination Location");
    if (securityName === "N/A" && !document.getElementById('t_security_name')) {
        // Allow
    } else if (!securityName || securityName === "N/A") {
        return failValidation("Missing Field: Security Name");
    }
    if (receiverName === "N/A" && !document.getElementById('t_received_name')) {
    } else if (!receiverName || receiverName === "N/A") {
        return failValidation("Missing Field: Receiver Name");
    }

    // Signatures
    const securitySig = window.getCanvasBase64 ? window.getCanvasBase64('t_security_sig') : null;
    const receivedSig = window.getCanvasBase64 ? window.getCanvasBase64('t_received_sig') : null;

    if (!securitySig || securitySig.length < 500) {
        return failValidation("Security signature is required.");
    }
    if (!receivedSig || receivedSig.length < 500) {
        return failValidation("Receiver signature is required.");
    }

    if (typeof window.showGlobalSpinner === 'function') window.showGlobalSpinner("Processing Transfer...");

    try {
        let photoUrl = "";
        if (transferPhotoBase64) {
            const res = await window.uploadToDrive({
                category: 'ASSET_LOGS',
                documentType: 'TransferProof',
                fileName: `Transfer_${Date.now()}.jpg`,
                image: transferPhotoBase64
            });
            if (res && res.status === 'success') photoUrl = res.fileUrl;
        }

        const staff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || '{}');
        const transferId = "TRF-" + Date.now();
        const now = new Date();
        const updates = {};

        // Process each asset in batch
        for (const asset of window.transferBatch) {
            const assetKey = asset.barcode.replace(/[.#$\[\]/]/g, '_');
            const transferRecordKey = `${transferId}_${assetKey}`;

            // Map ALL 14-15 Fields for history integrity
            const adminRecord = mapAssetToAdminRecord(asset);

            // 1. Create individual transfer record
            updates[`asset_transfers/${transferRecordKey}`] = {
                ...adminRecord,
                collectorName,
                companyName,
                collectionDate,
                destinationLocation,
                securityName,
                receivedName: receiverName,
                staffName: staff.fullName || staff.name || "Unknown",
                staffId: staff.mobile || "N/A",
                timestamp: Date.now(),
                proofPhoto: photoUrl, // Explicit key for dashboard
                securitySig: securitySig,
                receivedSig: receivedSig,
                status: 'Transferred'
            };

            // 2. Update Master Register State (Atomic)
            updates[`assets/${assetKey}/assetStatus`] = 'TRANSFERRED';
            updates[`assets/${assetKey}/status`] = 'TRANSFERRED';
            updates[`assets/${assetKey}/isTransferred`] = true;
            updates[`assets/${assetKey}/isAvailable`] = false;
            updates[`assets/${assetKey}/location`] = destinationLocation;
            updates[`assets/${assetKey}/currentLocation`] = destinationLocation;
            updates[`assets/${assetKey}/locationName`] = destinationLocation;
            updates[`assets/${assetKey}/lastTransferId`] = transferId;
            updates[`assets/${assetKey}/updatedAt`] = now.toISOString();

            // 3. Log to general movement logs
            const logId = push(ref(db, 'movement_logs')).key;
            updates[`movement_logs/${logId}`] = {
                assetBarcode: asset.barcode,
                action: 'Asset Batch Transfer',
                collector: collectorName,
                destination: destinationLocation,
                staff: staff.fullName || staff.name || "Unknown",
                timestamp: Date.now(),
                date: now.toLocaleDateString(),
                type: 'transfer',
                transferId: transferId
            };
        }

        await update(ref(db), updates);

        // ✅ Cache Sync: Update local app cache immediately
        if (window.appCache && Array.isArray(window.appCache.assets)) {
            const batchBarcodes = window.transferBatch.map(a => a.barcode);
            window.appCache.assets = window.appCache.assets.map(a => {
                if (batchBarcodes.includes(a.barcode) || batchBarcodes.includes(a.assetBarcode)) {
                    return { ...a, status: 'TRANSFERRED', assetStatus: 'TRANSFERRED', isTransferred: true, isAvailable: false, location: destinationLocation, currentLocation: destinationLocation, locationName: destinationLocation };
                }
                return a;
            });
        }

        // Update transfers cache locally for immediate UI update
        if (window.appCache && Array.isArray(window.appCache.transfers)) {
            const newTransfers = [];
            for (const asset of window.transferBatch) {
                const adminRecord = mapAssetToAdminRecord(asset);
                newTransfers.push({
                    ...adminRecord,
                    collectorName,
                    companyName,
                    collectionDate,
                    destinationLocation,
                    securityName,
                    receivedName: receiverName,
                    staffName: staff.fullName || staff.name || "Unknown",
                    staffId: staff.mobile || "N/A",
                    timestamp: Date.now(),
                    transferPhotoUrl: photoUrl,
                    securitySig: securitySig,
                    receivedSig: receivedSig,
                    status: 'Transferred'
                });
            }
            window.appCache.transfers = [...newTransfers, ...window.appCache.transfers];
        }

        // Re-trigger Tables Filter & Render
        if (typeof window.filterAssetTable === 'function') window.filterAssetTable();
        if (typeof window.renderStandardizedAssetTable === 'function') {
            window.renderStandardizedAssetTable(window.appCache.transfers, 'transfers');
        }

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

// ================================================
// MOVEMENT HISTORY HUB (v5.0 - PERSONAL ACTIVITY)
// ================================================

let movementPagination = {
    currentPage: 1,
    itemsPerPage: 8,
    filteredData: []
};

window.loadMovementLogs = async function() {
    const container = document.getElementById('movement-logs-container');
    if (!container) return;

    container.innerHTML = `
        <div class="col-span-full py-20 flex flex-col items-center gap-4 text-slate-400">
            <div class="w-12 h-12 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin"></div>
            <span class="text-[10px] font-black uppercase tracking-widest">Synchronizing History...</span>
        </div>
    `;

    try {
        const staff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || '{}');
        const isAdmin = staff.role === 'Admin' || staff.designation === 'Admin' || staff.mobile === '961486864461';

        const snap = await get(ref(db, 'movement_logs'));
        if (snap.exists()) {
            const logsData = snap.val();
            let allLogs = Object.values(logsData);

            // 1. Personal Filtering: Non-admins only see their own logs
            if (!isAdmin && staff.fullName) {
                allLogs = allLogs.filter(log => {
                    const staffName = (log.staff || log.staffName || log.performedBy || "").toLowerCase();
                    const currentName = staff.fullName.toLowerCase();
                    return staffName.includes(currentName);
                });
            }

            // Sort by timestamp descending
            allLogs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            window.allMovementLogs = allLogs;
            window.filterLogsByType('all'); // Trigger initial render
        } else {
            container.innerHTML = `
                <div class="col-span-full py-20 text-center space-y-3 opacity-30">
                    <i class="fa-solid fa-clock-rotate-left text-5xl text-slate-300"></i>
                    <p class="text-xs font-black uppercase tracking-widest text-slate-500">No activity logs found</p>
                </div>
            `;
        }
    } catch (e) {
        console.error("Error loading movement logs:", e);
        container.innerHTML = `<div class="col-span-full py-12 text-center text-red-500 font-bold text-xs">Error: ${e.message}</div>`;
    }
};

window.filterLogsByType = function(type) {
    // UI Update for tabs
    document.querySelectorAll('.log-filter-btn').forEach(btn => {
        if (btn.dataset.type === type) {
            btn.classList.add('active', 'bg-indigo-600', 'text-white');
            btn.classList.remove('bg-slate-100', 'text-slate-500');
        } else {
            btn.classList.remove('active', 'bg-indigo-600', 'text-white');
            btn.classList.add('bg-slate-100', 'text-slate-500');
        }
    });

    const searchTerm = document.getElementById('movement-log-search')?.value.toLowerCase() || '';

    movementPagination.filteredData = (window.allMovementLogs || []).filter(log => {
        const matchesType = type === 'all' || log.type === type;
        const stringified = JSON.stringify(log).toLowerCase();
        const matchesSearch = !searchTerm || stringified.includes(searchTerm);
        return matchesType && matchesSearch;
    });

    movementPagination.currentPage = 1;
    window.renderMovementCards();
};

window.renderMovementCards = function() {
    const container = document.getElementById('movement-logs-container');
    if (!container) return;

    const data = movementPagination.filteredData;
    const start = (movementPagination.currentPage - 1) * movementPagination.itemsPerPage;
    const end = start + movementPagination.itemsPerPage;
    const pageItems = data.slice(start, end);

    if (pageItems.length === 0) {
        container.innerHTML = `<div class="col-span-full py-20 text-center opacity-30 uppercase font-black text-[10px]">No matching records found</div>`;
        return;
    }

    container.innerHTML = pageItems.map((log, index) => {
        const type = log.type || 'activity';
        const typeLabel = type.toUpperCase();
        const dateStr = log.date || new Date(log.timestamp).toLocaleDateString();
        const timeStr = new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const proof = log.proofPhoto || log.disposalPhotoUrl || log.transferPhotoUrl || null;

        const typeColors = {
            transfer: 'bg-indigo-50 text-indigo-600 border-indigo-100',
            disposal: 'bg-red-50 text-red-600 border-red-100',
            audit: 'bg-emerald-50 text-emerald-600 border-emerald-100',
            activity: 'bg-slate-50 text-slate-600 border-slate-100'
        };
        const colorClass = typeColors[type] || typeColors.activity;

        return `
            <div class="group bg-white border border-slate-100 rounded-3xl p-4 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all cursor-pointer animate-fade-in relative overflow-hidden"
                 onclick="window.openAssetPreviewModal(decodeURIComponent('${encodeURIComponent(JSON.stringify(log))}'))">

                <div class="flex items-start justify-between mb-4">
                    <div class="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                        ${proof ? `<img src="https://placehold.co/100x100/e2e8f0/64748b?text=..." data-cache-src="${window.getDirectDriveImageUrl(proof)}" class="w-full h-full object-cover">` : `<i class="fa-solid fa-clock-rotate-left text-slate-300"></i>`}
                    </div>
                    <span class="px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${colorClass} border">
                        ${typeLabel}
                    </span>
                </div>

                <div class="space-y-1">
                    <div class="flex justify-between items-center">
                         <span class="text-[9px] font-black text-indigo-600 font-mono tracking-wider">${log.assetBarcode || 'SYSTEM'}</span>
                         <span class="text-[8px] font-bold text-slate-400 uppercase">${dateStr}</span>
                    </div>
                    <h4 class="text-xs font-black text-slate-900 uppercase truncate">${log.action || 'Logged Activity'}</h4>
                    <div class="flex items-center gap-1.5 pt-2">
                        <div class="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center text-[7px] font-bold text-slate-400">
                             <i class="fa-solid fa-user"></i>
                        </div>
                        <span class="text-[9px] font-bold text-slate-500 uppercase truncate">${log.staff || log.staffName || log.performedBy || 'System'}</span>
                    </div>
                </div>

                <div class="absolute bottom-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-all">
                    <i class="fa-solid fa-circle-chevron-right text-indigo-500 text-lg"></i>
                </div>
            </div>
        `;
    }).join('');

    // Update Pagination UI
    const totalPages = Math.ceil(data.length / movementPagination.itemsPerPage) || 1;
    const pageInfo = document.getElementById('log-page-info');
    const totalInfo = document.getElementById('log-total-info');
    if (pageInfo) pageInfo.innerText = `Page ${movementPagination.currentPage} / ${totalPages}`;
    if (totalInfo) totalInfo.innerText = `${data.length} records found`;

    const prevBtn = document.getElementById('prev-log-page');
    const nextBtn = document.getElementById('next-log-page');
    if (prevBtn) prevBtn.disabled = movementPagination.currentPage === 1;
    if (nextBtn) nextBtn.disabled = movementPagination.currentPage >= totalPages;

    if (window.lazyLoadCachedImages) window.lazyLoadCachedImages();
};

// Pagination Listeners
document.addEventListener('DOMContentLoaded', () => {
    const prevBtn = document.getElementById('prev-log-page');
    const nextBtn = document.getElementById('next-log-page');
    const searchInput = document.getElementById('movement-log-search');

    if (prevBtn) {
        prevBtn.onclick = () => {
            if (movementPagination.currentPage > 1) {
                movementPagination.currentPage--;
                window.renderMovementCards();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        };
    }

    if (nextBtn) {
        nextBtn.onclick = () => {
            const totalPages = Math.ceil(movementPagination.filteredData.length / movementPagination.itemsPerPage);
            if (movementPagination.currentPage < totalPages) {
                movementPagination.currentPage++;
                window.renderMovementCards();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        };
    }

    if (searchInput) {
        searchInput.oninput = () => {
            const activeTab = document.querySelector('.log-filter-btn.active')?.dataset.type || 'all';
            window.filterLogsByType(activeTab);
        };
    }
});

console.log("✅ audit_module.js ready - v5.0 Deployed");
