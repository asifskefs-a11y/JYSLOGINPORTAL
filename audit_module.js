import { db } from './firebase_config.js';
import { ref, set, get, update, child } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

// ================================================
// ASSET TRANSFER LOGIC (FIXED & SCHEMA v3.5.1)
// ================================================
window.submitAssetTransfer = async (event) => {
    if (event) event.preventDefault();

    const barcode = document.getElementById('t_asset_barcode').value.trim();
    const toLocation = document.getElementById('t_to_location')?.value.trim();

    // 1. Critical Validation
    if (!barcode) return alert("Please scan or enter an Asset Barcode first!");
    if (!window.activeTransferAsset) return alert("❌ Cannot proceed: Asset details not loaded or asset not registered.");

    const btn = document.getElementById('submit-transfer-btn');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> UPLOADING...';

    try {
        // 2. Capture Signature Data and Photos
        const sigSecurity = window.getCanvasBase64('t_security_sig');
        const sigReceived = window.getCanvasBase64('t_received_sig');

        if (!sigSecurity || !sigReceived) throw new Error("Both signatures (Security & Receiver) are required!");

        // 3. Parallel Image Upload to Google Drive (Slow Net Optimized)
        const uploadTask = async (img, fileName, type) => {
            if (!img || img.length < 500) return ""; // Ignore empty/invalid base64
            const res = await window.uploadToDrive({ action: "upload", type, fileName, image: img });
            return res.fileUrl || res.signatureUrl || "";
        };

        const [urlSec, urlRec, urlPhoto] = await Promise.all([
            uploadTask(sigSecurity, `Sig_Sec_${barcode}_${Date.now()}.png`, 'signature'),
            uploadTask(sigReceived, `Sig_Rec_${barcode}_${Date.now()}.png`, 'signature'),
            uploadTask(transferPhotoBase64, `Img_Trf_${barcode}_${Date.now()}.jpg`, 'active_asset')
        ]);

        const transferId = "TRF-" + Date.now();
        const asset = window.activeTransferAsset;

        // 4. Extended 26-Column Schema Mapping (ONLY URLs saved to Firebase)
        const transferData = {
            transferId,
            assetBarcode: barcode,
            assetDescription: asset.assetDescription || asset.modelDescription || "-",
            assetVendorName: asset.vendorName || asset.vendor || "-",
            category: asset.majorCategory || asset.category || "-",
            datePlaceInService: asset.serviceDate || asset.datePlaceInService || "-",
            floorDescription: asset.floorDescription || "-",
            floorNo: asset.floorNo || "-",
            locationName: asset.locationName || asset.location || "-",
            manufacturer: asset.manufacturer || "-",
            modelDescription: asset.modelDescription || "-",
            roomBarcode: asset.roomBarcode || "-",
            roomName: asset.roomName || "-",
            roomNumber: asset.roomNo || asset.roomNumber || "-",
            schoolBuildingName: asset.buildingName || asset.schoolBuilding || "-",
            auditPhotoAfter: asset.auditPhotoUrl || asset.photoUrl || "-",

            collectorFullName: document.getElementById('t_collector_name').value.trim(),
            companyName: document.getElementById('t_company_name').value.trim(),
            reasonForCollection: document.getElementById('t_collection_reason')?.value.trim() || "-",
            dateOfCollection: document.getElementById('t_collection_date').value,
            companyLandlineNo: document.getElementById('t_company_landline')?.value.trim() || "-",
            assetManufacturer: asset.manufacturer || "-",
            assetSerialNo: asset.serialNo || asset.serialNumber || "-",
            assetLocation: asset.locationName || asset.location || "-",
            toLocation: toLocation || "Unknown",

            reasonForTransfer: document.getElementById('t_transfer_reason_select')?.value || "-",
            securitySignatureUrl: urlSec,
            receivedSignatureUrl: urlRec,
            transferPhotoUrl: urlPhoto,
            status: 'In-Transit',
            timestamp: Date.now(),
            date: new Date().toLocaleDateString('en-US')
        };

        // 5. Final Save to Firebase (NO BASE64)
        await set(ref(db, `asset_transfers/${transferId}`), transferData);

        window.triggerSuccessPopup("Transfer Success! 📦");

        // Cleanup UI
        window.closeAssetTransfer();
        if (window.refreshDashboardData) window.refreshDashboardData();

    } catch (e) {
        alert("Transfer Error: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
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
            const input = document.getElementById(currentScanTarget);
            if (input) {
                input.value = text.trim().toUpperCase();
                // Trigger auto-fetch if it's the transfer barcode input
                if (currentScanTarget === 't_asset_barcode') {
                    window.fetchTransferAssetDetails(input.value);
                }
                if (window.checkDuplicateBarcode && currentScanTarget === 'f1_asset_barcode') {
                    window.checkDuplicateBarcode(input.value);
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
// REMAINING WORKING FUNCTIONS
// ================================================
window.fetchTransferAssetDetails = async (barcode) => {
    const previewArea = document.getElementById('transfer-asset-preview');
    const submitBtn = document.getElementById('submit-transfer-btn');

    if (!barcode) {
        if (previewArea) previewArea.innerHTML = "";
        return;
    }

    // 1. Transparent Loading Feedback
    if (previewArea) {
        previewArea.innerHTML = `
            <div class="glass-preview-card flex items-center justify-center gap-4 py-8 animate-pulse">
                <i class="fa-solid fa-compass-drafting fa-spin text-indigo-500 text-2xl"></i>
                <span class="text-xs font-black uppercase tracking-widest text-indigo-900">Syncing Master Record...</span>
            </div>
        `;
    }
    if (submitBtn) submitBtn.disabled = true;

    try {
        const snap = await get(child(ref(db), `assets/${barcode.trim().toUpperCase()}`));

        if (snap.exists()) {
            const a = snap.val();
            window.activeTransferAsset = a;

            // Mapping logic with multi-key support
            const getVal = (keys) => {
                for (let k of keys) { if (a[k]) return a[k]; }
                return "-";
            };

            const data = {
                desc: getVal(['assetDescription', 'modelDescription', 'description', 'Asset Description']),
                vendor: getVal(['vendorName', 'vendor', 'Vendor']),
                loc: getVal(['locationName', 'location', 'Location']),
                build: getVal(['buildingName', 'schoolBuilding', 'Building']),
                floor: getVal(['floorNo', 'Floor No', 'f23_floor_no']),
                room: getVal(['roomNo', 'Room No']),
                cat: getVal(['majorCategory', 'category', 'Category']),
                photo: getVal(['auditPhotoUrl', 'photoUrl', 'initialAuditPhoto'])
            };

            // 2. PREMIUM TRANSPARENT GLASS PREVIEW RENDERING
            if (previewArea) {
                const photoUrl = window.getDirectDriveImageUrl(data.photo);
                previewArea.innerHTML = `
                    <div class="glass-preview-card space-y-6">
                        <div class="flex items-center gap-5 pb-5 border-b border-white/40">
                            <div class="w-20 h-20 rounded-3xl overflow-hidden shadow-2xl border-2 border-white/60 bg-indigo-50/50 flex items-center justify-center flex-shrink-0">
                                ${data.photo !== "-" ? `<img src="${photoUrl}" class="w-full h-full object-cover">` : `<div class="text-center p-2"><i class="fa-solid fa-camera-retro text-indigo-200 text-2xl"></i><p class="text-[7px] font-black text-indigo-300 uppercase mt-1">No Image</p></div>`}
                            </div>
                            <div class="min-w-0">
                                <h4 class="text-sm font-black text-indigo-950 uppercase truncate tracking-tight leading-tight">${data.desc}</h4>
                                <div class="flex items-center gap-2 mt-2">
                                    <span class="px-2 py-0.5 bg-indigo-600 text-white rounded text-[8px] font-mono font-bold tracking-widest">${barcode}</span>
                                    <span class="text-[9px] font-black text-indigo-500 uppercase">${data.cat}</span>
                                </div>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-3">
                            <div class="preview-grid-item">
                                <span class="preview-label">Location / Building</span>
                                <span class="preview-value">${data.loc} <br><span class="text-[9px] opacity-60">${data.build}</span></span>
                            </div>
                            <div class="preview-grid-item">
                                <span class="preview-label">Floor / Room</span>
                                <span class="preview-value">F${data.floor} - R${data.room}</span>
                            </div>
                            <div class="preview-grid-item">
                                <span class="preview-label">Asset Vendor</span>
                                <span class="preview-value">${data.vendor}</span>
                            </div>
                            <div class="preview-grid-item">
                                <span class="preview-label">Status</span>
                                <span class="flex items-center gap-1.5 text-emerald-600 font-black text-[10px] uppercase">
                                    <i class="fa-solid fa-shield-check"></i> Registered
                                </span>
                            </div>
                        </div>

                        <div class="pt-2 flex items-center justify-center gap-2">
                            <div class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                            <p class="text-[10px] font-black text-indigo-900 uppercase tracking-widest">Verify details before signing</p>
                        </div>
                    </div>
                `;
            }
            if (submitBtn) submitBtn.disabled = false;

        } else {
            // 3. ERROR GLASS VIEW
            if (previewArea) {
                previewArea.innerHTML = `
                    <div class="glass-preview-card asset-not-registered-glass flex flex-col items-center justify-center py-10 text-center space-y-4">
                        <div class="w-16 h-16 bg-red-500/10 text-red-600 rounded-full flex items-center justify-center border-2 border-red-500/20">
                            <i class="fa-solid fa-ban text-3xl"></i>
                        </div>
                        <div>
                            <h3 class="text-lg font-black text-red-700 uppercase tracking-tighter">Asset Not Registered</h3>
                            <p class="text-[10px] text-red-600/70 font-bold uppercase tracking-widest mt-1 px-8">This item must be audited in the Master Register before movement.</p>
                        </div>
                    </div>
                `;
            }
            window.activeTransferAsset = null;
            if (submitBtn) submitBtn.disabled = true;
        }
    } catch (e) {
        console.error("Fetch Error:", e);
    }
};

window.initTransferSigPads = () => {
    window.initCanvasDrawing('t_security_sig');
    window.initCanvasDrawing('t_received_sig');
};

window.clearTransferSig = (id) => {
    window.clearCanvas(id);
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
