/* --- STAFF DOCUMENT ADMIN ENGINE (v2.0 - EXPANDED) --- */
import { db } from '../../firebase_config.js';
import { ref, get, set, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

/**
 * Global Document Templates (Master List)
 */
window.ALL_DOCUMENTS_MASTER = {
    'QCC': { name: 'QCC', icon: 'fa-certificate' },
    'EMIRATES_ID': { name: 'Emirates ID (EID)', icon: 'fa-id-card' },
    'DRIVING_LICENSE': { name: 'Driving License', icon: 'fa-id-card' },
    'PERMIT': { name: 'Permit', icon: 'fa-file-contract' },
    'PASSPORT': { name: 'Passport', icon: 'fa-passport' },
    'LABOUR_CARD': { name: 'Labour Card', icon: 'fa-address-card' },
    'COMPANY_ID': { name: 'Company ID Card', icon: 'fa-id-badge' },
    'RESUME': { name: 'Resume', icon: 'fa-file-pdf' },
    'VISA_COPY': { name: 'Visa Copy', icon: 'fa-stamp' },
    'TRAINING_CERTIFICATE': { name: 'Training Certificate', icon: 'fa-graduation-cap' }
};

/**
 * Global Bio-Data Templates
 */
window.BIO_DATA_FIELDS_MASTER = {
    'email': { name: 'Email Address', type: 'email' },
    'phone': { name: 'Phone Number', type: 'tel' },
    'religion': { name: 'Religion', type: 'text' },
    'marital_status': { name: 'Marital Status', type: 'text' },
    'passport_issue_place': { name: 'Passport Place of Issue', type: 'text' },
    'home_country_address': { name: 'Home Country Address', type: 'text' },
    'home_country_mobile': { name: 'Home Country Mobile Number', type: 'tel' },
    'uae_full_address': { name: 'UAE Full Address (Including Room No)', type: 'text' },
    'uae_contact_number': { name: 'UAE Contact Number', type: 'tel' }
};

/**
 * Renders the role-based document assignment UI
 */
window.renderDocAssignmentUI = async function(roleId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!roleId) {
        container.innerHTML = `
            <div class="p-8 bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200 text-center">
                <i class="fa-solid fa-arrow-pointer text-slate-300 text-3xl mb-3"></i>
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select a role to assign documents</p>
            </div>
        `;
        return;
    }

    try {
        // ✅ Load existing requirements
        const existingDocs = await window.getRoleRequirements(roleId);

        let html = `
            <div class="doc-assign-container space-y-6">
                <div class="flex items-center justify-between">
                    <div>
                        <h4 class="text-sm font-black text-indigo-900 uppercase tracking-tight">Assign Documents: <span class="text-indigo-600">${roleId}</span></h4>
                        <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Select documents required for this role</p>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" id="doc-checkbox-grid">
        `;

        Object.entries(window.ALL_DOCUMENTS_MASTER).forEach(([id, doc]) => {
            const isSelected = existingDocs && existingDocs[id] ? true : false;
            html += `
                <div class="doc-check-item flex items-center gap-3 p-4 bg-white border-2 rounded-2xl cursor-pointer transition-all hover:border-indigo-300 active:scale-95 ${isSelected ? 'border-indigo-500 bg-indigo-50/30' : 'border-slate-100'}"
                     onclick="window.toggleDocCheck(this, '${id}')">
                    <div class="hidden">
                        <input type="checkbox" id="doc-${id}" value="${id}" ${isSelected ? 'checked' : ''} onchange="window.updateDocCheck(this)" />
                    </div>
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-400'}">
                        <i class="fas ${doc.icon} text-lg"></i>
                    </div>
                    <label class="text-[10px] font-black text-slate-700 uppercase tracking-tight cursor-pointer">${doc.name}</label>
                </div>
            `;
        });

        html += `
                </div>

                <div class="flex gap-3 pt-4 border-t border-slate-100">
                    <button class="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg shadow-indigo-500/20 active:scale-95 transition-all" onclick="window.saveRoleDocs('${roleId}')">
                        <i class="fas fa-save mr-2"></i> Save Requirements
                    </button>
                    <button class="px-6 py-4 bg-slate-100 text-slate-400 rounded-2xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all" onclick="window.clearDocSelections()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;

        container.innerHTML = html;

    } catch (error) {
        console.error("❌ Error:", error);
        container.innerHTML = `
            <div class="p-8 bg-red-50 rounded-3xl border border-red-100 text-center">
                <p class="text-xs font-bold text-red-700 uppercase">Error loading requirements: ${error.message}</p>
                <button onclick="window.renderDocAssignmentUI('${roleId}', '${containerId}')" class="mt-4 px-6 py-2 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase">Retry</button>
            </div>
        `;
    }
};

/**
 * ✅ NEW: Open Onboarding Configuration Modal (v5.0)
 */
window.openOnboardingConfigModal = async function(roleId) {
    const modal = document.getElementById('onboarding-config-modal');
    const content = document.getElementById('onboarding-config-content');
    if (!modal || !content) return;

    modal.classList.remove('hidden');
    content.innerHTML = `
        <div class="flex flex-col items-center justify-center py-12">
            <i class="fa-solid fa-spinner fa-spin text-4xl text-indigo-500 mb-4"></i>
            <p class="text-xs font-black text-slate-400 uppercase tracking-widest">Fetching requirements for ${roleId}...</p>
        </div>
    `;

    try {
        // Load existing global role requirements if any
        const existingDocs = await window.getRoleRequirements(roleId);

        let html = `
            <div class="space-y-8">
                <!-- 1. MANDATORY DOCUMENTS -->
                <div class="space-y-4">
                    <div class="flex items-center gap-2 border-b border-slate-100 pb-2">
                        <i class="fa-solid fa-file-shield text-indigo-600"></i>
                        <h4 class="text-xs font-black text-indigo-900 uppercase tracking-wider">Mandatory Upload Requirements</h4>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2" id="onboarding-docs-grid">
        `;

        Object.entries(window.ALL_DOCUMENTS_MASTER).forEach(([id, doc]) => {
            const isChecked = existingDocs && existingDocs[id];
            html += `
                <label class="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl cursor-pointer hover:bg-white hover:border-indigo-300 transition-all">
                    <input type="checkbox" class="doc-req-checkbox w-4 h-4 rounded border-slate-300 text-indigo-600" value="${id}" data-name="${doc.name}" ${isChecked ? 'checked' : ''}>
                    <div class="flex flex-col">
                        <span class="text-[10px] font-black text-slate-700 uppercase leading-none">${doc.name}</span>
                    </div>
                </label>
            `;
        });

        html += `
                        <!-- Custom Document Entry -->
                        <div class="col-span-full pt-2">
                            <div class="flex gap-2">
                                <input type="text" id="custom-doc-input" placeholder="Custom Document Name (e.g. Health Card)" class="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] outline-none focus:border-indigo-500">
                                <button type="button" onclick="window.addCustomOnboardingDoc()" class="px-4 bg-slate-800 text-white rounded-lg text-[8px] font-black uppercase">Add</button>
                            </div>
                            <div id="custom-docs-list" class="flex flex-wrap gap-2 mt-2"></div>
                        </div>
                    </div>
                </div>

                <!-- 2. MANDATORY BIO-DATA FIELDS -->
                <div class="space-y-4">
                    <div class="flex items-center gap-2 border-b border-slate-100 pb-2">
                        <i class="fa-solid fa-address-card text-indigo-600"></i>
                        <h4 class="text-xs font-black text-indigo-900 uppercase tracking-wider">Required Bio-Data Information</h4>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2" id="onboarding-biodata-grid">
        `;

        Object.entries(window.BIO_DATA_FIELDS_MASTER).forEach(([id, field]) => {
            // By default, common fields might be checked
            const isChecked = true;
            html += `
                <label class="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl cursor-pointer hover:bg-white hover:border-indigo-300 transition-all">
                    <input type="checkbox" class="bio-req-checkbox w-4 h-4 rounded border-slate-300 text-indigo-600" value="${id}" data-name="${field.name}" ${isChecked ? 'checked' : ''}>
                    <div class="flex flex-col">
                        <span class="text-[10px] font-black text-slate-700 uppercase leading-none">${field.name}</span>
                    </div>
                </label>
            `;
        });

        html += `
                    </div>
                </div>
            </div>
        `;

        content.innerHTML = html;

    } catch (e) {
        content.innerHTML = `<div class="p-8 text-center text-red-500 font-bold uppercase text-xs">Error: ${e.message}</div>`;
    }
};

/**
 * ✅ Add custom document to the temporary onboarding list
 */
window.addCustomOnboardingDoc = function() {
    const input = document.getElementById('custom-doc-input');
    const name = input?.value?.trim();
    const list = document.getElementById('custom-docs-list');
    if (!name || !list) return;

    const id = "CUSTOM_" + Date.now();
    const tag = document.createElement('div');
    tag.className = "flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-[9px] font-black uppercase fade-in";
    tag.innerHTML = `
        <input type="hidden" class="doc-req-checkbox" value="${id}" data-name="${name}" checked>
        <span>${name}</span>
        <button type="button" onclick="this.parentElement.remove()" class="text-indigo-400 hover:text-indigo-900">&times;</button>
    `;
    list.appendChild(tag);
    input.value = "";
};

/**
 * ✅ Save the configuration back to the main registration form
 */
window.saveOnboardingConfig = function() {
    // Collect selected documents
    const requiredDocs = {};
    document.querySelectorAll('.doc-req-checkbox:checked').forEach(cb => {
        requiredDocs[cb.value] = {
            name: cb.dataset.name,
            mandatory: true,
            status: 'pending'
        };
    });

    // Collect selected bio-data fields
    const requiredBio = [];
    document.querySelectorAll('.bio-req-checkbox:checked').forEach(cb => {
        requiredBio.push({
            id: cb.value,
            name: cb.dataset.name,
            mandatory: true
        });
    });

    // Store in global window variable to be picked up by handleStaffSubmit
    window._pendingOnboardingConfig = {
        requiredDocuments: requiredDocs,
        requiredBioData: requiredBio
    };

    // Update the visual indicator in the main form
    const container = document.getElementById('staff-doc-assignment-container');
    if (container) {
        container.innerHTML = `
            <div class="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between shadow-sm fade-in">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center text-xl shadow-lg shadow-emerald-500/20">
                        <i class="fa-solid fa-check-double"></i>
                    </div>
                    <div>
                        <h4 class="text-[10px] font-black text-emerald-900 uppercase">Onboarding Requirements Configured</h4>
                        <p class="text-[8px] font-bold text-emerald-600 uppercase tracking-widest">${Object.keys(requiredDocs).length} Documents • ${requiredBio.length} Bio-Data Fields</p>
                    </div>
                </div>
                <button type="button" onclick="window.openOnboardingConfigModal(document.getElementById('staff-role').value)" class="px-4 py-2 bg-white text-emerald-600 border border-emerald-200 rounded-lg text-[8px] font-black uppercase hover:bg-emerald-600 hover:text-white transition-all">Edit</button>
            </div>
        `;
    }

    document.getElementById('onboarding-config-modal').classList.add('hidden');
    if (window.showWhatsAppToast) window.showWhatsAppToast("✅ Config Saved", "Onboarding requirements applied successfully.", "success");
};

/**
 * ✅ ADMIN: Save selected documents
 */
window.saveRoleDocs = async function(roleId) {
    if (!roleId) {
        alert("❌ Please select a role first.");
        return;
    }

    // ✅ Get selected documents
    const selectedDocs = {};
    document.querySelectorAll('#doc-checkbox-grid input[type="checkbox"]:checked').forEach(cb => {
        const id = cb.value;
        const label = cb.closest('.doc-check-item').querySelector('label')?.textContent || id;
        selectedDocs[id] = {
            name: label,
            mandatory: true,
            icon: window.ALL_DOCUMENTS_MASTER[id]?.icon || 'fa-file'
        };
    });

    if (Object.keys(selectedDocs).length === 0) {
        if (!confirm("⚠️ No documents selected. This role will have no requirements. Continue?")) {
            return;
        }
    }

    try {
        if (window.showGlobalSpinner) window.showGlobalSpinner("Saving Role Requirements...");

        const result = await window.saveRoleRequirements(roleId, selectedDocs);
        if (result) {
            alert(`✅ Document requirements saved for role: ${roleId}`);
            // ✅ Refresh UI if possible
            const container = document.getElementById('admin-doc-assign-container');
            if (container) {
                await window.renderDocAssignmentUI(roleId, 'admin-doc-assign-container');
            }
        }
    } catch (error) {
        alert("❌ Failed to save: " + error.message);
    } finally {
        if (window.hideGlobalSpinner) window.hideGlobalSpinner();
    }
};

/**
 * ✅ Toggle document checkbox
 */
window.toggleDocCheck = function(element, docId) {
    const checkbox = element.querySelector('input[type="checkbox"]');
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        element.classList.toggle('border-indigo-500', checkbox.checked);
        element.classList.toggle('bg-indigo-50/30', checkbox.checked);
        element.classList.toggle('border-slate-100', !checkbox.checked);

        const iconDiv = element.querySelector('.w-10');
        if (iconDiv) {
            iconDiv.classList.toggle('bg-indigo-600', checkbox.checked);
            iconDiv.classList.toggle('text-white', checkbox.checked);
            iconDiv.classList.toggle('bg-slate-50', !checkbox.checked);
            iconDiv.classList.toggle('text-slate-400', !checkbox.checked);
        }
    }
};

window.updateDocCheck = function(checkbox) {
    const parent = checkbox.closest('.doc-check-item');
    if (parent) {
        parent.classList.toggle('selected', checkbox.checked);
    }
};

window.clearDocSelections = function() {
    document.querySelectorAll('#doc-checkbox-grid input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
        const parent = cb.closest('.doc-check-item');
        if (parent) {
            parent.classList.remove('border-indigo-500', 'bg-indigo-50/30');
            parent.classList.add('border-slate-100');
            const iconDiv = parent.querySelector('.w-10');
            if (iconDiv) {
                iconDiv.classList.remove('bg-indigo-600', 'text-white');
                iconDiv.classList.add('bg-slate-50', 'text-slate-400');
            }
        }
    });
};

/**
 * Dynamically adds a custom document row to the checklist
 */
window.addCustomDocToChecklist = function() {
    const input = document.getElementById('custom-doc-name');
    const name = input?.value?.trim();
    const grid = document.getElementById('doc-assignment-grid');

    if (!name || !grid) return;

    const id = "CUSTOM_" + Date.now();
    const html = `
        <label class="flex items-center gap-3 p-3 bg-indigo-50 rounded-2xl border border-indigo-200 cursor-pointer hover:border-indigo-300 transition-all shadow-sm fade-in">
            <input type="checkbox" class="doc-assign-checkbox w-4 h-4 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500"
                   data-doc-id="${id}" data-doc-name="${name}" checked>
            <span class="text-[10px] font-bold text-indigo-900 leading-tight">${name}</span>
        </label>
    `;
    grid.insertAdjacentHTML('beforeend', html);
    input.value = "";
};

/**
 * Collects the checked documents from the UI to be saved with staff metadata
 */
window.getAssignedDocsFromUI = function() {
    const selected = {};
    document.querySelectorAll('.doc-assign-checkbox:checked').forEach(cb => {
        selected[cb.dataset.docId] = {
            name: cb.dataset.docName,
            assignedAt: Date.now()
        };
    });
    return selected;
};

console.log("✅ docs_admin.js: v2.0 Expanded Document Engine Ready");
