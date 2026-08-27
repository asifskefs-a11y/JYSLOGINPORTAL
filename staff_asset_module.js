import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, get, update, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================
// STAFF ASSET QUICK SEARCH & EDIT MODULE (v4.3 FIXED)
// ================================================

// ================================================================ */
// ✅ FIXED: DOM READY CHECK - Wait for elements to exist          */
// ================================================================ */

function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(checkInterval);
                resolve(element);
            } else if (Date.now() - startTime > timeout) {
                clearInterval(checkInterval);
                reject(new Error(`Element ${selector} not found within ${timeout}ms`));
            }
        }, 100);
    });
}

// ================================================================ */
// OPEN/CLOSE MODAL                                                 */
// ================================================================ */

window.openAssetScannerModal = function() {
    const modal = document.getElementById('asset-quick-edit-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
    document.getElementById('asset-edit-form').classList.add('hidden');
    document.getElementById('asset-search-input').value = '';

    // ✅ FIXED: Reset form state
    const formContainer = document.getElementById('dynamic-edit-fields-container');
    if (formContainer) formContainer.innerHTML = '';
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

    // ✅ FIXED: Reset state
    const editForm = document.getElementById('asset-edit-form');
    if (editForm) editForm.classList.add('hidden');
    const searchInput = document.getElementById('asset-search-input');
    if (searchInput) searchInput.value = '';
};

// ================================================================ */
// ✅ FIXED: SEARCH ASSET WITH BETTER ERROR HANDLING               */
// ================================================================ */

window.searchAssetByIdOrBarcode = async function(scannedCode) {
    const queryTerm = (scannedCode || document.getElementById('asset-search-input')?.value || '').trim();
    if (!queryTerm) {
        alert("⚠️ Please enter or scan an Asset ID or Barcode.");
        return;
    }

    window.showGlobalSpinner("Searching Master Register...");

    // CLEAR PREVIOUS DATA
    const formContainer = document.getElementById('dynamic-edit-fields-container');
    if (formContainer) formContainer.innerHTML = '';
    document.getElementById('asset-display-id').innerText = '...';
    document.getElementById('asset-display-name').innerText = 'Searching...';
    document.getElementById('asset-edit-form')?.classList.add('hidden');

    try {
        // ✅ FIXED: Sanitize the query for Firebase key
        const sanitizedQuery = queryTerm.replace(/[.#$\[\]]/g, '_');

        // Direct lookup by Barcode/ID Key
        let assetRef = ref(db, `assets/${sanitizedQuery}`);
        let snapshot = await get(assetRef);

        let foundAssetKey = null;
        let foundAssetData = null;

        if (snapshot.exists()) {
            foundAssetKey = snapshot.key;
            foundAssetData = snapshot.val();
        } else {
            // Fallback: Full Register Scan
            console.log("🔍 Direct key search missed, trying full register scan...");
            const allAssetsSnap = await get(ref(db, 'assets'));
            if (allAssetsSnap.exists()) {
                allAssetsSnap.forEach((child) => {
                    const val = child.val();
                    const barcode = val.assetBarcode || val.barcode || val.assetId || '';
                    if (barcode && barcode.toString().toUpperCase() === queryTerm.toUpperCase()) {
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

        // --- DYNAMIC FORM GENERATION ---
        if (formContainer) {
            // Hidden ID tracking
            document.getElementById('edit-asset-doc-id').value = foundAssetKey;

            // Identity Header
            document.getElementById('asset-display-id').innerText = foundAssetData.assetBarcode || foundAssetData.barcode || foundAssetData.assetId || foundAssetData.serialNo || foundAssetKey;
            document.getElementById('asset-display-name').innerText = foundAssetData.assetDescription || foundAssetData.name || foundAssetData.description || foundAssetData.itemName || 'Unnamed Asset';
            document.getElementById('asset-display-category').innerText = `${foundAssetData.category || foundAssetData.classification || foundAssetData.majorCategory || 'General'} | Category`;

            // Photo
            const photoUrl = foundAssetData.photoURL || foundAssetData.photoUrl || foundAssetData.auditPhoto || foundAssetData.photo || foundAssetData.imageUrl;
            const imgEl = document.getElementById('asset-display-img');
            if (imgEl) {
                if (photoUrl && photoUrl !== 'N/A' && photoUrl !== '-') {
                    imgEl.src = window.getDirectDriveImageUrl ? window.getDirectDriveImageUrl(photoUrl) : photoUrl;
                } else {
                    imgEl.src = 'https://placehold.co/150x150/e2e8f0/64748b?text=No+Photo';
                }
            }

            // ✅ FIXED: Clear container before generating fields
            formContainer.innerHTML = '';

            // Iterate all keys in the asset object
            const ignoredKeys = [
                'assetId', 'updatedAt', 'profilePicUrl', '_importBatch',
                '_forceId', '_importSource', 'locationHistory', 'firebaseKey',
                'photo', 'photoUrl', 'photoURL', 'auditPhoto', 'imageUrl'
            ];

            // ✅ FIXED: Sort keys for consistent display
            const sortedKeys = Object.keys(foundAssetData).filter(k => !ignoredKeys.includes(k)).sort();

            if (sortedKeys.length === 0) {
                formContainer.innerHTML = `<p class="text-slate-400 text-center py-4">No editable fields found.</p>`;
            }

            sortedKeys.forEach(key => {
                const val = (foundAssetData[key] !== undefined && foundAssetData[key] !== null) ? foundAssetData[key] : '';
                const label = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toUpperCase().trim();

                const fieldGroup = document.createElement('div');
                fieldGroup.className = 'space-y-1.5';

                // ✅ FIXED: Special handling for status/condition fields
                if (key.toLowerCase().includes('status') || key.toLowerCase().includes('condition')) {
                    const statusOptions = ['OPERATIONAL', 'NEEDS_MAINTENANCE', 'DAMAGED', 'IN_TRANSIT', 'DISPOSED'];
                    const currentVal = String(val).toUpperCase();

                    let optionsHtml = statusOptions.map(opt => {
                        const isSelected = currentVal === opt || (currentVal.includes(opt.substring(0, 3)) && opt !== 'OPERATIONAL');
                        return `<option value="${opt}" ${isSelected ? 'selected' : ''}>${opt.replace(/_/g, ' ')}</option>`;
                    }).join('');

                    fieldGroup.innerHTML = `
                        <label class="text-[9px] font-black uppercase text-indigo-900 ml-2 tracking-wider">${label}</label>
                        <select name="${key}" class="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-black text-slate-900 focus:border-indigo-600 outline-none">
                            ${optionsHtml}
                        </select>
                    `;
                } else if (label.includes('DATE') || key.toLowerCase().includes('date')) {
                    fieldGroup.innerHTML = `
                        <label class="text-[9px] font-black uppercase text-indigo-900 ml-2 tracking-wider">${label}</label>
                        <input type="text" name="${key}" value="${val}" class="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-black text-slate-900 focus:border-indigo-600 outline-none" placeholder="YYYY-MM-DD">
                    `;
                } else if (typeof val === 'number') {
                    fieldGroup.innerHTML = `
                        <label class="text-[9px] font-black uppercase text-indigo-900 ml-2 tracking-wider">${label}</label>
                        <input type="number" name="${key}" value="${val}" class="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-black text-slate-900 focus:border-indigo-600 outline-none" step="0.01">
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

// ================================================================ */
// ✅ FIXED: SAVE ASSET UPDATES WITH VALIDATION & RETRY            */
// ================================================================ */

window.saveAssetLocationUpdate = async function(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    const docId = document.getElementById('edit-asset-doc-id')?.value;
    if (!docId) {
        alert("Asset ID missing! Please search for an asset first.");
        return;
    }

    const staffUser = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || '{}');
    if (!staffUser || !staffUser.name) {
        alert("Session error. Please logout and login again.");
        return;
    }

    const btn = document.getElementById('btn-save-asset');
    const originalText = btn?.innerHTML || 'SAVE & SYNC MASTER REGISTER';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Syncing Master Register...`;
    }

    window.showGlobalSpinner("Updating Asset Database...");

    try {
        const form = document.getElementById('form-asset-update');
        if (!form) throw new Error("Form not found");

        const formData = new FormData(form);
        const updateData = {};

        // ✅ FIXED: Validate and collect form data
        let hasValidData = false;
        formData.forEach((value, key) => {
            const trimmed = value.toString().trim();
            if (trimmed) {
                updateData[key] = trimmed;
                hasValidData = true;
            } else {
                // Keep existing value if empty (we'll merge with existing)
                updateData[key] = trimmed;
            }
        });

        // ✅ FIXED: Fetch existing data to merge
        const existingSnap = await get(ref(db, `assets/${docId}`));
        if (existingSnap.exists()) {
            const existing = existingSnap.val();
            // Only update fields that were in the form
            Object.keys(updateData).forEach(key => {
                if (updateData[key] === '') {
                    // Keep existing value if field was left empty
                    if (existing[key] !== undefined) {
                        updateData[key] = existing[key];
                    }
                }
            });
        }

        // Audit Trail Fields
        updateData.lastUpdatedAt = new Date().toLocaleString();
        updateData.lastUpdatedBy = staffUser.fullName || staffUser.name || 'Staff';
        updateData.lastUpdatedRole = staffUser.role || 'Staff';
        updateData.updatedTimestamp = Date.now();

        // ✅ FIXED: Update Firebase with retry
        let retries = 3;
        let lastError = null;
        let success = false;

        while (retries > 0 && !success) {
            try {
                await update(ref(db, `assets/${docId}`), updateData);
                success = true;
                console.log(`✅ Asset ${docId} updated successfully`);
            } catch (err) {
                lastError = err;
                retries--;
                console.warn(`⚠️ Update attempt failed, ${retries} retries left:`, err);
                if (retries > 0) {
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        }

        if (!success) {
            throw new Error(lastError || "Failed to update asset after retries");
        }

        // ✅ FIXED: Record History
        try {
            const historyRef = ref(db, `assets/${docId}/locationHistory`);
            await push(historyRef, {
                updatedBy: updateData.lastUpdatedBy,
                updatedRole: updateData.lastUpdatedRole,
                newLocation: updateData.locationName || updateData.roomName || updateData.location || 'N/A',
                timestamp: updateData.lastUpdatedAt,
                unixTimestamp: Date.now()
            });
        } catch (histErr) {
            console.warn("⚠️ History recording failed:", histErr);
            // Continue - don't fail the main update
        }

        window.triggerSuccessPopup("✅ Asset Master Updated! Live Sync Successful.");

        // ✅ FIXED: Update the display with new data
        setTimeout(() => {
            window.searchAssetByIdOrBarcode(docId);
        }, 500);

        window.closeAssetScannerModal();

    } catch (err) {
        console.error("Failed to update asset:", err);
        alert("❌ Sync Failed: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
        window.hideGlobalSpinner();
    }
};

// ================================================================ */
// ✅ FIXED: CAMERA SCANNER TRIGGER                                */
// ================================================================ */

window.startCameraQRScanner = function() {
    if (!window.startCameraScanner) {
        alert("Scanner engine not loaded. Please refresh the page.");
        return;
    }

    // Ensure we have a target input
    const input = document.getElementById('asset-search-input');
    if (!input) {
        alert("Search input not found.");
        return;
    }

    // Start scanner with the input ID
    window.startCameraScanner('asset-search-input');

    // ✅ FIXED: Auto-detect when scan completes
    const checkInterval = setInterval(() => {
        if (input.value !== "") {
            window.searchAssetByIdOrBarcode(input.value);
            clearInterval(checkInterval);
        }
        // Check if scanner modal is closed
        const scannerModal = document.getElementById('scannerModal');
        if (scannerModal && scannerModal.classList.contains('hidden')) {
            clearInterval(checkInterval);
        }
    }, 500);
};

// ================================================================ */
// ✅ FIXED: INITIALIZATION - Wait for DOM to be ready             */
// ================================================================ */

document.addEventListener('DOMContentLoaded', function() {
    console.log("🔧 staff_asset_module: Initializing...");

    // Wait for the search input to be available
    waitForElement('#asset-search-input', 3000)
        .then(() => {
            console.log("✅ Asset search input found");

            // ✅ FIXED: Add keyboard support (Enter key to search)
            const searchInput = document.getElementById('asset-search-input');
            if (searchInput) {
                searchInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        window.searchAssetByIdOrBarcode();
                    }
                });
            }

            // ✅ FIXED: Auto-focus on modal open
            const modal = document.getElementById('asset-quick-edit-modal');
            if (modal) {
                const observer = new MutationObserver(() => {
                    if (!modal.classList.contains('hidden')) {
                        setTimeout(() => {
                            const input = document.getElementById('asset-search-input');
                            if (input) input.focus();
                        }, 300);
                    }
                });
                observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
            }
        })
        .catch((err) => {
            console.warn("⚠️ Asset search input not found (may not be on this page):", err);
        });
});

console.log("✅ staff_asset_module.js (v4.3) loaded");