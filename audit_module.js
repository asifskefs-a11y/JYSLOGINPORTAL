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
                auditTimestamp: new Date().toLocaleString(),
                auditBy: window.currentStaff ? window.currentStaff.name : "Unknown"
            };

            await set(ref(db, `assets/${barcode}`), assetData);
            alert("Asset Registered Successfully!");
            e.target.reset();
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

window.openDirectDisposal = async () => {
    const val = prompt("Enter Asset Barcode for Disposal (Manual):");
    if (!val) return;
    const assetSnap = await get(child(ref(db), `assets/${val}`));
    if (assetSnap.exists()) {
        window.openDisposalModal(val);
    } else { alert("Asset not found in register."); }
};
