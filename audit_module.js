import { db } from './firebase_config.js';
import { ref, set, get, update, child } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- ASSET MODULE LOGIC ---
let currentRoomContext = null;
let currentAuditSessionAssets = [];
let html5QrCode = null;
let currentScanTarget = null;
let activeDisposalBarcode = null;
let disposalPhotoBase64 = "";
let initialAuditPhotoBase64 = "";
let damageAuditPhotoBase64 = "";
let assetTemplates = {};

// --- MASTER TEMPLATE LOGIC ---
window.toggleTemplateMode = async () => {
    const isChecked = document.getElementById('use-template-toggle').checked;
    const select = document.getElementById('master-template-select');
    const preview = document.getElementById('template-photo-preview');
    const uploadBtn = document.querySelector('button[onclick*="f40_audit_photo_input"]');

    if (isChecked) {
        select.classList.remove('hidden');
        uploadBtn.classList.add('hidden');
        // Fetch templates from DB
        const snap = await get(ref(db, 'asset_templates'));
        if (snap.exists()) {
            assetTemplates = snap.val();
            select.innerHTML = '<option value="">Select Category Model...</option>';
            Object.keys(assetTemplates).forEach(cat => {
                select.innerHTML += `<option value="${cat}">${cat}</option>`;
            });
        }
    } else {
        select.classList.add('hidden');
        preview.classList.add('hidden');
        uploadBtn.classList.remove('hidden');
    }
};

window.previewTemplatePhoto = () => {
    const cat = document.getElementById('master-template-select').value;
    const preview = document.getElementById('template-photo-preview');
    if (cat && assetTemplates[cat]) {
        preview.classList.remove('hidden');
        preview.querySelector('img').src = window.getDirectDriveImageUrl(assetTemplates[cat]);
    } else {
        preview.classList.add('hidden');
    }
};

window.handleInitialAuditPhoto = async (e) => {
    try {
        const file = e.target.files[0];
        if (!file) return;
        const btnText = document.getElementById('audit-photo-btn-text');
        if (btnText) btnText.innerText = "Compressing...";
        initialAuditPhotoBase64 = await window.compressImageFile(file, 1000, 1000, 0.7);
        const preview = document.getElementById('audit-photo-preview');
        if (preview) {
            preview.classList.remove('hidden');
            preview.querySelector('img').src = initialAuditPhotoBase64;
        }
        if (btnText) btnText.innerText = "Captured ✓";
    } catch (e) { console.error(e); }
};

window.removeInitialAuditPhoto = () => {
    initialAuditPhotoBase64 = "";
    const input = document.getElementById('f40_audit_photo_input');
    if (input) input.value = "";
    const preview = document.getElementById('audit-photo-preview');
    if (preview) preview.classList.add('hidden');
    const btnText = document.getElementById('audit-photo-btn-text');
    if (btnText) btnText.innerText = "Capture Asset Photo";
};

window.openAssetAudit = () => {
    try {
        const dash = document.getElementById('staff-dash-area');
        const audit = document.getElementById('asset-audit-section');
        if (dash) dash.classList.add('hidden');
        if (audit) audit.classList.remove('hidden');
        window.generatePhysRegNo();
    } catch (e) { console.error(e); }
};

window.closeAssetAudit = () => {
    try {
        const dash = document.getElementById('staff-dash-area');
        const audit = document.getElementById('asset-audit-section');
        if (dash) dash.classList.remove('hidden');
        if (audit) audit.classList.add('hidden');
    } catch (e) { console.error(e); }
};

window.toggleAccordion = (sectionId) => {
    const content = document.getElementById(`${sectionId}-content`);
    const icon = document.getElementById(`${sectionId}-icon`);
    if (!content) return;
    const isHidden = content.classList.contains('hidden');
    if (isHidden) {
        content.classList.remove('hidden');
        icon.classList.replace('fa-chevron-right', 'fa-chevron-down');
    } else {
        content.classList.add('hidden');
        icon.classList.replace('fa-chevron-down', 'fa-chevron-right');
    }
};

window.generatePhysRegNo = async () => {
    try {
        const snap = await get(ref(db, 'assets'));
        let count = 1;
        if (snap.exists()) {
            count = Object.keys(snap.val()).length + 1;
        }
        const no = "JYS-" + count.toString().padStart(4, '0');
        const el = document.getElementById('f36_phys_reg_no');
        if (el) el.value = no;
    } catch (e) { console.error(e); }
};

// --- CAMERA SCANNER LOGIC ---
// --- AUDIT UPDATE LOGIC ---
let activeAuditBarcode = null;

window.handleAuditConditionChange = () => {
    const condition = document.getElementById('audit-condition-select').value;
    const photoArea = document.getElementById('damage-photo-area');
    if (condition === 'BROKEN / DAMAGED') {
        photoArea.classList.remove('hidden');
    } else {
        photoArea.classList.add('hidden');
        damageAuditPhotoBase64 = "";
        document.getElementById('damage-photo-preview').classList.add('hidden');
    }
};

window.handleDamagePhotoCapture = async (e) => {
    try {
        const file = e.target.files[0];
        if (!file) return;
        const btnText = document.getElementById('damage-btn-text');
        if (btnText) btnText.innerText = "Compressing...";
        damageAuditPhotoBase64 = await window.compressImageFile(file, 1000, 1000, 0.7);
        const preview = document.getElementById('damage-photo-preview');
        if (preview) {
            preview.classList.remove('hidden');
            preview.querySelector('img').src = damageAuditPhotoBase64;
        }
        if (btnText) btnText.innerText = "Damage Photo Captured ✓";
    } catch (e) { console.error(e); }
};

window.submitAuditUpdate = async () => {
    if (!activeAuditBarcode) return;
    const condition = document.getElementById('audit-condition-select').value;
    const btn = document.getElementById('submit-audit-update-btn');

    if (condition === 'BROKEN / DAMAGED' && !damageAuditPhotoBase64) {
        return alert("Photo of damage is mandatory!");
    }

    btn.disabled = true;
    btn.innerText = "UPDATING AUDIT...";

    try {
        let damageUrl = "";
        if (damageAuditPhotoBase64) {
            const res = await window.uploadToDrive({
                type: 'disposed_asset',
                fileName: `AuditDamage_${activeAuditBarcode}.jpg`,
                image: damageAuditPhotoBase64
            });
            damageUrl = res.fileUrl || res.signatureUrl;
        }

        const updates = {
            assetCondition: condition,
            lastAuditTimestamp: new Date().toLocaleString(),
            lastAuditBy: window.currentStaff ? window.currentStaff.name : "System"
        };

        if (damageUrl) {
            updates.disposalDamagedPhoto = damageUrl;
            updates.afterPhotoUrl = damageUrl;
        }

        await update(ref(db, `assets/${activeAuditBarcode}`), updates);
        alert("Audit status updated successfully!");
        window.checkDuplicateBarcode(activeAuditBarcode); // Refresh preview
    } catch (e) { alert("Error: " + e.message); }
    finally {
        btn.disabled = false;
        btn.innerText = "SAVE AUDIT STATUS";
    }
};

window.checkDuplicateBarcode = async (barcode) => {
    const val = barcode ? barcode.trim() : "";
    const previewContainer = document.getElementById('duplicate-asset-preview');
    const contentArea = document.getElementById('duplicate-card-content');
    const submitBtn = document.querySelector('#master-asset-form button[type="submit"]');

    if (!val) {
        if (previewContainer) previewContainer.classList.add('hidden');
        if (submitBtn) submitBtn.disabled = false;
        activeAuditBarcode = null;
        return;
    }

    try {
        const snap = await get(child(ref(db), `assets/${val}`));
        if (snap.exists()) {
            const a = snap.val();
            activeAuditBarcode = val;
            if (submitBtn) submitBtn.disabled = true;
            if (previewContainer) {
                previewContainer.classList.remove('hidden');

                const photoUrl = window.getDirectDriveImageUrl(a.auditPhotoUrl || a.audit_photo || a.beforePhotoUrl || a.photoUrl ||
                               (a.initialAuditPhoto ? (typeof a.initialAuditPhoto === 'object' ? a.initialAuditPhoto.fileUrl : a.initialAuditPhoto) : null));

                // Element Assignments
                document.getElementById('dup-photo').src = photoUrl;
                document.getElementById('dup-name').innerText = a.assetDescription || a.modelDescription || 'Unnamed Asset';
                document.getElementById('dup-cat').innerText = `${a.majorCategory || '-'} | ${a.classification || '-'}`;
                document.getElementById('dup-serial').innerText = a.serialNo || a.serialNumber || '-';
                document.getElementById('dup-loc').innerText = `${a.buildingName || a.schoolName || '-'} / ${a.roomNo || a.roomName || '-'}`;
                document.getElementById('dup-date').innerText = a.auditTimestamp || a.registeredDate || '-';
                document.getElementById('dup-by').innerText = a.auditBy || a.staffName || '-';

                // Reset Condition UI
                document.getElementById('audit-condition-select').value = a.assetCondition || "GOOD";
                window.handleAuditConditionChange();
            }
        } else {
            if (previewContainer) previewContainer.classList.add('hidden');
            if (submitBtn) submitBtn.disabled = false;
            activeAuditBarcode = null;
        }
    } catch (e) { console.error("Duplicate check error:", e); }
};

window.startCameraScanner = async (inputId) => {
    try {
        currentScanTarget = inputId;
        const modal = document.getElementById('scanner-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
        }

        if (!html5QrCode) {
            // @ts-ignore
            html5QrCode = new Html5Qrcode("scanner-container");
        }

        // Optimization: Use rear camera by default for mobile
        const config = { fps: 15, qrbox: { width: 250, height: 180 } };

        await html5QrCode.start(
            { facingMode: "environment" },
            config,
            async (decodedText) => {
                try {
                    console.log("Scan Success:", decodedText);
                    const input = document.getElementById(currentScanTarget);
                    if (input) {
                        input.value = decodedText.trim().toUpperCase();

                        // Instantly trigger search logic
                        if (currentScanTarget === 'f1_disposal_barcode_input') {
                            window.fetchDisposalAssetDetails(input.value);
                        } else if (currentScanTarget === 'f1_asset_barcode') {
                            await window.checkDuplicateBarcode(input.value);
                        } else if (currentScanTarget === 't_asset_barcode') {
                            window.fetchTransferAssetDetails(input.value);
                        }
                    }

                    // AUTO-CLOSE: Return to form immediately after successful scan
                    window.stopCameraScanner();

                } catch (e) { console.error("Scan processing error:", e); }
            },
            () => {}
        );
    } catch (err) {
        console.error("Scanner Start Error:", err);
        alert("Camera Error: Access denied or camera not found.");
        window.stopCameraScanner();
    }
};

window.stopCameraScanner = async () => {
    try {
        if (html5QrCode && html5QrCode.isScanning) {
            await html5QrCode.stop();
        }
    } catch (e) { console.error("Scanner Stop Error:", e); }
    const modal = document.getElementById('scanner-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

window.fetchRoomDetails = async (roomBarcode) => {
    try {
        const snap = await get(child(ref(db), `rooms/${roomBarcode}`));
        if (snap.exists()) {
            const data = snap.val();
            const rNo = document.getElementById('f21_room_no');
            const bNm = document.getElementById('f19_school_building');
            const fNo = document.getElementById('f23_floor_no');
            if (rNo) rNo.value = data.roomNo || "";
            if (bNm) bNm.value = data.buildingName || "";
            if (fNo) fNo.value = data.floorNo || "";
        }
    } catch (e) { console.error(e); }
};

// --- FORM SUBMISSION ---
const masterAssetForm = document.getElementById('master-asset-form');
if (masterAssetForm) {
    masterAssetForm.onsubmit = async (e) => {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerText = "SAVING...";

        try {
            const barcode = document.getElementById('f1_asset_barcode').value.trim();
            if (!barcode) return alert("Asset Barcode is mandatory!");

            const assetData = {
                assetBarcode: barcode,
                serialNo: document.getElementById('f2_serial_no').value,
                modelDescription: document.getElementById('f3_model_desc').value,
                assetCondition: document.getElementById('f4_asset_cond').value,
                priceStatus: document.getElementById('f5_price_stat').value,
                unitCost: document.getElementById('f6_unit_cost').value,
                assetDescription: document.getElementById('f7_asset_desc').value,
                serviceDate: document.getElementById('f8_service_date').value,
                manufacturer: document.getElementById('f9_manufacturer').value,
                majorCategory: document.getElementById('f10_major_cat').value,
                subMajorCategory: document.getElementById('f11_sub_major').value,
                subMinorCategory: document.getElementById('f12_sub_minor').value,
                dofMajor: document.getElementById('f13_dof_major').value,
                dofMinor: document.getElementById('f14_dof_minor').value,
                category: document.getElementById('f15_category').value,
                classification: document.getElementById('f16_class').value,
                locationName: document.getElementById('f17_location').value,
                esisId: document.getElementById('f18_esis').value,
                buildingName: document.getElementById('f19_school_building').value,
                roomName: document.getElementById('f20_room_name').value,
                roomNo: document.getElementById('f21_room_no').value,
                currentRoomBarcode: document.getElementById('f22_room_barcode').value,
                floorNo: document.getElementById('f23_floor_no').value,
                floorDescription: document.getElementById('f24_floor_desc').value,
                barcodeStatus: document.getElementById('f25_barcode_stat').value,
                assetStatus: document.getElementById('f26_asset_stat').value,
                oldSchoolName: document.getElementById('f27_old_school').value,
                transactionNo: document.getElementById('f28_trans_no').value,
                usefulLife: document.getElementById('f29_useful_life').value,
                vendorName: document.getElementById('f30_vendor').value,
                oldBarcode: document.getElementById('f31_old_barcode').value,
                farBarcode: document.getElementById('f32_far_barcode').value,
                invoiceNo: document.getElementById('f33_invoice_no').value,
                dnNo: document.getElementById('f34_dn_no').value,
                remarks: document.getElementById('f35_remarks').value,
                physRegNo: document.getElementById('f36_phys_reg_no').value,
                fixedAssetRegNo: document.getElementById('f37_fixed_reg_no').value,
                mappingCriteria: document.getElementById('f38_mapping').value,
                initialAuditPhoto: null,
                auditTimestamp: new Date().toLocaleString(),
                auditBy: window.currentStaff ? window.currentStaff.name : "Unknown"
            };

            if (initialAuditPhotoBase64) {
                submitBtn.innerText = "UPLOADING PHOTO...";
                const result = await window.uploadToDrive({
                    action: "upload",
                    type: "active_asset",
                    fileName: `${barcode}_AFTER.jpg`,
                    image: initialAuditPhotoBase64
                });
                if (result.status === 'success' && result.fileUrl) {
                    console.log("UPLOAD_DEBUG", "Extracted URL: " + result.fileUrl);
                    const fileUrl = result.fileUrl;

                    // Standardized Keys as direct strings for Dashboard Rendering
                    assetData.initialAuditPhoto = fileUrl;
                    assetData.auditPhotoUrl = fileUrl;
                    assetData.audit_photo = fileUrl;
                    assetData.beforePhotoUrl = fileUrl;
                    assetData.photoUrl = fileUrl;

                    // Optional: keep fileId for deletion logic if needed in a separate field
                    assetData.initialAuditPhotoData = {
                        fileId: result.fileId,
                        fileUrl: fileUrl
                    };
                } else if (result.status === 'success') {
                    console.error("UPLOAD_DEBUG", "Success but fileUrl is missing in response");
                }
            }

            console.log("UPLOAD_DEBUG", "Database Update Path: assets/" + barcode);
            await update(ref(db, `assets/${barcode}`), assetData);
            alert("Asset Registered Successfully!");
            e.target.reset();
            window.removeInitialAuditPhoto();
            window.generatePhysRegNo();
        } catch (err) {
            alert("Error saving asset: " + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = "SAVE ASSET REGISTER (AUDIT)";
        }
    };
}

// Compatibility features
window.resetRoomContext = () => {
    try {
        const rDisplay = document.getElementById('current-room-display');
        if (rDisplay) rDisplay.classList.add('hidden');
    } catch (e) {}
};

// --- DISPOSAL MODULE ---
window.openDisposalModal = async (barcode) => {
    activeDisposalBarcode = (barcode || "").trim().toUpperCase();
    const input = document.getElementById('f1_disposal_barcode_input'); // The actual input

    if (input) {
        input.value = activeDisposalBarcode;
    }

    const modal = document.getElementById('asset-disposal-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }

    // Reset UI state for fresh manual entry
    if (!barcode) {
        const previewArea = document.getElementById('disposal-asset-preview');
        if (previewArea) previewArea.innerHTML = '<p class="text-xs text-gray-400 italic text-center p-4">Enter a barcode to see details</p>';
        const submitBtn = document.getElementById('submit-disposal-btn');
        if (submitBtn) submitBtn.disabled = true;
    }

    // If barcode is provided (e.g. from scanner or direct action), fetch details immediately
    if (activeDisposalBarcode) {
        window.fetchDisposalAssetDetails(activeDisposalBarcode);
    }
};

window.fetchDisposalAssetDetails = async (barcode) => {
    const previewArea = document.getElementById('disposal-asset-preview');
    const submitBtn = document.getElementById('submit-disposal-btn');
    if (!previewArea) return;

    if (!barcode || barcode.trim() === "") {
        previewArea.innerHTML = '<p class="text-xs text-gray-400 italic text-center p-4">Enter a barcode to see details</p>';
        if (submitBtn) submitBtn.disabled = true;
        return;
    }

    const cleanBC = barcode.trim().toUpperCase();
    previewArea.innerHTML = '<div class="p-4 text-center"><i class="fa-solid fa-spinner fa-spin text-indigo-600"></i><p class="text-[10px] mt-1">Searching...</p></div>';

    try {
        // Robust Multi-Field Search
        let asset = null;

        // 1. Direct Hit by Key
        const snap = await get(child(ref(db), `assets/${cleanBC}`));
        if (snap.exists()) {
            asset = snap.val();
        } else if (window.appCache && window.appCache.assets) {
            // 2. Search by Aliases in Cache
            asset = window.appCache.assets.find(a =>
                String(a.assetBarcode || "").toUpperCase() === cleanBC ||
                String(a['Asset Barcode'] || "").toUpperCase() === cleanBC ||
                String(a['1. Asset Barcode'] || "").toUpperCase() === cleanBC ||
                String(a.barcode || "").toUpperCase() === cleanBC ||
                String(a.serialNo || "").toUpperCase() === cleanBC ||
                String(a['Serial No'] || "").toUpperCase() === cleanBC
            );
        }

        if (asset) {
            // Extract Rich Metadata
            const name = asset.classification || asset['Classification'] || asset['Classification (Aset Name)'] || asset.modelDescription || asset['Model Description'] || asset.assetDescription || asset.minorCategory || "Unnamed Asset";
            const location = asset.locationName || asset['Location Name'] || asset.buildingName || asset.schoolName || asset.roomNo || asset.roomName || "N/A";
            const cat = asset.majorCategory || asset.minorCategory || "Asset Record Found";
            const photoUrl = window.getDirectDriveImageUrl(asset.auditPhotoUrl || asset.audit_photo || asset.beforePhotoUrl || asset.photoUrl || asset.initialAuditPhoto);

            previewArea.innerHTML = `
                <div class="flex items-center gap-4 p-3 bg-indigo-50/50 rounded-2xl border border-indigo-100 shadow-sm animate-fade-in">
                    <div class="w-16 h-16 bg-white rounded-xl overflow-hidden border border-indigo-100 flex-shrink-0">
                        ${photoUrl && photoUrl.includes('http') ? `<img src="${photoUrl}" class="w-full h-full object-cover" alt="Asset Preview">` : '<div class="w-full h-full flex items-center justify-center text-[8px] text-gray-300">No Image</div>'}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-[9px] font-black text-indigo-400 uppercase tracking-widest">${cat}</p>
                        <h4 class="text-xs font-bold text-indigo-900 truncate">${name}</h4>
                        <p class="text-[10px] text-gray-500 mt-0.5 truncate"><i class="fa-solid fa-location-dot mr-1"></i>${location}</p>
                    </div>
                    <div class="bg-green-100 text-green-600 px-2 py-1 rounded-lg">
                        <i class="fa-solid fa-check-circle text-xs"></i>
                    </div>
                </div>
            `;
            activeDisposalBarcode = cleanBC;
            if (submitBtn) submitBtn.disabled = false;

            // Store original metadata for disposal payload
            window.activeDisposalAssetData = {
                assetName: name,
                assetType: asset.majorCategory || "N/A",
                originalLocation: location
            };

        } else {
            previewArea.innerHTML = `
                <div class="flex items-center gap-3 p-3 bg-red-50 rounded-2xl border border-red-100 shadow-sm">
                    <div class="w-10 h-10 bg-red-100 text-red-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                    </div>
                    <div>
                        <h4 class="text-[11px] font-black text-red-900 uppercase">Asset Tag Not Registered</h4>
                        <p class="text-[9px] text-red-500 font-medium">Verify barcode or contact Admin</p>
                    </div>
                </div>
            `;
            if (submitBtn) submitBtn.disabled = true;
            window.activeDisposalAssetData = null;
        }
    } catch (e) {
        console.error("Disposal Detail Fetch Error:", e);
        previewArea.innerHTML = '<p class="text-xs text-red-500 text-center p-4">Search failed</p>';
    }
};

window.removeDisposalPhoto = () => {
    disposalPhotoBase64 = "";
    const input = document.getElementById('disposal-photo-input');
    if (input) input.value = "";
    const preview = document.getElementById('disposal-photo-preview');
    if (preview) preview.classList.add('hidden');
    const btnText = document.getElementById('disposal-photo-btn-text');
    if (btnText) btnText.innerText = "Take Damage Photo";
};

// --- BIND REAL-TIME LISTENER ON STARTUP ---
document.addEventListener('DOMContentLoaded', () => {
    const bcInput = document.getElementById('f1_disposal_barcode_input');
    if (bcInput) {
        bcInput.addEventListener('input', (e) => {
            const val = e.target.value.trim().toUpperCase();
            // Debounce or instant search
            window.fetchDisposalAssetDetails(val);
        });
    }
});

window.closeDisposalModal = () => {
    const modal = document.getElementById('asset-disposal-modal');
    if (modal) modal.classList.add('hidden');
    activeDisposalBarcode = null;
    disposalPhotoBase64 = "";
    const preview = document.getElementById('disposal-photo-preview');
    const btnText = document.getElementById('disposal-photo-btn-text');
    if (preview) preview.classList.add('hidden');
    if (btnText) btnText.innerText = "Take Damage Photo";
};

window.handleDisposalPhoto = async (e) => {
    try {
        const file = e.target.files[0];
        if (!file) return;
        const btnText = document.getElementById('disposal-photo-btn-text');
        if (btnText) btnText.innerText = "Compressing...";
        disposalPhotoBase64 = await window.compressImageFile(file, 1000, 1000, 0.7);
        const preview = document.getElementById('disposal-photo-preview');
        if (preview) {
            preview.classList.remove('hidden');
            preview.querySelector('img').src = disposalPhotoBase64;
        }
        if (btnText) btnText.innerText = "Damage Photo Captured ✓";
    } catch (e) { console.error(e); }
};

window.submitAssetDisposal = async () => {
    try {
        const reason = document.getElementById('disposal-reason').value;
        const scrapLoc = document.getElementById('disposal-scrap-loc').value;
        if (!reason || !scrapLoc || !disposalPhotoBase64) return alert("Photo and details required!");

        const btn = document.getElementById('submit-disposal-btn');
        if (btn) { btn.disabled = true; btn.innerText = "Uploading Proof Photo..."; }

        // 1. ENSURE RELIABLE IMAGE UPLOAD
        const result = await window.uploadToDrive({
            action: "upload",
            type: "disposed_asset",
            fileName: `DISPOSAL_${activeDisposalBarcode}_${Date.now()}.jpg`,
            image: disposalPhotoBase64
        });

        if (result.status !== 'success' || !result.fileUrl) {
            throw new Error(result.message || "Upload failed or URL missing");
        }

        // 2. CONSTRUCT COMPLETE METADATA PAYLOAD
        const now = new Date();
        const assetInfo = window.activeDisposalAssetData || {};

        const disposalData = {
            assetBarcode: activeDisposalBarcode,
            assetName: assetInfo.assetName || "-",
            assetType: assetInfo.assetType || "-",
            originalLocation: assetInfo.originalLocation || "-",
            assetStatus: 'Disposed',
            disposalReason: reason,
            scrapLocation: scrapLoc,
            disposalPhotoUrl: result.fileUrl,
            reportedBy: window.currentStaff ? window.currentStaff.name : "System",
            reportedRole: window.currentStaff ? window.currentStaff.role : "Admin",
            date: now.toISOString().split('T')[0],
            time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
            timestamp: Date.now()
        };

        // 3. FETCH EXISTING FULL RECORD TO PRESERVE 39 COLUMNS
        const assetSnap = await get(child(ref(db), `assets/${activeDisposalBarcode}`));
        const existingData = assetSnap.exists() ? assetSnap.val() : {};

        // Final merged record
        const finalPayload = { ...existingData, ...disposalData };

        // 4. PUSH TO DISPOSED_ASSETS (As requested) and update /assets
        const updates = {};
        updates[`assets/${activeDisposalBarcode}`] = finalPayload;
        updates[`disposed_assets/${activeDisposalBarcode}`] = finalPayload;

        console.log("Saving Comprehensive Disposal Record...");
        await update(ref(db), updates);

        // --- MULTI-CAST NOTIFICATION: ASSET DISPOSAL (CRITICAL) ---
        if (typeof window.triggerMultiRoleNotification === 'function') {
            const adekId = window.currentStaff ? (window.currentStaff.adekPass || window.currentStaff.adcPassNumber) : "System";
            window.triggerMultiRoleNotification({
                title: `Asset Disposed - ${disposalData.assetName || activeDisposalBarcode}`,
                body: `User: ${disposalData.reportedBy} (${adekId}) | Location: ${disposalData.scrapLocation} | Time: ${disposalData.time}`,
                image: disposalData.disposalPhotoUrl,
                roles: ["Admin", "Security"], // Multi-cast to Admin and Security
                tag: "asset-disposal",
                icon: "fa-trash-can",
                url: "/JYSLOGINPORTAL/admin.html"
            });
        }

        alert("Asset marked as Disposed. Record synchronized with metadata and photo proof.");
        closeDisposalModal();

        // Force refresh
        if (window.appCache) window.appCache.isInitialized = false;
        if (typeof window.loadAdminDashboard === 'function') window.loadAdminDashboard();

    } catch (err) {
        console.error("Disposal Submit Error:", err);
        alert("CRITICAL ERROR: " + err.message);
    }
    finally {
        const btn = document.getElementById('submit-disposal-btn');
        if (btn) { btn.disabled = false; btn.innerText = "Confirm Scrap"; }
    }
};

window.openDirectDisposal = async () => {
    try {
        // REPLACED: prompt() removed. Now opens a custom modal with input and scanner icon.
        window.openDisposalModal("");
    } catch (e) { console.error(e); }
};

// --- BULK DELETE LOGIC ---
window.toggleAllAssetCheckboxes = (master) => {
    const checkboxes = document.querySelectorAll('.asset-checkbox');
    checkboxes.forEach(cb => cb.checked = master.checked);
};

window.bulkDeleteAssets = async () => {
    const selected = document.querySelectorAll('.asset-checkbox:checked');
    if (selected.length === 0) return alert("Please select assets to delete.");

    if (!confirm(`Are you sure you want to PERMANENTLY delete ${selected.length} selected assets and their photos?`)) return;

    const btn = document.querySelector('button[onclick="window.bulkDeleteAssets()"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting...';

    try {
        const updates = {};
        for (const cb of selected) {
            const barcode = cb.value;
            // Get data first for photo deletion
            const snap = await get(ref(db, `assets/${barcode}`));
            if (snap.exists()) {
                const data = snap.val();
                if (data.initialAuditPhotoData && data.initialAuditPhotoData.fileId) {
                    await window.uploadToDrive({ action: "delete", fileId: data.initialAuditPhotoData.fileId }).catch(e => console.error("Photo delete error:", e));
                }
                if (data.disposalPhotoData && data.disposalPhotoData.fileId) {
                    await window.uploadToDrive({ action: "delete", fileId: data.disposalPhotoData.fileId }).catch(e => console.error("Photo delete error:", e));
                }
            }
            updates[`assets/${barcode}`] = null;
        }

        await update(ref(db), updates);
        alert(`Successfully deleted ${selected.length} assets.`);
        if (typeof window.loadAdminDashboard === 'function') window.loadAdminDashboard();
    } catch (err) {
        alert("Error during bulk delete: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        const masterCb = document.querySelector('.selectAllAssets');
        if (masterCb) masterCb.checked = false;
    }
};

// Admin UI Components
// --- ASSET TRANSFER MODULE ---
window.openAssetTransfer = (barcode) => {
    try {
        const dash = document.getElementById('staff-dash-area');
        const transferSection = document.getElementById('asset-transfer-section');
        if (dash) dash.classList.add('hidden');
        if (transferSection) transferSection.classList.remove('hidden');

        if (barcode) {
            const bcInput = document.getElementById('t_asset_barcode');
            if (bcInput) {
                bcInput.value = barcode.toUpperCase();
                window.fetchTransferAssetDetails(barcode);
            }
        }
    } catch (e) { console.error(e); }
};

window.closeAssetTransfer = () => {
    try {
        const dash = document.getElementById('staff-dash-area');
        const transferSection = document.getElementById('asset-transfer-section');
        if (dash) dash.classList.remove('hidden');
        if (transferSection) transferSection.classList.add('hidden');
    } catch (e) { console.error(e); }
};

window.fetchTransferAssetDetails = async (barcode) => {
    const previewArea = document.getElementById('transfer-asset-preview');
    if (!previewArea || !barcode) return;

    const cleanBC = barcode.trim().toUpperCase();
    previewArea.innerHTML = '<div class="p-2 text-center"><i class="fa-solid fa-spinner fa-spin"></i></div>';

    try {
        const snap = await get(child(ref(db), `assets/${cleanBC}`));
        if (snap.exists()) {
            const a = snap.val();
            const name = a.assetDescription || a.modelDescription || 'Unnamed Asset';
            const location = a.locationName || a.buildingName || 'Unknown';
            const photoUrl = window.getDirectDriveImageUrl(a.auditPhotoUrl || a.photoUrl);

            previewArea.innerHTML = `
                <div class="flex items-center gap-3 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100">
                    <img src="${photoUrl}" class="w-12 h-12 object-cover rounded-lg border">
                    <div class="flex-1 min-w-0">
                        <h4 class="text-xs font-bold text-indigo-900 truncate">${name}</h4>
                        <p class="text-[9px] text-gray-500 truncate"><i class="fa-solid fa-location-dot mr-1"></i>${location}</p>
                    </div>
                </div>
            `;
            window.activeTransferAsset = a;
        } else {
            previewArea.innerHTML = '<p class="text-[10px] text-red-500 p-2">Asset Not Found</p>';
            window.activeTransferAsset = null;
        }
    } catch (e) { console.error(e); }
};

window.submitAssetTransfer = async () => {
    const barcode = document.getElementById('t_asset_barcode').value.trim();
    const toLocation = document.getElementById('t_to_location').value.trim();
    const reason = document.getElementById('t_reason').value.trim();

    if (!barcode || !toLocation) return alert("Barcode and Destination are required!");
    if (!window.activeTransferAsset) return alert("Please select a valid asset first.");

    const btn = document.getElementById('submit-transfer-btn');
    btn.disabled = true;
    btn.innerText = "PROCESSING...";

    try {
        const staff = window.currentStaff;
        const adekId = staff.adekPass || staff.adcPassNumber || "Unknown";
        const now = new Date();
        const transferId = "TRF-" + Date.now();

        const transferData = {
            transferId,
            assetBarcode: barcode,
            assetName: window.activeTransferAsset.assetDescription || "-",
            serialNo: window.activeTransferAsset.serialNo || "-",
            category: window.activeTransferAsset.majorCategory || "-",
            condition: window.activeTransferAsset.assetCondition || "GOOD",
            fromLocation: window.activeTransferAsset.locationName || window.activeTransferAsset.buildingName || "Unknown",
            toLocation: toLocation,
            reason: reason,
            status: 'In-Transit',
            initiatedBy: staff.name,
            initiatedByAdek: adekId,
            timestamp: now.getTime(),
            date: now.toLocaleDateString(),
            time: now.toLocaleTimeString()
        };

        await set(ref(db, `asset_transfers/${transferId}`), transferData);

        // --- MULTI-ROLE NOTIFICATION DISPATCH (TASK 2) ---
        if (typeof window.triggerMultiRoleNotification === 'function') {
            // a) Initiator
            window.triggerMultiRoleNotification({
                title: "Transfer Initiated",
                body: `Asset ${barcode} is now In-Transit to ${toLocation}`,
                adekId: adekId,
                tag: "transfer-init",
                icon: "fa-truck-ramp-box"
            });

            // b) Security (Gate-Pass)
            window.triggerMultiRoleNotification({
                title: "Gate-Pass Alert",
                body: `Asset ${barcode} moving from ${transferData.fromLocation} to ${toLocation}`,
                roles: ["Security"],
                tag: "gate-pass",
                icon: "fa-shield-halved"
            });

            // c) IT / Cleaner Leaders (Asset Status)
            const targetRoles = [];
            if (transferData.category === 'IT' || transferData.category.includes('Computer')) targetRoles.push("RT Technician");
            else targetRoles.push("Cleaner Leader");

            window.triggerMultiRoleNotification({
                title: "Asset Movement Alert",
                body: `${transferData.assetName} (${barcode}) transfer started.`,
                roles: targetRoles,
                tag: "asset-move",
                icon: "fa-shuffle"
            });

            // d) Admins
            window.triggerMultiRoleNotification({
                title: "Audit: Asset Transfer Started",
                body: `${staff.name} initiated transfer for ${barcode} to ${toLocation}`,
                roles: ["Admin"],
                tag: "audit-transfer",
                icon: "fa-file-signature",
                url: "/JYSLOGINPORTAL/admin.html"
            });
        }

        alert("Transfer Initiated Successfully!");
        window.closeAssetTransfer();
        if (typeof window.loadRoleView === 'function') window.loadRoleView(staff);

    } catch (e) { alert("Error: " + e.message); }
    finally {
        btn.disabled = false;
        btn.innerText = "INITIATE TRANSFER";
    }
};

window.completeAssetTransfer = async (transferId) => {
    if (!confirm("Are you sure you want to mark this transfer as COMPLETED/RECEIVED?")) return;

    try {
        const snap = await get(child(ref(db), `asset_transfers/${transferId}`));
        if (!snap.exists()) return;
        const tr = snap.val();

        const now = new Date();
        const updates = {};
        updates[`asset_transfers/${transferId}/status`] = 'Completed';
        updates[`asset_transfers/${transferId}/completedAt`] = now.getTime();
        updates[`asset_transfers/${transferId}/completedBy`] = window.currentStaff ? window.currentStaff.name : "System";

        // Update Asset Location in Master Register
        updates[`assets/${tr.assetBarcode}/locationName`] = tr.toLocation;
        updates[`assets/${tr.assetBarcode}/lastAuditTimestamp`] = now.toLocaleString();
        updates[`assets/${tr.assetBarcode}/lastAuditBy`] = window.currentStaff ? window.currentStaff.name : "System";

        await update(ref(db), updates);
        alert("Transfer Completed and Asset Location Updated!");

        // Notify Initiator
        if (typeof window.triggerMultiRoleNotification === 'function' && tr.initiatedByAdek) {
            window.triggerMultiRoleNotification({
                title: "Transfer Completed",
                body: `Asset ${tr.assetBarcode} received at ${tr.toLocation}`,
                adekId: tr.initiatedByAdek,
                tag: "transfer-complete",
                icon: "fa-circle-check"
            });
        }

        if (window.appCache) window.appCache.isInitialized = false;
        if (typeof window.loadAdminDashboard === 'function') window.loadAdminDashboard();
        else if (typeof window.loadRoleView === 'function') window.loadRoleView(window.currentStaff);

    } catch (e) { alert("Error: " + e.message); }
};

window.renderTransferTable = (transfers) => {
    const body = document.getElementById('transfer-logs-body');
    if (!body) return;
    body.innerHTML = '';

    if (!transfers || transfers.length === 0) {
        body.innerHTML = '<tr><td colspan="8" class="p-8 text-center text-gray-400">No transfer records found</td></tr>';
        return;
    }

    transfers.sort((a, b) => b.timestamp - a.timestamp).forEach(t => {
        const isSecurity = window.currentStaff && window.currentStaff.role === 'Security';
        const isAdmin = window.isAdminLoggedIn;
        const canComplete = t.status === 'In-Transit' && (isSecurity || isAdmin);

        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 border-b text-[11px]";
        tr.innerHTML = `
            <td class="p-3 font-bold text-indigo-900">${t.transferId}</td>
            <td class="p-3 font-mono">${t.assetBarcode}</td>
            <td class="p-3">${t.assetName}</td>
            <td class="p-3">
                <div class="flex items-center gap-1">
                    <span class="text-gray-400">${t.fromLocation}</span>
                    <i class="fa-solid fa-arrow-right text-[8px] text-indigo-300"></i>
                    <span class="font-bold text-indigo-600">${t.toLocation}</span>
                </div>
            </td>
            <td class="p-3">
                <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${t.status === 'Completed' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600 animate-pulse'}">
                    ${t.status}
                </span>
            </td>
            <td class="p-3">
                <div class="flex flex-col">
                    <span class="font-bold">${t.initiatedBy}</span>
                    <span class="text-[8px] text-gray-400">${t.initiatedByAdek}</span>
                </div>
            </td>
            <td class="p-3 text-gray-400">${t.date} ${t.time}</td>
            <td class="p-3 text-center">
                ${canComplete ? `<button onclick="window.completeAssetTransfer('${t.transferId}')" class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold text-[9px] hover:bg-indigo-700 transition shadow-sm uppercase">Complete</button>` : '-'}
            </td>
        `;
        body.appendChild(tr);
    });
};

window.renderAdminAssetTable = (data, targetTable = 'both') => {
    try {
        const body = document.getElementById('admin-asset-list-body');
        const disposalBody = document.getElementById('admin-disposal-list-body');
        const transferBody = document.getElementById('transfer-logs-body');
        if (!body && !disposalBody && !transferBody) return;

        if (targetTable === 'both' || targetTable === 'assets') if (body) body.innerHTML = '';
        if (targetTable === 'both' || targetTable === 'disposal') if (disposalBody) disposalBody.innerHTML = '';

        if (data.length === 0) return;

        // DYNAMIC HEADER DETECTION: Share schema for Asset Register only
        const sampleRecord = data[0];
        const dynamicHeaders = Object.keys(sampleRecord).filter(k =>
            !['updatedAt', 'createdAt', 'assetBarcode', 'initialAuditPhotoData', 'disposalPhotoData', 'assetStatus', 'Audit Photo', 'Disposal Photo', 'Action', 'auditPhotoUrl', 'disposalPhotoUrl', 'initialAuditPhoto', 'disposalDamagedPhoto', 'audit_photo', 'beforePhotoUrl', 'afterPhotoUrl', 'photoUrl', 'initialAuditPhotoAtDisposal', 'disposalReason', 'scrapLocation', 'disposedBy', 'disposedByRole', 'disposalDate', 'disposalTime', 'timestamp'].includes(k)
        );

        // Update the <thead> for Register only
        if (window.updateAssetTableHeaders && (targetTable === 'both' || targetTable === 'assets')) {
            window.updateAssetTableHeaders(dynamicHeaders);
        }

        data.forEach(a => {
            const isDisposed = a.assetStatus === 'Disposed';
            const initialPhotoUrl = a.auditPhotoUrl || a.audit_photo || a.beforePhotoUrl || a.photoUrl ||
                                   (a.initialAuditPhoto ? (typeof a.initialAuditPhoto === 'object' ? a.initialAuditPhoto.fileUrl : a.initialAuditPhoto) : null);
            const damagePhotoUrl = a.disposalPhotoUrl || a.afterPhotoUrl ||
                                  (a.disposalDamagedPhoto ? (typeof a.disposalDamagedPhoto === 'object' ? a.disposalDamagedPhoto.fileUrl : a.disposalDamagedPhoto) : null);
            const initialPhoto = window.getDirectDriveImageUrl(initialPhotoUrl);
            const damagePhoto = window.getDirectDriveImageUrl(damagePhotoUrl);

            // Aggressive ID extraction
            const barcode = window.findValueByFuzzyKey(a, "Asset Barcode") ||
                           window.findValueByFuzzyKey(a, "Barcode") ||
                           window.findValueByFuzzyKey(a, "Tag Number") ||
                           a.assetBarcode ||
                           Object.values(a).find(v => String(v).startsWith('AT')) ||
                           "UNKNOWN";

            const tr = document.createElement('tr');
            tr.className = "hover:bg-gray-50 transition border-b border-gray-100 text-[12px]";

            if (isDisposed && disposalBody && (targetTable === 'both' || targetTable === 'disposal')) {
                // SPECIAL RENDERING FOR DISPOSAL TABLE (EXTENDED METADATA)
                const assetName = a['Classification'] || a['Asset Description'] || a['Model Description'] || "-";
                tr.innerHTML = `
                    <td class="p-3 border-r font-mono font-bold">${barcode}</td>
                    <td class="p-3 border-r font-bold text-indigo-900">${assetName}</td>
                    <td class="p-3 border-r">${a.scrapLocation || a.locationName || "-"}</td>
                    <td class="p-3 border-r italic text-red-600 font-medium">${a.disposalReason || "-"}</td>
                    <td class="p-3 border-r text-center">
                        ${damagePhotoUrl ? `<img src="${damagePhoto}" class="h-10 w-10 object-cover rounded border border-red-200 mx-auto cursor-pointer hover:scale-150 transition" onclick="window.openImageZoom('${damagePhoto}')">` : '<span class="text-[8px] opacity-30">No Photo</span>'}
                    </td>
                    <td class="p-3 border-r">
                        <div class="flex flex-col">
                            <span class="font-bold text-gray-700">${a.reportedBy || "-"}</span>
                            <span class="text-[9px] text-gray-400 uppercase">${a.reportedRole || "-"}</span>
                        </div>
                    </td>
                    <td class="p-3 border-r font-mono text-gray-600">${a.date || "-"}</td>
                    <td class="p-3 border-r font-mono text-gray-600">${a.time || "-"}</td>
                    <td class="p-3 text-center">
                        <button onclick="window.deleteAssetRecord('${barcode}')" class="text-red-600 hover:text-red-800 transition" title="Delete Permanent">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </td>
                `;
                disposalBody.appendChild(tr);
            } else if (!isDisposed && body && (targetTable === 'both' || targetTable === 'assets')) {
                // STANDARD RENDERING FOR REGISTER
                let rowHtml = `<td class="p-3 border-r text-center"><input type="checkbox" class="asset-checkbox" value="${barcode}"></td>`;
                dynamicHeaders.forEach(h => {
                    let val = a[h];
                    rowHtml += `<td class="p-3 border-r">${(val !== undefined && val !== null && val !== "" && val !== "-") ? val : "-"}</td>`;
                });
                rowHtml += `
                    <td class="p-3 border-r text-center">
                        ${initialPhotoUrl ? `<img src="${initialPhoto}" class="h-10 w-10 object-cover rounded border mx-auto cursor-pointer hover:scale-110 transition" onclick="window.openImageZoom('${initialPhoto}')">` : '<i class="fa-solid fa-image-slash opacity-20"></i>'}
                    </td>
                    <td class="p-3 border-r text-center">
                        ${damagePhotoUrl ? `<img src="${damagePhoto}" class="h-10 w-10 object-cover rounded border border-red-200 mx-auto cursor-pointer hover:scale-110 transition" onclick="window.openImageZoom('${damagePhoto}')">` : '<i class="fa-solid fa-image-slash opacity-20"></i>'}
                    </td>
                    <td class="p-3 text-center">
                        <button onclick="window.deleteAssetRecord('${barcode}')" class="text-red-600 hover:text-red-800 transition" title="Delete Asset">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </td>
                `;
                tr.innerHTML = rowHtml;
                body.appendChild(tr);
            }
        });
    } catch (e) { console.error("Error rendering dynamic asset tables:", e); }
};

window.deleteAssetRecord = async (barcode) => {
    if (!confirm(`Are you sure you want to PERMANENTLY delete asset ${barcode} and its photos?`)) return;

    try {
        const snap = await get(child(ref(db), `assets/${barcode}`));
        if (snap.exists()) {
            const data = snap.val();

            // Delete photos from Drive
            if (data.initialAuditPhotoData && data.initialAuditPhotoData.fileId) {
                await window.uploadToDrive({ action: "delete", fileId: data.initialAuditPhotoData.fileId });
            }
            if (data.disposalPhotoData && data.disposalPhotoData.fileId) {
                await window.uploadToDrive({ action: "delete", fileId: data.disposalPhotoData.fileId });
            }

            // Remove from Firebase
            await set(ref(db, `assets/${barcode}`), null);
            alert("Asset and linked photos deleted successfully.");
            if (typeof window.loadAdminDashboard === 'function') window.loadAdminDashboard();
        }
    } catch (e) { alert("Error deleting asset: " + e.message); }
};

window.filterDisposalTable = () => {
    try {
        if (!window.appCache || !window.appCache.assets) return;
        const q = document.getElementById('disposal-search').value.toLowerCase();
        const filtered = window.appCache.assets.filter(a => {
            if (a.assetStatus !== 'Disposed') return false;
            return JSON.stringify(a).toLowerCase().includes(q);
        });
        window.renderAdminAssetTable(filtered, 'disposal');
    } catch (e) { console.error(e); }
};

window.filterAssetTable = () => {
    try {
        if (!window.appCache || !window.appCache.assets) return;
        const q = document.getElementById('asset-search').value.toLowerCase();
        const cat = document.getElementById('asset-category-filter').value;
        const filtered = window.appCache.assets.filter(a => {
            if (a.assetStatus === 'Disposed') return false;
            const matchQ = JSON.stringify(a).toLowerCase().includes(q);
            const matchCat = cat === 'all' || a.majorCategory === cat;
            return matchQ && matchCat;
        });
        window.renderAdminAssetTable(filtered, 'assets');
    } catch (e) { console.error(e); }
};
window.openTransferLogs = async () => {
    try {
        const dash = document.getElementById('staff-dash-area');
        const logSection = document.getElementById('transfer-logs-section');
        if (dash) dash.classList.add('hidden');
        if (logSection) logSection.classList.remove('hidden');

        const snap = await get(ref(db, 'asset_transfers'));
        const transfers = snap.exists() ? Object.values(snap.val()) : [];
        window.renderTransferTable(transfers);
    } catch (e) { console.error(e); }
};

window.closeTransferLogs = () => {
    try {
        const dash = document.getElementById('staff-dash-area');
        const logSection = document.getElementById('transfer-logs-section');
        if (dash) dash.classList.remove('hidden');
        if (logSection) logSection.classList.add('hidden');
    } catch (e) { console.error(e); }
};
