import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, set, get, update, child } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { FieldNormalizer } from './field_normalizer.js';

// ================================================
// GLOBAL STATE & UTILITIES
// ================================================
let transferPhotoBase64 = "";
let initialAuditPhotoBase64 = "";
let damageAuditPhotoBase64 = "";
let html5QrCode = null;
let currentScanTarget = null;
let isScannerStarting = false;
let isScannerRunning = false;

window.transferBatch = [];

// Handle Disposal Photo Capture
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
    const previews = ['before-photo-preview', 'disposal-photo-preview', 'disposal-asset-preview'];
    previews.forEach(id => { const el = document.getElementById(id); if (el) { el.classList.add('hidden'); if(id === 'disposal-asset-preview') el.innerHTML = ""; } });
    initialAuditPhotoBase64 = ""; damageAuditPhotoBase64 = "";
    const submitBtn = document.getElementById('submit-disposal-btn');
    if (submitBtn) { submitBtn.disabled = true; }
};

window.submitAssetDisposal = async () => {
    const barcode = document.getElementById('f1_disposal_barcode_input')?.value.trim();
    if (!barcode) return alert("Scan barcode first!");
    const reason = document.getElementById('disposal-reason')?.value.trim();
    if (!reason || !initialAuditPhotoBase64 || !damageAuditPhotoBase64) return alert("Required fields missing!");

    const btn = document.getElementById('submit-disposal-btn');
    if (btn) btn.disabled = true;
    window.showGlobalSpinner("Saving Disposal Record...");

    try {
        const [urlBefore, urlAfter] = await Promise.all([
            window.uploadToDrive({ category: UPLOAD_CONFIG.CATEGORIES.DISPOSAL, fileName: `Disp_Before_${barcode}.jpg`, image: initialAuditPhotoBase64 }).then(res => res.fileUrl || ""),
            window.uploadToDrive({ category: UPLOAD_CONFIG.CATEGORIES.DISPOSAL, fileName: `Disp_After_${barcode}.jpg`, image: damageAuditPhotoBase64 }).then(res => res.fileUrl || "")
        ]);

        const updates = {};
        updates[`assets/${barcode}/assetStatus`] = 'Disposed';
        updates[`assets/${barcode}/disposalReason`] = reason;
        updates[`assets/${barcode}/disposalPhotoUrl`] = urlAfter;
        updates[`assets/${barcode}/beforePhotoUrl`] = urlBefore;
        updates[`asset_disposals/${barcode}_${Date.now()}`] = {
            assetBarcode: barcode, status: 'Disposed', reason, date: new Date().toLocaleDateString(), timestamp: Date.now(),
            disposalPhotoUrl: urlAfter, beforePhotoUrl: urlBefore, disposedBy: window.currentStaff?.name || "System"
        };
        await update(ref(db), updates);
        window.triggerSuccessPopup("Disposed!");
        window.resetAssetDisposalForm();
        window.showStaffView('staff-dash-area');
    } catch (e) { alert(e.message); } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = 'CONFIRM DISPOSAL'; }
        window.hideGlobalSpinner();
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
            status: 'Pending', // CHANGED TO PENDING FOR APPROVAL
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
            // DO NOT ATOMICALLY MOVE YET - Wait for approval
        });

        await update(ref(db), updates);

        // Success Notification
        window.showWhatsAppToast("✅ Request Sent", "Asset Transfer Submitted & Sent to Admin for Approval.");
        // Notify Admin
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

    // Check if already in batch
    if (window.transferBatch.some(a => a.barcode === barcode)) {
        alert("Asset already in batch!");
        input.value = "";
        return;
    }

    try {
        console.log(`🔍 Fetching asset: ${barcode}`);
        const snap = await get(child(ref(db), `assets/${barcode}`));
        if (snap.exists()) {
            const rawData = snap.val();
            // Use FieldNormalizer if available, else use raw
            const mapped = window.fieldNormalizer ? window.fieldNormalizer.mapFields(rawData) : rawData;
            const asset = window.fieldNormalizer ? window.fieldNormalizer.createAsset(mapped, barcode) : { barcode, ...rawData };

            window.transferBatch.push(asset);
            console.log("✅ Asset added to batch:", asset);
            window.renderBatchUI();
            input.value = "";
            if (window.triggerSuccessPopup) window.triggerSuccessPopup("Asset Added! 📦");
        } else {
            alert("Asset not found in register!");
        }
    } catch (e) {
        console.error("❌ Add to Batch Error:", e);
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

    // Use headers from FieldNormalizer for full 15-field display
    const fieldMap = window.fieldNormalizer ? window.fieldNormalizer.fieldMap : {};
    const fieldKeys = Object.keys(fieldMap);

    // 1. Render Headers
    let headerHtml = '<tr>';
    headerHtml += '<th class="p-4 text-center sticky left-0 bg-slate-50 z-20">#</th>';
    fieldKeys.forEach(key => {
        headerHtml += `<th class="p-4 whitespace-nowrap text-[10px] font-black uppercase text-indigo-600">${fieldMap[key].label}</th>`;
    });
    headerHtml += '<th class="p-4 text-center sticky right-0 bg-slate-50 z-20">ACTIONS</th>';
    headerHtml += '</tr>';
    tableHeader.innerHTML = headerHtml;

    // 2. Render Rows
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
                    <button type="button" onclick="window.openAssetDetailsModal('${asset.barcode}')" class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center shadow-sm" title="View Full Details">
                        <i class="fa-solid fa-eye text-xs"></i>
                    </button>
                    <button type="button" onclick="window.removeAssetFromBatch(${index})" class="w-8 h-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-all flex items-center justify-center shadow-sm" title="Remove from Batch">
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
                <button type="button" onclick="window.openAssetDetailsModal('${a.barcode}')" class="card-btn eye-btn">
                    <i class="fa-solid fa-eye"></i>
                </button>
                <button type="button" onclick="window.removeAssetFromBatch(${i})" class="card-btn delete-btn">
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
// ASSET DETAILS MODAL (16 FIELDS)
// ================================================
window.openAssetDetailsModal = (barcode) => {
    const asset = window.transferBatch.find(a => a.barcode === barcode);
    if (!asset) return;

    const modal = document.getElementById('asset-details-modal');
    const container = document.getElementById('modal-preview-container');
    if (!modal || !container) return;

    modal.classList.add('active');
    modal.style.display = 'flex';

    // Display all fields from normalizer
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
    const snap = await get(child(ref(db), `assets/${barcode}`));
    if (snap.exists()) {
        const data = snap.val();
        window.renderSmartPreview('audit-asset-preview', data, barcode);
        document.getElementById('f1_asset_barcode').value = barcode;
    }
};

window.fetchDisposalAssetDetails = async (barcode) => {
    if (!barcode || barcode.length < 3) return;
    const snap = await get(child(ref(db), `assets/${barcode}`));
    if (snap.exists()) {
        const data = snap.val();
        window.activeDisposalAsset = data;
        window.renderSmartPreview('disposal-asset-preview', data, barcode, 'red');
        document.getElementById('disposed-by-name').value = window.currentStaff?.name || "Staff";
    }
};

window.startCameraScanner = (target) => {
    currentScanTarget = target;
    const modal = document.getElementById('scanner-modal');
    modal.classList.remove('hidden');

    // Add the overlay box
    const container = document.getElementById('scanner-container');
    if (!document.getElementById('scanner-overlay-box')) {
        const overlay = document.createElement('div');
        overlay.id = 'scanner-overlay-box';
        overlay.className = 'scanner-overlay-box';
        container.appendChild(overlay);
    }

    const scanner = new Html5Qrcode("scanner-container");
    scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 240, height: 240 } }, (text) => {
        document.getElementById(currentScanTarget).value = text.toUpperCase();
        if (currentScanTarget === 'f1_asset_barcode') window.fetchAuditAssetDetails(text);
        if (currentScanTarget === 'f1_disposal_barcode_input') window.fetchDisposalAssetDetails(text);
        if (currentScanTarget === 't_asset_barcode') window.addAssetToBatch();
        scanner.stop(); document.getElementById('scanner-modal').classList.add('hidden');
    });
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