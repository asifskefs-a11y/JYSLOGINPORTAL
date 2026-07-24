import { getDatabase, ref, set, get, update, child } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- ASSET MODULE LOGIC ---
let currentRoomContext = null;
let currentAuditSessionAssets = [];
let html5QrCode = null;
let currentScanTarget = null;
let activeDisposalBarcode = null;
let disposalPhotoBase64 = "";
let initialAuditPhotoBase64 = "";

const db = getDatabase();

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
    const snap = await get(ref(db, 'assets'));
    let count = 1;
    if (snap.exists()) {
        count = Object.keys(snap.val()).length + 1;
    }
    const no = "JYS-" + count.toString().padStart(4, '0');
    const el = document.getElementById('f36_phys_reg_no');
    if (el) el.value = no;
};

// --- CAMERA SCANNER LOGIC ---
window.startCameraScanner = async (inputId) => {
    try {
        currentScanTarget = inputId;
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
                    const input = document.getElementById(currentScanTarget);
                    if (input) {
                        input.value = decodedText;
                        if (currentScanTarget === 'f22_room_barcode') {
                            window.fetchRoomDetails(decodedText);
                        }
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
                initialAuditPhoto: "",
                auditTimestamp: new Date().toLocaleString(),
                auditBy: window.currentStaff ? window.currentStaff.name : "Unknown"
            };

            if (initialAuditPhotoBase64) {
                submitBtn.innerText = "UPLOADING PHOTO...";
                assetData.initialAuditPhoto = await window.uploadToDrive({
                    type: 'photo',
                    fileName: `Initial_${barcode}_${Date.now()}.png`,
                    image: initialAuditPhotoBase64
                });
            }

            await set(ref(db, `assets/${barcode}`), assetData);
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

// Re-implementing the old audit features for compatibility
window.resetRoomContext = () => {
    const rDisplay = document.getElementById('current-room-display');
    if (rDisplay) rDisplay.classList.add('hidden');
    const expectedContainer = document.getElementById('expected-assets-container');
    if (expectedContainer) expectedContainer.innerHTML = '';
};

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
        if (btn) { btn.disabled = true; btn.innerText = "Uploading After Photo..."; }

        const afterPhotoUrl = await window.uploadToDrive({
            type: 'photo',
            fileName: `Disposal_After_${activeDisposalBarcode}_${Date.now()}.png`,
            image: disposalPhotoBase64
        });

        // Fetch original asset for Before Photo (Initial Audit Photo)
        const assetSnap = await get(child(ref(db), `assets/${activeDisposalBarcode}`));
        let beforePhoto = "";
        if (assetSnap.exists()) {
            beforePhoto = assetSnap.val().initialAuditPhoto || "";
        }

        const updates = {
            assetStatus: 'Disposed',
            disposalReason: reason,
            scrapLocation: scrapLoc,
            disposalDamagedPhoto: afterPhotoUrl,
            initialAuditPhotoAtDisposal: beforePhoto,
            disposalDate: new Date().toLocaleDateString(),
            disposedBy: window.currentStaff ? window.currentStaff.name : "Unknown"
        };

        await update(ref(db, `assets/${activeDisposalBarcode}`), updates);
        alert("Asset marked as Disposed. Before/After proof saved.");
        closeDisposalModal();
    } catch (err) { alert(err.message); }
    finally {
        const btn = document.getElementById('submit-disposal-btn');
        if (btn) { btn.disabled = false; btn.innerText = "Confirm Scrap"; }
    }
};

window.openDirectDisposal = async () => {
    try {
        const val = prompt("Enter Asset Barcode for Disposal (Manual):");
        if (!val) return;
        const assetSnap = await get(child(ref(db), `assets/${val}`));
        if (assetSnap.exists()) {
            window.openDisposalModal(val);
        } else { alert("Asset not found in register."); }
    } catch (e) { console.error(e); }
};

// Admin UI Components
window.renderAdminAssetTable = (data) => {
    try {
        const body = document.getElementById('admin-asset-list-body');
        if (!body) return;
        body.innerHTML = '';
        data.forEach(a => {
            const isDisposed = a.assetStatus === 'Disposed';
            const initialPhoto = a.initialAuditPhoto ? window.getDirectDriveImageUrl(a.initialAuditPhoto) : null;
            const damagePhoto = a.disposalDamagedPhoto ? window.getDirectDriveImageUrl(a.disposalDamagedPhoto) : null;

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
                        <span class="asset-status-badge ${isDisposed ? 'status-disposed' : 'status-existing'}">${a.assetStatus || 'Existing'}</span>
                    </td>
                    <td class="p-2 text-gray-800">
                        ${isDisposed ? `<div class="text-[8px] font-bold text-red-600">${a.disposalReason}</div><div class="text-[7px]">At: ${a.scrapLocation}</div>` : '-'}
                    </td>
                    <td class="p-2 text-center text-gray-800">
                        <div class="flex flex-col gap-1 items-center">
                            ${initialPhoto ? `
                                <div class="flex flex-col items-center">
                                    <span class="text-[6px] uppercase font-bold opacity-40">Initial</span>
                                    <img src="${initialPhoto}" class="h-8 w-8 rounded border" onclick="window.openImageZoom('${initialPhoto}')">
                                </div>` : (isDisposed ? '<span class="text-[6px] opacity-20">No Initial</span>' : '-')}

                            ${isDisposed && damagePhoto ? `
                                <div class="flex flex-col items-center">
                                    <span class="text-[6px] uppercase font-bold text-red-400">Damage</span>
                                    <img src="${damagePhoto}" class="h-8 w-8 rounded border border-red-200" onclick="window.openImageZoom('${damagePhoto}')">
                                </div>` : ''}
                        </div>
                    </td>
                </tr>`;
        });
    } catch (e) { console.error(e); }
};

window.filterAssetTable = () => {
    try {
        if (!window.allAssets) return;
        const q = document.getElementById('asset-search').value.toLowerCase();
        const cat = document.getElementById('asset-category-filter').value;
        const stat = document.getElementById('asset-status-filter').value;
        const filtered = window.allAssets.filter(a => {
            const matchQ = (a.assetBarcode || "").toLowerCase().includes(q) || (a.modelDescription || "").toLowerCase().includes(q) || (a.currentRoomBarcode && a.currentRoomBarcode.toLowerCase().includes(q));
            const matchCat = cat === 'all' || a.majorCategory === cat;
            const matchStat = stat === 'all' || (a.assetStatus || 'Existing') === stat;
            return matchQ && matchCat && matchStat;
        });
        window.renderAdminAssetTable(filtered);
    } catch (e) { console.error(e); }
};
