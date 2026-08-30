/* --- STAFF DOCUMENT MODULE INITIALIZER (v2.2 - BUG FIX) --- */

/**
 * Initializes the document verification module for the current logged-in user
 */
window.initStaffDocsModule = async function(containerId) {
    console.log("🚀 Initializing Staff Documents Module...");

    const container = containerId ? document.getElementById(containerId) : null;
    const sessionStaff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || 'null');

    if (!sessionStaff) {
        console.error("❌ No active staff session found.");
        return;
    }

    // Try multiple fields to find the unique identifier
    const adekNumber = sessionStaff.adekPass || sessionStaff.adcPassNumber || sessionStaff.mobile;

    if (!adekNumber) {
        console.error("❌ Identification ID missing in session.");
        if (container) {
            container.innerHTML = `<p class="p-8 text-center text-amber-500 font-bold text-[10px] uppercase">Please Re-Login: Identity Data Missing</p>`;
        }
        return;
    }

    try {
        // 1. Fetch Latest Staff Data strictly using ADEK/ID
        const [latestStaff, staffDataNode] = await Promise.all([
            window.getLatestStaffData(adekNumber),
            window.getStaffDocuments(adekNumber)
        ]);

        if (!latestStaff) {
            console.error("❌ Profile Sync Failed: Profile not found in master database for:", adekNumber);
            if (container) {
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-20 text-slate-400">
                        <i class="fa-solid fa-id-card-clip text-4xl mb-4 opacity-20"></i>
                        <p class="text-[10px] font-black uppercase tracking-widest text-slate-600">Profile Sync Failed</p>
                        <p class="text-[8px] font-bold text-slate-400 mt-2 uppercase">Please contact Admin to verify your ADEK Pass Registration.</p>
                    </div>
                `;
            }
            return;
        }

        // 2. Determine requirements
        const roleId = (latestStaff.role || 'staff').toLowerCase();
        let requirements = latestStaff.requiredVerificationDocs;

        if (!requirements || Object.keys(requirements).length === 0) {
            requirements = await window.getRoleRequirements(roleId);
        }

        // 3. UI Handling for "No Requirements"
        if (!requirements || Object.keys(requirements).length === 0) {
            console.warn(`⚠️ No document requirements found for: ${adekNumber}`);
            if (container) {
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-20 text-slate-400">
                        <i class="fa-solid fa-circle-check text-4xl mb-4 opacity-20"></i>
                        <p class="text-[10px] font-black uppercase tracking-widest">No verification required for your account.</p>
                    </div>
                `;
            }
            return;
        }

        const staffDocs = staffDataNode.docs || {};

        // 4. Render Dashboard section
        if (container) {
            window.renderStaffDocsModule(containerId, requirements, staffDocs);
        }

        // 5. Trigger Automated Onboarding Popup if needed
        if (!staffDataNode.isAccountActivated) {
            window.renderOnboardingModal(requirements, staffDocs);
        }

        console.log("✅ Staff Documents Module Sync Complete.");

    } catch (error) {
        console.error("❌ Initialization Error:", error);
        if (container) {
            container.innerHTML = `<p class="p-8 text-center text-rose-400 font-bold text-xs uppercase">Sync Failed. Please check connection.</p>`;
        }
    }
};
