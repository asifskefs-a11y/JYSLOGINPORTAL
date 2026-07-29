import { db } from './firebase_config.js';
import { ref, set, get, update, child } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- ASSET MODULE LOGIC (RESTORED ORIGINAL) ---
let html5QrCode = null;
let currentScanTarget = null;
let activeAuditBarcode = null;
let initialAuditPhotoBase64 = "";
let damageAuditPhotoBase64 = "";
let assetTemplates = {};

// --- MASTER TEMPLATE LOGIC ---
window.toggleTemplateMode = async () => {
    const isChecked = document.getElementById('use-template-toggle').checked;
    const select = document.getElementById('master-template-select');
    const preview = document.getElementById('template-photo-preview');
    const uploadBtn = document.querySelector('button[onclick*="f40_audit_photo_input"]');

    if (isChecked) {
        select.classList.remove('hidden');
        uploadBtn.classList.add('hidden');
        const snap = await get(ref(db, 'asset_templates'));
        if (snap.exists()) {
            assetTemplates = snap.val();
            select.innerHTML = '<option value="">Select Category Model...</option>';
            Object.keys(assetTemplates).forEach(cat => {
                select.innerHTML += `<option value="${cat}">${cat}</option>`;
            });
        }
    } else {
        select.classList.add('hidden');
        preview.classList.add('hidden');
        uploadBtn.classList.remove('hidden');
    }
};

window.previewTemplatePhoto = () => {
    const cat = document.getElementById('master-template-select').value;
    const preview = document.getElementById('template-photo-preview');
    if (cat && assetTemplates[cat]) {
        preview.classList.remove('hidden');
        preview.querySelector('img').src = window.getDirectDriveImageUrl(assetTemplates[cat]);
    } else {
        preview.classList.add('hidden');
    }
};

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

// --- CORE NAVIGATION ---
window.openAssetAudit = () => {
    const dash = document.getElementById('staff-dash-area');
    const audit = document.getElementById('asset-audit-section');
    if (dash) dash.classList.add('hidden');
    if (audit) audit.classList.remove('hidden');
    window.generatePhysRegNo();
};

window.closeAssetAudit = () => {
    const dash = document.getElementById('staff-dash-area');
    const audit = document.getElementById('asset-audit-section');
    if (dash) dash.classList.remove('hidden');
    if (audit) audit.classList.add('hidden');
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
        if (snap.exists()) count = Object.keys(snap.val()).length + 1;
        const no = "JYS-" + count.toString().padStart(4, '0');
        const el = document.getElementById('f36_phys_reg_no');
        if (el) el.value = no;
    } catch (e) { console.error(e); }
};

// --- SCANNER LOGIC ---
window.startCameraScanner = async (inputId) => {
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

    const config = { fps: 15, qrbox: { width: 250, height: 180 } };

    try {
        await html5QrCode.start(
            { facingMode: "environment" },
            config,
            async (decodedText) => {
                const input = document.getElementById(currentScanTarget);
                if (input) {
                    input.value = decodedText.trim().toUpperCase();
                    if (currentScanTarget === 'f1_asset_barcode') {
                        await window.checkDuplicateBarcode(input.value);
                    } else if (currentScanTarget === 'f1_disposal_barcode_input') {
                        window.fetchDisposalAssetDetails(input.value);
                    }
                }
                window.stopCameraScanner();
            },
            () => {}
        );
    } catch (err) {
        alert("Camera Error: Access denied.");
        window.stopCameraScanner();
    }
};

window.stopCameraScanner = async () => {
    if (html5QrCode && html5QrCode.isScanning) await html5QrCode.stop();
    const modal = document.getElementById('scanner-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

// --- AUDIT UPDATES ---
window.handleAuditConditionChange = () => {
    const condition = document.getElementById('audit-condition-select').value;
    const photoArea = document.getElementById('damage-photo-area');
    if (condition === 'BROKEN / DAMAGED') {
        photoArea.classList.remove('hidden');
    } else {
        photoArea.classList.add('hidden');
        damageAuditPhotoBase64 = "";
        document.getElementById('damage-photo-preview').classList.add('hidden');
    }
};

window.handleDamagePhotoCapture = async (e) => {
    try {
        const file = e.target.files[0];
        if (!file) return;
        damageAuditPhotoBase64 = await window.compressImageFile(file, 1000, 1000, 0.7);
        const preview = document.getElementById('damage-photo-preview');
        if (preview) {
            preview.classList.remove('hidden');
            preview.querySelector('img').src = damageAuditPhotoBase64;
        }
    } catch (e) { console.error(e); }
};

window.submitAuditUpdate = async () => {
    if (!activeAuditBarcode) return;
    const condition = document.getElementById('audit-condition-select').value;
    const btn = document.getElementById('submit-audit-update-btn');

    if (condition === 'BROKEN / DAMAGED' && !damageAuditPhotoBase64) {
        return alert("Photo of damage is mandatory!");
    }

    btn.disabled = true;
    btn.innerText = "UPDATING...";

    try {
        let damageUrl = "";
        if (damageAuditPhotoBase64) {
            const res = await window.uploadToDrive({
                type: 'disposed_asset',
                fileName: `AuditDamage_${activeAuditBarcode}.jpg`,
                image: damageAuditPhotoBase64
            });
            damageUrl = res.fileUrl || res.signatureUrl;
        }

        const updates = {
            assetCondition: condition,
            lastAuditTimestamp: new Date().toLocaleString(),
            lastAuditBy: window.currentStaff ? window.currentStaff.name : "System"
        };
        if (damageUrl) updates.disposalDamagedPhoto = damageUrl;

        await update(ref(db, `assets/${activeAuditBarcode}`), updates);
        alert("Audit status updated!");
        window.checkDuplicateBarcode(activeAuditBarcode);
    } catch (e) { alert("Error: " + e.message); }
    finally {
        btn.disabled = false;
        btn.innerText = "SAVE AUDIT STATUS";
    }
};

window.checkDuplicateBarcode = async (barcode) => {
    const val = barcode ? barcode.trim() : "";
    const previewContainer = document.getElementById('duplicate-asset-preview');
    const submitBtn = document.querySelector('#master-asset-form button[type="submit"]');

    if (!val) {
        if (previewContainer) previewContainer.classList.add('hidden');
        if (submitBtn) submitBtn.disabled = false;
        activeAuditBarcode = null;
        return;
    }

    try {
        const snap = await get(child(ref(db), `assets/${val}`));
        if (snap.exists()) {
            const a = snap.val();
            activeAuditBarcode = val;
            if (submitBtn) submitBtn.disabled = true;
            if (previewContainer) {
                previewContainer.classList.remove('hidden');
                const photoUrl = window.getDirectDriveImageUrl(a.auditPhotoUrl || a.photoUrl || a.initialAuditPhoto);
                document.getElementById('dup-photo').src = photoUrl;
                document.getElementById('dup-name').innerText = a.assetDescription || a.modelDescription || 'Unnamed Asset';
                document.getElementById('dup-cat').innerText = `${a.majorCategory || '-'} | ${a.classification || '-'}`;
                document.getElementById('dup-serial').innerText = a.serialNo || '-';
                document.getElementById('dup-loc').innerText = `${a.buildingName || '-'} / ${a.roomNo || '-'}`;
                document.getElementById('dup-date').innerText = a.auditTimestamp || '-';
                document.getElementById('dup-by').innerText = a.auditBy || '-';
                document.getElementById('audit-condition-select').value = a.assetCondition || "GOOD";
                window.handleAuditConditionChange();
            }
        } else {
            if (previewContainer) previewContainer.classList.add('hidden');
            if (submitBtn) submitBtn.disabled = false;
            activeAuditBarcode = null;
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
            if (!barcode) return alert("Barcode is mandatory!");

            const assetData = {
                assetBarcode: barcode,
                serialNo: document.getElementById('f2_serial_no').value,
                modelDescription: document.getElementById('f3_model_desc').value,
                assetCondition: document.getElementById('f4_asset_cond').value,
                assetDescription: document.getElementById('f7_asset_desc').value,
                buildingName: document.getElementById('f19_school_building').value,
                roomNo: document.getElementById('f21_room_no').value,
                majorCategory: document.getElementById('f10_major_cat').value,
                classification: document.getElementById('f16_class').value,
                auditTimestamp: new Date().toLocaleString(),
                auditBy: window.currentStaff ? window.currentStaff.name : "Unknown"
            };

            if (initialAuditPhotoBase64) {
                const res = await window.uploadToDrive({
                    type: "active_asset",
                    fileName: `${barcode}_INITIAL.jpg`,
                    image: initialAuditPhotoBase64
                });
                if (res.status === 'success') assetData.auditPhotoUrl = res.fileUrl;
            }

            await update(ref(db, `assets/${barcode}`), assetData);
            alert("Registered!");
            e.target.reset();
            window.removeInitialAuditPhoto();
        } catch (err) {
            alert("Error: " + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = "SAVE ASSET REGISTER (AUDIT)";
        }
    };
}

// --- DISPOSAL LOGIC ---
window.openDirectDisposal = () => {
    const modal = document.getElementById('asset-disposal-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
};

window.fetchDisposalAssetDetails = async (barcode) => {
    const previewArea = document.getElementById('disposal-asset-preview');
    const submitBtn = document.getElementById('submit-disposal-btn');
    if (!previewArea || !barcode) return;

    try {
        const snap = await get(child(ref(db), `assets/${barcode.trim().toUpperCase()}`));
        if (snap.exists()) {
            const asset = snap.val();
            previewArea.innerHTML = `<div class="p-3 bg-green-50 rounded-xl border border-green-200"><h4 class="font-bold">${asset.assetDescription || asset.modelDescription}</h4><p class="text-[10px]">${asset.buildingName} / ${asset.roomNo}</p></div>`;
            submitBtn.disabled = false;
        } else {
            previewArea.innerHTML = `<p class="text-red-500 text-center p-2 text-xs">Asset Not Found</p>`;
            submitBtn.disabled = true;
        }
    } catch (e) { console.error(e); }
};

window.submitAssetDisposal = async () => {
    const barcode = document.getElementById('f1_disposal_barcode_input').value.trim().toUpperCase();
    const reason = document.getElementById('disposal-reason').value;
    const scrapLoc = document.getElementById('disposal-scrap-loc').value;

    if (!barcode || !reason || !scrapLoc) return alert("All fields are required!");

    try {
        const updates = {};
        updates[`assets/${barcode}/assetStatus`] = 'Disposed';
        updates[`disposed_assets/${barcode}`] = {
            barcode, reason, scrapLoc,
            date: new Date().toLocaleDateString(),
            disposedBy: window.currentStaff ? window.currentStaff.name : "System"
        };
        await update(ref(db), updates);
        alert("Disposed.");
        document.getElementById('asset-disposal-modal').classList.add('hidden');
    } catch (e) { alert("Error: " + e.message); }
};
