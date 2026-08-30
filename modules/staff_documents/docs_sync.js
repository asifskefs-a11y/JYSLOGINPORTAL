/* ================================================================ */
/* ✅ DOCUMENT SYNC & LOCK GUARD - FIXED v2.0                       */
/* ================================================================ */

/**
 * ✅ Update lock status for dashboard
 */
window.updateLockStatus = function(progress, isActivated) {
    console.log(`🔒 Lock Status: ${isActivated ? 'UNLOCKED' : 'LOCKED'}, Progress: ${progress}`);

    const checkInBtn = document.getElementById('s-checkin-btn') || document.getElementById('security-checkin-btn') || document.getElementById('checkin-btn');
    const lockOverlay = document.getElementById('lock-overlay');
    const progressBar = document.getElementById('verification-progress');

    if (checkInBtn) {
        if (isActivated) {
            checkInBtn.disabled = false;
            checkInBtn.style.opacity = '1';
            checkInBtn.style.cursor = 'pointer';
            document.body.removeAttribute('data-attendance-locked');
        } else {
            checkInBtn.disabled = true;
            checkInBtn.style.opacity = '0.5';
            checkInBtn.style.cursor = 'not-allowed';
            document.body.setAttribute('data-attendance-locked', 'true');
        }
    }

    if (lockOverlay) {
        lockOverlay.style.display = isActivated ? 'none' : 'flex';
    }

    if (progressBar) {
        progressBar.style.width = progress;
        progressBar.textContent = progress;
    }
};

/**
 * ✅ Check if staff is activated
 */
window.isStaffActivated = async function(userId) {
    try {
        const docData = await window.getStaffDocuments(userId);
        return docData.isAccountActivated || false;
    } catch (error) {
        console.error("Error checking activation:", error);
        return false;
    }
};

/**
 * ✅ Check and lock dashboard
 */
window.checkAndLockDashboard = async function() {
    try {
        const staffData = window.currentStaffData ||
                         JSON.parse(sessionStorage.getItem('active_staff_user') || 'null');

        if (!staffData) return;

        const userId = staffData.adekPass || staffData.mobile;
        if (!userId) return;

        const docData = await window.getStaffDocuments(userId);
        const progress = docData.verificationProgress || "0%";
        const isActivated = docData.isAccountActivated || false;

        window.updateLockStatus(progress, isActivated);

    } catch (error) {
        console.error("Lock check error:", error);
    }
};

console.log("✅ docs_sync.js v2.0 Loaded");
