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

            if (staffUser && staffUser.bioData) {
                bioDataHtml = `
                    <div class="mb-6 p-6 bg-indigo-50/50 rounded-3xl border border-indigo-100 shadow-inner">
                        <h4 class="text-[10px] font-black text-indigo-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <i class="fa-solid fa-address-card text-indigo-600"></i> Bio-Data Profile
                        </h4>
                        <div class="grid grid-cols-1 gap-3">
                            ${Object.entries(staffUser.bioData).map(([key, val]) => `
                                <div class="flex justify-between items-center border-b border-indigo-100/50 pb-2">
                                    <span class="text-[9px] font-bold text-indigo-400 uppercase">${BIO_DATA_TITLE_MAP[key] || key}</span>
                                    <span class="text-[10px] font-black text-indigo-950">${val || '-'}</span>
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

            return `
                <div class="p-5 bg-white rounded-2xl border border-slate-200 mb-4 shadow-sm transition-all hover:border-indigo-200">
                    <div class="flex justify-between items-start mb-3">
                        <div class="flex flex-col">
                            <span class="font-bold text-[#1e293b] text-sm uppercase tracking-tight">${friendlyTitle}</span>
                            <div class="text-[11px] font-medium text-[#64748b] mt-1">
                                <i class="fa-solid fa-calendar-day mr-1 opacity-50"></i> Issue: ${d.issueDate || '-'} |
                                <i class="fa-solid fa-calendar-xmark mr-1 opacity-50 ml-1"></i> Expiry: ${d.expiryDate || '-'}
                            </div>
                        </div>
                        <span class="px-3 py-1 rounded-full text-[9px] font-black tracking-widest uppercase ${
                            status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                            status === 'REJECTED' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                            'bg-amber-50 text-amber-600 border border-amber-100'
                        }">${status}</span>
                    </div>

                    <div class="flex flex-col gap-2 mt-4">
                        ${isUploaded ? `
                            <button onclick="window.open('${d.driveFileUrl}', '_blank'); return false;"
                               class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase text-center shadow-lg shadow-indigo-500/20 transition-all active:scale-95 flex items-center justify-center gap-2">
                                <i class="fa-solid fa-eye"></i> Preview Document
                            </button>

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
            <div class="bg-white w-full max-w-xl rounded-[40px] shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh] fade-in">
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
                <div class="p-8 overflow-y-auto bg-[#f8fafc] custom-scrollbar" style="flex: 1;">
                    ${bioDataHtml}
                    ${docsHtml || `
                        <div class="py-20 text-center">
                            <i class="fa-solid fa-folder-open text-4xl text-slate-200 mb-4"></i>
                            <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">No verification documents assigned.</p>
                        </div>
                    `}
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

window.rejectDoc = function(userId, docKey) {
    const reason = prompt("Please provide a reason for rejection:");
    if (reason && reason.trim() !== "") {
        window.updateDocStatus(userId, docKey, "REJECTED", reason.trim());
    } else if (reason !== null) {
        alert("Rejection reason is required.");
    }
};

console.log("✅ docs_verification.js: v2.0 Premium UI Engaged");
