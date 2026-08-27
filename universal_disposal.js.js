/**
 * UNIVERSAL ASSET DISPOSAL COMPONENT
 * Single source of truth for asset disposal across all dashboards
 * Version: 1.1 - Enhanced display
 */

import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, get, update, child } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================================ */
// STATE MANAGEMENT                                                 */
// ================================================================ */

let disposalState = {
    currentAsset: null,
    photoBase64: null,
    isSubmitting: false,
    modalId: null
};

// ================================================================ */
// RENDER UNIVERSAL DISPOSAL COMPONENT                             */
// ================================================================ */

function renderUniversalDisposal(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container #${containerId} not found`);
        return;
    }

    const {
        title = 'Asset Disposal',
        subtitle = 'Scrap & Dispose Asset',
        showHeader = true,
        onSuccess = null,
        onCancel = null
    } = options;

    // Store modal ID for later use
    disposalState.modalId = containerId;

    container.innerHTML = `
        <!-- Disposal Container -->
        <div class="universal-disposal-container bg-white rounded-3xl shadow-xl border border-red-50 p-6 space-y-6 text-gray-800">

            ${showHeader ? `
            <div class="flex items-center gap-3 pb-4 border-b border-red-100">
                <div class="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600">
                    <i class="fa-solid fa-trash-can text-xl"></i>
                </div>
                <div>
                    <h3 class="text-xl font-black text-red-600 uppercase tracking-tight">${title}</h3>
                    <p class="text-[10px] font-bold text-red-400 uppercase tracking-widest">${subtitle}</p>
                </div>
            </div>
            ` : ''}

            <!-- Scan Barcode -->
            <div class="input-group">
                <label class="text-[10px] font-black text-red-500 uppercase tracking-wider flex items-center gap-2">
                    <i class="fa-solid fa-qrcode"></i> Scan Barcode *
                </label>
                <div class="input-with-camera relative">
                    <div class="absolute left-4 top-1/2 -translate-y-1/2 text-red-300">
                        <i class="fa-solid fa-barcode text-lg"></i>
                    </div>
                    <input type="text"
                           id="disposal-barcode-input"
                           placeholder="ENTER BARCODE..."
                           class="w-full pl-12 pr-14 py-4 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-red-500 focus:bg-white outline-none transition-all text-sm font-bold uppercase tracking-wider"
                           oninput="window.handleDisposalBarcodeInput(this.value)">
                    <button type="button"
                            onclick="window.startCameraScanner('disposal-barcode-input')"
                            class="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 bg-red-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-red-500/25 hover:bg-red-600 transition-all">
                        <i class="fa-solid fa-camera text-lg"></i>
                    </button>
                </div>
            </div>

            <!-- Asset Preview Card -->
            <div id="disposal-asset-preview-card" class="preview-card bg-slate-50 rounded-xl p-4 border-2 border-dashed border-slate-200 min-h-[60px] transition-all">
                <div class="flex items-center justify-center h-full text-slate-400">
                    <span class="text-[10px] font-bold uppercase tracking-widest">Scan barcode to load asset details</span>
                </div>
            </div>

            <!-- Asset Details Grid (Auto-populated) -->
            <div id="disposal-asset-details" class="hidden">
                <div class="grid grid-cols-2 gap-3">
                    <!-- Dynamically populated by JavaScript -->
                </div>
            </div>

            <!-- Master Register Photo -->
            <div id="disposal-master-photo-container" class="hidden">
                <div class="text-center">
                    <span class="text-[10px] font-bold text-gray-500 uppercase block mb-1">📷 Master Register Photo</span>
                    <div class="w-full h-32 bg-gray-100 rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-center p-2">
                        <i class="fa-solid fa-image-slash text-gray-400 text-xl mb-1"></i>
                        <span class="text-xs font-bold text-gray-400 uppercase">No Photo Available</span>
                    </div>
                </div>
            </div>

            <!-- Disposal Photo Capture -->
            <div class="input-group">
                <label class="text-[10px] font-black text-red-500 uppercase tracking-wider flex items-center gap-2">
                    <i class="fa-regular fa-image"></i> Disposal Photo (Required)
                </label>
                <input type="file"
                       id="disposal-photo-upload"
                       capture="environment"
                       accept="image/*"
                       class="hidden"
                       onchange="window.handleDisposalPhotoUpload(event)">
                <button type="button"
                        onclick="document.getElementById('disposal-photo-upload').click()"
                        class="w-full py-4 border-2 border-dashed border-red-200 rounded-2xl text-red-600 font-bold flex items-center justify-center gap-3 hover:bg-red-50 transition-all active:scale-[0.98]">
                    <i class="fa-solid fa-camera text-xl"></i>
                    <span id="disposal-photo-btn-text">Take Disposal Photo</span>
                </button>
                <div id="disposal-photo-preview" class="hidden mt-3 h-40 rounded-2xl overflow-hidden border-2 border-red-100 shadow-sm relative">
                    <img id="disposal-photo-preview-img" src="" class="w-full h-full object-cover">
                    <button type="button"
                            onclick="window.removeDisposalPhoto()"
                            class="absolute top-2 right-2 bg-red-500 text-white w-8 h-8 rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-transform">
                        <i class="fa-solid fa-trash-can text-xs"></i>
                    </button>
                </div>
            </div>

            <!-- Date & Time -->
            <div class="grid grid-cols-2 gap-3">
                <div class="input-group">
                    <label class="text-[9px] font-black text-slate-400 uppercase">Current Date</label>
                    <input type="text" id="disposal-current-date" readonly class="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl text-[10px] font-bold">
                </div>
                <div class="input-group">
                    <label class="text-[9px] font-black text-slate-400 uppercase">Current Time</label>
                    <input type="text" id="disposal-current-time" readonly class="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl text-[10px] font-bold">
                </div>
            </div>

            <!-- Disposed By (Auto-filled) -->
            <div class="input-group">
                <label class="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">
                    <i class="fa-regular fa-user"></i> Disposed By
                </label>
                <input type="text" id="disposal-initiated-by" readonly class="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl text-[10px] font-bold text-red-600">
            </div>

            <!-- Reason -->
            <div class="input-group">
                <label class="text-[10px] font-black text-red-500 uppercase tracking-wider flex items-center gap-2">
                    <i class="fa-regular fa-pen-to-square"></i> Reason Of Disposal *
                </label>
                <textarea id="disposal-reason-input"
                          placeholder="Enter reason for disposal..."
                          class="w-full px-4 py-4 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-red-500 focus:bg-white outline-none transition-all h-24 resize-none text-[10px]"></textarea>
            </div>

            <!-- Submit Button -->
            <button id="disposal-submit-btn"
                    onclick="window.submitUniversalDisposal()"
                    class="w-full py-5 bg-gradient-to-r from-red-600 to-red-800 text-white rounded-2xl font-black text-lg shadow-xl shadow-red-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled>
                <i class="fa-solid fa-trash-can"></i> CONFIRM SCRAP & DISPOSE
            </button>
        </div>
    `;

    // Set current date and time
    const now = new Date();
    const dateEl = document.getElementById('disposal-current-date');
    const timeEl = document.getElementById('disposal-current-time');
    if (dateEl) dateEl.value = now.toLocaleDateString();
    if (timeEl) timeEl.value = now.toLocaleTimeString();

    // Auto-fill staff name
    const staffName = window.currentStaff?.fullName || window.currentStaff?.name || 'Unknown Staff';
    const staffRole = window.currentStaff?.role || 'Staff';
    const initiatedBy = document.getElementById('disposal-initiated-by');
    if (initiatedBy) initiatedBy.value = `${staffName} (${staffRole})`;

    console.log('✅ Universal Disposal Component rendered');
}

// ================================================================ */
// HANDLE BARCODE INPUT - ENHANCED WITH BETTER DISPLAY             */
// ================================================================ */

window.handleDisposalBarcodeInput = async function(barcode) {
    const cleanBarcode = (barcode || '').toString().trim().toUpperCase();
    const previewCard = document.getElementById('disposal-asset-preview-card');
    const detailsContainer = document.getElementById('disposal-asset-details');
    const masterPhotoContainer = document.getElementById('disposal-master-photo-container');
    const submitBtn = document.getElementById('disposal-submit-btn');

    if (!cleanBarcode || cleanBarcode.length < 2) {
        // Reset UI
        if (previewCard) {
            previewCard.innerHTML = `
                <div class="flex items-center justify-center h-full text-slate-400">
                    <span class="text-[10px] font-bold uppercase tracking-widest">Scan barcode to load asset details</span>
                </div>
            `;
            previewCard.className = 'preview-card bg-slate-50 rounded-xl p-4 border-2 border-dashed border-slate-200 min-h-[60px] transition-all';
        }
        if (detailsContainer) {
            detailsContainer.classList.add('hidden');
            detailsContainer.innerHTML = '';
        }
        if (masterPhotoContainer) masterPhotoContainer.classList.add('hidden');
        if (submitBtn) submitBtn.disabled = true;
        disposalState.currentAsset = null;
        return;
    }

    if (typeof window.showGlobalSpinner === 'function') {
        window.showGlobalSpinner('Fetching asset details...');
    }

    try {
        // Try direct lookup first
        let assetData = null;
        let assetKey = null;

        // Direct lookup by sanitized key
        const sanitizedKey = cleanBarcode.replace(/[.#$\[\]/]/g, '_');
        const snap = await get(child(ref(db), `assets/${sanitizedKey}`));
        if (snap.exists()) {
            assetData = snap.val();
            assetKey = sanitizedKey;
        }

        // If not found, search all assets
        if (!assetData) {
            const allSnap = await get(ref(db, 'assets'));
            if (allSnap.exists()) {
                const allAssets = allSnap.val();
                for (const [key, val] of Object.entries(allAssets)) {
                    const barcodeVal = val.assetBarcode || val.barcode || val.assetId || '';
                    if (barcodeVal.toString().toUpperCase() === cleanBarcode) {
                        assetData = val;
                        assetKey = key;
                        break;
                    }
                }
            }
        }

        // Normalize the asset data
        const normalizedAsset = window.normalizeAssetData ?
            window.normalizeAssetData(assetData) :
            assetData;

        console.log('📦 Normalized Asset:', normalizedAsset);

        if (normalizedAsset && normalizedAsset.barcode !== '-') {
            disposalState.currentAsset = normalizedAsset;

            // Update preview card - Enhanced with more details
            if (previewCard) {
                const summary = window.getAssetSummary ?
                    window.getAssetSummary(normalizedAsset) :
                    {
                        name: normalizedAsset.assetName || normalizedAsset.description || 'Asset',
                        barcode: normalizedAsset.barcode,
                        location: normalizedAsset.location || '-',
                        category: normalizedAsset.category || '-',
                        status: normalizedAsset.assetStatus || 'Active'
                    };

                previewCard.innerHTML = `
                    <div class="flex items-start gap-4">
                        <div class="w-14 h-14 bg-red-100 rounded-xl flex items-center justify-center text-red-600 flex-shrink-0">
                            <i class="fa-solid fa-box text-2xl"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="font-black text-slate-900 text-sm uppercase truncate">${summary.name}</p>
                            <div class="flex flex-wrap gap-1.5 mt-1.5">
                                <span class="text-[8px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">${summary.barcode}</span>
                                <span class="text-[8px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded">${summary.location}</span>
                                <span class="text-[8px] font-bold ${summary.status === 'Active' ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50'} px-2 py-0.5 rounded">${summary.status}</span>
                            </div>
                            <div class="flex flex-wrap gap-1.5 mt-1">
                                <span class="text-[8px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded">${summary.category}</span>
                                ${summary.vendor && summary.vendor !== '-' ? `<span class="text-[8px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded">${summary.vendor}</span>` : ''}
                            </div>
                        </div>
                        ${summary.photo ? `<img src="${summary.photo}" class="w-14 h-14 object-cover rounded-xl border-2 border-white shadow-sm flex-shrink-0">` : ''}
                    </div>
                `;
                previewCard.className = 'preview-card bg-red-50 rounded-xl p-4 border-2 border-red-200 min-h-[60px] transition-all has-data';
            }

            // Populate details grid - Enhanced with all fields
            if (detailsContainer) {
                detailsContainer.classList.remove('hidden');
                detailsContainer.innerHTML = `
                    <div class="grid grid-cols-2 gap-3">
                        <div class="col-span-2 bg-white p-3 rounded-xl border border-slate-200">
                            <label class="text-[8px] font-black text-slate-400 uppercase block">Asset Name</label>
                            <span class="text-sm font-black text-slate-900">${normalizedAsset.assetName || normalizedAsset.description || '-'}</span>
                        </div>
                        <div class="bg-white p-3 rounded-xl border border-slate-200">
                            <label class="text-[8px] font-black text-slate-400 uppercase block">Barcode</label>
                            <span class="text-sm font-black text-indigo-600 font-mono">${normalizedAsset.barcode || '-'}</span>
                        </div>
                        <div class="bg-white p-3 rounded-xl border border-slate-200">
                            <label class="text-[8px] font-black text-slate-400 uppercase block">Serial Number</label>
                            <span class="text-sm font-black text-slate-900">${normalizedAsset.serialNo || '-'}</span>
                        </div>
                        <div class="bg-white p-3 rounded-xl border border-slate-200">
                            <label class="text-[8px] font-black text-slate-400 uppercase block">Category</label>
                            <span class="text-sm font-black text-slate-900">${normalizedAsset.category || normalizedAsset.majorCategory || '-'}</span>
                        </div>
                        <div class="bg-white p-3 rounded-xl border border-slate-200">
                            <label class="text-[8px] font-black text-slate-400 uppercase block">Major Category</label>
                            <span class="text-sm font-black text-slate-900">${normalizedAsset.majorCategory || '-'}</span>
                        </div>
                        <div class="bg-white p-3 rounded-xl border border-slate-200">
                            <label class="text-[8px] font-black text-slate-400 uppercase block">Minor Category</label>
                            <span class="text-sm font-black text-slate-900">${normalizedAsset.minorCategory || '-'}</span>
                        </div>
                        <div class="bg-white p-3 rounded-xl border border-slate-200">
                            <label class="text-[8px] font-black text-slate-400 uppercase block">Location / Room</label>
                            <span class="text-sm font-black text-slate-900">${normalizedAsset.location || normalizedAsset.roomName || '-'}</span>
                        </div>
                        <div class="bg-white p-3 rounded-xl border border-slate-200">
                            <label class="text-[8px] font-black text-slate-400 uppercase block">Building</label>
                            <span class="text-sm font-black text-slate-900">${normalizedAsset.building || '-'}</span>
                        </div>
                        <div class="bg-white p-3 rounded-xl border border-slate-200">
                            <label class="text-[8px] font-black text-slate-400 uppercase block">Floor</label>
                            <span class="text-sm font-black text-slate-900">${normalizedAsset.floorNo || normalizedAsset.floorDescription || '-'}</span>
                        </div>
                        <div class="bg-white p-3 rounded-xl border border-slate-200">
                            <label class="text-[8px] font-black text-slate-400 uppercase block">Room</label>
                            <span class="text-sm font-black text-slate-900">${normalizedAsset.roomNo || normalizedAsset.roomName || '-'}</span>
                        </div>
                        <div class="bg-white p-3 rounded-xl border border-slate-200">
                            <label class="text-[8px] font-black text-slate-400 uppercase block">Vendor</label>
                            <span class="text-sm font-black text-slate-900">${normalizedAsset.vendor || normalizedAsset.manufacturer || '-'}</span>
                        </div>
                        <div class="bg-white p-3 rounded-xl border border-slate-200">
                            <label class="text-[8px] font-black text-slate-400 uppercase block">Manufacturer</label>
                            <span class="text-sm font-black text-slate-900">${normalizedAsset.manufacturer || '-'}</span>
                        </div>
                        <div class="bg-white p-3 rounded-xl border border-slate-200">
                            <label class="text-[8px] font-black text-slate-400 uppercase block">Model</label>
                            <span class="text-sm font-black text-slate-900">${normalizedAsset.model || '-'}</span>
                        </div>
                        <div class="bg-white p-3 rounded-xl border border-slate-200">
                            <label class="text-[8px] font-black text-slate-400 uppercase block">Date In Service</label>
                            <span class="text-sm font-black text-slate-900">${normalizedAsset.dateInService || '-'}</span>
                        </div>
                        <div class="bg-white p-3 rounded-xl border border-slate-200">
                            <label class="text-[8px] font-black text-slate-400 uppercase block">Status</label>
                            <span class="text-sm font-black ${normalizedAsset.assetStatus === 'Active' ? 'text-emerald-600' : 'text-amber-600'}">${normalizedAsset.assetStatus || 'Active'}</span>
                        </div>
                        <div class="bg-white p-3 rounded-xl border border-slate-200">
                            <label class="text-[8px] font-black text-slate-400 uppercase block">Condition</label>
                            <span class="text-sm font-black text-slate-900">${normalizedAsset.condition || 'Good'}</span>
                        </div>
                        <div class="bg-white p-3 rounded-xl border border-slate-200">
                            <label class="text-[8px] font-black text-slate-400 uppercase block">Custodian</label>
                            <span class="text-sm font-black text-slate-900">${normalizedAsset.custodian || 'Unassigned'}</span>
                        </div>
                        <div class="bg-white p-3 rounded-xl border border-slate-200">
                            <label class="text-[8px] font-black text-slate-400 uppercase block">Department</label>
                            <span class="text-sm font-black text-slate-900">${normalizedAsset.department || '-'}</span>
                        </div>
                    </div>
                `;
            }

            // Master photo
            if (masterPhotoContainer) {
                const photoUrl = normalizedAsset.photoUrl;
                if (photoUrl && photoUrl !== '-' && photoUrl !== 'null' && photoUrl !== '') {
                    masterPhotoContainer.innerHTML = `
                        <div class="text-center">
                            <span class="text-[10px] font-bold text-gray-500 uppercase block mb-1">📷 Master Register Photo</span>
                            <img src="${photoUrl}" class="w-full h-32 object-cover rounded-2xl border border-gray-300 shadow-sm mx-auto">
                        </div>
                    `;
                    masterPhotoContainer.classList.remove('hidden');
                } else {
                    masterPhotoContainer.innerHTML = `
                        <div class="text-center">
                            <span class="text-[10px] font-bold text-gray-500 uppercase block mb-1">📷 Master Register Photo</span>
                            <div class="w-full h-32 bg-gray-100 rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-center p-2">
                                <i class="fa-solid fa-image-slash text-gray-400 text-xl mb-1"></i>
                                <span class="text-xs font-bold text-gray-400 uppercase">No Photo Available</span>
                            </div>
                        </div>
                    `;
                    masterPhotoContainer.classList.remove('hidden');
                }
            }

            // Enable submit button
            if (submitBtn) submitBtn.disabled = false;

            console.log('✅ Asset loaded successfully:', normalizedAsset.barcode);

        } else {
            // Asset not found
            if (previewCard) {
                previewCard.innerHTML = `
                    <div class="flex items-center justify-center h-full text-red-500">
                        <div class="text-center">
                            <i class="fa-solid fa-triangle-exclamation text-2xl block mb-2"></i>
                            <span class="text-[10px] font-black uppercase tracking-widest">Asset not found: ${cleanBarcode}</span>
                        </div>
                    </div>
                `;
                previewCard.className = 'preview-card bg-red-50 rounded-xl p-4 border-2 border-red-300 min-h-[60px] transition-all';
            }
            if (detailsContainer) {
                detailsContainer.classList.add('hidden');
                detailsContainer.innerHTML = '';
            }
            if (masterPhotoContainer) masterPhotoContainer.classList.add('hidden');
            if (submitBtn) submitBtn.disabled = true;
            disposalState.currentAsset = null;
        }

    } catch (error) {
        console.error('Error fetching asset:', error);
        if (previewCard) {
            previewCard.innerHTML = `
                <div class="flex items-center justify-center h-full text-red-500">
                    <span class="text-[10px] font-bold uppercase tracking-widest">Error loading asset</span>
                </div>
            `;
        }
        if (submitBtn) submitBtn.disabled = true;
    } finally {
        if (typeof window.hideGlobalSpinner === 'function') {
            window.hideGlobalSpinner();
        }
    }
};

// ================================================================ */
// HANDLE PHOTO UPLOAD                                              */
// ================================================================ */

window.handleDisposalPhotoUpload = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        disposalState.photoBase64 = e.target.result;

        // Show preview
        const previewContainer = document.getElementById('disposal-photo-preview');
        const previewImg = document.getElementById('disposal-photo-preview-img');
        const btnText = document.getElementById('disposal-photo-btn-text');

        if (previewContainer && previewImg) {
            previewImg.src = disposalState.photoBase64;
            previewContainer.classList.remove('hidden');
        }
        if (btnText) btnText.innerText = 'Photo Captured ✅';

        console.log('✅ Disposal photo captured');
    };
    reader.readAsDataURL(file);
};

window.removeDisposalPhoto = function() {
    disposalState.photoBase64 = null;
    const input = document.getElementById('disposal-photo-upload');
    const previewContainer = document.getElementById('disposal-photo-preview');
    const btnText = document.getElementById('disposal-photo-btn-text');

    if (input) input.value = '';
    if (previewContainer) previewContainer.classList.add('hidden');
    if (btnText) btnText.innerText = 'Take Disposal Photo';
};

// ================================================================ */
// SUBMIT DISPOSAL REQUEST                                          */
// ================================================================ */

window.submitUniversalDisposal = async function() {
    // Prevent duplicate submissions
    if (disposalState.isSubmitting) {
        console.warn('⚠️ Disposal already in progress');
        return;
    }

    const barcode = document.getElementById('disposal-barcode-input')?.value?.trim() || '';
    const reason = document.getElementById('disposal-reason-input')?.value?.trim() || '';
    const photo = disposalState.photoBase64;
    const asset = disposalState.currentAsset;

    // Validation
    if (!barcode) {
        alert('Please scan or enter an asset barcode.');
        return;
    }
    if (!reason) {
        alert('Please enter a reason for disposal.');
        document.getElementById('disposal-reason-input')?.focus();
        return;
    }
    if (!photo) {
        alert('Please capture a disposal photo.');
        return;
    }
    if (!asset || asset.barcode === '-') {
        alert('Asset not found. Please scan a valid barcode.');
        return;
    }

    disposalState.isSubmitting = true;
    const submitBtn = document.getElementById('disposal-submit-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
    }

    if (typeof window.showGlobalSpinner === 'function') {
        window.showGlobalSpinner('Submitting disposal request...');
    }

    try {
        // Get staff info
        const staff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || '{}');
        const staffName = staff.fullName || staff.name || 'Unknown Staff';
        const staffRole = staff.role || 'Staff';
        const staffId = staff.mobile || staff.staffId || 'unknown';

        // Upload photo to Drive
        let photoUrl = '';
        if (window.uploadToDrive) {
            try {
                const uploadRes = await window.uploadToDrive({
                    category: UPLOAD_CONFIG.CATEGORIES.DISPOSAL || 'DISPOSAL',
                    fileName: `Disposal_${barcode}_${Date.now()}.jpg`,
                    image: photo
                });
                if (uploadRes && uploadRes.status === 'success') {
                    photoUrl = uploadRes.fileUrl || '';
                }
            } catch (uploadErr) {
                console.warn('⚠️ Photo upload failed:', uploadErr);
                photoUrl = photo;
            }
        }

        // Create disposal record
        const requestId = `${barcode}_${Date.now()}`;
        const disposalRecord = {
            requestId: requestId,
            assetBarcode: barcode,
            assetName: asset.assetName || asset.description || 'Unknown Asset',
            assetCategory: asset.category || asset.majorCategory || 'Unknown',
            assetLocation: asset.location || asset.roomName || 'Unknown',
            assetVendor: asset.vendor || asset.manufacturer || 'Unknown',
            assetStatus: asset.assetStatus || 'Active',
            assetSerial: asset.serialNo || '',
            assetCustodian: asset.custodian || 'Unassigned',
            assetDepartment: asset.department || '',
            assetBuilding: asset.building || '',
            assetRoom: asset.roomNo || asset.roomName || '',
            assetFloor: asset.floorNo || '',
            reason: reason,
            disposalPhotoUrl: photoUrl,
            requestedBy: staffName,
            requestedByRole: staffRole,
            requestedById: staffId,
            timestamp: Date.now(),
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString(),
            status: 'Pending'
        };

        // Save to Firebase
        const updates = {};
        updates[`asset_disposal_requests/${requestId}`] = disposalRecord;

        // Update asset status to Pending_Disposal
        const assetKey = barcode.replace(/[.#$\[\]/]/g, '_');
        updates[`assets/${assetKey}/assetStatus`] = 'Pending_Disposal';
        updates[`assets/${assetKey}/disposalReason`] = reason;
        updates[`assets/${assetKey}/disposalRequestedBy`] = staffName;
        updates[`assets/${assetKey}/disposalRequestedAt`] = Date.now();

        await update(ref(db), updates);

        // Log to movement logs
        const logEntry = {
            type: 'disposal',
            assetBarcode: barcode,
            assetName: asset.assetName || asset.description || 'Unknown Asset',
            staffName: staffName,
            staffRole: staffRole,
            staffId: staffId,
            action: 'Disposal Request Submitted',
            status: 'Pending Approval',
            timestamp: Date.now(),
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString(),
            reason: reason
        };

        // Save to staff-specific movement log
        const staffLogRef = ref(db, `staff_movement_logs/${staffId}`);
        await update(staffLogRef, {
            [Date.now()]: logEntry
        });

        // Also save to global movement log
        const globalLogRef = ref(db, `movement_logs`);
        await update(globalLogRef, {
            [Date.now()]: logEntry
        });

        // Success message
        if (typeof window.triggerSuccessPopup === 'function') {
            window.triggerSuccessPopup('✅ Disposal Request Submitted for Approval!');
        } else {
            alert('✅ Disposal Request Submitted for Approval!');
        }

        // Reset form
        resetDisposalForm();

        // Call success callback if provided
        if (typeof window.disposalOnSuccess === 'function') {
            window.disposalOnSuccess(disposalRecord);
        }

        // Refresh movement logs if visible
        if (window.loadMovementLogs) {
            setTimeout(() => window.loadMovementLogs(), 500);
        }

    } catch (error) {
        console.error('❌ Disposal submission error:', error);
        alert('❌ Failed to submit disposal request: ' + error.message);
    } finally {
        disposalState.isSubmitting = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> CONFIRM SCRAP & DISPOSE';
        }
        if (typeof window.hideGlobalSpinner === 'function') {
            window.hideGlobalSpinner();
        }
    }
};

// ================================================================ */
// RESET FORM                                                       */
// ================================================================ */

function resetDisposalForm() {
    const inputs = ['disposal-barcode-input', 'disposal-reason-input'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    // Reset preview
    const previewCard = document.getElementById('disposal-asset-preview-card');
    if (previewCard) {
        previewCard.innerHTML = `
            <div class="flex items-center justify-center h-full text-slate-400">
                <span class="text-[10px] font-bold uppercase tracking-widest">Scan barcode to load asset details</span>
            </div>
        `;
        previewCard.className = 'preview-card bg-slate-50 rounded-xl p-4 border-2 border-dashed border-slate-200 min-h-[60px] transition-all';
    }

    // Hide details
    const detailsContainer = document.getElementById('disposal-asset-details');
    if (detailsContainer) {
        detailsContainer.classList.add('hidden');
        detailsContainer.innerHTML = '';
    }

    // Hide master photo
    const masterPhotoContainer = document.getElementById('disposal-master-photo-container');
    if (masterPhotoContainer) masterPhotoContainer.classList.add('hidden');

    // Reset photo
    window.removeDisposalPhoto();

    // Reset state
    disposalState.currentAsset = null;
    disposalState.photoBase64 = null;

    // Disable submit button
    const submitBtn = document.getElementById('disposal-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    // Reset date/time
    const now = new Date();
    const dateEl = document.getElementById('disposal-current-date');
    const timeEl = document.getElementById('disposal-current-time');
    if (dateEl) dateEl.value = now.toLocaleDateString();
    if (timeEl) timeEl.value = now.toLocaleTimeString();

    // Reset staff name
    const staffName = window.currentStaff?.fullName || window.currentStaff?.name || 'Unknown Staff';
    const staffRole = window.currentStaff?.role || 'Staff';
    const initiatedBy = document.getElementById('disposal-initiated-by');
    if (initiatedBy) initiatedBy.value = `${staffName} (${staffRole})`;

    console.log('🔄 Disposal form reset');
}

window.resetDisposalForm = resetDisposalForm;

// ================================================================ */
// EXPOSE GLOBALLY                                                   */
// ================================================================ */

window.renderUniversalDisposal = renderUniversalDisposal;
window.disposalState = disposalState;

console.log('✅ universal_disposal.js v1.1 loaded');