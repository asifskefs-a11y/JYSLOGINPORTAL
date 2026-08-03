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
        // 2. Signature Capture
        const sigSecurity = window.getCanvasBase64('t_security_sig');
        const sigReceived = window.getCanvasBase64('t_received_sig');
        if (!sigSecurity || !sigReceived) throw new Error("Both signatures (Security & Receiver) are required!");

        // 3. Parallel Image Upload to Google Drive (Slow Net Optimized)
        const uploadTask = async (img, fileName, type) => {
            if (!img) return "";
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

        // 4. Extended 26-Column Schema Mapping
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

        // 5. Final Save to Firebase
        await set(ref(db, `asset_transfers/${transferId}`), transferData);

        alert("✅ Transfer Success! Record created in Movement Logs.");

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
    const barcodeInput = document.getElementById('t_asset_barcode');

    if (!barcode) {
        if (previewArea) previewArea.innerHTML = "";
        return;
    }

    // 1. Instant UI Feedback (Slow Net Friendly)
    if (previewArea) {
        previewArea.innerHTML = `
            <div class="flex items-center gap-3 p-3 bg-indigo-50 text-indigo-600 rounded-xl animate-pulse">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span class="text-[10px] font-bold uppercase tracking-widest">Searching Asset Register...</span>
            </div>
        `;
    }
    if (submitBtn) submitBtn.disabled = true;

    try {
        // 2. Optimized Firebase Fetch
        const snap = await get(child(ref(db), `assets/${barcode.trim().toUpperCase()}`));

        if (snap.exists()) {
            const a = snap.val();
            window.activeTransferAsset = a; // Store for submission payload

            // 3. Automatic Mapping to UI (Visible & Hidden)
            // Note: Adjusting IDs to match your standard schema
            const mapping = {
                't_asset_description': a.assetDescription || a.modelDescription || "-",
                't_asset_vendor': a.vendorName || a.vendor || "-",
                't_asset_category': a.majorCategory || a.category || "-",
                't_asset_location': a.locationName || a.location || "-",
                't_asset_manufacturer': a.manufacturer || "-",
                't_asset_serial_no_display': a.serialNo || a.serialNumber || "-",
                't_asset_building': a.buildingName || a.schoolBuilding || "-"
            };

            for (let id in mapping) {
                const el = document.getElementById(id);
                if (el) el.value = mapping[id];
            }

            // 4. Success Preview
            if (previewArea) {
                previewArea.innerHTML = `
                    <div class="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 shadow-sm animate-fade-in">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 rounded-xl overflow-hidden border border-emerald-200">
                                <img src="${window.getDirectDriveImageUrl(a.auditPhotoUrl || a.photoUrl)}" class="w-full h-full object-cover">
                            </div>
                            <div>
                                <h4 class="text-xs font-black text-indigo-900 uppercase">${a.assetDescription || a.modelDescription || 'Asset Found'}</h4>
                                <p class="text-[9px] text-emerald-600 font-bold uppercase tracking-wider">${a.assetBarcode || barcode}</p>
                            </div>
                        </div>
                    </div>
                `;
            }
            if (submitBtn) submitBtn.disabled = false;

        } else {
            // 5. Validation Guard: Asset Not Registered
            if (previewArea) {
                previewArea.innerHTML = `
                    <div class="p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 flex items-center gap-3">
                        <i class="fa-solid fa-circle-exclamation text-xl"></i>
                        <div>
                            <p class="text-[11px] font-black uppercase">Asset Not Registered</p>
                            <p class="text-[9px] opacity-70">This barcode does not exist in the master register.</p>
                        </div>
                    </div>
                `;
            }
            alert("❌ ERROR: Asset Not Registered!\n\nPlease register this asset in the Item Audit section before attempting a transfer.");

            // Clear fields
            window.activeTransferAsset = null;
            const fieldsToClear = ['t_asset_description', 't_asset_vendor', 't_asset_category', 't_asset_location', 't_asset_manufacturer', 't_asset_serial_no_display'];
            fieldsToClear.forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ""; });

            if (submitBtn) submitBtn.disabled = true;
        }
    } catch (e) {
        console.error("Fetch Error:", e);
        if (previewArea) previewArea.innerHTML = `<div class="p-3 bg-amber-50 text-amber-700 text-[10px] rounded-xl font-bold">⚠️ Connection slow. Retrying...</div>`;
    }
};

window.initTransferSigPads = () => {
    ['t_security_sig', 't_received_sig'].forEach(id => {
        const canvas = document.getElementById(id);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight;
        let drawing = false;
        canvas.onmousedown = (e) => { drawing = true; ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); };
        canvas.onmousemove = (e) => { if (drawing) { ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke(); } };
        canvas.onmouseup = () => { drawing = false; };
    });
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
