/* ================================================================ */
/* ✅ STAFF DOCUMENT UI ENGINE - FIXED v2.0                         */
/* ================================================================ */

// ✅ Global variables
window.selectedDocFile = null;
window.selectedDocId = null;
window.currentStaffData = null;

/**
 * ✅ Create document card
 */
window.createDocCard = function(requirement, docData = null) {
    const status = docData ? docData.status : 'NOT UPLOADED';
    const statusClass = status.toLowerCase().replace(/\s+/g, '-');
    const docId = requirement.id || requirement.name;

    // ✅ Get icon
    const icon = getDocIcon(docId);

    // ✅ Check if card already exists
    const card = document.createElement('div');
    card.className = 'doc-card';
    card.dataset.type = docId;

    let html = `
        <div class="doc-header">
            <div class="doc-title-wrapper">
                <span class="doc-icon"><i class="fas ${icon}"></i></span>
                <span class="doc-title">${requirement.name || docId} ${requirement.mandatory ? '<span class="text-red-500">*</span>' : ''}</span>
            </div>
            <span class="status-badge status-${statusClass}">${status}</span>
        </div>
    `;

    // ✅ If not uploaded, show upload buttons
    if (status === 'NOT UPLOADED') {
        html += `
            <div class="doc-upload-zone" onclick="window.triggerDocUpload('${docId}')">
                <i class="fa-solid fa-cloud-arrow-up"></i>
                <span>Upload Document</span>
                <span class="sub-text">Click to upload</span>
            </div>
            <div class="doc-actions">
                <button class="doc-link-btn upload" onclick="window.triggerDocUpload('${docId}')">
                    <i class="fas fa-upload"></i> Upload
                </button>
            </div>
        `;
    } else {
        // ✅ Show document details
        html += `
            <div class="doc-details">
                <div class="doc-detail-item">
                    <span class="doc-detail-label">Issue Date</span>
                    <span class="doc-detail-value ${!docData.issueDate ? 'empty' : ''}">${docData.issueDate || '-'}</span>
                </div>
                <div class="doc-detail-item">
                    <span class="doc-detail-label">Expiry Date</span>
                    <span class="doc-detail-value ${!docData.expiryDate ? 'empty' : ''}">${docData.expiryDate || '-'}</span>
                </div>
            </div>
            <div class="doc-actions">
                ${docData.driveFileUrl ? `
                    <a href="${docData.driveFileUrl}" target="_blank" class="doc-link-btn preview">
                        <i class="fas fa-eye"></i> Preview
                    </a>
                ` : ''}
                ${status === 'REJECTED' ? `
                    <button class="doc-link-btn reupload" onclick="window.triggerDocUpload('${docId}')">
                        <i class="fas fa-sync-alt"></i> Re-Upload
                    </button>
                ` : ''}
            </div>
        `;

        // ✅ Show rejection reason if rejected
        if (status === 'REJECTED' && docData.rejectionReason) {
            html += `
                <div class="doc-rejection-box">
                    <p class="doc-rejection-text">Reason: ${docData.rejectionReason}</p>
                </div>
            `;
        }
    }

    card.innerHTML = html;
    return card;
};

/**
 * ✅ Get document icon
 */
window.getDocIcon = function(docType) {
    const icons = {
        'EMIRATES_ID': 'fa-id-card',
        'PASSPORT': 'fa-passport',
        'SIRA_LICENSE': 'fa-certificate',
        'VISA_COPY': 'fa-stamp',
        'DRIVING_LICENSE': 'fa-id-card',
        'MEDICAL_REPORT': 'fa-file-medical',
        'POLICE_CLEARANCE': 'fa-file-shield',
        'TRAINING_CERTIFICATE': 'fa-graduation-cap',
        'DEGREE_CERTIFICATE': 'fa-file-alt',
        'EXPERIENCE_LETTER': 'fa-file-signature',
        'SECURITY_LICENSE': 'fa-shield-alt',
        'TECHNICAL_LICENSE': 'fa-microchip',
        'LEADERSHIP_CERTIFICATE': 'fa-user-tie',
        'SUPERVISOR_CERTIFICATE': 'fa-users'
    };
    return icons[docType] || 'fa-file';
}

/**
 * ✅ Trigger document upload
 */
window.triggerDocUpload = function(docType) {
    console.log(`📂 Starting upload flow for: ${docType}`);
    window.selectedDocId = docType;
    window.showDocUploadModal(docType);
};

/**
 * ✅ Show upload modal
 */
window.showDocUploadModal = function(docType) {
    // ✅ Create modal if not exists
    let modal = document.getElementById('doc-upload-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'doc-upload-modal';
        document.body.appendChild(modal);
    }

    // ✅ Reset and Force Visibility
    modal.classList.remove('hidden', 'opacity-0');
    modal.className = 'fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[200000] flex items-center justify-center p-4 transition-all duration-300';
    modal.style.display = 'flex';
    modal.style.zIndex = '999999';

    modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden transform transition-all animate-modal-up border border-slate-100 flex flex-col max-h-[90vh]">
            <div class="bg-indigo-600 p-6 flex justify-between items-center shadow-lg relative z-10 shrink-0">
                <div>
                    <h3 class="text-white font-black uppercase tracking-tight text-lg flex items-center gap-2">
                        <i class="fa-solid fa-cloud-arrow-up"></i> Document Upload
                    </h3>
                    <p class="text-indigo-100 text-[10px] font-bold uppercase tracking-widest mt-0.5">${docType}</p>
                </div>
                <button onclick="window.closeDocUploadModal()" class="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-all active:scale-90">
                    <i class="fa-solid fa-xmark text-lg"></i>
                </button>
            </div>

            <div class="p-8 space-y-6 bg-slate-50/50 overflow-y-auto flex-1 custom-scrollbar">
                <!-- Selection Grid -->
                <div class="grid grid-cols-2 gap-3">
                    <!-- Gallery Option -->
                    <label for="doc-file-input" class="group cursor-pointer">
                        <div class="p-5 bg-white border-2 border-slate-100 rounded-3xl flex flex-col items-center gap-2 transition-all hover:border-indigo-500 hover:shadow-xl active:scale-95">
                            <div class="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                <i class="fa-solid fa-images text-xl"></i>
                            </div>
                            <span class="text-[10px] font-black text-slate-900 uppercase">Gallery</span>
                        </div>
                    </label>

                    <!-- Camera Option -->
                    <label for="doc-camera-input" class="group cursor-pointer">
                        <div class="p-5 bg-white border-2 border-slate-100 rounded-3xl flex flex-col items-center gap-2 transition-all hover:border-emerald-500 hover:shadow-xl active:scale-95">
                            <div class="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                <i class="fa-solid fa-camera text-xl"></i>
                            </div>
                            <span class="text-[10px] font-black text-slate-900 uppercase">Scanner</span>
                        </div>
                    </label>
                </div>

                <!-- Hidden Inputs -->
                <input type="file" id="doc-file-input" accept="image/*,application/pdf" class="hidden" onchange="window.handleFileSelect(this)">
                <input type="file" id="doc-camera-input" accept="image/*" capture="environment" class="hidden" onchange="window.handleFileSelect(this)">

                <!-- Preview Area -->
                <div id="upload-preview-area" class="hidden p-4 bg-white border-2 border-indigo-100 rounded-3xl flex items-center gap-4 shadow-inner">
                    <div class="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white shrink-0">
                        <i class="fa-solid fa-file-check text-lg"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p id="upload-zone-text" class="text-[10px] font-black text-slate-900 uppercase truncate">No file selected</p>
                        <p class="text-[8px] font-bold text-slate-400 uppercase">Ready for upload</p>
                    </div>
                    <button onclick="window.resetDocSelection()" class="text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>

                <!-- Metadata Inputs -->
                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-1.5">
                        <label class="text-[9px] font-black text-indigo-500 uppercase ml-2 tracking-wider">Issue Date</label>
                        <input type="date" id="meta-issue-date" class="w-full px-4 py-3 bg-white border-2 border-slate-100 rounded-2xl text-[11px] font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all shadow-sm">
                    </div>
                    <div class="space-y-1.5">
                        <label class="text-[9px] font-black text-indigo-500 uppercase ml-2 tracking-wider">Expiry Date</label>
                        <input type="date" id="meta-expiry-date" class="w-full px-4 py-3 bg-white border-2 border-slate-100 rounded-2xl text-[11px] font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all shadow-sm">
                    </div>
                </div>
            </div>

            <div class="p-6 bg-white border-t border-slate-100 flex gap-3 shrink-0">
                <button onclick="window.closeDocUploadModal()" class="flex-1 py-4 bg-slate-50 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all">Cancel</button>
                <button id="doc-submit-btn" onclick="window.executeFinalDocUpload()" class="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-indigo-500/20 active:scale-95 transition-all flex items-center justify-center gap-2">
                    <i class="fa-solid fa-paper-plane"></i> Finalize Upload
                </button>
            </div>
        </div>
    `;

    // Add animation style if not exists
    if (!document.getElementById('doc-modal-anim')) {
        const style = document.createElement('style');
        style.id = 'doc-modal-anim';
        style.textContent = `
            @keyframes modalUp {
                from { opacity: 0; transform: translateY(40px) scale(0.95); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
            .animate-modal-up { animation: modalUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        `;
        document.head.appendChild(style);
    }

    window.selectedDocFile = null;
};

/**
 * ✅ Close upload modal
 */
window.closeDocUploadModal = function() {
    const modal = document.getElementById('doc-upload-modal');
    if (modal) {
        modal.classList.add('opacity-0');
        setTimeout(() => {
            modal.style.display = 'none';
            modal.classList.remove('opacity-0', 'flex');
            modal.classList.add('hidden');
        }, 300);
    }
};

window.resetDocSelection = function() {
    window.selectedDocFile = null;
    const zoneText = document.getElementById('upload-zone-text');
    const previewArea = document.getElementById('upload-preview-area');
    if (zoneText) zoneText.innerText = 'No file selected';
    if (previewArea) previewArea.classList.add('hidden');

    // Clear inputs
    const inputs = ['doc-file-input', 'doc-camera-input'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
};

/**
 * ✅ Handle file selection
 */
window.handleFileSelect = function(input) {
    if (input.files && input.files[0]) {
        window.selectedDocFile = input.files[0];
        const zoneText = document.getElementById('upload-zone-text');
        const previewArea = document.getElementById('upload-preview-area');

        if (zoneText) {
            zoneText.textContent = input.files[0].name;
        }
        if (previewArea) {
            previewArea.classList.remove('hidden');
        }
        console.log(`📄 File selected: ${input.files[0].name}`);
    }
};

/**
 * ✅ Execute final document upload
 */
window.executeFinalDocUpload = async function() {
    const file = window.selectedDocFile;
    const docType = window.selectedDocId;

    if (!file) {
        alert("❌ Please select a file first.");
        return;
    }

    const submitBtn = document.getElementById('doc-submit-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-inline"></span> Uploading...';
    }

    if (window.showGlobalSpinner) {
        window.showGlobalSpinner("Compressing & Uploading...");
    }

    try {
        // ✅ Get staff data
        const staffData = window.currentStaff ||
                         window.currentStaffData ||
                         JSON.parse(sessionStorage.getItem('active_staff_user') || 'null');

        if (!staffData) {
            alert("❌ Staff data not found. Please refresh.");
            return;
        }

        const userId = staffData.adekPass || staffData.mobile;
        if (!userId) {
            alert("❌ Staff ID not found.");
            return;
        }

        // ✅ Compress image
        const base64 = await window.compressImageFile(file);

        // ✅ Get metadata
        const issueDate = document.getElementById('meta-issue-date')?.value || '';
        const expiryDate = document.getElementById('meta-expiry-date')?.value || '';

        // ✅ Process upload
        const success = await window.processDocUpload(userId, docType, base64, {
            issueDate: issueDate,
            expiryDate: expiryDate,
            documentType: docType
        });

        if (success) {
            // ✅ Close modal
            window.closeDocUploadModal();

            // ✅ Refresh UI
            if (window.initStaffDocsModule) {
                await window.initStaffDocsModule('staff-docs-container');
            }

            alert("✅ Document uploaded successfully!");
        }

    } catch (error) {
        console.error("Upload error:", error);
        alert("❌ Upload failed: " + (error.message || "Unknown error"));
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-upload"></i> Submit Upload';
        }
        if (window.hideGlobalSpinner) {
            window.hideGlobalSpinner();
        }
    }
};

/**
 * ✅ Compress image file
 */
window.compressImageFile = function(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error("No file provided"));
            return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function(e) {
            try {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    // ✅ Resize to max 800px
                    let width = img.width;
                    let height = img.height;
                    const maxSize = 800;

                    if (width > height && width > maxSize) {
                        height = Math.round(height * (maxSize / width));
                        width = maxSize;
                    } else if (height > maxSize) {
                        width = Math.round(width * (maxSize / height));
                        height = maxSize;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);

                    const quality = file.type === 'image/png' ? 0.9 : 0.7;
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.onerror = function() {
                    reject(new Error("Failed to load image"));
                };
                img.src = e.target.result;
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = function() {
            reject(new Error("Failed to read file"));
        };
    });
};

/**
 * ✅ Render staff documents module
 */
window.renderStaffDocsModule = function(container, requirements, staffDocs, progress, isActivated) {
    // ✅ Check if requirements exist
    const requirementKeys = Object.keys(requirements || {});

    if (requirementKeys.length === 0) {
        // ✅ Show empty state
        container.innerHTML = `
            <div class="doc-empty-state text-center p-8 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                <i class="fas fa-check-circle text-4xl text-emerald-500 mb-4"></i>
                <h3 class="text-xl font-black text-indigo-900 uppercase">No Documents Required</h3>
                <p class="text-sm text-slate-500 mt-2 font-medium">Your role "${container.dataset.role || 'Staff'}" does not require any documents.</p>
                <p class="text-[10px] text-slate-400 mt-4 uppercase font-bold tracking-widest">You can access all features without document verification.</p>
            </div>
        `;
        return;
    }

    // ✅ Render document cards
    let html = `
        <div class="doc-header-section mb-8">
            <h2 class="text-xl font-black text-indigo-900 uppercase tracking-tight flex items-center gap-2 mb-6">
                <i class="fa-solid fa-file-shield text-indigo-500"></i> Required Documents (${requirementKeys.length})
            </h2>
            <div class="doc-progress-section bg-indigo-50 p-6 rounded-[2rem] border border-indigo-100 shadow-sm">
                <div class="flex justify-between items-center mb-3">
                    <span class="text-[10px] font-black text-indigo-900 uppercase tracking-widest">Verification Progress</span>
                    <span class="text-lg font-black text-indigo-600">${progress}</span>
                </div>
                <div class="w-full h-3 bg-white rounded-full overflow-hidden shadow-inner border border-indigo-100">
                    <div class="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-1000" style="width: ${parseInt(progress) || 0}%;"></div>
                </div>
                <div class="mt-4">
                    ${isActivated ? `
                        <div class="flex items-center gap-2 text-emerald-600 font-black text-[10px] uppercase tracking-widest">
                            <i class="fa-solid fa-circle-check"></i> Account Fully Activated
                        </div>
                    ` : `
                        <div class="flex items-center gap-2 text-indigo-400 font-bold text-[9px] uppercase tracking-tighter">
                            <i class="fa-solid fa-circle-info"></i> Complete all requirements to activate your account
                        </div>
                    `}
                </div>
            </div>
        </div>
        <div class="doc-cards-grid grid grid-cols-1 md:grid-cols-2 gap-4">
    `;
   // renderStaffDocsModule function mein - Card HTML update karein

   // ✅ Loop through each requirement
   Object.entries(requirements).forEach(([docId, req]) => {
       const uploadedDoc = staffDocs[docId] || null;
       const status = uploadedDoc ? uploadedDoc.status : 'NOT UPLOADED';
       const statusClass = status.toLowerCase().replace(/\s+/g, '-');
       const isUploaded = status !== 'NOT UPLOADED';
       const isApproved = status === 'APPROVED';
       const isRejected = status === 'REJECTED';
       const icon = req.icon || window.getDocIcon(docId);
       const displayName = req.name || docId;

       html += `
           <div class="doc-card group relative bg-white border border-slate-100 rounded-[2.5rem] p-6 transition-all duration-300 hover:shadow-xl hover:border-indigo-200" data-id="${docId}">
               <!-- ===== HEADER ===== -->
               <div class="doc-header flex items-start justify-between w-full">
                   <div class="doc-title-wrapper flex items-center gap-3">
                       <div class="doc-icon w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors">
                           <i class="fas ${icon} text-xl"></i>
                       </div>
                       <div>
                           <h4 class="doc-title text-sm font-black text-slate-900 leading-tight uppercase tracking-tight">${displayName}</h4>
                           ${req.mandatory ? '<span class="text-[8px] font-black text-red-500 uppercase tracking-widest">Mandatory</span>' : ''}
                       </div>
                   </div>
                   <span class="status-badge px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                       isApproved ? 'bg-emerald-100 text-emerald-600' :
                       isRejected ? 'bg-red-100 text-red-600' :
                       isUploaded ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'
                   }">${status}</span>
               </div>

               <!-- ===== DETAILS + ACTIONS ROW ===== -->
               <div class="doc-body flex flex-wrap items-center gap-4 w-full mt-2">
                   ${isUploaded ? `
                       <div class="doc-details flex flex-wrap gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100 flex-1 min-w-[200px]">
                           <div class="doc-detail-item">
                               <span class="doc-detail-label text-[8px] font-black text-slate-400 uppercase tracking-tighter">Issue Date</span>
                               <span class="doc-detail-value text-[10px] font-bold text-slate-700">${uploadedDoc.issueDate || '-'}</span>
                           </div>
                           <div class="doc-detail-item">
                               <span class="doc-detail-label text-[8px] font-black text-slate-400 uppercase tracking-tighter">Expiry Date</span>
                               <span class="doc-detail-value text-[10px] font-bold text-slate-700">${uploadedDoc.expiryDate || '-'}</span>
                           </div>
                       </div>
                   ` : `
                       <div onclick="window.triggerDocUpload('${docId}')" class="doc-upload-zone flex-1 min-w-[150px] py-4 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:border-indigo-400 hover:text-indigo-500 transition-all">
                           <i class="fa-solid fa-cloud-arrow-up text-2xl mb-1 opacity-50"></i>
                           <span class="text-[9px] font-black uppercase tracking-widest">Tap to Upload</span>
                       </div>
                   `}

                   <!-- ===== ACTION BUTTONS ===== -->
                   <div class="doc-actions flex gap-2 ml-auto shrink-0">
                       ${!isApproved ? `
                           <button class="flex-1 min-w-[100px] py-3 px-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-500/20 active:scale-95 transition-all" onclick="window.triggerDocUpload('${docId}')">
                               <i class="fas ${isUploaded ? 'fa-sync-alt' : 'fa-upload'} mr-1"></i>
                               ${isUploaded ? 'Re-Upload' : 'Upload'}
                           </button>
                       ` : ''}
                       ${uploadedDoc?.driveFileUrl ? `
                           <button onclick="window.open('${uploadedDoc.driveFileUrl}', '_blank'); return false;" class="px-4 py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all no-underline inline-flex items-center justify-center">
                               <i class="fas fa-eye mr-1"></i> View
                           </button>
                       ` : ''}
                   </div>
               </div>

               ${isRejected && uploadedDoc?.rejectionReason ? `
                   <div class="doc-rejection-box w-full mt-3 p-3 bg-red-50 rounded-2xl border border-red-100 flex items-start gap-2">
                       <i class="fas fa-exclamation-circle text-red-400 mt-0.5 text-xs"></i>
                       <span class="text-[9px] font-bold text-red-700 leading-tight">${uploadedDoc.rejectionReason}</span>
                   </div>
               ` : ''}
           </div>
       `;
   });

   html += `</div>`;
   container.innerHTML = html;
};

/**
 * ✅ Initialize staff documents module
 */
window.initStaffDocsModule = async function(containerId = 'staff-docs-container') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error("❌ Container not found:", containerId);
        return;
    }

    if (window.showGlobalSpinner) {
        window.showGlobalSpinner("Loading Verification Center...");
    }

    try {
        // ✅ Show local inline loading as fallback
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center p-12">
                <div class="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                <p class="text-[10px] font-black text-indigo-900 uppercase tracking-widest">Syncing Requirements...</p>
            </div>
        `;

        // ✅ Get staff data
        const staffData = window.currentStaff ||
                         window.currentStaffData ||
                         JSON.parse(sessionStorage.getItem('active_staff_user') || 'null');

        if (!staffData) {
            container.innerHTML = `
                <div class="p-8 bg-red-50 rounded-3xl border border-red-100 text-center">
                    <i class="fas fa-exclamation-circle text-2xl text-red-500 mb-2"></i>
                    <p class="text-xs font-bold text-red-700 uppercase">Please login to view documents.</p>
                </div>
            `;
            return;
        }

        const userId = staffData.adekPass || staffData.mobile;
        const role = staffData.role || staffData.roleId || '';

        console.log(`📋 Staff: ${userId}, Role: ${role}`);

        if (!userId || !role) {
            container.innerHTML = `
                <div class="p-8 bg-amber-50 rounded-3xl border border-amber-100 text-center">
                    <i class="fas fa-exclamation-triangle text-2xl text-amber-500 mb-2"></i>
                    <p class="text-xs font-bold text-amber-700 uppercase">Staff information incomplete. Please contact admin.</p>
                </div>
            `;
            return;
        }

        // ✅ STEP 1: Get role requirements (assigned by admin)
        console.log(`🔍 Fetching requirements for role: ${role}`);
        const requirements = await window.getRoleRequirements(role);

        // ✅ STEP 2: Get staff uploaded documents
        console.log(`🔍 Fetching staff documents for: ${userId}`);
        const docData = await window.getStaffDocuments(userId);
        const staffDocs = docData.docs || {};
        const progress = docData.verificationProgress || "0%";
        const isActivated = docData.isAccountActivated || false;

        // ✅ Set data-role for empty state
        container.dataset.role = role;

        // ✅ STEP 3: Render documents
        window.renderStaffDocsModule(container, requirements, staffDocs, progress, isActivated);

        // ✅ STEP 4: Check for Document Expiries (Task 2)
        window.checkDocumentExpiries(staffDocs);

        // ✅ Update lock status
        if (window.updateLockStatus) {
            window.updateLockStatus(progress, isActivated);
        }

        // ✅ Update Dashboard Quick-View (if elements exist)
        const dashProgress = document.getElementById('dash-doc-progress');
        const dashStatus = document.getElementById('dash-doc-status');
        const dashBar = document.getElementById('dash-doc-progress-bar');

        if (dashProgress) dashProgress.innerText = progress;
        if (dashBar) dashBar.style.width = progress;
        if (dashStatus) {
            if (isActivated) {
                dashStatus.innerText = "Activated ✅";
                dashStatus.className = "text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded uppercase tracking-tighter";
            } else {
                dashStatus.innerText = "Pending Verification";
            }
        }

        console.log(`✅ Documents loaded: ${Object.keys(requirements).length} requirements, ${Object.keys(staffDocs).length} uploaded`);

    } catch (error) {
        console.error("❌ Init error:", error);
        container.innerHTML = `
            <div class="p-8 bg-red-50 rounded-3xl border border-red-100 text-center">
                <i class="fas fa-exclamation-circle text-2xl text-red-500 mb-2"></i>
                <p class="text-xs font-bold text-red-700 uppercase">Error loading documents: ${error.message}</p>
                <button onclick="window.initStaffDocsModule('${containerId}')" class="mt-4 px-6 py-2 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase">
                    <i class="fas fa-sync-alt mr-1"></i> Retry
                </button>
            </div>
        `;
    } finally {
        if (window.hideGlobalSpinner) {
            window.hideGlobalSpinner();
        }
    }
};

/**
 * ✅ Check Document Expiries (Task 2)
 */
window.checkDocumentExpiries = function(staffDocs) {
    if (!staffDocs) return;

    const today = new Date();
    const expiryThresholdDays = 30;
    const warnings = [];

    Object.entries(staffDocs).forEach(([docId, data]) => {
        if (data.expiryDate && data.status === 'APPROVED') {
            const expiryDate = new Date(data.expiryDate);
            if (isNaN(expiryDate.getTime())) return;

            const timeDiff = expiryDate.getTime() - today.getTime();
            const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));

            if (daysRemaining <= expiryThresholdDays) {
                const docName = docId.replace(/_/g, ' ');
                if (daysRemaining <= 0) {
                    warnings.push(`🚨 Your <b>${docName}</b> has EXPIRED. Please upload a renewed copy immediately.`);
                } else {
                    warnings.push(`⚠️ Your <b>${docName}</b> expires in <b>${daysRemaining} days</b>. Please upload a renewed copy.`);
                }
            }
        }
    });

    if (warnings.length > 0) {
        window.showExpiryNotificationBanner(warnings);
    }
};

/**
 * ✅ Show Expiry Notification Banner
 */
window.showExpiryNotificationBanner = function(warnings) {
    let banner = document.getElementById('doc-expiry-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'doc-expiry-banner';
        banner.className = 'fixed top-0 left-0 right-0 z-[200000] bg-rose-600 text-white p-4 shadow-2xl transform -translate-y-full transition-transform duration-500 ease-in-out';
        document.body.prepend(banner);
    }

    const warningsHtml = warnings.map(w => `<p class="flex items-center gap-2 mb-1 last:mb-0"><i class="fa-solid fa-circle-exclamation"></i> <span>${w}</span></p>`).join('');

    banner.innerHTML = `
        <div class="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div class="flex-1 text-[11px] font-black uppercase tracking-tight leading-tight">
                ${warningsHtml}
            </div>
            <button onclick="this.closest('#doc-expiry-banner').classList.add('-translate-y-full')" class="shrink-0 w-8 h-8 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-all">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
    `;

    // Force show after a small delay
    setTimeout(() => {
        banner.classList.remove('-translate-y-full');
    }, 1000);
};

console.log("✅ docs_ui.js v2.0 Loaded");
