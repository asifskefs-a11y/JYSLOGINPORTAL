/* --- STAFF DOCUMENT ADMIN ENGINE (v2.0 - EXPANDED) --- */
import { db } from '../../firebase_config.js';
import { ref, get, set, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

/**
 * Global Document Templates (Master List)
 */
window.ALL_DOCUMENTS_MASTER = {
    'EMIRATES_ID': { name: 'EMIRATES_ID', icon: 'fa-id-card' },
    'PASSPORT': { name: 'PASSPORT', icon: 'fa-passport' },
    'SIRA_LICENSE': { name: 'SIRA_LICENSE', icon: 'fa-certificate' },
    'VISA_COPY': { name: 'VISA_COPY', icon: 'fa-stamp' },
    'DRIVING_LICENSE': { name: 'DRIVING LICENSE', icon: 'fa-id-card' },
    'MEDICAL_REPORT': { name: 'MEDICAL REPORT', icon: 'fa-file-medical' },
    'POLICE_CLEARANCE': { name: 'POLICE CLEARANCE', icon: 'fa-file-shield' },
    'TRAINING_CERTIFICATE': { name: 'TRAINING CERTIFICATE', icon: 'fa-graduation-cap' },
    'DEGREE_CERTIFICATE': { name: 'DEGREE CERTIFICATE', icon: 'fa-file-alt' },
    'EXPERIENCE_LETTER': { name: 'EXPERIENCE LETTER', icon: 'fa-file-signature' },
    'SECURITY_LICENSE': { name: 'SECURITY LICENSE', icon: 'fa-shield-alt' },
    'TECHNICAL_LICENSE': { name: 'TECHNICAL LICENSE', icon: 'fa-microchip' },
    'LEADERSHIP_CERTIFICATE': { name: 'LEADERSHIP CERTIFICATE', icon: 'fa-user-tie' },
    'SUPERVISOR_CERTIFICATE': { name: 'SUPERVISOR CERTIFICATE', icon: 'fa-users' }
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
