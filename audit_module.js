import { getDatabase, ref, set, get, update, child } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- ASSET AUDIT SYSTEM ---
let currentRoomContext = null;
let currentAuditSessionAssets = [];
let html5QrCode = null;
let currentScanTarget = null;
let activeDisposalBarcode = null;
let disposalPhotoBase64 = "";

const db = getDatabase();

window.openAssetAudit = () => {
    try {
        const dash = document.getElementById('staff-dash-area');
        const audit = document.getElementById('asset-audit-section');
        if (dash) dash.classList.add('hidden');
        if (audit) audit.classList.remove('hidden');
        window.resetRoomContext();
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

// --- CAMERA SCANNER LOGIC ---
window.startCameraScanner = async (target) => {
    try {
        currentScanTarget = target;
        const modal = document.getElementById('scanner-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
        }

        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode("scanner-container");
        }

        const config = { fps: 10, qrbox: { width: 250, height: 150 } };

        await html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
                try {
                    window.stopCameraScanner();
                    const inputId = currentScanTarget === 'room' ? 'room-barcode-input' : 'asset-barcode-input';
                    const input = document.getElementById(inputId);
                    if (input) {
                        input.value = decodedText;
                        window.processBarcodeManual(currentScanTarget);
                    }
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

window.processBarcodeManual = async (type) => {
    try {
        const inputId = type === 'room' ? 'room-barcode-input' : 'asset-barcode-input';
        const inputEl = document.getElementById(inputId);
        const val = inputEl ? inputEl.value.trim() : "";
        if (!val) return;

        if (type === 'room') {
            const snap = await get(child(ref(db), `rooms/${val}`));
            if (snap.exists()) {
                currentRoomContext = snap.val();
                document.getElementById('current-room-display').classList.remove('hidden');
                document.getElementById('active-room-id').innerText = currentRoomContext.roomBarcode;
                document.getElementById('active-room-desc').innerText = `${currentRoomContext.floorNo} - ${currentRoomContext.roomNo}`;
                document.getElementById('step-asset-audit').classList.remove('opacity-50', 'pointer-events-none');
                currentAuditSessionAssets = [];
                renderScannedAssets();
                if (inputEl) inputEl.value = '';
            } else { alert("Invalid Room Barcode"); }
        } else {
            if (!currentRoomContext) return alert("Please scan room first");
            const assetSnap = await get(child(ref(db), `assets/${val}`));
            if (assetSnap.exists()) {
                const assetData = assetSnap.val();
                await update(ref(db, `assets/${val}`), {
                    currentRoomBarcode: currentRoomContext.roomBarcode,
                    lastAuditDate: new Date().toLocaleDateString(),
                    lastAuditBy: window.currentStaff ? window.currentStaff.name : "Unknown"
                });
                currentAuditSessionAssets.unshift({ ...assetData, status: 'Existing' });
                renderScannedAssets();
                if (inputEl) inputEl.value = '';
            } else { alert("Asset not found in Master Register"); }
        }
    } catch (e) { console.error("Process Error:", e); }
};

window.resetRoomContext = () => {
    currentRoomContext = null;
    const roomDisplay = document.getElementById('current-room-display');
    const assetAuditStep = document.getElementById('step-asset-audit');
    const assetList = document.getElementById('scanned-assets-list');
    if (roomDisplay) roomDisplay.classList.add('hidden');
    if (assetAuditStep) assetAuditStep.classList.add('opacity-50', 'pointer-events-none');
    if (assetList) assetList.innerHTML = '';
};

function renderScannedAssets() {
    const container = document.getElementById('scanned-assets-list');
    if (!container) return;
    container.innerHTML = '';
    currentAuditSessionAssets.forEach(a => {
        container.innerHTML += `
            <div class="asset-card ${a.majorCategory === 'IT' ? 'category-it' : 'category-nonit'}">
                <div class="flex justify-between items-start">
                    <div>
                        <h4 class="font-bold text-sm text-indigo-900">${a.assetBarcode}</h4>
                        <p class="text-[10px] text-gray-500">${a.modelDescription}</p>
                    </div>
                    <span class="asset-status-badge status-existing">Existing</span>
                </div>
                <div class="flex gap-2 mt-3">
                    <button onclick="openDisposalModal('${a.assetBarcode}')" class="flex-1 py-2 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold border border-red-100">MARK BROKEN / SCRAP</button>
                </div>
            </div>`;
    });
}

// --- DISPOSAL MODULE ---
window.openDisposalModal = (barcode) => {
    activeDisposalBarcode = barcode;
    const el = document.getElementById('disposal-barcode');
    if (el) el.innerText = barcode;
    const modal = document.getElementById('asset-disposal-modal');
    if (modal) modal.classList.remove('hidden');
};

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
        disposalPhotoBase64 = await window.compressImageFile(file, 800, 800, 0.6);
        const preview = document.getElementById('disposal-photo-preview');
        if (preview) {
            preview.classList.remove('hidden');
            preview.querySelector('img').src = disposalPhotoBase64;
        }
        if (btnText) btnText.innerText = "Photo Captured ✓";
    } catch (e) { console.error(e); }
};

window.submitAssetDisposal = async () => {
    try {
        const reason = document.getElementById('disposal-reason').value;
        const scrapLoc = document.getElementById('disposal-scrap-loc').value;
        if (!reason || !scrapLoc || !disposalPhotoBase64) return alert("Photo and details required!");

        const btn = document.getElementById('submit-disposal-btn');
        if (btn) { btn.disabled = true; btn.innerText = "Uploading..."; }

        const driveUrl = await window.uploadToDrive({
            type: 'photo',
            fileName: `Disposal_${activeDisposalBarcode}_${Date.now()}.png`,
            image: disposalPhotoBase64
        });

        const updates = {
            assetStatus: 'Disposed',
            disposalReason: reason,
            scrapLocation: scrapLoc,
            disposalPhotoUrl: driveUrl,
            disposalDate: new Date().toLocaleDateString(),
            disposedBy: window.currentStaff ? window.currentStaff.name : "Unknown"
        };

        await update(ref(db, `assets/${activeDisposalBarcode}`), updates);
        alert("Asset marked as Disposed.");
        closeDisposalModal();
        currentAuditSessionAssets = currentAuditSessionAssets.filter(a => a.assetBarcode !== activeDisposalBarcode);
        renderScannedAssets();
    } catch (err) { alert(err.message); }
    finally {
        const btn = document.getElementById('submit-disposal-btn');
        if (btn) { btn.disabled = false; btn.innerText = "Confirm Scrap"; }
    }
};

window.openDirectDisposal = async () => {
    const val = prompt("Enter Asset Barcode for Disposal (Manual):");
    if (!val) return;
    const assetSnap = await get(child(ref(db), `assets/${val}`));
    if (assetSnap.exists()) {
        window.openDisposalModal(val);
    } else {
        alert("Asset not found in register.");
    }
};

// --- ADMIN ASSET UI ---
window.renderAdminAssetTable = (data) => {
    const body = document.getElementById('admin-asset-list-body');
    if (!body) return;
    body.innerHTML = '';
    data.forEach(a => {
        const photo = a.disposalPhotoUrl ? window.getDirectDriveImageUrl(a.disposalPhotoUrl) : null;
        body.innerHTML += `
            <tr class="hover:bg-gray-50 transition border-b border-gray-100 text-gray-800">
                <td class="p-2 font-mono text-gray-400">${a.currentRoomBarcode || '-'}</td>
                <td class="p-2 font-bold">${a.assetBarcode}</td>
                <td class="p-2 text-gray-800">
                    <div class="font-bold">${a.majorCategory} > ${a.category}</div>
                    <div class="text-[8px] opacity-60">${a.modelDescription}</div>
                </td>
                <td class="p-2 text-gray-800">${a.majorCategory}</td>
                <td class="p-2 text-gray-800">${a.assetCondition || 'Good'}</td>
                <td class="p-2 text-gray-800">
                    <span class="asset-status-badge ${a.assetStatus === 'Disposed' ? 'status-disposed' : 'status-existing'}">${a.assetStatus || 'Existing'}</span>
                </td>
                <td class="p-2 text-gray-800">
                    ${a.assetStatus === 'Disposed' ? `<div class="text-[8px] font-bold text-red-600">${a.disposalReason}</div><div class="text-[7px]">At: ${a.scrapLocation}</div>` : '-'}
                </td>
                <td class="p-2 text-center text-gray-800">
                    ${photo ? `<img src="${photo}" class="h-8 w-8 rounded border mx-auto" onclick="window.openImageZoom('${photo}')">` : '-'}
                </td>
            </tr>`;
    });
};

window.filterAssetTable = () => {
    if (!window.allAssets) return;
    const q = document.getElementById('asset-search').value.toLowerCase();
    const cat = document.getElementById('asset-category-filter').value;
    const stat = document.getElementById('asset-status-filter').value;
    const filtered = window.allAssets.filter(a => {
        const matchQ = a.assetBarcode.toLowerCase().includes(q) || (a.modelDescription || "").toLowerCase().includes(q) || (a.currentRoomBarcode && a.currentRoomBarcode.toLowerCase().includes(q));
        const matchCat = cat === 'all' || a.majorCategory === cat;
        const matchStat = stat === 'all' || (a.assetStatus || 'Existing') === stat;
        return matchQ && matchCat && matchStat;
    });
    window.renderAdminAssetTable(filtered);
};
