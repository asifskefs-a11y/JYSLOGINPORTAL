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
window.transferBatch = []; // NEW: Attach to window for global access

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

// ================================================
// MULTI-ASSET BATCH LOGIC (FIXED v3.5.4)
// ================================================
window.addAssetToBatch = async () => {
    const input = document.getElementById('t_asset_barcode');
    const barcode = input?.value?.trim().toUpperCase();

    if (!barcode) {
        alert("Please enter or scan a barcode!");
        return;
    }

    // Check for duplicates in current batch
    if (window.transferBatch.some(a => a.barcode === barcode)) {
        alert("This asset is already in the batch!");
        input.value = "";
        return;
    }

    // Show loading indicator on button
    const btn = document.querySelector('button[onclick="window.addAssetToBatch()"]');
    const originalContent = btn ? btn.innerHTML : '+ ADD ASSET';
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

            // Add to batch array
            window.transferBatch.push(asset);

            // Update UI
            window.renderBatchTable();
            input.value = ""; // Clear input for next scan
            input.focus();
            console.log("✅ Asset added to batch:", barcode);
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

// ======================================== */
// RENDER BATCH TABLE - MOBILE RESPONSIVE */
// ======================================== */

window.renderBatchTable = () => {
    const body = document.getElementById('transfer-batch-body');
    const mobileCards = document.getElementById('batch-mobile-cards');

    if (!body) return;

    if (!window.transferBatch || window.transferBatch.length === 0) {
        // Empty state for table
        body.innerHTML = `
            <tr id="empty-batch-row">
                <td colspan="4" class="empty-state">
                    <i class="fa-solid fa-box-open block text-2xl mb-2 opacity-20"></i>
                    No assets added to batch yet.
                </td>
            </tr>
        `;

        // Empty state for mobile cards
        if (mobileCards) {
            mobileCards.innerHTML = `
                <div class="empty-state-card text-center p-8 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 italic">
                    <i class="fa-solid fa-box-open block text-3xl mb-3 opacity-20"></i>
                    No assets added to batch yet.
                </div>
            `;
        }
        return;
    }

    // ======================================== */
    // RENDER TABLE (Desktop/Tablet)
    // ======================================== */
    body.innerHTML = window.transferBatch.map((asset, index) => {
        const sourceLoc = asset.location || 'Unknown';
        const desc = asset.description || 'N/A';

        return `
            <tr class="animate-fade-in">
                <td class="barcode-cell">${asset.barcode}</td>
                <td class="description-cell truncate max-w-[200px]" title="${desc}">${desc}</td>
                <td class="location-cell truncate max-w-[150px]" title="${sourceLoc}">${sourceLoc}</td>
                <td>
                    <div class="action-buttons">
                        <button type="button"
                                onclick="window.openAssetDetailsModal(${index})"
                                class="action-btn view-btn"
                                aria-label="View asset details">
                            <i class="fa-solid fa-eye text-xs"></i>
                        </button>
                        <button type="button"
                                onclick="window.removeAssetFromBatch(${index})"
                                class="action-btn delete-btn"
                                aria-label="Remove asset from batch">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // ======================================== */
    // RENDER MOBILE CARDS
    // ======================================== */
    if (mobileCards) {
        mobileCards.innerHTML = window.transferBatch.map((asset, index) => {
            const sourceLoc = asset.location || 'Unknown';
            const desc = asset.description || 'N/A';
            const category = asset.category || 'N/A';

            return `
                <div class="batch-card animate-fade-in flex items-center justify-between p-4 bg-white border border-indigo-100 rounded-2xl shadow-sm mb-3" data-index="${index}">
                    <div class="flex-1 min-w-0 pr-4">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-[10px] font-mono font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">${asset.barcode}</span>
                            <span class="text-[8px] font-black text-slate-400 uppercase tracking-tighter truncate">${category}</span>
                        </div>
                        <h4 class="text-[12px] font-bold text-slate-800 truncate">${desc}</h4>
                        <p class="text-[9px] font-medium text-slate-400 flex items-center gap-1 mt-0.5">
                            <i class="fa-solid fa-location-dot text-indigo-300"></i> ${sourceLoc}
                        </p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button type="button"
                                onclick="window.openAssetDetailsModal(${index})"
                                class="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center active:scale-90 transition-all shadow-sm border border-indigo-100/50"
                                aria-label="View Details">
                            <i class="fa-solid fa-eye text-lg"></i>
                        </button>
                        <button type="button"
                                onclick="window.removeAssetFromBatch(${index})"
                                class="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center active:scale-90 transition-all shadow-sm border border-rose-100/50"
                                aria-label="Remove">
                            <i class="fa-solid fa-trash-can text-lg"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }
};

// ======================================== */
// HANDLE WINDOW RESIZE
// ======================================== */
let resizeTimeout;

window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        // Re-render only if batch exists
        if (window.transferBatch && window.transferBatch.length > 0) {
            window.renderBatchTable();
        }
    }, 250);
});

window.removeAssetFromBatch = (index) => {
    if (confirm(`Remove asset from batch?`)) {
        window.transferBatch.splice(index, 1);
        window.renderBatchTable();
    }
};

window.openAssetDetailsModal = (index) => {
    const asset = window.transferBatch[index];
    if (!asset) return;

    const modal = document.getElementById('asset-details-modal');
    const container = document.getElementById('modal-preview-container');

    if (modal && container) {
        const normalizer = window.fieldNormalizer || new FieldNormalizer();
        const displayData = normalizer.toDisplayObject(asset);

        container.innerHTML = "";
        // Use colorTheme 'indigo' for Transfer details
        window.renderSmartPreview('modal-preview-container', displayData, asset.barcode, 'indigo');

        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
};

window.closeAssetDetailsModal = () => {
    const modal = document.getElementById('asset-details-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
};

// ================================================
// BATCH SUBMISSION LOGIC
// ================================================
window.submitAssetTransfer = async (event) => {
    if (event) event.preventDefault();

    if (!window.transferBatch || window.transferBatch.length === 0) {
        alert("Please add at least one asset to the batch!");
        return;
    }

    const btn = document.getElementById('submit-transfer-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> UPLOADING BATCH...';
    }

    try {
        const sigSecurity = window.getCanvasBase64('t_security_sig');
        const sigReceived = window.getCanvasBase64('t_received_sig');

        if (!sigSecurity || !sigReceived) throw new Error("Both signatures (Security & Receiver) are required!");

        const uploadTask = async (img, fileName, type) => {
            if (!img || img.length < 500) return "";
            const res = await window.uploadToDrive({ action: "upload", type, fileName, image: img });
            return res.fileUrl || res.signatureUrl || "";
        };

        const batchId = "BATCH-" + Date.now();
        const [urlSec, urlRec, urlPhoto] = await Promise.all([
            uploadTask(sigSecurity, `Sig_Sec_${batchId}.png`, 'signature'),
            uploadTask(sigReceived, `Sig_Rec_${batchId}.png`, 'signature'),
            uploadTask(transferPhotoBase64, `Img_Batch_${batchId}.jpg`, 'active_asset')
        ]);

        const commonTransferData = {
            batchId,
            collectorFullName: document.getElementById('t_collector_name').value.trim(),
            companyName: document.getElementById('t_company_name').value.trim(),
            dateOfCollection: document.getElementById('t_collection_date').value,
            securitySignatureUrl: urlSec,
            receivedSignatureUrl: urlRec,
            transferPhotoUrl: urlPhoto,
            status: 'In-Transit',
            timestamp: Date.now(),
            date: new Date().toLocaleDateString('en-US'),
            assetCount: window.transferBatch.length
        };

        const updates = {};
        window.transferBatch.forEach(asset => {
            const transferId = "TRF-" + asset.barcode + "-" + Date.now();
            updates[`asset_transfers/${transferId}`] = {
                ...commonTransferData,
                transferId,
                assetBarcode: asset.barcode,
                assetDescription: asset.description,
                category: asset.category,
                serialNo: asset.serialNumber,
                sourceLocation: asset.location,
                sourceBuilding: asset.building
            };
        });

        await update(ref(db), updates);
        window.triggerSuccessPopup(`${window.transferBatch.length} Assets Transferred! 📦`);

        // Reset Batch
        window.transferBatch = [];
        window.renderBatchTable();
        transferPhotoBase64 = "";
        const photoPreview = document.getElementById('t_photo_preview');
        if (photoPreview) photoPreview.classList.add('hidden');
        window.closeAssetTransfer();
        if (window.refreshDashboardData) window.refreshDashboardData();

    } catch (e) {
        console.error("Batch Transfer Error:", e);
        alert("Transfer failed: " + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'CONFIRM TRANSFER <span class="text-xs opacity-60">→</span>';
        }
    }
};

// ✅ FIXED: Complete transfer updates locationName
window.completeAssetTransfer = async (transferId) => {
    if (!confirm("Mark as RECEIVED?")) return;
    try {
        const snap = await get(child(ref(db), `asset_transfers/${transferId}`));
        if (!snap.exists()) return;
        const tr = snap.val();
        if (!tr.toLocation) return alert("⚠️ Error: Missing destination location!");

        const now = new Date();
        const updates = {};
        updates[`asset_transfers/${transferId}/status`] = 'Completed';
        updates[`assets/${tr.assetBarcode}/locationName`] = tr.toLocation; // ✅ SYNCED
        updates[`assets/${tr.assetBarcode}/lastAuditTimestamp`] = now.toLocaleString();

        await update(ref(db), updates);
        alert(`✅ Asset ${tr.assetBarcode} moved to ${tr.toLocation}`);
        if (window.refreshDashboardData) window.refreshDashboardData();
    } catch (e) { alert("Error: " + e.message); }
};

// ================================================
// SCANNER SYSTEM
// ================================================
window.startCameraScanner = async (inputId) => {
    if (isScannerStarting) return;
    try {
        isScannerStarting = true;
        currentScanTarget = inputId;
        const modal = document.getElementById('scanner-modal');
        if (modal) { modal.classList.remove('hidden'); modal.style.display = 'flex'; }
        if (html5QrCode) { await html5QrCode.stop().catch(()=>{}); await html5QrCode.clear(); }
        html5QrCode = new Html5Qrcode("scanner-container");
         await html5QrCode.start({ facingMode: "environment" }, { fps: 30, qrbox: 250 }, async (text) => {
            const val = text.trim().toUpperCase();
            const input = document.getElementById(currentScanTarget);
            if (input) {
                input.value = val;
                // Trigger auto-fetch based on target
                if (currentScanTarget === 't_asset_barcode') {
                    window.addAssetToBatch(); // Trigger batch add instead of single fetch
                } else if (currentScanTarget === 'f1_disposal_barcode_input') {
                    window.fetchDisposalAssetDetails(val);
                } else if (currentScanTarget === 'f1_asset_barcode') {
                    window.fetchAuditAssetDetails(val);
                    if (window.checkDuplicateBarcode) window.checkDuplicateBarcode(val);
                }
            }
            window.stopCameraScanner();
        });
        isScannerRunning = true;
    } catch (e) { console.error(e); window.stopCameraScanner(); }
    finally { isScannerStarting = false; }
};

window.stopCameraScanner = async () => {
    if (html5QrCode) { await html5QrCode.stop().catch(()=>{}); await html5QrCode.clear(); html5QrCode = null; }
    const modal = document.getElementById('scanner-modal');
    if (modal) modal.classList.add('hidden');
    isScannerRunning = false;
};

// ================================================
// ASSET DATA FETCHING WITH NORMALIZATION
// CROSS-DEVICE SUPPORT + FUZZY MATCHING
// ================================================
const CONFIG = {
    TIMEOUT: 15000,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000,
    DEBUG: true,
};

// ================================================
// IMAGE URL VALIDATOR
// ================================================
window.getDirectDriveImageUrl = (url) => {
    if (!url || url === 'N/A' || url === '-') return 'https://placehold.co/400x300?text=No+Photo';

    try {
        const urlObj = new URL(url);
        if (urlObj.hostname.includes('drive.google.com')) {
            const fileId = urlObj.pathname.split('/')[3];
            if (fileId) {
                return `https://drive.google.com/uc?export=view&id=${fileId}`;
            }
        }
        return url;
    } catch (e) {
        return url;
    }
};

// ================================================
// ENHANCED PREVIEW RENDERER
// ================================================
window.renderTransparentPreview = (data, barcode) => {
    const previewArea = document.getElementById('transfer-asset-preview');
    if (!previewArea) return;

    const isMobile = window.innerWidth < 640;

    // Safe data with normalization fallbacks
    const safeData = {
        desc: data?.desc || 'N/A',
        vendor: data?.vendor || 'N/A',
        category: data?.category || 'N/A',
        location: data?.location || 'N/A',
        building: data?.building || 'N/A',
        floor: data?.floor || 'N/A',
        room: data?.room || 'N/A',
        serial: data?.serial || 'N/A',
        manufacturer: data?.manufacturer || 'N/A',
        photo: data?.photo || null,
        barcode: barcode || data?.barcode || 'N/A',
        model: data?.model || 'N/A',
        serviceDate: data?.serviceDate || 'N/A',
        floorDesc: data?.floorDesc || 'N/A'
    };

    const photoHTML = (url) => {
        if (!url || url === 'N/A' || url === '-') return `<i class="fa-solid fa-camera-retro text-indigo-200 text-2xl"></i>`;
        const validUrl = window.getDirectDriveImageUrl(url);
        return `<img src="${validUrl}" class="${isMobile ? 'w-16 h-16' : 'w-20 h-20'} rounded-xl object-cover" onerror="this.parentElement.innerHTML='<i class=\'fa-solid fa-image-slash text-indigo-200 text-2xl\'></i>'">`;
    };

    previewArea.innerHTML = `
        <div class="glass-preview-card p-4 space-y-4 animate-slide-up">
            <div class="flex items-center gap-4 pb-4 border-b border-white/40">
                <div class="flex-shrink-0 bg-indigo-50/50 rounded-2xl overflow-hidden shadow-lg border-2 border-white/60 flex items-center justify-center w-20 h-20">
                    ${photoHTML(safeData.photo)}
                </div>
                <div class="min-w-0 flex-1">
                    <h4 class="text-sm font-black text-indigo-950 uppercase truncate leading-tight">${safeData.desc}</h4>
                    <div class="flex flex-wrap items-center gap-2 mt-2">
                        <span class="px-2 py-0.5 bg-indigo-600 text-white rounded text-[8px] font-mono font-bold">${safeData.barcode}</span>
                        <span class="text-[9px] font-black text-indigo-500 uppercase">${safeData.category}</span>
                    </div>
                    <span class="text-[8px] font-semibold text-indigo-400 uppercase">${safeData.manufacturer}</span>
                </div>
            </div>

            <div class="grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-2">
                <div class="p-2 rounded-xl bg-white/40">
                    <span class="text-[8px] font-bold text-indigo-400 uppercase block">Location</span>
                    <span class="text-xs font-semibold text-indigo-950">${safeData.location}</span>
                </div>
                <div class="p-2 rounded-xl bg-white/40">
                    <span class="text-[8px] font-bold text-indigo-400 uppercase block">Building</span>
                    <span class="text-xs font-semibold text-indigo-950">${safeData.building}</span>
                </div>
                <div class="p-2 rounded-xl bg-white/40">
                    <span class="text-[8px] font-bold text-indigo-400 uppercase block">Floor</span>
                    <span class="text-xs font-semibold text-indigo-950">${safeData.floor}</span>
                </div>
                <div class="p-2 rounded-xl bg-white/40">
                    <span class="text-[8px] font-bold text-indigo-400 uppercase block">Room</span>
                    <span class="text-xs font-semibold text-indigo-950">${safeData.room}</span>
                </div>
                <div class="p-2 rounded-xl bg-white/40 ${!isMobile ? 'col-span-2' : ''}">
                    <span class="text-[8px] font-bold text-indigo-400 uppercase block">Vendor</span>
                    <span class="text-xs font-semibold text-indigo-950">${safeData.vendor}</span>
                </div>
                <div class="p-2 rounded-xl bg-white/40">
                    <span class="text-[8px] font-bold text-indigo-400 uppercase block">Serial No</span>
                    <span class="text-xs font-mono font-semibold text-indigo-950">${safeData.serial}</span>
                </div>
                <div class="p-2 rounded-xl bg-white/40">
                    <span class="text-[8px] font-bold text-indigo-400 uppercase block">Model</span>
                    <span class="text-xs font-semibold text-indigo-950">${safeData.model}</span>
                </div>
            </div>

            <div class="flex items-center gap-3 pt-2 text-[9px] text-indigo-400/80 border-t border-white/20">
                <i class="fa-regular fa-circle-check text-indigo-400"></i>
                <span>Ready for transfer</span>
                <span class="ml-auto">${new Date().toLocaleDateString()}</span>
            </div>
        </div>
    `;
};

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
        let photoUrl = document.getElementById('a_asset_photo').value || "";

        // Upload new photo if captured
        if (initialAuditPhotoBase64) {
            const res = await window.uploadToDrive({
                action: "upload",
                type: "audit",
                fileName: `Audit_${barcode}_${Date.now()}.jpg`,
                image: initialAuditPhotoBase64
            });
            photoUrl = res.fileUrl || "";
        }

        const assetData = {
            assetBarcode: barcode,
            serialNo: document.getElementById('f2_serial_no').value.trim(),
            modelDescription: document.getElementById('f3_model_desc').value.trim(),
            assetCondition: document.getElementById('f4_asset_cond').value.trim(),
            priceStatus: document.getElementById('f5_price_stat').value.trim(),
            unitCost: document.getElementById('f6_unit_cost').value.trim(),
            assetDescription: document.getElementById('f7_asset_desc').value.trim(),
            serviceDate: document.getElementById('f8_service_date').value,
            manufacturer: document.getElementById('f9_manufacturer').value.trim(),

            majorCategory: document.getElementById('f10_major_cat').value,
            subMajorCategory: document.getElementById('f11_sub_major').value,
            subMinorCategory: document.getElementById('f12_sub_minor').value,
            dofMajor: document.getElementById('f13_dof_major').value,
            dofMinor: document.getElementById('f14_dof_minor').value,
            category: document.getElementById('f15_category').value,
            classification: document.getElementById('f16_class').value,

            locationName: document.getElementById('f17_location').value,
            esisCode: document.getElementById('f18_esis').value,
            schoolBuildingName: document.getElementById('f19_school_building').value,
            roomName: document.getElementById('f20_room_name').value.trim(),
            roomNumber: document.getElementById('f21_room_no').value.trim(),
            roomBarcode: document.getElementById('f22_room_barcode').value.trim(),
            floorNo: document.getElementById('f23_floor_no').value,
            floorDescription: document.getElementById('f24_floor_desc').value.trim(),

            barcodeStatus: document.getElementById('f25_barcode_stat').value,
            assetStatus: document.getElementById('f26_asset_stat').value,
            oldSchool: document.getElementById('f27_old_school').value,
            transactionNo: document.getElementById('f28_trans_no').value,
            usefulLife: document.getElementById('f29_useful_life').value,
            vendorName: document.getElementById('f30_vendor').value,
            oldBarcode: document.getElementById('f31_old_barcode').value,
            farBarcode: document.getElementById('f32_far_barcode').value,
            invoiceNo: document.getElementById('f33_invoice_no').value,
            dnNo: document.getElementById('f34_dn_no').value,
            remarks: document.getElementById('f35_remarks').value,
            physicalRegNo: document.getElementById('f36_phys_reg_no').value,
            fixedAssetReg: document.getElementById('f37_fixed_reg_no').value,
            mappingCriteria: document.getElementById('f38_mapping').value,

            auditPhotoUrl: photoUrl,
            lastAuditTimestamp: new Date().toLocaleString(),
            updatedBy: window.currentStaff?.name || "Unknown"
        };

        await set(ref(db, `assets/${barcode}`), assetData);

        // Log the audit action
        await set(ref(db, `audit_logs/${barcode}_${Date.now()}`), {
            barcode,
            action: 'Audit/Update',
            performedBy: window.currentStaff?.name || "Unknown",
            timestamp: Date.now()
        });

        window.triggerSuccessPopup("Asset Registered Successfully! ✅");
        window.showStaffView('staff-dash-area');

    } catch (e) {
        console.error("Audit submission error", e);
        alert("Error saving asset: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

// ================================================
// ENHANCED ASSET FETCH WITH NORMALIZATION
// ================================================
window.fetchTransferAssetDetails = async (barcode, retryCount = 0) => {
    const previewArea = document.getElementById('transfer-asset-preview');
    const submitBtn = document.getElementById('submit-transfer-btn');

    if (!barcode || barcode.trim() === '') {
        if (previewArea) previewArea.innerHTML = "";
        if (submitBtn) submitBtn.disabled = true;
        window.activeTransferAsset = null;
        return;
    }

    const sanitizedBarcode = barcode.trim().toUpperCase();

    if (previewArea) {
        previewArea.innerHTML = `
            <div class="glass-preview-card flex items-center justify-center gap-4 py-8 animate-pulse">
                <i class="fa-solid fa-compass-drafting fa-spin text-indigo-500 text-2xl"></i>
                <span class="text-xs font-black uppercase tracking-widest text-indigo-900">
                    ${retryCount > 0 ? `Retrying... (${retryCount}/${CONFIG.RETRY_ATTEMPTS})` : 'Syncing Master Record...'}
                </span>
            </div>
        `;
    }
    if (submitBtn) submitBtn.disabled = true;

    try {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout')), CONFIG.TIMEOUT);
        });

        const fetchPromise = get(child(ref(db), `assets/${sanitizedBarcode}`));
        const snap = await Promise.race([fetchPromise, timeoutPromise]);

        if (snap.exists()) {
            const rawData = snap.val();
            const normalizer = window.fieldNormalizer || new FieldNormalizer();
            const mappedData = normalizer.mapFields(rawData);
            const asset = normalizer.createAsset(mappedData, sanitizedBarcode);

            window.activeTransferAsset = asset;

            const inputMap = {
                't_asset_description': asset.description,
                't_asset_vendor': asset.vendor,
                't_asset_category': asset.category,
                't_asset_location': asset.location,
                't_asset_manufacturer': asset.manufacturer,
                't_asset_serial_no_display': asset.serialNumber,
                't_asset_building': asset.building,
                't_asset_model': asset.model,
                't_asset_service_date': asset.serviceDate,
                't_asset_barcode_val': sanitizedBarcode,
                't_asset_floor_no': asset.floorNo,
                't_asset_room_name': asset.roomName,
                't_asset_room_no': asset.roomNo,
                't_asset_floor_desc': asset.floorDesc,
                't_asset_room_bc': asset.roomBC,
                't_asset_photo': asset.photo
            };

            for (let id in inputMap) {
                const el = document.getElementById(id);
                if (el) el.value = inputMap[id] || 'N/A';
            }

            const displayData = normalizer.toDisplayObject(asset);
            window.renderTransparentPreview(displayData, sanitizedBarcode);

            if (submitBtn) submitBtn.disabled = false;

        } else {
            if (previewArea) {
                previewArea.innerHTML = `
                    <div class="p-6 bg-rose-50/80 backdrop-blur-sm rounded-2xl border-2 border-rose-200/80 text-center space-y-3 animate-slide-up">
                        <div class="flex justify-center"><div class="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center"><i class="fa-solid fa-triangle-exclamation text-rose-500 text-2xl"></i></div></div>
                        <div>
                            <h4 class="text-sm font-black text-rose-800 uppercase tracking-wider">Asset Not Registered</h4>
                            <p class="text-xs text-rose-600/80 mt-1">This barcode does not exist in the asset database.</p>
                        </div>
                    </div>
                `;
            }
            window.activeTransferAsset = null;
            if (submitBtn) submitBtn.disabled = true;
        }
    } catch (error) {
        if (retryCount < CONFIG.RETRY_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY * (retryCount + 1)));
            return window.fetchTransferAssetDetails(barcode, retryCount + 1);
        }
        if (previewArea) {
            previewArea.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded-xl border-2 border-red-200"><div class="flex items-center gap-3"><i class="fa-solid fa-circle-exclamation text-red-500 text-xl"></i><div><div class="font-bold text-sm">Connection Error</div><div class="text-xs opacity-75">${error.message}</div></div></div></div>`;
        }
        if (submitBtn) submitBtn.disabled = true;
        window.activeTransferAsset = null;
    }
};

// ================================================
// DISPOSAL ASSET FETCHING
// ================================================
window.fetchDisposalAssetDetails = async (barcode, retryCount = 0) => {
    const previewArea = document.getElementById('disposal-asset-preview');
    const submitBtn = document.getElementById('submit-disposal-btn');

    if (!barcode || barcode.trim() === '') {
        if (previewArea) previewArea.innerHTML = "";
        if (submitBtn) submitBtn.disabled = true;
        window.activeDisposalAsset = null;
        return;
    }

    const sanitizedBarcode = barcode.trim().toUpperCase();

    if (previewArea) {
        previewArea.innerHTML = `
            <div class="flex items-center justify-center gap-3 py-4 animate-pulse">
                <i class="fa-solid fa-spinner fa-spin text-red-500"></i>
                <span class="text-[10px] font-black uppercase text-red-900">Checking Record...</span>
            </div>
        `;
    }

    try {
        const snap = await get(child(ref(db), `assets/${sanitizedBarcode}`));
        if (snap.exists()) {
            const rawData = snap.val();
            const normalizer = window.fieldNormalizer || new FieldNormalizer();
            const mappedData = normalizer.mapFields(rawData);
            const asset = normalizer.createAsset(mappedData, sanitizedBarcode);
            window.activeDisposalAsset = asset;

            const inputMap = {
                'd_asset_description': asset.description,
                'd_asset_vendor': asset.vendor,
                'd_asset_category': asset.category,
                'd_asset_location': asset.location,
                'd_asset_manufacturer': asset.manufacturer,
                'd_asset_serial_no_display': asset.serialNumber,
                'd_asset_building': asset.building,
                'd_asset_model': asset.model,
                'd_asset_service_date': asset.serviceDate,
                'd_asset_barcode_val': sanitizedBarcode,
                'd_asset_floor_no': asset.floorNo,
                'd_asset_room_name': asset.roomName,
                'd_asset_room_no': asset.roomNo,
                'd_asset_floor_desc': asset.floorDesc,
                'd_asset_room_bc': asset.roomBC,
                'd_asset_photo': asset.photo
            };

            for (let id in inputMap) {
                const el = document.getElementById(id);
                if (el) el.value = inputMap[id] || 'N/A';
            }

            // Render Disposal Preview (Red Theme)
            window.renderSmartPreview('disposal-asset-preview', normalizer.toDisplayObject(asset), sanitizedBarcode, 'red');
            if (submitBtn) submitBtn.disabled = false;
        } else {
            if (previewArea) {
                previewArea.innerHTML = `<div class="p-3 bg-red-50 text-red-600 rounded-xl text-[10px] font-bold text-center">⚠️ Asset Not Registered</div>`;
            }
            window.activeDisposalAsset = null;
            if (submitBtn) submitBtn.disabled = true;
        }
    } catch (e) {
        if (retryCount < CONFIG.RETRY_ATTEMPTS) return window.fetchDisposalAssetDetails(barcode, retryCount + 1);
        if (previewArea) previewArea.innerHTML = `<div class="p-3 bg-red-50 text-red-600 rounded-xl text-[10px] font-bold text-center">Error Connecting</div>`;
    }
};

// ================================================
// AUDIT ASSET FETCHING (MASTER REGISTER)
// ================================================
window.fetchAuditAssetDetails = async (barcode, retryCount = 0) => {
    const previewArea = document.getElementById('audit-asset-preview');
    if (!barcode || barcode.trim() === '') {
        if (previewArea) previewArea.innerHTML = "";
        return;
    }
    const sanitizedBarcode = barcode.trim().toUpperCase();

    try {
        const snap = await get(child(ref(db), `assets/${sanitizedBarcode}`));
        if (snap.exists()) {
            const rawData = snap.val();
            const normalizer = window.fieldNormalizer || new FieldNormalizer();
            const mappedData = normalizer.mapFields(rawData);
            const asset = normalizer.createAsset(mappedData, sanitizedBarcode);

            // Auto-fill form fields if asset exists
            const formMap = {
                'f2_serial_no': asset.serialNumber,
                'f3_model_desc': asset.model,
                'f7_asset_desc': asset.description,
                'f9_manufacturer': asset.manufacturer,
                'f20_room_name': asset.roomName,
                'f21_room_no': asset.roomNo,
                'f22_room_barcode': asset.roomBC,
                'f24_floor_desc': asset.floorDesc
            };

            for (let id in formMap) {
                const el = document.getElementById(id);
                if (el && (!el.value || el.value === 'N/A' || el.value === '-')) {
                    el.value = formMap[id] !== 'N/A' ? formMap[id] : '';
                }
            }

            // Set select values if they match
            const selectMap = {
                'f10_major_cat': asset.category,
                'f15_category': asset.category,
                'f19_school_building': asset.building,
                'f23_floor_no': asset.floorNo
            };

            for (let id in selectMap) {
                const el = document.getElementById(id);
                if (el) {
                    for (let option of el.options) {
                        if (option.value.toLowerCase() === selectMap[id].toLowerCase()) {
                            el.value = option.value;
                            break;
                        }
                    }
                }
            }

            window.renderSmartPreview('audit-asset-preview', normalizer.toDisplayObject(asset), sanitizedBarcode, 'indigo');
        } else {
            if (previewArea) previewArea.innerHTML = "";
        }
    } catch (e) { console.error("Audit fetch error", e); }
};

// ================================================
// UNIVERSAL ROBUST FIELD EXTRACTOR
// ================================================
window.getFieldValue = (data, keys, fallback = 'N/A') => {
    if (!data) return fallback;
    for (const key of keys) {
        if (data[key] !== undefined && data[key] !== null && String(data[key]).trim() !== "" && String(data[key]).trim() !== "-") {
            return data[key];
        }
    }
    return fallback;
};

// ================================================
// UNIVERSAL SMART PREVIEW RENDERER (CROSS-DEVICE)
// ================================================
window.renderSmartPreview = (areaId, data, barcode, colorTheme = 'indigo') => {
    const previewArea = document.getElementById(areaId);
    if (!previewArea) return;

    const theme = {
        indigo: {
            bg: 'bg-indigo-50/40',
            border: 'border-indigo-100/60',
            text: 'text-indigo-950',
            accent: 'bg-indigo-600',
            sub: 'text-indigo-500',
            itemBg: 'bg-white/60'
        },
        red: {
            bg: 'bg-red-50/40',
            border: 'border-red-100/60',
            text: 'text-red-950',
            accent: 'bg-red-600',
            sub: 'text-red-500',
            itemBg: 'bg-white/60'
        }
    }[colorTheme] || {
        bg: 'bg-indigo-50/40', border: 'border-indigo-100/60', text: 'text-indigo-950', accent: 'bg-indigo-600', sub: 'text-indigo-500', itemBg: 'bg-white/60'
    };

    const photoUrl = window.getDirectDriveImageUrl(data.photo || data.auditPhotoUrl);

    // 16-Field Grid Data Mapping (Robust Mapping)
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
        <div class="glass-preview-card ${theme.bg} ${theme.border} p-4 md:p-6 rounded-[2rem] border-2 shadow-2xl backdrop-blur-md space-y-6 animate-slide-up mb-6">
            <!-- TOP HEADER SECTION (Working) -->
            <div class="flex items-center gap-4 md:gap-6 pb-6 border-b border-white/40">
                <div class="w-20 h-20 md:w-24 md:h-24 rounded-3xl overflow-hidden shadow-xl border-4 border-white/80 bg-white/50 flex items-center justify-center flex-shrink-0">
                    ${(data.photo && data.photo !== "N/A") ? `<img src="${photoUrl}" class="w-full h-full object-cover">` : `<i class="fa-solid fa-camera-retro text-indigo-200 text-3xl"></i>`}
                </div>
                <div class="min-w-0 flex-1">
                    <h4 class="text-sm md:text-lg font-black ${theme.text} uppercase truncate tracking-tight leading-tight">${data.desc || data.description || 'N/A'}</h4>
                    <div class="flex flex-wrap items-center gap-2 mt-2">
                        <span class="px-3 py-1 ${theme.accent} text-white rounded-full text-[9px] font-mono font-bold tracking-widest shadow-lg shadow-indigo-500/20">${barcode}</span>
                        <span class="px-3 py-1 bg-white/80 text-[10px] font-black ${theme.sub} uppercase rounded-full border border-white/50">${data.category || 'N/A'}</span>
                    </div>
                </div>
            </div>

            <!-- BOTTOM DETAIL GRID (FIXED) -->
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                ${fields.map(f => `
                    <div class="${theme.itemBg} p-3 rounded-2xl border border-white/50 shadow-sm transition-all hover:shadow-md">
                        <span class="block text-[8px] md:text-[9px] font-black opacity-40 uppercase tracking-widest mb-1">${f.label}</span>
                        <span class="block text-[11px] md:text-[12px] font-bold ${theme.text} truncate">${f.value || 'N/A'}</span>
                    </div>
                `).join('')}
            </div>

            <!-- Footer -->
            <div class="pt-2 flex items-center justify-between text-[10px] font-bold ${theme.sub} opacity-60">
                <span class="flex items-center gap-1"><i class="fa-solid fa-shield-check"></i> Data Verified</span>
                <span>${new Date().toLocaleDateString()}</span>
            </div>
        </div>
    `;
};

// Map renderTransparentPreview to use the same engine
window.renderTransparentPreview = (data, barcode) => {
    window.renderSmartPreview('transfer-asset-preview', data, barcode, 'indigo');
};

window.initTransferSigPads = () => {
    if (typeof window.initCanvasDrawing === 'function') {
        window.initCanvasDrawing('t_security_sig');
        window.initCanvasDrawing('t_received_sig');
    }
};

window.clearTransferSig = (id) => {
    const canvas = document.getElementById(id);
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Also re-init to set correctly if size changed
        window.initCanvasDrawing(id);
    }
};

// Handle Transfer Photo Capture
window.handleTransferPhoto = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        transferPhotoBase64 = e.target.result;
        const preview = document.getElementById('t_photo_preview');
        const btnText = document.getElementById('t_photo_btn_text');

        if (preview) {
            preview.classList.remove('hidden');
            preview.querySelector('img').src = transferPhotoBase64;
        }
        if (btnText) btnText.innerText = "Photo Captured ✅";
    };
    reader.readAsDataURL(file);
};

// =========================================================
// ASSET TRANSFER - ROLE-BASED ACCESS CONTROL (v3.5.1)
// =========================================================

// ✅ ALL ROLES HAVE ACCESS
const TRANSFER_ALLOWED_ROLES = ['admin', 'security', 'cleaner leader', 'technician'];

// Check if current user has transfer access
window.hasTransferAccess = () => {
    if (window.isAdminLoggedIn) return true;
    if (!window.currentStaff) return false;

    const userRole = (window.currentStaff.role || "").toLowerCase().trim();
    return TRANSFER_ALLOWED_ROLES.includes(userRole);
};

// Open Asset Transfer - Accessible to ALL
window.openAssetTransfer = () => {
    if (!window.hasTransferAccess()) {
        alert("❌ You don't have permission to access Asset Transfer.");
        return;
    }

    try {
        window.showStaffView('asset-transfer-section');
        const dateInput = document.getElementById('t_collection_date');
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
        window.initTransferSigPads();
    } catch (e) { console.error(e); }
};

// Open Movement Logs - Accessible to ALL
window.openTransferLogs = async () => {
    if (!window.hasTransferAccess()) {
        alert("❌ You don't have permission to view Movement Logs.");
        return;
    }

    try {
        window.showStaffView('transfer-logs-section');
        const snap = await get(ref(db, 'asset_transfers'));
        const transfers = snap.exists() ? Object.values(snap.val()) : [];
        window.renderTransferTable(transfers);
    } catch (e) { console.error(e); }
};

window.closeAssetTransfer = () => { window.showStaffView('staff-dash-area'); };

console.log("✅ audit_module.js loaded (FIXED)");
