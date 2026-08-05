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
    btn.disabled = true; btn.innerHTML = 'SYNCING...';

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
    } catch (e) { alert(e.message); } finally { btn.disabled = false; btn.innerHTML = 'CONFIRM DISPOSAL'; }
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
    btn.disabled = true; btn.innerHTML = 'UPLOADING...';

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
            batchId, status: 'In-Transit', timestamp: Date.now(), date: new Date().toLocaleDateString(),
            securitySignatureUrl: urlSec, receivedSignatureUrl: urlRec, transferPhotoUrl: urlPhoto,
            collectorName: document.getElementById('t_collector_name')?.value || "",
            companyName: document.getElementById('t_company_name')?.value || ""
        };

        const updates = {};
        window.transferBatch.forEach(asset => {
            const trfId = "TRF-" + asset.barcode + "-" + Date.now();
            updates[`asset_transfers/${trfId}`] = { ...common, transferId: trfId, assetBarcode: asset.barcode, assetDescription: asset.description };
            updates[`assets/${asset.barcode}/assetStatus`] = 'Transferred';
        });

        await update(ref(db), updates);
        window.triggerSuccessPopup("Transferred!");
        window.resetAssetTransferForm();
        window.showStaffView('staff-dash-area');
        if (window.refreshDashboardData) window.refreshDashboardData();
    } catch (e) { alert(e.message); } finally { btn.disabled = false; btn.innerHTML = 'CONFIRM TRANSFER'; }
};

window.revertAssetToRegister = async (barcode, transferId = null) => {
    if (!confirm(`Revert ${barcode}?`)) return;
    try {
        const updates = {};
        updates[`assets/${barcode}/assetStatus`] = 'Active';
        updates[`assets/${barcode}/disposalReason`] = null;
        if (transferId) updates[`asset_transfers/${transferId}/status`] = 'Reverted';
        await update(ref(db), updates);
        window.triggerSuccessPopup("Reverted!");
        if (window.refreshDashboardData) window.refreshDashboardData();
    } catch (e) { alert(e.message); }
};

// --- CORE UTILS ---
window.addAssetToBatch = async () => {
    const input = document.getElementById('t_asset_barcode');
    const barcode = input?.value.trim().toUpperCase();
    if (!barcode) return;
    try {
        const snap = await get(child(ref(db), `assets/${barcode}`));
        if (snap.exists()) {
            const data = snap.val();
            window.transferBatch.push({ barcode, description: data.assetDescription || data.modelDescription || 'N/A' });
            window.renderBatchUI(); input.value = "";
        } else { alert("Not found"); }
    } catch (e) { console.error(e); }
};

window.renderBatchUI = () => { window.renderBatchTable(); window.renderMobileCards(); };
window.renderBatchTable = () => {
    const body = document.getElementById('transfer-batch-body'); if (!body) return;
    body.innerHTML = window.transferBatch.map((a, i) => `<tr><td>${a.barcode}</td><td>${a.description}</td><td><button onclick="window.transferBatch.splice(${i},1);window.renderBatchUI()">X</button></td></tr>`).join('');
};
window.renderMobileCards = () => {
    const container = document.getElementById('batch-mobile-cards'); if (!container) return;
    container.innerHTML = window.transferBatch.map((a, i) => `<div class="card">${a.barcode} - ${a.description} <button onclick="window.transferBatch.splice(${i},1);window.renderBatchUI()">X</button></div>`).join('');
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
    document.getElementById('scanner-modal').classList.remove('hidden');
    const scanner = new Html5Qrcode("scanner-container");
    scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (text) => {
        document.getElementById(currentScanTarget).value = text.toUpperCase();
        if (currentScanTarget === 'f1_asset_barcode') window.fetchAuditAssetDetails(text);
        if (currentScanTarget === 'f1_disposal_barcode_input') window.fetchDisposalAssetDetails(text);
        scanner.stop(); document.getElementById('scanner-modal').classList.add('hidden');
    });
};

console.log("✅ audit_module.js ready");
