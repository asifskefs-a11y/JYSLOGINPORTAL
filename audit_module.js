import { db } from './firebase_config.js';
import { ref, set, get, update, child } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { FieldNormalizer } from './field_normalizer.js';

// ================================================
// GLOBAL STATE & UTILITIES
// ================================================
let activeDisposalBarcode = null;
let transferPhotoBase64 = "";
let initialAuditPhotoBase64 = "";
let damageAuditPhotoBase64 = "";
let assetTemplates = {};
let html5QrCode = null;
let currentScanTarget = null;
let isScannerStarting = false;
let isScannerRunning = false;

// Initialize batch array
window.transferBatch = [];

// ✅ FIXED: Forced HTTPS Image Buffer
const getImageBuffer = async (url) => {
    if (!url || !url.includes('http') || url.includes('placeholder')) return null;
    let cu = url.startsWith('http://') ? url.replace('http://', 'https://') : url;
    const urlFormats = [
        (u)=>u,
        (u)=>u.replace('lh3.googleusercontent.com/d/', 'drive.google.com/uc?export=view&id='),
        (u)=>{const m=u.match(/[-\w]{25,}/); return m?`https://lh3.googleusercontent.com/d/${m[0]}`:null;}
    ];
    for (const f of urlFormats) {
        try {
            const formatted = f(cu); if(!formatted) continue;
            const res = await fetch(formatted, { mode: 'cors', headers: {'Accept': 'image/*'} });
            if (res.ok) return await res.blob().then(b => b.arrayBuffer());
        } catch (e) { console.debug("Fetch fail:", e.message); }
    }
    return null;
};

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

// ================================================
// ASSET DISPOSAL SUBMISSION
// ================================================
window.submitAssetDisposal = async () => {
    const barcode = document.getElementById('f1_disposal_barcode_input').value.trim();
    if (!barcode) return alert("Please scan an asset first!");
    if (!window.activeDisposalAsset) return alert("Asset details not loaded!");

    const reason = document.getElementById('disposal-reason').value.trim();
    if (!reason) return alert("Please enter reason for disposal!");

    if (!initialAuditPhotoBase64 || !damageAuditPhotoBase64) {
        return alert("Both Before and Audit photos are required!");
    }

    const btn = document.getElementById('submit-disposal-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> DISPOSING...';

    try {
        const uploadTask = async (img, fileName) => {
            if (!img || img.length < 500) return "";
            const res = await window.uploadToDrive({ action: "upload", type: "disposal", fileName, image: img });
            return res.fileUrl || "";
        };

        const [urlBefore, urlAfter] = await Promise.all([
            uploadTask(initialAuditPhotoBase64, `Disp_Before_${barcode}_${Date.now()}.jpg`),
            uploadTask(damageAuditPhotoBase64, `Disp_After_${barcode}_${Date.now()}.jpg`)
        ]);

        const asset = window.activeDisposalAsset;
        const now = new Date();

        const disposalData = {
            assetBarcode: barcode,
            assetStatus: 'Disposed',
            disposalReason: reason,
            disposedBy: document.getElementById('disposed-by-name').value,
            disposalDate: document.getElementById('disposal-date').value,
            disposalTime: document.getElementById('disposal-time').value,
            disposalPhotoUrl: urlAfter,
            beforePhotoUrl: urlBefore,
            timestamp: Date.now(),

            // Normalized data from hidden fields
            description: document.getElementById('d_asset_description').value,
            category: document.getElementById('d_asset_category').value,
            location: document.getElementById('d_asset_location').value,
            serialNo: document.getElementById('d_asset_serial_no_display').value
        };

        // Update asset status in master branch
        const updates = {};
        updates[`assets/${barcode}/assetStatus`] = 'Disposed';
        updates[`assets/${barcode}/disposalReason`] = reason;
        updates[`assets/${barcode}/disposalDate`] = disposalData.disposalDate;
        updates[`assets/${barcode}/disposalPhotoUrl`] = urlAfter;
        updates[`assets/${barcode}/beforePhotoUrl`] = urlBefore;

        // Save to disposal logs
        updates[`asset_disposals/${barcode}_${Date.now()}`] = disposalData;

        await update(ref(db), updates);

        window.triggerSuccessPopup("Asset Disposed Successfully! ♻️");
        window.showStaffView('staff-dash-area');

    } catch (e) {
        console.error("Disposal error", e);
        alert("Error during disposal: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'CONFIRM SCRAP & DISPOSE <span class="text-xs opacity-60">→</span>';
    }
};

// ================================================================ */
// ASSET BATCH MANAGEMENT - RESPONSIVE                              */
// ================================================================ */

window.addAssetToBatch = async () => {
    const barcodeInput = document.getElementById('t_asset_barcode');
    if (!barcodeInput) return;

    const barcode = barcodeInput.value.trim().toUpperCase();
    if (!barcode) {
        alert('Please enter or scan a barcode first.');
        return;
    }

    if (window.transferBatch.some(a => a.barcode === barcode)) {
        alert(`⚠️ Asset ${barcode} is already in the batch.`);
        return;
    }

    const btn = document.querySelector('.add-asset-button');
    const originalContent = btn ? btn.innerHTML : 'Add Asset';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }

    try {
        const snap = await get(child(ref(db), `assets/${barcode}`));
        if (snap.exists()) {
            const rawData = snap.val();
            const normalizer = window.fieldNormalizer || new FieldNormalizer();
            const mappedData = normalizer.mapFields(rawData);
            const asset = normalizer.createAsset(mappedData, barcode);

            window.transferBatch.push(asset);
            window.renderBatchUI();

            barcodeInput.value = '';
            barcodeInput.focus();
            if (navigator.vibrate) navigator.vibrate(50);
        } else {
            alert(`Asset "${barcode}" not found in register!`);
        }
    } catch (e) {
        console.error("Batch add error:", e);
        alert("Connection error while fetching asset.");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
};

window.removeAssetFromBatch = (index) => {
    if (!window.transferBatch || index >= window.transferBatch.length) return;
    const asset = window.transferBatch[index];
    if (confirm(`❌ Remove ${asset.barcode} from batch?`)) {
        window.transferBatch.splice(index, 1);
        window.renderBatchUI();
        if (navigator.vibrate) navigator.vibrate(30);
    }
};

window.renderBatchUI = () => {
    window.renderBatchTable();
    window.renderMobileCards();
    window.updateBatchCounter();
};

window.renderBatchTable = () => {
    const body = document.getElementById('transfer-batch-body');
    if (!body) return;

    if (!window.transferBatch || window.transferBatch.length === 0) {
        body.innerHTML = `
            <tr id="empty-batch-row">
                <td colspan="5" class="empty-state">
                    <i class="fa-solid fa-box-open"></i>
                    <span>No assets added to batch yet.</span>
                </td>
            </tr>
        `;
        return;
    }

    body.innerHTML = window.transferBatch.map((asset, index) => {
        const desc = asset.description || 'N/A';
        const loc = asset.location || 'Unknown';
        const cat = asset.category || 'N/A';

        return `
            <tr>
                <td class="barcode-cell">${asset.barcode}</td>
                <td class="category-cell">${cat}</td>
                <td class="description-cell" title="${desc}">${desc}</td>
                <td class="location-cell" title="${loc}">${loc}</td>
                <td>
                    <div class="action-buttons">
                        <button type="button"
                                onclick="window.openAssetDetailsModal(${index})"
                                class="action-btn view-btn">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        <button type="button"
                                onclick="window.removeAssetFromBatch(${index})"
                                class="action-btn delete-btn">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
};

window.renderMobileCards = () => {
    const container = document.getElementById('batch-mobile-cards');
    if (!container) return;

    if (!window.transferBatch || window.transferBatch.length === 0) {
        container.innerHTML = `
            <div class="empty-state-card">
                <i class="fa-solid fa-box-open"></i>
                <span>No assets added to batch yet.</span>
            </div>
        `;
        return;
    }

    container.innerHTML = window.transferBatch.map((asset, index) => {
        const desc = asset.description || 'N/A';
        const loc = asset.location || 'Unknown';
        const cat = asset.category || 'N/A';

        return `
            <div class="batch-card">
                <div class="card-content">
                    <div class="card-header">
                        <span class="card-barcode">${asset.barcode}</span>
                        <span class="card-category">${cat}</span>
                    </div>
                    <div class="card-description" title="${desc}">${desc}</div>
                    <div class="card-location">
                        <i class="fa-solid fa-location-dot"></i> ${loc}
                    </div>
                </div>
                <div class="card-actions">
                    <button type="button"
                            onclick="window.openAssetDetailsModal(${index})"
                            class="card-btn eye-btn">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                    <button type="button"
                            onclick="window.removeAssetFromBatch(${index})"
                            class="card-btn delete-btn">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
};

window.updateBatchCounter = () => {
    const counter = document.getElementById('batch-counter');
    if (!counter) return;
    const count = window.transferBatch.length;
    counter.textContent = `${count} item${count !== 1 ? 's' : ''}`;
    if (count > 0) counter.classList.add('has-items');
    else counter.classList.remove('has-items');
};

window.openAssetDetailsModal = (index) => {
    if (!window.transferBatch || !window.transferBatch[index]) return;
    const asset = window.transferBatch[index];
    const modal = document.getElementById('asset-details-modal');
    const container = document.getElementById('modal-preview-container');
    if (!modal || !container) return;

    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    const photoUrl = window.getDirectDriveImageUrl(asset.photo);
    const photoHtml = (asset.photo && asset.photo !== 'N/A') ?
        `<img src="${photoUrl}" alt="Asset Photo" onerror="this.style.display='none'">` :
        '<span style="color: #94a3b8; font-size: 13px;">No photo available</span>';

    const fields = [
        { label: 'Barcode', value: asset.barcode, icon: 'fa-regular fa-qrcode', full: false },
        { label: 'Serial Number', value: asset.serialNumber || 'N/A', icon: 'fa-regular fa-hashtag', full: false },
        { label: 'Asset Description', value: asset.description || 'N/A', icon: 'fa-regular fa-file-lines', full: true },
        { label: 'Category', value: asset.category || 'N/A', icon: 'fa-regular fa-tags', full: false },
        { label: 'Manufacturer', value: asset.manufacturer || 'N/A', icon: 'fa-regular fa-industry', full: false },
        { label: 'Model', value: asset.model || 'N/A', icon: 'fa-regular fa-cube', full: false },
        { label: 'Vendor', value: asset.vendor || 'N/A', icon: 'fa-regular fa-building', full: false },
        { label: 'Service Date', value: asset.serviceDate || 'N/A', icon: 'fa-regular fa-calendar', full: false },
        { label: 'Location', value: asset.location || 'N/A', icon: 'fa-regular fa-location-dot', full: false },
        { label: 'Building', value: asset.building || 'N/A', icon: 'fa-regular fa-building', full: false },
        { label: 'Floor', value: asset.floor || 'N/A', icon: 'fa-regular fa-layer-group', full: false },
        { label: 'Room', value: asset.room || 'N/A', icon: 'fa-regular fa-door-open', full: false },
        { label: 'Floor Description', value: asset.floorDesc || 'N/A', icon: 'fa-regular fa-tag', full: false },
        { label: 'Room Barcode', value: asset.roomBC || 'N/A', icon: 'fa-regular fa-qrcode', full: false },
        { label: 'Asset Status', value: asset.assetStatus || 'Active', icon: 'fa-regular fa-circle-check', full: false },
        { label: 'Asset Photo', value: photoHtml, icon: 'fa-regular fa-image', full: true, isPhoto: true }
    ];

    container.innerHTML = fields.map(f => `
        <div class="detail-item ${f.full ? 'full-width' : ''}">
            <span class="detail-label"><i class="${f.icon}"></i> ${f.label}</span>
            <span class="detail-value ${f.label === 'Barcode' ? 'barcode-value' : ''} ${f.isPhoto ? 'photo-value' : ''}">${f.value}</span>
        </div>
    `).join('');
};

window.closeAssetDetailsModal = () => {
    const modal = document.getElementById('asset-details-modal');
    if (modal) { modal.style.display = 'none'; modal.classList.remove('active'); document.body.style.overflow = ''; }
};

// ================================================================ */
// UX HELPERS: KEYBOARD & RESIZE
// ================================================================ */
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.closeAssetDetailsModal();
});

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (window.transferBatch && window.transferBatch.length > 0) {
            window.renderMobileCards();
        }
    }, 250);
});

// ================================================
// MASTER ASSET AUDIT SUBMISSION
// ================================================
window.submitAssetAudit = async (event) => {
    if (event) event.preventDefault();
    const barcode = document.getElementById('f1_asset_barcode').value.trim();
    if (!barcode) return alert("Barcode is required!");
    const btn = event.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> SAVING...';
    try {
        let photoUrl = "";
        if (initialAuditPhotoBase64) {
            const res = await window.uploadToDrive({ action: "upload", type: "audit", fileName: `Audit_${barcode}_${Date.now()}.jpg`, image: initialAuditPhotoBase64 });
            photoUrl = res.fileUrl || "";
        }
        const assetData = {
            assetBarcode: barcode, serialNo: document.getElementById('f2_serial_no').value.trim(), modelDescription: document.getElementById('f3_model_desc').value.trim(),
            assetCondition: document.getElementById('f4_asset_cond').value.trim(), priceStatus: document.getElementById('f5_price_stat').value.trim(), unitCost: document.getElementById('f6_unit_cost').value.trim(),
            assetDescription: document.getElementById('f7_asset_desc').value.trim(), serviceDate: document.getElementById('f8_service_date').value, manufacturer: document.getElementById('f9_manufacturer').value.trim(),
            majorCategory: document.getElementById('f10_major_cat').value, subMajorCategory: document.getElementById('f11_sub_major').value, subMinorCategory: document.getElementById('f12_sub_minor').value,
            dofMajor: document.getElementById('f13_dof_major').value, dofMinor: document.getElementById('f14_dof_minor').value, category: document.getElementById('f15_category').value, classification: document.getElementById('f16_class').value,
            locationName: document.getElementById('f17_location').value, esisCode: document.getElementById('f18_esis').value, schoolBuildingName: document.getElementById('f19_school_building').value,
            roomName: document.getElementById('f20_room_name').value.trim(), roomNumber: document.getElementById('f21_room_no').value.trim(), roomBarcode: document.getElementById('f22_room_barcode').value.trim(),
            floorNo: document.getElementById('f23_floor_no').value, floorDescription: document.getElementById('f24_floor_desc').value.trim(),
            barcodeStatus: document.getElementById('f25_barcode_stat').value, assetStatus: document.getElementById('f26_asset_stat').value, oldSchool: document.getElementById('f27_old_school').value, transactionNo: document.getElementById('f28_trans_no').value,
            usefulLife: document.getElementById('f29_useful_life').value, vendorName: document.getElementById('f30_vendor').value, oldBarcode: document.getElementById('f31_old_barcode').value, farBarcode: document.getElementById('f32_far_barcode').value,
            invoiceNo: document.getElementById('f33_invoice_no').value, dnNo: document.getElementById('f34_dn_no').value, remarks: document.getElementById('f35_remarks').value, physicalRegNo: document.getElementById('f36_phys_reg_no').value,
            fixedAssetReg: document.getElementById('f37_fixed_reg_no').value, mappingCriteria: document.getElementById('f38_mapping').value, auditPhotoUrl: photoUrl, lastAuditTimestamp: new Date().toLocaleString(), updatedBy: window.currentStaff?.name || "Unknown"
        };
        await set(ref(db, `assets/${barcode}`), assetData);
        window.triggerSuccessPopup("Asset Registered Successfully! ✅");
        window.showStaffView('staff-dash-area');
    } catch (e) { console.error(e); alert("Error saving asset: " + e.message); } finally { btn.disabled = false; btn.innerHTML = originalText; }
};

// ================================================
// BATCH SUBMISSION LOGIC
// ================================================
window.submitAssetTransfer = async (event) => {
    if (event) event.preventDefault();
    if (window.transferBatch.length === 0) return alert("Please add at least one asset to the batch!");
    const btn = document.getElementById('submit-transfer-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> UPLOADING BATCH...'; }
    try {
        const sigSecurity = window.getCanvasBase64('t_security_sig');
        const sigReceived = window.getCanvasBase64('t_received_sig');
        if (!sigSecurity || !sigReceived) throw new Error("Both signatures (Security & Receiver) are required!");
        const uploadTask = async (img, fileName, type) => { if (!img || img.length < 500) return ""; const res = await window.uploadToDrive({ action: "upload", type, fileName, image: img }); return res.fileUrl || res.signatureUrl || ""; };
        const batchId = "BATCH-" + Date.now();
        const [urlSec, urlRec, urlPhoto] = await Promise.all([ uploadTask(sigSecurity, `Sig_Sec_${batchId}.png`, 'signature'), uploadTask(sigReceived, `Sig_Rec_${batchId}.png`, 'signature'), uploadTask(transferPhotoBase64, `Img_Batch_${batchId}.jpg`, 'active_asset') ]);
        const commonTransferData = { batchId, collectorFullName: document.getElementById('t_collector_name').value.trim(), companyName: document.getElementById('t_company_name').value.trim(), dateOfCollection: document.getElementById('t_collection_date').value, securitySignatureUrl: urlSec, receivedSignatureUrl: urlRec, transferPhotoUrl: urlPhoto, status: 'In-Transit', timestamp: Date.now(), date: new Date().toLocaleDateString('en-US'), assetCount: window.transferBatch.length };
        const updates = {};
        window.transferBatch.forEach(asset => {
            const transferId = "TRF-" + asset.barcode + "-" + Date.now();
            updates[`asset_transfers/${transferId}`] = { ...commonTransferData, transferId, assetBarcode: asset.barcode, assetDescription: asset.description, category: asset.category, serialNo: asset.serialNumber, sourceLocation: asset.location, sourceBuilding: asset.building };
        });
        await update(ref(db), updates);
        window.triggerSuccessPopup(`${window.transferBatch.length} Assets Transferred! 📦`);
        window.transferBatch = []; window.renderBatchTable(); window.renderMobileCards(); transferPhotoBase64 = "";
        window.closeAssetTransfer();
        if (window.refreshDashboardData) window.refreshDashboardData();
    } catch (e) { console.error(e); alert("Transfer failed: " + e.message); } finally { if (btn) { btn.disabled = false; btn.innerHTML = 'CONFIRM TRANSFER <span class="text-xs opacity-60">→</span>'; } }
};

// ✅ FIXED: Complete transfer updates locationName
window.completeAssetTransfer = async (transferId) => {
    if (!confirm("Mark as RECEIVED?")) return;
    try {
        const snap = await get(child(ref(db), `asset_transfers/${transferId}`));
        if (!snap.exists()) return;
        const tr = snap.val();
        const now = new Date();
        const updates = {};
        updates[`asset_transfers/${transferId}/status`] = 'Completed';
        updates[`assets/${tr.assetBarcode}/locationName`] = tr.toLocation || "Unknown";
        updates[`assets/${tr.assetBarcode}/lastAuditTimestamp`] = now.toLocaleString();
        await update(ref(db), updates);
        alert(`✅ Asset ${tr.assetBarcode} moved`);
        if (window.refreshDashboardData) window.refreshDashboardData();
    } catch (e) { alert("Error: " + e.message); }
};

// ================================================
// SCANNER SYSTEM
// ================================================
window.startCameraScanner = async (inputId) => {
    if (isScannerStarting) return;
    try {
        isScannerStarting = true; currentScanTarget = inputId;
        const modal = document.getElementById('scanner-modal');
        if (modal) { modal.classList.remove('hidden'); modal.style.display = 'flex'; }
        if (html5QrCode) { await html5QrCode.stop().catch(()=>{}); await html5QrCode.clear(); }
        html5QrCode = new Html5Qrcode("scanner-container");
         await html5QrCode.start({ facingMode: "environment" }, { fps: 30, qrbox: 250 }, async (text) => {
            const val = text.trim().toUpperCase();
            const input = document.getElementById(currentScanTarget);
            if (input) {
                input.value = val;
                if (currentScanTarget === 't_asset_barcode') { window.addAssetToBatch(); }
                else if (currentScanTarget === 'f1_disposal_barcode_input') { window.fetchDisposalAssetDetails(val); }
                else if (currentScanTarget === 'f1_asset_barcode') { window.fetchAuditAssetDetails(val); if (window.checkDuplicateBarcode) window.checkDuplicateBarcode(val); }
            }
            window.stopCameraScanner();
        });
        isScannerRunning = true;
    } catch (e) { console.error(e); window.stopCameraScanner(); } finally { isScannerStarting = false; }
};

window.stopCameraScanner = async () => {
    if (html5QrCode) { await html5QrCode.stop().catch(()=>{}); await html5QrCode.clear(); html5QrCode = null; }
    const modal = document.getElementById('scanner-modal'); if (modal) modal.classList.add('hidden'); isScannerRunning = false;
};

// ================================================
// ASSET DATA FETCHING WITH NORMALIZATION
// ================================================
const CONFIG = { TIMEOUT: 15000, RETRY_ATTEMPTS: 3, RETRY_DELAY: 1000, DEBUG: true };

window.getDirectDriveImageUrl = (url) => {
    if (!url || url === 'N/A' || url === '-') return 'https://placehold.co/400x300?text=No+Photo';
    try { const urlObj = new URL(url); if (urlObj.hostname.includes('drive.google.com')) { const fileId = urlObj.pathname.split('/')[3]; if (fileId) return `https://drive.google.com/uc?export=view&id=${fileId}`; } return url; } catch (e) { return url; }
};

window.renderSmartPreview = (areaId, data, barcode, colorTheme = 'indigo') => {
    const previewArea = document.getElementById(areaId); if (!previewArea) return;
    const theme = colorTheme === 'red' ?
        { bg: 'bg-[#fef2f2]', border: 'border-[#fecaca]', text: 'text-[#991b1b]', accent: 'bg-[#dc2626]', sub: 'text-[#dc2626]', itemBg: 'bg-[#ffffff]' } :
        { bg: 'bg-[#f8fafc]', border: 'border-[#e2e8f0]', text: 'text-[#0f172a]', accent: 'bg-[#4f46e5]', sub: 'text-[#64748b]', itemBg: 'bg-[#ffffff]' };

    const photoUrl = window.getDirectDriveImageUrl(data.photo || data.auditPhotoUrl);
    const fields = [
        { label: 'Location', value: data.location || 'N/A' },
        { label: 'Building', value: data.building || 'N/A' },
        { label: 'Floor No', value: data.floor || data.floorNo || 'N/A' },
        { label: 'Floor Desc', value: data.floorDesc || 'N/A' },
        { label: 'Room No', value: data.room || data.roomNo || 'N/A' },
        { label: 'Room Name', value: data.roomName || 'N/A' },
        { label: 'Room BC', value: data.roomBC || 'N/A' },
        { label: 'Vendor', value: data.vendor || 'N/A' },
        { label: 'Manufacturer', value: data.manufacturer || 'N/A' },
        { label: 'Model', value: data.model || 'N/A' },
        { label: 'Serial No', value: data.serial || data.serialNumber || 'N/A' },
        { label: 'Service Date', value: data.serviceDate || 'N/A' },
        { label: 'Category', value: data.category || 'N/A' },
        { label: 'Major Cat', value: data.majorCategory || 'N/A' },
        { label: 'Class', value: data.classification || 'N/A' },
        { label: 'Status', value: data.assetStatus || 'Registered' }
    ];

    previewArea.innerHTML = `
        <div class="glass-preview-card ${theme.bg} ${theme.border} p-4 md:p-6 rounded-[2rem] border-2 shadow-sm space-y-6 animate-slide-up mb-6">
            <div class="flex items-center gap-4 md:gap-6 pb-6 border-b border-gray-100">
                <div class="w-20 h-20 md:w-24 md:h-24 rounded-3xl overflow-hidden shadow-sm border-2 border-white bg-white flex items-center justify-center flex-shrink-0">
                    ${(data.photo && data.photo !== "N/A") ? `<img src="${photoUrl}" class="w-full h-full object-cover">` : `<i class="fa-solid fa-camera-retro text-gray-200 text-3xl"></i>`}
                </div>
                <div class="min-w-0 flex-1">
                    <h4 class="text-sm md:text-lg font-black ${theme.text} uppercase truncate leading-tight">${data.desc || data.description || 'N/A'}</h4>
                    <div class="flex flex-wrap items-center gap-2 mt-2">
                        <span class="px-3 py-1 ${theme.accent} text-white rounded-full text-[9px] font-mono font-bold tracking-widest shadow-sm">${barcode}</span>
                        <span class="px-3 py-1 bg-[#e0e7ff] text-[10px] font-black text-[#3730a3] uppercase rounded-full border border-white/50">${data.category || 'N/A'}</span>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                ${fields.map(f => `
                    <div class="${theme.itemBg} p-3 rounded-xl border border-[#e2e8f0] shadow-sm">
                        <span class="block text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1">${f.label}</span>
                        <span class="block text-[13px] font-bold text-[#0f172a] truncate">${f.value || 'N/A'}</span>
                    </div>
                `).join('')}
            </div>
            <div class="pt-2 flex items-center justify-between text-[10px] font-bold text-[#64748b] opacity-60">
                <span class="flex items-center gap-1"><i class="fa-solid fa-shield-check"></i> Data Verified</span>
                <span>${new Date().toLocaleDateString()}</span>
            </div>
        </div>
    `;
};

window.renderTransparentPreview = (data, barcode) => { window.renderSmartPreview('transfer-asset-preview', data, barcode, 'indigo'); };

window.initTransferSigPads = () => {
    window.sigPadManager.getPad('t_security_sig');
    window.sigPadManager.getPad('t_received_sig');
};

window.clearTransferSig = (id) => {
    const pad = window.sigPadManager.getPad(id);
    pad.clear();
    pad.lock();
};

window.handleTransferPhoto = (event) => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { transferPhotoBase64 = e.target.result; const preview = document.getElementById('t_photo_preview'); const btnText = document.getElementById('t_photo_btn_text'); if (preview) { preview.classList.remove('hidden'); preview.querySelector('img').src = transferPhotoBase64; } if (btnText) btnText.innerText = "Photo Captured ✅"; }; reader.readAsDataURL(file); };

// =========================================================
// ROLE-BASED ACCESS
// =========================================================
const TRANSFER_ALLOWED_ROLES = ['admin', 'security', 'cleaner leader', 'technician'];
window.hasTransferAccess = () => { if (window.isAdminLoggedIn) return true; if (!window.currentStaff) return false; return TRANSFER_ALLOWED_ROLES.includes((window.currentStaff.role || "").toLowerCase().trim()); };
window.openAssetTransfer = () => { if (!window.hasTransferAccess()) return alert("❌ Permission Denied"); window.showStaffView('asset-transfer-section'); const dateInput = document.getElementById('t_collection_date'); if (dateInput) dateInput.value = new Date().toISOString().split('T')[0]; window.initTransferSigPads(); };
window.openTransferLogs = async () => { if (!window.hasTransferAccess()) return alert("❌ Permission Denied"); window.showStaffView('transfer-logs-section'); const snap = await get(ref(db, 'asset_transfers')); const transfers = snap.exists() ? Object.values(snap.val()) : []; window.renderTransferTable(transfers); };
window.closeAssetTransfer = () => { window.showStaffView('staff-dash-area'); };

console.log("✅ audit_module.js v3.5.5 Ready");
