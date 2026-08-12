import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, get, update, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================
// STAFF ASSET QUICK SEARCH & EDIT MODULE
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

/* Search Asset in 6000+ Register by ID or Barcode */
window.searchAssetByIdOrBarcode = async function(scannedCode) {
    const queryTerm = (scannedCode || document.getElementById('asset-search-input').value).trim();
    if (!queryTerm) {
        alert("⚠️ Please enter or scan an Asset ID or Barcode.");
        return;
    }

    window.showGlobalSpinner("Searching Master Register...");

    try {
        // Direct lookup by Barcode (most efficient if barcode is the key)
        let assetRef = ref(db, `assets/${queryTerm}`);
        let snapshot = await get(assetRef);

        let foundAssetKey = null;
        let foundAssetData = null;

        if (snapshot.exists()) {
            foundAssetKey = snapshot.key;
            foundAssetData = snapshot.val();
        } else {
            // Fallback: Iterative search (only if not found by direct key)
            // Note: For 6000+ assets, direct key access is preferred.
            // If the key is not the barcode, we might need a query.
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
            return;
        }

        // Populate Form with Existing Asset Details
        document.getElementById('edit-asset-doc-id').value = foundAssetKey;
        document.getElementById('asset-display-id').innerText = foundAssetData.assetBarcode || foundAssetData.assetId || foundAssetKey;
        document.getElementById('asset-display-name').innerText = foundAssetData.assetDescription || foundAssetData.name || 'Unnamed Asset';
        document.getElementById('asset-display-category').innerText = `${foundAssetData.category || 'General'} | Category`;

        const photoUrl = foundAssetData.photoURL || foundAssetData.photoUrl || foundAssetData.auditPhoto;
        document.getElementById('asset-display-img').src = window.getDirectDriveImageUrl ? window.getDirectDriveImageUrl(photoUrl) : (photoUrl || 'https://placehold.co/150x150/e2e8f0/64748b?text=No+Photo');

        // Populate Editable Location & Status
        document.getElementById('edit-asset-location').value = foundAssetData.locationName || foundAssetData.location || foundAssetData.roomName || '';
        document.getElementById('edit-asset-status').value = (foundAssetData.assetStatus || foundAssetData.status || 'OPERATIONAL').toUpperCase();
        document.getElementById('edit-asset-note').value = '';

        // Show Edit Form
        document.getElementById('asset-edit-form').classList.remove('hidden');

    } catch (err) {
        console.error("Error searching asset:", err);
        alert("❌ Error retrieving asset data: " + err.message);
    } finally {
        window.hideGlobalSpinner();
    }
};

/* Save Updated Location & Details (Direct Sync to Admin Register) */
window.saveAssetLocationUpdate = async function(e) {
    e.preventDefault();

    const docId = document.getElementById('edit-asset-doc-id').value;
    const newLocation = document.getElementById('edit-asset-location').value.trim();
    const newStatus = document.getElementById('edit-asset-status').value;
    const note = document.getElementById('edit-asset-note').value.trim();

    const staffUser = window.currentStaff || JSON.parse(localStorage.getItem('loggedStaff')) || { name: 'Staff Member', role: 'Staff' };

    if (!docId || !newLocation) {
        alert("⚠️ Please provide a valid location.");
        return;
    }

    const btn = document.getElementById('btn-save-asset');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Syncing to Master Register...`;
    }

    window.showGlobalSpinner("Updating Asset Master...");

    try {
        const updateData = {
            locationName: newLocation,
            location: newLocation,
            roomName: newLocation,
            assetStatus: newStatus,
            lastUpdatedBy: staffUser.fullName || staffUser.name || 'Staff',
            lastUpdatedRole: staffUser.role || staffUser.position || 'Staff',
            lastUpdatedAt: new Date().toLocaleString()
        };

        // Update Master Register
        await update(ref(db, `assets/${docId}`), updateData);

        // Record Location Audit History
        const historyRef = ref(db, `assets/${docId}/locationHistory`);
        await push(historyRef, {
            updatedBy: staffUser.fullName || staffUser.name,
            updatedRole: staffUser.role || staffUser.position,
            newLocation: newLocation,
            status: newStatus,
            remark: note || 'Location Shifted via Staff Quick Edit',
            timestamp: new Date().toLocaleString(),
            unixTimestamp: Date.now()
        });

        window.triggerSuccessPopup("✅ Asset Updated! Master Register Synced.");
        window.closeAssetScannerModal();

        // Refresh dashboard data if admin
        if (window.refreshDashboardData) window.refreshDashboardData();

    } catch (err) {
        console.error("Failed to update asset:", err);
        alert("❌ Failed to update asset: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save & Sync to Admin Register`;
        }
        window.hideGlobalSpinner();
    }
};

/* Camera Trigger using global scanner Modal */
window.startCameraQRScanner = function() {
    if (window.startCameraScanner) {
        window.startCameraScanner('asset-search-input');

        // Add a listener to trigger search when scan completes
        const input = document.getElementById('asset-search-input');
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === "attributes" && mutation.attributeName === "value" || mutation.target.value !== "") {
                    window.searchAssetByIdOrBarcode(input.value);
                    observer.disconnect();
                }
            });
        });

        // Simple polling fallback since MutationObserver on value attribute doesn't always work for JS updates
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

console.log("✅ staff_asset_module.js loaded (Quick Asset Edit)");
