/* --- STAFF DOCUMENT VERIFICATION ENGINE (v2.0 - FIXED UI) --- */
import { db } from '../../firebase_config.js';
import { ref, get, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

/**
 * Human-readable mapping for document keys
 */
const DOC_TITLE_MAP = {
    "PASSPORT": "Passport",
    "EMIRATES_ID": "Emirates ID",
    "VISA": "Visa",
    "CV": "CV",
    "PASSPORT_PHOTO": "Passport Size Photo",
    "POLICE_CLEARANCE": "Police Clearance Certificate",
    "INTRO_FORM": "Staff Introductory Form",
    "CONTACT_FORM": "Candidate Contact Form",
    "ADQCC": "ADQCC",
    "ITC_PERMIT": "ITC Driver Permit",
    "DRIVING_LICENSE": "Driving License",
    "EXP_LETTER": "Experience Letter",
    "EDU_CERT": "Education & Training Certificates"
};

/**
 * Human-readable mapping for bio-data fields
 */
const BIO_DATA_TITLE_MAP = {
    'email': 'Email Address',
    'phone': 'Phone Number',
    'religion': 'Religion',
    'marital_status': 'Marital Status',
    'passport_issue_place': 'Passport Place of Issue',
    'home_country_address': 'Home Country Address',
    'home_country_mobile': 'Home Country Mobile',
    'uae_full_address': 'UAE Full Address',
    'uae_contact_number': 'UAE Contact Number'
};

/**
 * Opens a modal for Admin to review staff documents
 */
window.openStaffDocumentReviewModal = async function(staffMobile) {
    window.showGlobalSpinner("Loading Verification Data...");

    try {
        // Fetch staff docs and info
        const docRef = ref(db, `staff_documents/${staffMobile}`);
        const snap = await get(docRef);
        const docData = snap.exists() ? snap.val() : { docs: {} };

        // Fetch staff profile for bio-data
        let bioDataHtml = "";
        const staffSnap = await get(ref(db, 'staff'));
        if (staffSnap.exists()) {
            const allStaff = staffSnap.val();
            const staffUser = Object.values(allStaff).find(u => u.adekPass === staffMobile || u.mobile === staffMobile);

            if (staffUser) {
                // ✅ Task 2: 100% Dynamic Bio-Data Resolution (v7.4)
                const rawStaff = staffUser || {};
                const bio = {
                    ...(rawStaff.bioData || {}),
                    ...(rawStaff.biodata || {}),
                    ...(rawStaff.bio_data || {}),
                    ...((rawStaff.documents && rawStaff.documents.biodata) || {}),
                    ...rawStaff // fallback to root properties
                };

                // 1. Fixed Core Identity Fields
                const coreFields = [
                    { label: 'Full Name', val: rawStaff.fullName || rawStaff.name || 'N/A' },
                    { label: 'Staff ID', val: rawStaff.adekPass || rawStaff.mobile || 'N/A' },
                    { label: 'Company ID', val: rawStaff.companyId || 'N/A' },
                    { label: 'UAE Mobile', val: rawStaff.mobile || bio.phone || bio.uae_contact_number || 'N/A' }
                ];

                // 2. Dynamic Requirements Resolver
                // This array contains only the fields explicitly selected/added by Admin
                const requirements = rawStaff.bioDataRequirements || rawStaff.requiredBioData || [];
                let dynamicFields = [];

                if (requirements.length > 0) {
                    dynamicFields = requirements.map(req => {
                        const fieldId = req.id || req.key;
                        const fieldName = req.name || fieldId;

                        // Smart Resolver: Try ID, Name, variations
                        const val = bio[fieldId] ||
                                   bio[fieldName] ||
                                   bio[fieldId.toLowerCase()] ||
                                   bio[fieldId.replace(/ /g, '_')] ||
                                   "Not Provided";

                        return { label: fieldName, val: val };
                    });
                } else {
                    // Fallback for older records: Auto-detect non-system keys
                    const systemKeys = ['fullName', 'name', 'adekPass', 'mobile', 'companyId', 'password', 'role', 'school', 'companyName', 'profilePicUrl', 'firebaseKey', 'updatedAt', 'status', 'isProfileSubmitted', 'bioDataRequirements', 'onboardingRequirements', 'requiredBioData', 'requiredVerificationDocs', 'bioData', 'biodata', 'bio_data'];
                    dynamicFields = Object.keys(bio)
                        .filter(k => !systemKeys.includes(k) && typeof bio[k] !== 'object')
                        .map(k => ({
                            label: BIO_DATA_TITLE_MAP[k] || k.replace(/_/g, ' ').toUpperCase(),
                            val: bio[k]
                        }));
                }

                bioDataHtml = `
                    <div class="mb-8 w-full overflow-hidden rounded-2xl bg-white p-4 md:p-6 shadow-sm border border-slate-100 relative group">
                        <div class="absolute top-0 left-0 w-2 h-full bg-indigo-600"></div>
                        <h4 class="text-xs font-black text-indigo-900 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                            <i class="fa-solid fa-address-card text-indigo-500"></i> Staff Bio-Data Profile
                        </h4>

                        <!-- CORE IDENTITY -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 pb-6 border-b border-slate-100">
                            ${coreFields.map(f => `
                                <div class="flex flex-col">
                                    <span class="text-slate-600 font-semibold text-[10px] uppercase tracking-widest mb-1">${f.label}</span>
                                    <span class="text-slate-900 font-bold text-sm uppercase truncate">${f.val}</span>
                                </div>
                            `).join('')}
                        </div>

                        <!-- DYNAMIC REQUIREMENTS -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                            ${dynamicFields.map(f => `
                                <div class="flex flex-col border-b border-slate-50 pb-2">
                                    <span class="text-slate-600 font-semibold text-xs uppercase tracking-widest">${f.label}</span>
                                    <span class="text-slate-900 font-bold text-sm uppercase">${f.val}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
        }

        const modal = document.getElementById('view-staff-modal');
        if (!modal) return;

        // Render each document card
        let docsHtml = Object.entries(docData.docs || {}).map(([key, d]) => {
            const friendlyTitle = DOC_TITLE_MAP[key] || key.replace(/_/g, ' ');
            const status = d.status || "NOT UPLOADED";
            const isUploaded = status !== "NOT UPLOADED";

            // Task 2: Calculate Expiry & Animated Border
            let expiryClass = "";
            let expiryAlert = "";
            if (isUploaded && d.expiryDate && status === 'APPROVED') {
                const daysLeft = Math.ceil((new Date(d.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
                if (daysLeft <= 30) {
                    expiryClass = "expiring-border-animated";
                    expiryAlert = `<div class="mt-2 px-2 py-1 bg-rose-500 text-white text-[8px] font-black uppercase rounded animate-pulse text-center">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        ${daysLeft <= 0 ? "EXPIRED" : `Expiring in ${daysLeft} Days`}
                    </div>`;
                }
            }

            return `
                <div class="p-5 bg-white rounded-2xl border border-slate-200 mb-4 shadow-sm transition-all hover:border-indigo-200 ${expiryClass}">
                    <div class="flex justify-between items-start mb-3">
                        <div class="flex flex-col">
                            <span class="font-bold text-[#1e293b] text-sm uppercase tracking-tight">${friendlyTitle}</span>
                            <div class="text-[11px] font-medium text-[#64748b] mt-1">
                                <i class="fa-solid fa-calendar-day mr-1 opacity-50"></i> Issue: ${d.issueDate || '-'} |
                                <i class="fa-solid fa-calendar-xmark mr-1 opacity-50 ml-1"></i> Expiry: ${d.expiryDate || '-'}
                            </div>
                            ${expiryAlert}
                        </div>
                        <span class="px-3 py-1 rounded-full text-[9px] font-black tracking-widest uppercase ${
                            status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                            status === 'REJECTED' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                            'bg-amber-50 text-amber-600 border border-amber-100'
                        }">${status}</span>
                    </div>

                    <div class="flex flex-col gap-2 mt-4">
                        ${isUploaded ? `
                            <div class="flex gap-2 w-full">
                                <button onclick="window.open('${d.driveFileUrl}', '_blank'); return false;"
                                   class="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase text-center shadow-lg shadow-indigo-500/20 transition-all active:scale-95 flex items-center justify-center gap-2">
                                    <i class="fa-solid fa-eye"></i> Preview
                                </button>

                                <button onclick="window.downloadDocument('${d.driveFileUrl}', '${friendlyTitle}_${staffMobile}')"
                                   class="flex-1 py-2.5 bg-slate-800 hover:bg-black text-white rounded-xl text-[10px] font-black uppercase text-center shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2">
                                    <i class="fa-solid fa-download"></i> Download
                                </button>
                            </div>

                            ${(status !== 'APPROVED' && status !== 'REJECTED') ? `
                                <div class="flex gap-2 w-full">
                                    <button onclick="window.updateDocStatus('${staffMobile}', '${key}', 'APPROVED')"
                                            class="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-emerald-500/10 transition-all active:scale-95">
                                        Approve
                                    </button>
                                    <button onclick="window.rejectDoc('${staffMobile}', '${key}')"
                                            class="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-rose-500/10 transition-all active:scale-95">
                                        Reject
                                    </button>
                                </div>
                            ` : ''}
                        ` : `
                            <div class="w-full py-3 bg-slate-100 text-slate-400 rounded-xl text-[10px] font-black uppercase text-center border-2 border-dashed border-slate-200">
                                <i class="fa-solid fa-file-circle-xmark mr-1"></i> No File Uploaded
                            </div>
                        `}
                    </div>

                    ${d.rejectionReason ? `
                        <div class="mt-3 p-3 bg-rose-50 border border-rose-100 rounded-xl">
                            <p class="text-[10px] font-bold text-rose-600 uppercase tracking-tighter">
                                <i class="fa-solid fa-circle-exclamation mr-1"></i> Reason: ${d.rejectionReason}
                            </p>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        modal.innerHTML = `
            <div class="bg-white w-[95%] md:w-full max-w-5xl rounded-[40px] shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh] fade-in transition-all duration-300">
                <!-- Premium Header -->
                <div class="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h3 class="text-xl font-black text-[#0f172a] uppercase tracking-tighter">Staff Document Review</h3>
                        <p class="text-[10px] font-bold text-indigo-500 uppercase tracking-[0.2em] mt-1">Verification Console</p>
                    </div>
                    <button onclick="document.getElementById('view-staff-modal').classList.add('hidden')"
                            class="w-10 h-10 rounded-full bg-white text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all shadow-sm border border-slate-100">
                        <i class="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>

                <!-- Scrollable Body -->
                <div class="p-4 md:p-8 overflow-y-auto bg-[#f8fafc] custom-scrollbar max-h-[85vh]" style="flex: 1;">
                    ${bioDataHtml}
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        ${docsHtml.length ? docsHtml : `
                            <div class="col-span-full py-20 text-center">
                                <i class="fa-solid fa-folder-open text-4xl text-slate-200 mb-4"></i>
                                <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">No verification documents assigned.</p>
                            </div>
                        `}
                    </div>
                </div>

                <!-- Footer -->
                <div class="p-6 bg-white border-t border-slate-50">
                    <button onclick="document.getElementById('view-staff-modal').classList.add('hidden')"
                            class="w-full py-4 bg-slate-900 hover:bg-black text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl transition-all active:scale-[0.98]">
                        Close Console
                    </button>
                </div>
            </div>
        `;
        modal.classList.remove('hidden');
        modal.style.display = 'flex';

    } catch (e) {
        console.error("Verification Modal Error:", e);
        alert("Error loading docs: " + e.message);
    } finally {
        window.hideGlobalSpinner();
    }
};

/**
 * Updates document status in Firebase
 */
window.updateDocStatus = async function(userId, docKey, status, reason = "") {
    window.showGlobalSpinner("Updating Status...");
    try {
        await update(ref(db, `staff_documents/${userId}/docs/${docKey}`), {
            status,
            rejectionReason: reason,
            verifiedAt: Date.now(),
            verifiedBy: "Admin"
        });

        // Auto-recalculate progress and activation status
        if (window.recalculateVerificationProgress) {
            await window.recalculateVerificationProgress(userId);
        }

        window.openStaffDocumentReviewModal(userId); // Refresh modal
    } catch (e) {
        alert("Failed to update status: " + e.message);
    } finally {
        window.hideGlobalSpinner();
    }
};

/**
 * ✅ NEW: Direct Download Helper for Admin
 */
window.downloadDocument = async function(url, fileName) {
    if (!url || url.includes('placeholder')) return;

    if (window.showGlobalSpinner) window.showGlobalSpinner("Downloading File...");

    try {
        // Resolve direct URL if it's a Drive link
        const finalUrl = window.getDirectDriveImageUrl ? window.getDirectDriveImageUrl(url) : url;

        const response = await fetch(finalUrl);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${fileName || 'document'}_${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);
        }, 100);

    } catch (err) {
        console.error("Download Error:", err);
        // Fallback: Open in new tab if blob fails
        window.open(url, '_blank');
    } finally {
        if (window.hideGlobalSpinner) window.hideGlobalSpinner();
    }
};

window.rejectDoc = function(userId, docKey) {
    const reason = prompt("Please provide a reason for rejection:");
    if (reason && reason.trim() !== "") {
        window.updateDocStatus(userId, docKey, "REJECTED", reason.trim());
    } else if (reason !== null) {
        alert("Rejection reason is required.");
    }
};

/**
 * ✅ PREMIUM SMART SCANNER (v6.0)
 */
let scannerStream = null;

window.openDocumentScanner = function(docType) {
    // Force close any existing
    window.closeScannerModal();

    const scannerModalHtml = `
        <div id="scanner-modal" class="scanner-overlay fade-in">
            <div class="scanner-header">
                <span class="scanner-title-prefix">SMART DOC SCANNER</span>
                <div class="scanner-doc-type">${docType.toUpperCase()}</div>
                <button onclick="window.closeScannerModal()" class="close-scanner-btn">&times;</button>
            </div>

            <div class="viewfinder-container">
                <video id="scanner-video" autoplay playsinline muted></video>
                <div class="doc-detection-frame" id="scanner-guide"></div>
                <canvas id="scanner-detection-canvas" class="hidden"></canvas>
            </div>

            <div class="scanner-controls">
                <!-- Gallery Option -->
                <button onclick="document.getElementById('direct-file-input').click()" class="gallery-btn">
                    <i class="fas fa-file-image"></i>
                    <span class="gallery-label">GALLERY</span>
                </button>

                <!-- File Picker (Hidden) -->
                <div id="choose-file-container" class="hidden">
                    <input type="file" id="direct-file-input" accept="image/*,application/pdf"
                           onchange="window.handleDirectFileUpload(event, '${docType}')">
                </div>

                <!-- Shutter Button -->
                <button id="scanner-shutter-btn"
                        onclick="window.captureAndCropDocument('${docType}')"
                        ontouchstart="window.captureAndCropDocument('${docType}')"
                        class="shutter-btn">
                    <div class="shutter-btn-inner"></div>
                </button>

                <!-- Spacer to match layout -->
                <div style="width: 54px;"></div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', scannerModalHtml);
    window.startSmartCameraStream();
};

window.closeScannerModal = function() {
    const modal = document.getElementById('scanner-modal');
    if (modal) modal.remove();

    if (scannerStream) {
        scannerStream.getTracks().forEach(track => track.stop());
        scannerStream = null;
    }
};

window.startSmartCameraStream = async function() {
    const video = document.getElementById('scanner-video');
    if (!video) return;

    try {
        scannerStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false
        });
        video.srcObject = scannerStream;

        // Detection Logic Simulation
        video.onloadedmetadata = () => {
            setTimeout(() => {
                const guide = document.getElementById('scanner-guide');
                if (guide) guide.classList.add('detected');
            }, 1500);
        };

    } catch (err) {
        console.error("Camera Error:", err);
        alert("Failed to access camera: " + err.message);
        window.closeScannerModal();
    }
};

window.captureAndCropDocument = async function(docType) {
    const video = document.getElementById('scanner-video');
    if (!video || video.readyState !== 4) {
        console.warn("Camera feed not ready.");
        return;
    }

    window.showGlobalSpinner("Capturing Document...");

    try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert to Pure Base64
        const base64Full = canvas.toDataURL('image/jpeg', 0.85);
        const base64Data = base64Full.includes(',') ? base64Full.split(',')[1] : base64Full;

        // Release Camera
        window.closeScannerModal();

        // Trigger Google Drive upload pipeline
        if (window.uploadDocumentToDrive) {
            const driveUrl = await window.uploadDocumentToDrive(docType, base64Data, "image/jpeg");

            if (driveUrl) {
                const staff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user'));
                const userId = staff.adekPass || staff.mobile;

                const docData = {
                    driveFileUrl: driveUrl,
                    status: 'PENDING REVIEW',
                    uploadedAt: Date.now(),
                    documentType: docType
                };

                if (window.saveDocMetadata) {
                    await window.saveDocMetadata(userId, docType, docData);
                }

                if (window.initStaffDocsModule) await window.initStaffDocsModule();
            }
        }
    } catch (e) {
        console.error("📸 Capture Error:", e);
        alert("Scan Failed: " + e.message);
    } finally {
        window.hideGlobalSpinner();
    }
};

window.handleDirectFileUpload = async function(event, documentType) {
    const file = event.target.files[0];
    if (!file) return;

    window.showGlobalSpinner("Processing File...");

    try {
        const staff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user'));
        const userId = staff.adekPass || staff.mobile;

        let payload = "";
        if (file.type.startsWith('image/')) {
            payload = await window.compressImageFile(file, 1200, 1200, 0.8);
        } else {
            const reader = new FileReader();
            payload = await new Promise((resolve) => {
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(file);
            });
        }

        const base64Content = payload.includes(',') ? payload.split(',')[1] : payload;

        if (window.uploadDocumentToDrive) {
            const driveUrl = await window.uploadDocumentToDrive(documentType, base64Content, file.type);

            if (driveUrl) {
                const docData = {
                    driveFileUrl: driveUrl,
                    status: 'PENDING REVIEW',
                    uploadedAt: Date.now(),
                    documentType: documentType
                };

                if (window.saveDocMetadata) {
                    await window.saveDocMetadata(userId, documentType, docData);
                }

                if (window.initStaffDocsModule) await window.initStaffDocsModule();
                alert("✅ Upload success!");
            }
        }
    } catch (e) {
        alert("Upload Failed: " + e.message);
    } finally {
        window.hideGlobalSpinner();
    }
};

console.log("✅ docs_verification.js: v6.0 Smart Scanner Deployed");

console.log("✅ docs_verification.js: v2.5 Smart Scanner Active");
