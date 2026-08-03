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
// ASSET TRANSFER LOGIC (FIXED)
// ================================================
window.submitAssetTransfer = async (event) => {
    if (event) event.preventDefault();
    const barcode = document.getElementById('t_asset_barcode').value.trim();
    const toLocation = document.getElementById('t_to_location')?.value.trim(); // ✅ FIXED ID

    if (!barcode || !toLocation) return alert("Barcode and Destination Location are required!");

    const btn = document.getElementById('submit-transfer-btn');
    btn.disabled = true; btn.innerText = "UPLOADING...";

    try {
        const sigSecurity = window.getCanvasBase64('t_security_sig');
        const sigReceived = window.getCanvasBase64('t_received_sig');
        if (!sigSecurity || !sigReceived) throw new Error("Both signatures required!");

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
        const transferData = {
            transferId, assetBarcode: barcode, toLocation, // ✅ STORED FOR COMPLETION
            collectorName: document.getElementById('t_collector_name').value,
            companyName: document.getElementById('t_company_name').value,
            securitySignatureUrl: urlSec,
            receivedSignatureUrl: urlRec,
            transferPhotoUrl: urlPhoto,
            status: 'In-Transit',
            timestamp: Date.now(),
            date: new Date().toLocaleDateString()
        };

        await set(ref(db, `asset_transfers/${transferId}`), transferData);
        alert("✅ Transfer Recorded!");
        window.closeAssetTransfer();
        if (window.refreshDashboardData) window.refreshDashboardData();

    } catch (e) { alert("Error: " + e.message); }
    finally { btn.disabled = false; btn.innerText = "INITIATE TRANSFER"; }
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
                if (window.checkDuplicateBarcode && currentScanTarget === 'f1_asset_barcode') window.checkDuplicateBarcode(input.value);
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
    try {
        const snap = await get(child(ref(db), `assets/${barcode}`));
        if (snap.exists()) {
            const a = snap.val();
            const preview = document.getElementById('transfer-asset-preview');
            if (preview) preview.innerHTML = `<div class="p-3 bg-indigo-50 rounded-xl">Found: ${a.assetDescription || a.modelDescription}</div>`;
        }
    } catch (e) {}
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
