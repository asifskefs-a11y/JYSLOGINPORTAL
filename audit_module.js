import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, set, get, update, child } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { FieldNormalizer } from './field_normalizer.js';

// ================================================
// GLOBAL STATE & UTILITIES
// ================================================
let transferPhotoBase64 = "";
let initialAuditPhotoBase64 = "";
let damageAuditPhotoBase64 = "";

window.transferBatch = [];

// SAFE BARCODE DUPLICATE CHECKER
window.checkDuplicateBarcode = async (inputVal) => {
    if (!inputVal) return;
    const barcode = inputVal.toString().trim().toUpperCase();
    if (barcode.length < 3) return;

    try {
        const snap = await get(child(ref(db), `assets/${barcode}`));
        const inputEl = document.getElementById('f1_asset_barcode');
        if (snap.exists()) {
            if (inputEl) inputEl.classList.add('border-amber-500', 'bg-amber-50');
            console.warn(`⚠️ Barcode ${barcode} already exists in registry.`);
        } else {
            if (inputEl) inputEl.classList.remove('border-amber-500', 'bg-amber-50');
        }
    } catch (e) {
        console.error("Duplicate check failed:", e);
    }
};

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

    const btn = event.target.querySelector('button[type="submit"]');
    const originalBtnHtml = btn ? btn.innerHTML : 'SAVE ASSET REGISTER';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    }

    window.showGlobalSpinner("Saving Asset Register...");

    try {
        const data = {
            assetBarcode: barcode,
            serialNo: document.getElementById('f2_serial_no')?.value.trim() || '',
            modelDescription: document.getElementById('f3_model_desc')?.value.trim() || '',
            assetCondition: document.getElementById('f4_asset_cond')?.value.trim() || '',
            priceStatus: document.getElementById('f5_price_stat')?.value.trim() || '',
            assetUnitCost: document.getElementById('f6_unit_cost')?.value.trim() || '',
            assetDescription: document.getElementById('f7_asset_desc')?.value.trim() || '',
            datePlaceInService: document.getElementById('f8_service_date')?.value.trim() || '',
            manufacturer: document.getElementById('f9_manufacturer')?.value.trim() || '',
            majorCategory: document.getElementById('f10_major_cat')?.value.trim() || '',
            minorCategory: document.getElementById('f11_sub_major')?.value.trim() || '',
            subMinorCategory: document.getElementById('f12_sub_minor')?.value.trim() || '',
            dofMajor: document.getElementById('f13_dof_major')?.value.trim() || '',
            dofMinor: document.getElementById('f14_dof_minor')?.value.trim() || '',
            category: document.getElementById('f15_category')?.value.trim() || '',
            classification: document.getElementById('f16_class')?.value.trim() || '',
            locationName: document.getElementById('f17_location')?.value.trim() || '',
            schoolEsisId: document.getElementById('f18_esis')?.value.trim() || '',
            schoolBuildingName: document.getElementById('f19_school_building')?.value.trim() || '',
            roomName: document.getElementById('f20_room_name')?.value.trim() || '',
            roomNo: document.getElementById('f21_room_no')?.value.trim() || '',
            roomBarcode: document.getElementById('f22_room_barcode')?.value.trim() || '',
            floorNo: document.getElementById('f23_floor_no')?.value.trim() || '',
            floorDescription: document.getElementById('f24_floor_desc')?.value.trim() || '',
            barcodeStatus: document.getElementById('f25_barcode_stat')?.value.trim() || '',
            assetStatus: document.getElementById('f26_asset_stat')?.value.trim() || '',
            oldSchoolName: document.getElementById('f27_old_school')?.value.trim() || '',
            transactionNo: document.getElementById('f28_trans_no')?.value.trim() || '',
            assetUsefulLife: document.getElementById('f29_useful_life')?.value.trim() || '',
            assetVendorName: document.getElementById('f30_vendor')?.value.trim() || '',
            oldAssetBarcode: document.getElementById('f31_old_barcode')?.value.trim() || '',
            physicalAssetRegisterNo: document.getElementById('f36_phys_reg_no')?.value.trim() || '',
            fixedAssetRegisterNo: document.getElementById('f37_fixed_reg_no')?.value.trim() || '',
            mappingCriteria: document.getElementById('f38_mapping')?.value.trim() || '',
            remarks: document.getElementById('f35_remarks')?.value.trim() || '',
            updatedAt: new Date().toISOString()
        };

        const photoInput = document.getElementById('f40_audit_photo_input');
        if (photoInput && photoInput.files && photoInput.files[0]) {
            try {
                console.log("📸 Uploading photo to Google Drive...");
                const file = photoInput.files[0];
                const base64 = await window.compressImageFile(file, 800, 800, 0.7);

                if (window.uploadToDrive) {
                    const res = await window.uploadToDrive({
                        category: UPLOAD_CONFIG.CATEGORIES.ASSET_PHOTOS || 'ASSET_PHOTOS',
                        fileName: `Asset_${barcode}_${Date.now()}.jpg`,
                        image: base64
                    });
                    if (res && res.status === 'success' && res.fileUrl) {
                        data.photoURL = res.fileUrl;
                        data.auditPhoto = res.fileUrl;
                    }
                }
            } catch (driveErr) {
                console.error("⚠️ Drive upload failed:", driveErr);
            }
        }

        await update(ref(db, 'assets/' + barcode), data);
        window.triggerSuccessPopup("Asset Registered Successfully! ✅");

        if (event && event.target && event.target.reset) event.target.reset();
        window.showStaffView('staff-dash-area');

    } catch (e) {
        console.error("❌ Submission Failed:", e);
        alert("❌ Failed to register asset. Error: " + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalBtnHtml;
        }
        window.hideGlobalSpinner();
    }
};

// ================================================
// PHOTO CAPTURE HANDLERS
// ================================================
window.handleDisposalBeforePhoto = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        initialAuditPhotoBase64 = e.target.result;
        const preview = document.getElementById('before-photo-preview');
        if (preview) { preview.classList.remove('hidden'); preview.querySelector('img').src = initialAuditPhotoBase64; }
        const btnText = document.getElementById('before-photo-btn-text');
        if (btnText) btnText.innerText = "Before Photo OK ✅";
    };
    reader.readAsDataURL(file);
};

window.removeDisposalBeforePhoto = () => {
    initialAuditPhotoBase64 = "";
    const input = document.getElementById('disposal-before-photo-input');
    if (input) input.value = "";
    const preview = document.getElementById('before-photo-preview');
    if (preview) preview.classList.add('hidden');
    const btnText = document.getElementById('before-photo-btn-text');
    if (btnText) btnText.innerText = "Take Before Photo";
};

window.handleDisposalPhoto = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        damageAuditPhotoBase64 = e.target.result;
        const preview = document.getElementById('disposal-photo-preview');
        if (preview) { preview.classList.remove('hidden'); preview.querySelector('img').src = damageAuditPhotoBase64; }
        const btnText = document.getElementById('disposal-photo-btn-text');
        if (btnText) btnText.innerText = "Audit Photo OK ✅";
    };
    reader.readAsDataURL(file);
};

window.removeDisposalAfterPhoto = () => {
    damageAuditPhotoBase64 = "";
    const input = document.getElementById('disposal-photo-input');
    if (input) input.value = "";
    const preview = document.getElementById('disposal-photo-preview');
    if (preview) preview.classList.add('hidden');
    const btnText = document.getElementById('disposal-photo-btn-text');
    if (btnText) btnText.innerText = "Take Audit Photo";
};

window.handleInitialAuditPhoto = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        initialAuditPhotoBase64 = e.target.result;
        const preview = document.getElementById('audit-photo-preview');
        if (preview) { preview.classList.remove('hidden'); preview.querySelector('img').src = initialAuditPhotoBase64; }
        const btnText = document.getElementById('audit-photo-btn-text');
        if (btnText) btnText.innerText = "Photo Captured ✅";
    };
    reader.readAsDataURL(file);
};

window.removeAuditPhoto = () => {
    initialAuditPhotoBase64 = "";
    const input = document.getElementById('f40_audit_photo_input');
    if (input) input.value = "";
    const preview = document.getElementById('audit-photo-preview');
    if (preview) preview.classList.add('hidden');
    const btnText = document.getElementById('audit-photo-btn-text');
    if (btnText) btnText.innerText = "Capture Photo";
};

// ================================================
// ASSET DISPOSAL SUBMISSION
// ================================================
window.resetAssetDisposalForm = () => {
    const fields = ['f1_disposal_barcode_input', 'disposal-reason', 'disposed-by-name', 'disposal-date', 'disposal-time'];
    fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    const previews = ['before-photo-preview', 'disposal-photo-preview', 'disposal-asset-preview', 'audit-photo-preview-container'];
    previews.forEach(id => { const el = document.getElementById(id); if (el) { el.classList.add('hidden'); if(id === 'disposal-asset-preview' || id === 'audit-photo-preview-container') el.innerHTML = ""; } });
    initialAuditPhotoBase64 = ""; damageAuditPhotoBase64 = ""; window.disposalBeforePhotoBase64 = "";
    const submitBtn = document.getElementById('submit-disposal-btn');
    if (submitBtn) { submitBtn.disabled = true; }
};

window.submitAssetDisposal = async () => {
    const barcode = document.getElementById('f1_disposal_barcode_input')?.value.trim();
    const reason = document.getElementById('disposal-reason')?.value.trim();
    const disposalPhoto = window.disposalBeforePhotoBase64; // Photo captured by staff at disposal time

    if (!barcode) return alert("Please scan or enter an asset barcode!");
    if (!reason) return alert("Please enter a reason for disposal!");
    if (!disposalPhoto) return alert("Please capture the disposal photo!");

    if (window.showGlobalSpinner) window.showGlobalSpinner("Submitting Disposal Request...");

    try {
        // Upload Staff's Disposal Photo to Drive
        let photoUrl = "";
        if (window.uploadToDrive) {
            const uploadRes = await window.uploadToDrive({
                category: 'DISPOSAL',
                fileName: `Disposal_Request_${barcode}_${Date.now()}.jpg`,
                image: disposalPhoto
            });
            photoUrl = uploadRes.fileUrl || "";
        }

        const requestId = `${barcode}_${Date.now()}`;
        const masterPhoto = window.activeDisposalAsset?.imageUrl || window.activeDisposalAsset?.assetPhotoUrl || "Not Available";

        const updates = {};

        // A. Mark Asset Status as 'Pending_Disposal' (So staff sees it as pending)
        updates[`assets/${barcode}/assetStatus`] = 'Pending_Disposal';

        // B. Send Request to Admin Approval Node
        updates[`asset_disposal_requests/${requestId}`] = {
            requestId: requestId,
            assetBarcode: barcode,
            assetName: window.activeDisposalAsset?.assetName || "Unknown Asset",
            location: window.activeDisposalAsset?.location || "N/A",
            status: 'Pending',
            reason: reason,
            disposalPhotoUrl: photoUrl, // Staff captured photo
            auditMasterPhotoUrl: masterPhoto, // Master register photo (or "Not Available")
            requestedBy: window.currentStaff?.name || "Staff",
            requestedByRole: window.currentStaff?.role || "Staff",
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleDateString()
        };

        await update(ref(db), updates);

        if (window.hideGlobalSpinner) window.hideGlobalSpinner();
        if (window.triggerSuccessPopup) window.triggerSuccessPopup("Disposal Request Sent to Admin for Approval!");

        window.resetAssetDisposalForm();
        window.showStaffView('staff-dash-area');
    } catch (e) {
        if (window.hideGlobalSpinner) window.hideGlobalSpinner();
        alert("Submission Error: " + e.message);
    }
};

// ================================================
// BATCH TRANSFER SYSTEM
// ================================================
window.resetAssetTransferForm = () => {
    const form = document.getElementById('transfer-form-multi');
    if (form) form.reset();
    window.transferBatch = []; window.renderBatchUI();
    ['t_security_sig', 't_received_sig'].forEach(id => { const pad = window.sigPadManager.getPad(id); pad.clear(); pad.lock(); });
    transferPhotoBase64 = "";
    const preview = document.getElementById('t_photo_preview'); if (preview) preview.classList.add('hidden');
};

window.submitAssetTransfer = async (event) => {
    if (event) event.preventDefault();
    if (window.transferBatch.length === 0) return alert("Batch empty!");
    const btn = document.getElementById('submit-transfer-btn');
    if (btn) btn.disabled = true;
    window.showGlobalSpinner("Initiating Batch Transfer...");

    try {
        const securitySig = window.getCanvasBase64('t_security_sig');
        const receiverSig = window.getCanvasBase64('t_received_sig');
        if (securitySig.length < 500 || receiverSig.length < 500) throw new Error("Signatures missing!");

        const batchId = "BATCH-" + Date.now();
        const first = window.transferBatch[0];
        const photoName = `${first.barcode}_TRANSFER_${Date.now()}`;

        const [urlSec, urlRec, urlPhoto] = await Promise.all([
            window.uploadToDrive({ category: UPLOAD_CONFIG.CATEGORIES.ASSET_TRANSFER_SIGNATURES, fileName: `Sig_Sec_${batchId}.png`, image: securitySig }).then(res => res.fileUrl || ""),
            window.uploadToDrive({ category: UPLOAD_CONFIG.CATEGORIES.ASSET_TRANSFER_SIGNATURES, fileName: `Sig_Rec_${batchId}.png`, image: receiverSig }).then(res => res.fileUrl || ""),
            transferPhotoBase64 ? window.uploadToDrive({ category: UPLOAD_CONFIG.CATEGORIES.ASSET_TRANSFER_PHOTOS, fileName: `${photoName}.jpg`, image: transferPhotoBase64 }).then(res => res.fileUrl || "") : Promise.resolve("")
        ]);

        const common = {
            batchId,
            status: 'Pending',
            timestamp: Date.now(),
            date: new Date().toLocaleDateString(),
            securitySignatureUrl: urlSec,
            receivedSignatureUrl: urlRec,
            transferPhotoUrl: urlPhoto,
            collectorName: document.getElementById('t_collector_name')?.value || "N/A",
            companyName: document.getElementById('t_company_name')?.value || "N/A",
            securityName: window.currentStaff?.name || "N/A",
            receiverName: "N/A",
            staffId: window.currentStaff?.staffId || "",
            requesterName: window.currentStaff?.name || "Staff"
        };

        const updates = {};
        window.transferBatch.forEach(asset => {
            const trfId = "TRF-" + asset.barcode + "-" + Date.now();
            updates[`asset_transfers/${trfId}`] = { ...asset, ...common, transferId: trfId };
        });

        await update(ref(db), updates);

        window.showWhatsAppToast("✅ Request Sent", "Asset Transfer Submitted & Sent to Admin for Approval.");
        window.showWhatsAppToast("⚠️ Pending Request", `Asset Transfer Request from ${common.requesterName} - Action Required`);

        window.resetAssetTransferForm();
        window.showStaffView('staff-dash-area');
        if (window.refreshDashboardData) await window.refreshDashboardData();

    } catch (e) {
        console.error("❌ Transfer Submission Error:", e);
        alert("Submission Failed: " + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = 'CONFIRM TRANSFER'; }
        window.hideGlobalSpinner();
    }
};

window.revertAssetToRegister = async (barcode, transferId = null) => {
    if (!confirm(`Revert ${barcode}?`)) return;
    window.showGlobalSpinner("Reverting Asset...");
    try {
        const updates = {};
        updates[`assets/${barcode}/assetStatus`] = 'Active';
        updates[`assets/${barcode}/disposalReason`] = null;
        if (transferId) updates[`asset_transfers/${transferId}/status`] = 'Reverted';
        await update(ref(db), updates);
        window.triggerSuccessPopup("Reverted!");
        if (window.refreshDashboardData) await window.refreshDashboardData();
    } catch (e) {
        alert(e.message);
    } finally {
        window.hideGlobalSpinner();
    }
};

// --- CORE UTILS ---
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
        const snap = await get(child(ref(db), `assets/${barcode}`));
        if (snap.exists()) {
            const rawData = snap.val();
            const mapped = window.fieldNormalizer ? window.fieldNormalizer.mapFields(rawData) : rawData;
            const asset = window.fieldNormalizer ? window.fieldNormalizer.createAsset(mapped, barcode) : { barcode, ...rawData };

            window.transferBatch.push(asset);
            window.renderBatchUI();
            input.value = "";
            if (window.triggerSuccessPopup) window.triggerSuccessPopup("Asset Added! 📦");
        } else {
            alert("Asset not found in register!");
        }
    } catch (e) {
        alert("Error looking up asset: " + e.message);
    }
};

window.renderBatchUI = () => {
    window.renderBatchTable();
    window.renderMobileCards();
    const counter = document.getElementById('batch-counter');
    if (counter) {
        counter.innerText = `${window.transferBatch.length} items`;
        counter.classList.toggle('has-items', window.transferBatch.length > 0);
    }
};

window.renderBatchTable = () => {
    const tableHeader = document.querySelector('#batch-table thead');
    const tableBody = document.getElementById('transfer-batch-body');
    if (!tableHeader || !tableBody) return;

    if (window.transferBatch.length === 0) {
        tableBody.innerHTML = `<tr id="empty-batch-row"><td colspan="20" class="empty-state"><i class="fa-solid fa-box-open"></i><span>No assets added to batch yet.</span></td></tr>`;
        return;
    }

    const fieldMap = window.fieldNormalizer ? window.fieldNormalizer.fieldMap : {};
    const fieldKeys = Object.keys(fieldMap);

    let headerHtml = '<tr>';
    headerHtml += '<th class="p-4 text-center sticky left-0 bg-slate-50 z-20">#</th>';
    fieldKeys.forEach(key => {
        headerHtml += `<th class="p-4 whitespace-nowrap text-[10px] font-black uppercase text-indigo-600">${fieldMap[key].label}</th>`;
    });
    headerHtml += '<th class="p-4 text-center sticky right-0 bg-slate-50 z-20">ACTIONS</th>';
    headerHtml += '</tr>';
    tableHeader.innerHTML = headerHtml;

    tableBody.innerHTML = window.transferBatch.map((asset, index) => {
        let rowHtml = `<tr class="hover:bg-indigo-50/30 transition-colors">`;
        rowHtml += `<td class="p-4 text-center sticky left-0 bg-white z-10 border-r">${index + 1}</td>`;

        fieldKeys.forEach(key => {
            let val = asset[key] || 'N/A';
            if (key === 'photo' && val !== 'N/A') {
                val = `<img src="${window.getDirectDriveImageUrl(val)}" class="h-8 w-8 object-cover rounded border" onclick="window.openImageZoom('${val}')">`;
            }
            rowHtml += `<td class="p-4 whitespace-nowrap text-xs font-medium text-slate-600">${val}</td>`;
        });

        rowHtml += `
            <td class="p-4 text-center sticky right-0 bg-white z-10 border-l">
                <div class="flex items-center justify-center gap-2">
                    <button type="button" onclick="event.preventDefault(); window.openBatchAssetDetailsModal('${asset.barcode}')" class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center shadow-sm" title="View Full Details">
                        <i class="fa-solid fa-eye text-xs"></i>
                    </button>
                    <button type="button" onclick="event.preventDefault(); window.removeAssetFromBatch(${index})" class="w-8 h-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-all flex items-center justify-center shadow-sm" title="Remove from Batch">
                        <i class="fa-solid fa-trash-can text-xs"></i>
                    </button>
                </div>
            </td>`;
        rowHtml += `</tr>`;
        return rowHtml;
    }).join('');
};

window.renderMobileCards = () => {
    const container = document.getElementById('batch-mobile-cards'); if (!container) return;
    if (window.transferBatch.length === 0) {
        container.innerHTML = `<div class="empty-state-card"><i class="fa-solid fa-box-open"></i><span>No assets added to batch yet.</span></div>`;
        return;
    }

    container.innerHTML = window.transferBatch.map((a, i) => `
        <div class="batch-card fade-in">
            <div class="card-content">
                <div class="card-header">
                    <span class="card-barcode">${a.barcode}</span>
                    <span class="card-category">${a.category || 'N/A'}</span>
                </div>
                <h4 class="card-description">${a.description || 'N/A'}</h4>
                <div class="card-location">
                    <i class="fa-solid fa-location-dot"></i>
                    <span>${a.location || 'N/A'} | ${a.building || 'N/A'}</span>
                </div>
            </div>
            <div class="card-actions">
                <button type="button" onclick="event.preventDefault(); window.openBatchAssetDetailsModal('${a.barcode}')" class="card-btn eye-btn">
                    <i class="fa-solid fa-eye"></i>
                </button>
                <button type="button" onclick="event.preventDefault(); window.removeAssetFromBatch(${i})" class="card-btn delete-btn">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        </div>
    `).join('');
};

window.removeAssetFromBatch = (index) => {
    if (index >= 0 && index < window.transferBatch.length) {
        window.transferBatch.splice(index, 1);
        window.renderBatchUI();
    }
};

// ================================================
// BATCH ASSET PREVIEW (Local Data)
// ================================================
window.openBatchAssetDetailsModal = (barcode) => {
    const asset = window.transferBatch.find(a => a.barcode === barcode);
    if (!asset) return;

    const modal = document.getElementById('asset-details-modal');
    const container = document.getElementById('modal-preview-container');
    if (!modal || !container) return;

    modal.classList.add('active');
    modal.style.display = 'flex';

    const fieldMap = window.fieldNormalizer ? window.fieldNormalizer.fieldMap : {};

    let html = '';
    Object.keys(fieldMap).forEach(key => {
        const field = fieldMap[key];
        let val = asset[key] || 'N/A';
        const isFullWidth = key === 'description' || key === 'photo';

        html += `
            <div class="detail-item ${isFullWidth ? 'full-width' : ''}">
                <label class="detail-label"><i class="fa-solid fa-circle-info"></i> ${field.label}</label>
                <div class="detail-value ${key === 'barcode' ? 'barcode-value' : ''} ${key === 'photo' ? 'photo-value' : ''}">
                    ${key === 'photo' && val !== 'N/A'
                        ? `<img src="${window.getDirectDriveImageUrl(val)}" onclick="window.openImageZoom('${val}')">`
                        : val}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
};

window.closeAssetDetailsModal = () => {
    const modal = document.getElementById('asset-details-modal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
};

window.handleTransferPhoto = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    transferPhotoBase64 = await window.compressImageFile(file);
    const preview = document.getElementById('t_photo_preview'); if (preview) { preview.classList.remove('hidden'); preview.querySelector('img').src = transferPhotoBase64; }
};

window.fetchAuditAssetDetails = async (barcode) => {
    if (!barcode || barcode.length < 3) return;
    try {
        const snap = await get(child(ref(db), `assets/${barcode}`));
        if (snap.exists()) {
            const data = snap.val();
            localStorage.setItem(`asset_${barcode}`, JSON.stringify(data));
            window.renderSmartPreview('audit-asset-preview', data, barcode);
            document.getElementById('f1_asset_barcode').value = barcode;
        }
    } catch (e) {
        const cached = localStorage.getItem(`asset_${barcode}`);
        if (cached) {
            const data = JSON.parse(cached);
            window.renderSmartPreview('audit-asset-preview', data, barcode);
            document.getElementById('f1_asset_barcode').value = barcode;
            window.showWhatsAppToast("⚠️ Offline Mode", "Loaded from local cache.");
        }
    }
};

window.fetchDisposalAssetDetails = async function(barcode) {
    const cleanBarcode = (barcode || '').toString().trim();
    const previewArea = document.getElementById('disposal-asset-preview');
    const auditPhotoArea = document.getElementById('audit-photo-preview-container');

    if (!cleanBarcode || cleanBarcode.length < 2) {
        if (previewArea) previewArea.innerHTML = '';
        if (auditPhotoArea) auditPhotoArea.innerHTML = '';
        return;
    }

    try {
        // Fetch full record from Master Asset Register
        const snap = await get(child(ref(db), `assets/${cleanBarcode}`));

        if (snap.exists()) {
            const assetData = snap.val();
            window.activeDisposalAsset = assetData;

            // Auto-detect logged-in staff info
            const currentStaff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || '{}');
            const staffName = currentStaff.name || currentStaff.fullName || "Auto-Detected Staff";
            const staffRole = currentStaff.role || currentStaff.designation || "Staff";

            // Populate Disposed-By fields automatically if present in HTML
            const disposedByInput = document.getElementById('disposed-by-name');
            if (disposedByInput) disposedByInput.value = staffName;

            // 1. RENDER ALL MASTER ASSET REGISTER HEADERS IN PREVIEW CARD
            if (previewArea) {
                previewArea.innerHTML = `
                    <div class="bg-red-50 border-2 border-red-200 rounded-3xl p-5 space-y-4 text-left shadow-sm">
                        <!-- Top Header Bar -->
                        <div class="flex justify-between items-center border-b border-red-200 pb-3">
                            <div>
                                <span class="text-[9px] font-black uppercase text-red-500 tracking-widest">Asset Barcode</span>
                                <h3 class="text-lg font-black text-gray-900">${cleanBarcode}</h3>
                            </div>
                            <span class="px-3 py-1 text-xs font-black uppercase rounded-full bg-red-100 text-red-700 border border-red-300">
                                ${assetData.assetStatus || assetData.status || 'Active'}
                            </span>
                        </div>

                        <!-- All Asset Register Fields -->
                        <div class="grid grid-cols-2 gap-2 text-xs">
                            <div class="bg-white p-2 rounded-xl border border-red-100">
                                <span class="text-[9px] font-bold text-gray-400 uppercase block">Asset Name</span>
                                <span class="font-black text-gray-800">${assetData.assetName || assetData.name || 'N/A'}</span>
                            </div>
                            <div class="bg-white p-2 rounded-xl border border-red-100">
                                <span class="text-[9px] font-bold text-gray-400 uppercase block">Category</span>
                                <span class="font-black text-gray-800">${assetData.category || assetData.assetCategory || 'N/A'}</span>
                            </div>
                            <div class="bg-white p-2 rounded-xl border border-red-100">
                                <span class="text-[9px] font-bold text-gray-400 uppercase block">Location / Room</span>
                                <span class="font-black text-gray-800">${assetData.location || assetData.room || 'N/A'}</span>
                            </div>
                            <div class="bg-white p-2 rounded-xl border border-red-100">
                                <span class="text-[9px] font-bold text-gray-400 uppercase block">Department</span>
                                <span class="font-black text-gray-800">${assetData.department || 'N/A'}</span>
                            </div>
                            <div class="bg-white p-2 rounded-xl border border-red-100">
                                <span class="text-[9px] font-bold text-gray-400 uppercase block">Brand / Model</span>
                                <span class="font-black text-gray-800">${assetData.brand || assetData.model || 'N/A'}</span>
                            </div>
                            <div class="bg-white p-2 rounded-xl border border-red-100">
                                <span class="text-[9px] font-bold text-gray-400 uppercase block">Serial Number</span>
                                <span class="font-black text-gray-800">${assetData.serialNo || assetData.serialNumber || 'N/A'}</span>
                            </div>
                            <div class="bg-white p-2 rounded-xl border border-red-100">
                                <span class="text-[9px] font-bold text-gray-400 uppercase block">Assigned Custodian</span>
                                <span class="font-black text-gray-800">${assetData.assignedTo || assetData.custodian || 'Unassigned'}</span>
                            </div>
                            <div class="bg-white p-2 rounded-xl border border-red-100">
                                <span class="text-[9px] font-bold text-gray-400 uppercase block">Current Condition</span>
                                <span class="font-black text-gray-800">${assetData.condition || 'N/A'}</span>
                            </div>
                        </div>

                        <!-- Auto-Detected Staff Banner -->
                        <div class="bg-red-100/60 p-2.5 rounded-2xl border border-red-200 flex justify-between items-center text-xs">
                            <span class="font-bold text-red-800">Auto-Detected Initiator:</span>
                            <span class="font-black text-red-900">${staffName} (${staffRole})</span>
                        </div>
                    </div>
                `;
            }

            // 2. MASTER REGISTER PHOTO AUTO-FETCH LOGIC
            const registerPhoto = assetData.imageUrl || assetData.assetPhotoUrl || assetData.photoUrl;

            if (auditPhotoArea) {
                if (registerPhoto && registerPhoto !== 'N/A' && registerPhoto !== 'null' && registerPhoto !== '') {
                    auditPhotoArea.innerHTML = `
                        <div class="text-center w-full">
                            <span class="text-[10px] font-bold text-gray-500 uppercase block mb-1">Master Register Photo</span>
                            <img src="${registerPhoto}" class="w-full h-32 object-cover rounded-2xl border border-gray-300 shadow-sm mx-auto">
                        </div>`;
                } else {
                    auditPhotoArea.innerHTML = `
                        <div class="w-full h-32 bg-gray-100 rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-center p-2">
                            <i class="fa-solid fa-image-slash text-gray-400 text-xl mb-1"></i>
                            <span class="text-xs font-bold text-gray-400 uppercase">No Photo Available</span>
                        </div>`;
                }
            }

            const submitBtn = document.getElementById('submit-disposal-btn');
            if (submitBtn) submitBtn.disabled = false;

        } else {
            if (previewArea) {
                previewArea.innerHTML = `
                    <div class="p-4 bg-red-100 border border-red-300 rounded-2xl text-center">
                        <span class="text-xs font-black text-red-600 uppercase">⚠️ Asset Barcode Not Found!</span>
                    </div>`;
            }
            if (auditPhotoArea) auditPhotoArea.innerHTML = '';

            const submitBtn = document.getElementById('submit-disposal-btn');
            if (submitBtn) submitBtn.disabled = true;
        }

    } catch (e) {
        console.error("Error restoring disposal details preview:", e);
    }
};

window.toggleAccordion = (id) => {
    const content = document.getElementById(id + '-content');
    const icon = document.getElementById(id + '-icon');
    if (content) {
        content.classList.toggle('hidden');
    }
    if (icon) {
        icon.classList.toggle('fa-chevron-down');
        icon.classList.toggle('fa-chevron-right');
        icon.classList.toggle('rotate-180');
    }
};

console.log("✅ audit_module.js ready");

window.initTransferSigPads = () => {
    const pads = ['t_security_sig', 't_received_sig'];
    pads.forEach(id => {
        if (window.sigPadManager) {
            const pad = window.sigPadManager.getPad(id);
            if (pad) pad._setupCanvas();
        }
    });
};

window.renderSmartPreview = (containerId, data, barcode, themeColor = 'indigo') => {
    const el = document.getElementById(containerId);
    if (!el) return;

    el.classList.remove('hidden');
    el.innerHTML = `
        <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-${themeColor}-100 rounded-lg flex items-center justify-center text-${themeColor}-600">
                <i class="fa-solid fa-box"></i>
            </div>
            <div>
                <p class="font-black text-slate-900 leading-tight uppercase">${data.assetName || data.assetDescription || data.description || 'Unknown Asset'}</p>
                <p class="text-[8px] font-bold text-slate-400 uppercase tracking-widest">${barcode} | ${data.location || 'No Location'}</p>
            </div>
        </div>
    `;
};