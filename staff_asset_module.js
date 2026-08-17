import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, get, update, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================
// STAFF ASSET QUICK SEARCH & EDIT MODULE (v4.3)
// ================================================

/* Open/Close Modal */
window.openAssetScannerModal = function() {
    const modal = document.getElementById('asset-quick-edit-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
    document.getElementById('asset-edit-form').classList.add('hidden');
    document.getElementById('asset-search-input').value = '';
};

window.closeAssetScannerModal = function() {
    const modal = document.getElementById('asset-quick-edit-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    if (window.stopCameraScanner) {
        window.stopCameraScanner();
    }
};

/**
 * RESTORED: 40-COLUMN DYNAMIC ASSET SEARCH
 * Correctly maps any attribute from master register.
 */
window.searchAssetByIdOrBarcode = async function(scannedCode) {
    const queryTerm = (scannedCode || document.getElementById('asset-search-input').value).trim();
    if (!queryTerm) {
        alert("⚠️ Please enter or scan an Asset ID or Barcode.");
        return;
    }

    window.showGlobalSpinner("Searching Master Register...");

    // CLEAR PREVIOUS DATA TO PREVENT MIXED-UP RESULTS
    const formContainer = document.getElementById('dynamic-edit-fields-container');
    if (formContainer) formContainer.innerHTML = '';
    document.getElementById('asset-display-id').innerText = '...';
    document.getElementById('asset-display-name').innerText = 'Searching...';

    try {
        // Direct lookup by Barcode/ID Key
        let assetRef = ref(db, `assets/${queryTerm}`);
        let snapshot = await get(assetRef);

        let foundAssetKey = null;
        let foundAssetData = null;

        if (snapshot.exists()) {
            foundAssetKey = snapshot.key;
            foundAssetData = snapshot.val();
        } else {
            // Fallback: Full Register Scan (For 6000+ assets, direct key is faster)
            console.log("🔍 Direct key search missed, trying full register scan...");
            const allAssetsSnap = await get(ref(db, 'assets'));
            if (allAssetsSnap.exists()) {
                allAssetsSnap.forEach((child) => {
                    const val = child.val();
                    if (val.assetBarcode === queryTerm || val.barcode === queryTerm || val.assetId === queryTerm || child.key === queryTerm) {
                        foundAssetKey = child.key;
                        foundAssetData = val;
                    }
                });
            }
        }

        if (!foundAssetData) {
            alert(`❌ No asset found matching Code: "${queryTerm}"`);
            window.hideGlobalSpinner();
            return;
        }

        // --- DYNAMIC FORM GENERATION (ALL 40+ COLUMNS) ---
        if (formContainer) {
            // Hidden ID tracking
            document.getElementById('edit-asset-doc-id').value = foundAssetKey;

            // Identity Header with multi-property fallbacks
            document.getElementById('asset-display-id').innerText = foundAssetData.assetBarcode || foundAssetData.barcode || foundAssetData.assetId || foundAssetData.serialNo || foundAssetKey;
            document.getElementById('asset-display-name').innerText = foundAssetData.assetDescription || foundAssetData.name || foundAssetData.description || foundAssetData.itemName || 'Unnamed Asset';
            document.getElementById('asset-display-category').innerText = `${foundAssetData.category || foundAssetData.classification || foundAssetData.majorCategory || 'General'} | Category`;

            const photoUrl = foundAssetData.photoURL || foundAssetData.photoUrl || foundAssetData.auditPhoto || foundAssetData.photo || foundAssetData.imageUrl;
            document.getElementById('asset-display-img').src = window.getDirectDriveImageUrl ? window.getDirectDriveImageUrl(photoUrl) : (photoUrl || 'https://placehold.co/150x150/e2e8f0/64748b?text=No+Photo');

            // Iterate all keys in the asset object for the 40-column view
            const ignoredKeys = ['assetId', 'updatedAt', 'profilePicUrl', '_importBatch', '_forceId', '_importSource', 'locationHistory', 'firebaseKey', 'photo', 'photoUrl', 'photoURL', 'auditPhoto'];

            Object.keys(foundAssetData).forEach(key => {
                if (ignoredKeys.includes(key)) return;

                const val = (foundAssetData[key] !== undefined && foundAssetData[key] !== null) ? foundAssetData[key] : '';
                const label = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toUpperCase().trim();

                const fieldGroup = document.createElement('div');
                fieldGroup.className = 'space-y-1.5';

                // Dropdown for Status/Condition
                if (key.toLowerCase().includes('status') || key.toLowerCase().includes('condition')) {
                    fieldGroup.innerHTML = `
                        <label class="text-[9px] font-black uppercase text-indigo-900 ml-2 tracking-wider">${label}</label>
                        <select name="${key}" class="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-black text-slate-900 focus:border-indigo-600 outline-none">
                            <option value="OPERATIONAL" ${String(val).toUpperCase() === 'OPERATIONAL' ? 'selected' : ''}>🟢 Operational</option>
                            <option value="NEEDS_MAINTENANCE" ${String(val).toUpperCase() === 'NEEDS_MAINTENANCE' ? 'selected' : ''}>🟡 Needs Maintenance</option>
                            <option value="DAMAGED" ${String(val).toUpperCase() === 'DAMAGED' ? 'selected' : ''}>🔴 Damaged / Scrapped</option>
                            <option value="IN_TRANSIT" ${String(val).toUpperCase() === 'IN_TRANSIT' ? 'selected' : ''}>🔵 In Transit</option>
                        </select>
                    `;
                } else if (label.includes('DATE')) {
                    fieldGroup.innerHTML = `
                        <label class="text-[9px] font-black uppercase text-indigo-900 ml-2 tracking-wider">${label}</label>
                        <input type="text" name="${key}" value="${val}" class="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-black text-slate-900 focus:border-indigo-600 outline-none" placeholder="YYYY-MM-DD">
                    `;
                } else {
                    fieldGroup.innerHTML = `
                        <label class="text-[9px] font-black uppercase text-indigo-900 ml-2 tracking-wider">${label}</label>
                        <input type="text" name="${key}" value="${val}" class="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-black text-slate-900 focus:border-indigo-600 outline-none" placeholder="Enter ${label.toLowerCase()}">
                    `;
                }
                formContainer.appendChild(fieldGroup);
            });
        }

        // Show Edit Form
        document.getElementById('asset-edit-form').classList.remove('hidden');

    } catch (err) {
        console.error("Error searching asset:", err);
        alert("❌ Error retrieving asset data: " + err.message);
    } finally {
        window.hideGlobalSpinner();
    }
};

/* Save Updated Asset Details */
window.saveAssetLocationUpdate = async function(e) {
    e.preventDefault();

    const docId = document.getElementById('edit-asset-doc-id').value;
    if (!docId) return alert("Asset ID missing!");

    const staffUser = window.currentStaff || JSON.parse(localStorage.getItem('loggedStaff')) || { name: 'Staff Member', role: 'Staff' };
    const btn = document.getElementById('btn-save-asset');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Syncing Master Register...`;
    }

    window.showGlobalSpinner("Updating Asset Database...");

    try {
        const formData = new FormData(e.target);
        const updateData = {};

        formData.forEach((value, key) => {
            updateData[key] = value.trim();
        });

        // Audit Trail Fields
        updateData.lastUpdatedAt = new Date().toLocaleString();
        updateData.lastUpdatedBy = staffUser.fullName || staffUser.name || 'Staff';
        updateData.lastUpdatedRole = staffUser.role || 'Staff';

        // Update Firebase node
        await update(ref(db, `assets/${docId}`), updateData);

        // Record History
        const historyRef = ref(db, `assets/${docId}/locationHistory`);
        await push(historyRef, {
            updatedBy: updateData.lastUpdatedBy,
            updatedRole: updateData.lastUpdatedRole,
            newLocation: updateData.locationName || updateData.roomName || updateData.location || 'N/A',
            timestamp: updateData.lastUpdatedAt,
            unixTimestamp: Date.now()
        });

        window.triggerSuccessPopup("✅ Asset Master Updated! Live Sync Successful.");
        window.closeAssetScannerModal();

    } catch (err) {
        console.error("Failed to update asset:", err);
        alert("❌ Sync Failed: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> SAVE & SYNC MASTER REGISTER`;
        }
        window.hideGlobalSpinner();
    }
};

/* Camera Trigger using global scanner Modal */
window.startCameraQRScanner = function() {
    if (window.startCameraScanner) {
        window.startCameraScanner('asset-search-input');

        const input = document.getElementById('asset-search-input');
        const checkInterval = setInterval(() => {
            if (input.value !== "") {
                window.searchAssetByIdOrBarcode(input.value);
                clearInterval(checkInterval);
            }
            if (document.getElementById('scannerModal').classList.contains('hidden')) {
                clearInterval(checkInterval);
            }
        }, 500);

    } else {
        alert("Scanner engine not loaded.");
    }
};

console.log("✅ staff_asset_module.js (v4.3) loaded");
