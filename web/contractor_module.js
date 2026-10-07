import { db } from './firebase_config.js';
import { ref, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================
// CONTRACTOR MANAGEMENT MODULE
// ================================================

/* COMPLETE CONTRACTOR CHECK-OUT & AUTO RESET FORM */
window.contractorCheckOut = async function(contractorDocId) {
    if (!confirm("Confirm Check-Out for Contractor?")) return;

    try {
        // 1. Update status in Database
        await update(ref(db, `contractors/${contractorDocId}`), {
            status: 'CHECKED_OUT',
            checkOutTime: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
            timestamp_out: window.serverTimestamp ? window.serverTimestamp() : Date.now()
        });

        alert("✅ Checked Out Successfully!");

        // 2. Clear Form Data completely
        const form = document.getElementById('contractor-entry-form');
        if (form) form.reset();

        // 3. Clear Signature Canvas if present
        if (window.contractorSignaturePad) {
            window.contractorSignaturePad.clear();
        }

        // 4. Hide Check-out View and Reset back to Fresh Check-in Form
        const checkoutSec = document.getElementById('contractor-checkout-section');
        const checkinSec = document.getElementById('contractor-checkin-section');

        if (checkoutSec) checkoutSec.classList.add('hidden');
        if (checkinSec) checkinSec.classList.remove('hidden');

        // (removed) window.location.reload() - it wiped the form/UI we had just reset

    } catch (err) {
        console.error("Contractor Checkout Error:", err);
        alert("❌ Check-out failed. Please try again.");
    }
};

console.log("✅ contractor_module.js loaded");
