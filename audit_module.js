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
    try {
        const snap = await get(ref(db, 'assets'));
        let count = 1;
        if (snap.exists()) {
            count = Object.keys(snap.val()).length + 1;
        }
        const no = "JYS-" + count.toString().padStart(4, '0');
        const el = document.getElementById('f36_phys_reg_no');
        if (el) el.value = no;
    } catch (e) { console.error(e); }
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
            // @ts-ignore
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
                initialAuditPhoto: null,
                auditTimestamp: new Date().toLocaleString(),
                auditBy: window.currentStaff ? window.currentStaff.name : "Unknown"
            };

            if (initialAuditPhotoBase64) {
                submitBtn.innerText = "UPLOADING PHOTO...";
                const result = await window.uploadToDrive({
                    action: "upload",
                    type: "active_asset",
                    fileName: `${barcode}_AFTER.jpg`,
                    image: initialAuditPhotoBase64
                });
                if (result.status === 'success' && result.fileUrl) {
                    console.log("UPLOAD_DEBUG", "Extracted URL: " + result.fileUrl);
                    assetData.initialAuditPhoto = {
                        fileId: result.fileId,
                        fileUrl: result.fileUrl
                    };
                    // Standardized Keys for Dashboard Rendering
                    assetData.auditPhotoUrl = result.fileUrl;
                    assetData.audit_photo = result.fileUrl;
                    assetData.beforePhotoUrl = result.fileUrl;
                    assetData.photoUrl = result.fileUrl;
                } else if (result.status === 'success') {
                    console.error("UPLOAD_DEBUG", "Success but fileUrl is missing in response");
                }
            }

            console.log("UPLOAD_DEBUG", "Database Update Path: assets/" + barcode);
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

// Compatibility features
window.resetRoomContext = () => {
    try {
        const rDisplay = document.getElementById('current-room-display');
        if (rDisplay) rDisplay.classList.add('hidden');
    } catch (e) {}
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

        const result = await window.uploadToDrive({
            action: "upload",
            type: "disposed_asset",
            fileName: `${activeDisposalBarcode}_BEFORE.jpg`,
            image: disposalPhotoBase64
        });

        if (result.status !== 'success' || !result.fileUrl) {
            throw new Error(result.message || "Upload failed or URL missing");
        }

        console.log("UPLOAD_DEBUG", "Extracted URL: " + result.fileUrl);

        // Fetch original asset for Before Photo
        const assetSnap = await get(child(ref(db), `assets/${activeDisposalBarcode}`));
        let beforePhoto = null;
        if (assetSnap.exists()) {
            beforePhoto = assetSnap.val().initialAuditPhoto || null;
        }

        const updates = {
            assetStatus: 'Disposed',
            disposalReason: reason,
            scrapLocation: scrapLoc,
            disposalDamagedPhoto: {
                fileId: result.fileId,
                fileUrl: result.fileUrl
            },
            // Standardized Keys for Disposal
            disposalPhotoUrl: result.fileUrl,
            afterPhotoUrl: result.fileUrl,

            initialAuditPhotoAtDisposal: beforePhoto,
            disposalDate: new Date().toLocaleDateString(),
            disposedBy: window.currentStaff ? window.currentStaff.name : "Unknown"
        };

        console.log("UPLOAD_DEBUG", "Database Update Path: assets/" + activeDisposalBarcode);
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
        const disposalBody = document.getElementById('admin-disposal-list-body');
        if (!body && !disposalBody) return;

        if (body) body.innerHTML = '';
        if (disposalBody) disposalBody.innerHTML = '';

        data.forEach(a => {
            const isDisposed = a.assetStatus === 'Disposed';

            // Comprehensive URL fallback check
            const initialPhotoUrl = a.auditPhotoUrl || a.audit_photo || a.beforePhotoUrl || a.photoUrl ||
                                   (a.initialAuditPhoto ? (typeof a.initialAuditPhoto === 'object' ? a.initialAuditPhoto.fileUrl : a.initialAuditPhoto) : null);

            const damagePhotoUrl = a.disposalPhotoUrl || a.afterPhotoUrl ||
                                  (a.disposalDamagedPhoto ? (typeof a.disposalDamagedPhoto === 'object' ? a.disposalDamagedPhoto.fileUrl : a.disposalDamagedPhoto) : null);

            const initialPhoto = window.getDirectDriveImageUrl(initialPhotoUrl);
            const damagePhoto = window.getDirectDriveImageUrl(damagePhotoUrl);

            const tr = document.createElement('tr');
            tr.className = "hover:bg-gray-50 transition border-b border-gray-100 text-[12px]";

            tr.innerHTML = `
                <td class="p-3 border-r font-bold">${a.assetBarcode || '-'}</td>
                <td class="p-3 border-r">${a.serialNo || '-'}</td>
                <td class="p-3 border-r">${a.modelDescription || '-'}</td>
                <td class="p-3 border-r">${a.assetCondition || '-'}</td>
                <td class="p-3 border-r">${a.priceStatus || '-'}</td>
                <td class="p-3 border-r">${a.unitCost || '-'}</td>
                <td class="p-3 border-r">${a.assetDescription || '-'}</td>
                <td class="p-3 border-r">${a.serviceDate || '-'}</td>
                <td class="p-3 border-r">${a.manufacturer || '-'}</td>
                <td class="p-3 border-r">${a.majorCategory || '-'}</td>
                <td class="p-3 border-r">${a.subMajorCategory || '-'}</td>
                <td class="p-3 border-r">${a.subMinorCategory || '-'}</td>
                <td class="p-3 border-r">${a.dofMajor || '-'}</td>
                <td class="p-3 border-r">${a.dofMinor || '-'}</td>
                <td class="p-3 border-r">${a.category || '-'}</td>
                <td class="p-3 border-r">${a.classification || '-'}</td>
                <td class="p-3 border-r">${a.locationName || '-'}</td>
                <td class="p-3 border-r">${a.esisId || '-'}</td>
                <td class="p-3 border-r">${a.buildingName || '-'}</td>
                <td class="p-3 border-r">${a.roomName || '-'}</td>
                <td class="p-3 border-r">${a.roomNo || '-'}</td>
                <td class="p-3 border-r">${a.currentRoomBarcode || '-'}</td>
                <td class="p-3 border-r">${a.floorNo || '-'}</td>
                <td class="p-3 border-r">${a.floorDescription || '-'}</td>
                <td class="p-3 border-r">${a.barcodeStatus || '-'}</td>
                <td class="p-3 border-r">
                    <span class="px-2 py-1 rounded text-[10px] font-bold ${isDisposed ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}">
                        ${a.assetStatus || 'Existing'}
                    </span>
                </td>
                <td class="p-3 border-r">${a.oldSchoolName || '-'}</td>
                <td class="p-3 border-r">${a.transactionNo || '-'}</td>
                <td class="p-3 border-r">${a.usefulLife || '-'}</td>
                <td class="p-3 border-r">${a.vendorName || '-'}</td>
                <td class="p-3 border-r">${a.oldBarcode || '-'}</td>
                <td class="p-3 border-r">${a.farBarcode || '-'}</td>
                <td class="p-3 border-r">${a.invoiceNo || '-'}</td>
                <td class="p-3 border-r">${a.dnNo || '-'}</td>
                <td class="p-3 border-r italic text-gray-500">${a.remarks || '-'}</td>
                <td class="p-3 border-r font-mono font-bold text-indigo-600">${a.physRegNo || '-'}</td>
                <td class="p-3 border-r">${a.fixedAssetRegNo || '-'}</td>
                <td class="p-3 border-r">${a.mappingCriteria || '-'}</td>
                <td class="p-3 border-r text-center">
                    ${initialPhotoUrl ? `<img src="${initialPhoto}" class="h-10 w-10 object-cover rounded border mx-auto cursor-pointer hover:scale-110 transition" onclick="window.openImageZoom('${initialPhoto}')">` : '<i class="fa-solid fa-image-slash opacity-20"></i>'}
                </td>
                <td class="p-3 border-r text-center">
                    ${damagePhotoUrl ? `<img src="${damagePhoto}" class="h-10 w-10 object-cover rounded border border-red-200 mx-auto cursor-pointer hover:scale-110 transition" onclick="window.openImageZoom('${damagePhoto}')">` : '<i class="fa-solid fa-image-slash opacity-20"></i>'}
                </td>
                <td class="p-3 text-center">
                    <button onclick="window.deleteAssetRecord('${a.assetBarcode}')" class="text-red-600 hover:text-red-800 transition" title="Delete Asset">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            `;

            if (isDisposed && disposalBody) {
                disposalBody.appendChild(tr);
            } else if (!isDisposed && body) {
                body.appendChild(tr);
            }
        });
    } catch (e) { console.error("Error rendering asset tables:", e); }
};

window.deleteAssetRecord = async (barcode) => {
    if (!confirm("Are you sure you want to PERMANENTLY delete this asset and its photos?")) return;

    try {
        const snap = await get(child(ref(db), `assets/${barcode}`));
        if (snap.exists()) {
            const data = snap.val();

            // Delete photos from Drive
            if (data.initialAuditPhoto && data.initialAuditPhoto.fileId) {
                await window.uploadToDrive({ action: "delete", fileId: data.initialAuditPhoto.fileId });
            }
            if (data.disposalDamagedPhoto && data.disposalDamagedPhoto.fileId) {
                await window.uploadToDrive({ action: "delete", fileId: data.disposalDamagedPhoto.fileId });
            }

            // Remove from Firebase
            await set(ref(db, `assets/${barcode}`), null);
            alert("Asset and linked photos deleted successfully.");
            if (typeof loadAdminDashboard === 'function') loadAdminDashboard();
        }
    } catch (e) { alert("Error deleting asset: " + e.message); }
};

window.filterDisposalTable = () => {
    try {
        if (!window.allAssets) return;
        const q = document.getElementById('disposal-search').value.toLowerCase();
        const filtered = window.allAssets.filter(a => {
            if (a.assetStatus !== 'Disposed') return false;
            return (a.assetBarcode || "").toLowerCase().includes(q) || (a.modelDescription || "").toLowerCase().includes(q) || (a.physRegNo || "").toLowerCase().includes(q);
        });
        const disposalBody = document.getElementById('admin-disposal-list-body');
        if (disposalBody) {
            disposalBody.innerHTML = '';
            filtered.forEach(a => {
                const initialPhotoUrl = a.auditPhotoUrl || a.audit_photo || a.beforePhotoUrl || a.photoUrl ||
                                       (a.initialAuditPhoto ? (typeof a.initialAuditPhoto === 'object' ? a.initialAuditPhoto.fileUrl : a.initialAuditPhoto) : null);

                const damagePhotoUrl = a.disposalPhotoUrl || a.afterPhotoUrl ||
                                      (a.disposalDamagedPhoto ? (typeof a.disposalDamagedPhoto === 'object' ? a.disposalDamagedPhoto.fileUrl : a.disposalDamagedPhoto) : null);

                const initialPhoto = window.getDirectDriveImageUrl(initialPhotoUrl);
                const damagePhoto = window.getDirectDriveImageUrl(damagePhotoUrl);
                const tr = document.createElement('tr');
                tr.className = "hover:bg-gray-50 transition border-b border-gray-100 text-[12px]";
                tr.innerHTML = `
                    <td class="p-3 border-r font-bold">${a.assetBarcode || '-'}</td>
                    <td class="p-3 border-r">${a.serialNo || '-'}</td>
                    <td class="p-3 border-r">${a.modelDescription || '-'}</td>
                    <td class="p-3 border-r">${a.assetCondition || '-'}</td>
                    <td class="p-3 border-r">${a.priceStatus || '-'}</td>
                    <td class="p-3 border-r">${a.unitCost || '-'}</td>
                    <td class="p-3 border-r">${a.assetDescription || '-'}</td>
                    <td class="p-3 border-r">${a.serviceDate || '-'}</td>
                    <td class="p-3 border-r">${a.manufacturer || '-'}</td>
                    <td class="p-3 border-r">${a.majorCategory || '-'}</td>
                    <td class="p-3 border-r">${a.subMajorCategory || '-'}</td>
                    <td class="p-3 border-r">${a.subMinorCategory || '-'}</td>
                    <td class="p-3 border-r">${a.dofMajor || '-'}</td>
                    <td class="p-3 border-r">${a.dofMinor || '-'}</td>
                    <td class="p-3 border-r">${a.category || '-'}</td>
                    <td class="p-3 border-r">${a.classification || '-'}</td>
                    <td class="p-3 border-r">${a.locationName || '-'}</td>
                    <td class="p-3 border-r">${a.esisId || '-'}</td>
                    <td class="p-3 border-r">${a.buildingName || '-'}</td>
                    <td class="p-3 border-r">${a.roomName || '-'}</td>
                    <td class="p-3 border-r">${a.roomNo || '-'}</td>
                    <td class="p-3 border-r">${a.currentRoomBarcode || '-'}</td>
                    <td class="p-3 border-r">${a.floorNo || '-'}</td>
                    <td class="p-3 border-r">${a.floorDescription || '-'}</td>
                    <td class="p-3 border-r">${a.barcodeStatus || '-'}</td>
                    <td class="p-3 border-r"><span class="px-2 py-1 rounded text-[10px] font-bold bg-red-100 text-red-600">Disposed</span></td>
                    <td class="p-3 border-r">${a.oldSchoolName || '-'}</td>
                    <td class="p-3 border-r">${a.transactionNo || '-'}</td>
                    <td class="p-3 border-r">${a.usefulLife || '-'}</td>
                    <td class="p-3 border-r">${a.vendorName || '-'}</td>
                    <td class="p-3 border-r">${a.oldBarcode || '-'}</td>
                    <td class="p-3 border-r">${a.farBarcode || '-'}</td>
                    <td class="p-3 border-r">${a.invoiceNo || '-'}</td>
                    <td class="p-3 border-r">${a.dnNo || '-'}</td>
                    <td class="p-3 border-r italic text-gray-500">${a.remarks || '-'}</td>
                    <td class="p-3 border-r font-mono font-bold text-indigo-600">${a.physRegNo || '-'}</td>
                    <td class="p-3 border-r">${a.fixedAssetRegNo || '-'}</td>
                    <td class="p-3 border-r">${a.mappingCriteria || '-'}</td>
                    <td class="p-3 border-r text-center">
                        ${initialPhotoUrl ? `<img src="${initialPhoto}" class="h-10 w-10 object-cover rounded border mx-auto" onclick="window.openImageZoom('${initialPhoto}')">` : '-'}
                    </td>
                    <td class="p-3 border-r text-center">
                        ${damagePhotoUrl ? `<img src="${damagePhoto}" class="h-10 w-10 object-cover rounded border border-red-200 mx-auto" onclick="window.openImageZoom('${damagePhoto}')">` : '-'}
                    </td>
                    <td class="p-3 text-center">
                        <button onclick="window.deleteAssetRecord('${a.assetBarcode}')" class="text-red-600 hover:text-red-800 transition" title="Delete Asset">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </td>`;
                disposalBody.appendChild(tr);
            });
        }
    } catch (e) { console.error(e); }
};

window.filterAssetTable = () => {
    try {
        if (!window.allAssets) return;
        const q = document.getElementById('asset-search').value.toLowerCase();
        const cat = document.getElementById('asset-category-filter').value;
        const filtered = window.allAssets.filter(a => {
            if (a.assetStatus === 'Disposed') return false;
            const matchQ = (a.assetBarcode || "").toLowerCase().includes(q) || (a.modelDescription || "").toLowerCase().includes(q) || (a.physRegNo || "").toLowerCase().includes(q);
            const matchCat = cat === 'all' || a.majorCategory === cat;
            return matchQ && matchCat;
        });

        const body = document.getElementById('admin-asset-list-body');
        if (body) {
            body.innerHTML = '';
            filtered.forEach(a => {
                const initialPhotoUrl = a.auditPhotoUrl || a.audit_photo || a.beforePhotoUrl || a.photoUrl ||
                                       (a.initialAuditPhoto ? (typeof a.initialAuditPhoto === 'object' ? a.initialAuditPhoto.fileUrl : a.initialAuditPhoto) : null);

                const initialPhoto = window.getDirectDriveImageUrl(initialPhotoUrl);
                const tr = document.createElement('tr');
                tr.className = "hover:bg-gray-50 transition border-b border-gray-100 text-[12px]";
                tr.innerHTML = `
                    <td class="p-3 border-r font-bold">${a.assetBarcode || '-'}</td>
                    <td class="p-3 border-r">${a.serialNo || '-'}</td>
                    <td class="p-3 border-r">${a.modelDescription || '-'}</td>
                    <td class="p-3 border-r">${a.assetCondition || '-'}</td>
                    <td class="p-3 border-r">${a.priceStatus || '-'}</td>
                    <td class="p-3 border-r">${a.unitCost || '-'}</td>
                    <td class="p-3 border-r">${a.assetDescription || '-'}</td>
                    <td class="p-3 border-r">${a.serviceDate || '-'}</td>
                    <td class="p-3 border-r">${a.manufacturer || '-'}</td>
                    <td class="p-3 border-r">${a.majorCategory || '-'}</td>
                    <td class="p-3 border-r">${a.subMajorCategory || '-'}</td>
                    <td class="p-3 border-r">${a.subMinorCategory || '-'}</td>
                    <td class="p-3 border-r">${a.dofMajor || '-'}</td>
                    <td class="p-3 border-r">${a.dofMinor || '-'}</td>
                    <td class="p-3 border-r">${a.category || '-'}</td>
                    <td class="p-3 border-r">${a.classification || '-'}</td>
                    <td class="p-3 border-r">${a.locationName || '-'}</td>
                    <td class="p-3 border-r">${a.esisId || '-'}</td>
                    <td class="p-3 border-r">${a.buildingName || '-'}</td>
                    <td class="p-3 border-r">${a.roomName || '-'}</td>
                    <td class="p-3 border-r">${a.roomNo || '-'}</td>
                    <td class="p-3 border-r">${a.currentRoomBarcode || '-'}</td>
                    <td class="p-3 border-r">${a.floorNo || '-'}</td>
                    <td class="p-3 border-r">${a.floorDescription || '-'}</td>
                    <td class="p-3 border-r">${a.barcodeStatus || '-'}</td>
                    <td class="p-3 border-r"><span class="px-2 py-1 rounded text-[10px] font-bold bg-green-100 text-green-600">Existing</span></td>
                    <td class="p-3 border-r">${a.oldSchoolName || '-'}</td>
                    <td class="p-3 border-r">${a.transactionNo || '-'}</td>
                    <td class="p-3 border-r">${a.usefulLife || '-'}</td>
                    <td class="p-3 border-r">${a.vendorName || '-'}</td>
                    <td class="p-3 border-r">${a.oldBarcode || '-'}</td>
                    <td class="p-3 border-r">${a.farBarcode || '-'}</td>
                    <td class="p-3 border-r">${a.invoiceNo || '-'}</td>
                    <td class="p-3 border-r">${a.dnNo || '-'}</td>
                    <td class="p-3 border-r italic text-gray-500">${a.remarks || '-'}</td>
                    <td class="p-3 border-r font-mono font-bold text-indigo-600">${a.physRegNo || '-'}</td>
                    <td class="p-3 border-r">${a.fixedAssetRegNo || '-'}</td>
                    <td class="p-3 border-r">${a.mappingCriteria || '-'}</td>
                    <td class="p-3 border-r text-center">
                        ${initialPhotoUrl ? `<img src="${initialPhoto}" class="h-10 w-10 object-cover rounded border mx-auto" onclick="window.openImageZoom('${initialPhoto}')">` : '-'}
                    </td>
                    <td class="p-3 border-r text-center">-</td>
                    <td class="p-3 text-center">
                        <button onclick="window.deleteAssetRecord('${a.assetBarcode}')" class="text-red-600 hover:text-red-800 transition" title="Delete Asset">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </td>`;
                body.appendChild(tr);
            });
        }
    } catch (e) { console.error(e); }
};
