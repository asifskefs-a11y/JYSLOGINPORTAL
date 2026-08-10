import { db } from './firebase_config.js';
import { ref, set, get, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- VISITOR SYSTEM (v3.5.1 - FIXED) ---
let vCanvas, vCtx, vDrawing = false;

// ✅ FIXED: Self-contained compression function
// Ensures visitor sign-in works even if attendance_module.js hasn't loaded.
function getCompressedSignature(canvas) {
    if (!canvas) return null;
    try {
        const offscreen = document.createElement('canvas');
        offscreen.width = 300;
        offscreen.height = 150;
        const ctx = offscreen.getContext('2d');
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, 300, 150);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, 0, 0, 300, 150);
        return offscreen.toDataURL("image/jpeg", 0.4);
    } catch (e) {
        console.error("Compression error:", e);
        return null;
    }
}

// Ensure global availability for init_module.js
window.getCompressedSignature = getCompressedSignature;

function isCanvasBlank(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return true;
    const blank = document.createElement('canvas');
    blank.width = canvas.width;
    blank.height = canvas.height;
    const ctx = blank.getContext('2d');
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, blank.width, blank.height);
    return canvas.toDataURL() === blank.toDataURL();
}
window.isCanvasBlank = isCanvasBlank;

// --- INITIALIZATION: Signature Pad for Visitors ---
window.initVisitorCanvas = () => {
    if (window.sigPadManager) {
        const pad = window.sigPadManager.getPad('v-sig-pad');
        if (pad) pad._setupCanvas();
    }
};

window.clearVisitorSig = () => {
    if (window.sigPadManager) {
        const pad = window.sigPadManager.getPad('v-sig-pad');
        if (pad) {
            pad.clear();
            pad.lock();
        }
    }
};

window.generateKeyReturnPin = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
};

window.checkVisitorSession = () => {
    const active = localStorage.getItem('vActive');
    const signInArea = document.getElementById('v-signin-area');
    const signOutArea = document.getElementById('v-signout-area');
    const signOutBtn = document.getElementById('v-signout-btn');

    if(active) {
        const data = JSON.parse(active);
        if (signInArea) signInArea.classList.add('hidden');
        if (signOutArea) {
            signOutArea.classList.remove('hidden');
            const activeName = document.getElementById('v-active-name');
            const activeId = document.getElementById('v-active-id');
            const activeTimeIn = document.getElementById('v-active-timein');
            const activePin = document.getElementById('v-active-pin'); // NEW
            if (activeName) activeName.innerText = data.name;
            if (activeId) activeId.innerText = data.id;
            if (activeTimeIn) activeTimeIn.innerText = data.timeIn;
            if (activePin && data.keyCollected === 'YES') activePin.innerText = "🔑 PIN: " + data.keyReturnPin; // NEW
        }

        // Fix for Sign-Out button event listener
        if (signOutBtn) {
            signOutBtn.onclick = async () => {
                // 1. HELPER TO CHECK IF KEY WAS ISSUED (CASE INSENSITIVE & BOOLEAN SAFE)
                const keyWasIssued = () => {
                    const kc = (data.keyCollected || "").toString().toUpperCase();
                    const ks = (data.keyStatus || "").toString().toUpperCase();
                    return kc === 'YES' || kc === 'TRUE' || ks === 'HELD' || data.keyCollected === true;
                };

                let liveStoredPin = null;

                // 2. ALWAYS FETCH LIVE DATA FROM FIREBASE IF A KEY WAS ISSUED
                if (keyWasIssued()) {
                    window.showGlobalSpinner("Validating Security PIN...");
                    const mode = data.mode || (data.contractorId ? 'contractor' : 'visitor');
                    const dbNode = mode === 'contractor' ? 'contractor_logs' : 'visitor_logs';

                    try {
                        const snap = await get(ref(db, dbNode));
                        if (snap.exists()) {
                            const logs = snap.val();
                            // Match record by firebaseKey, id, contractorId, or mobile number
                            const recordEntry = Object.entries(logs).find(([key, record]) =>
                                key === data.firebaseKey ||
                                (record.id && data.id && record.id.toString() === data.id.toString()) ||
                                (record.contractorId && data.contractorId && record.contractorId.toString() === data.contractorId.toString()) ||
                                (record.mobile && data.mobile && record.mobile.toString() === data.mobile.toString())
                            );
                            if (recordEntry) {
                                const freshData = recordEntry[1];
                                liveStoredPin = (freshData.keyReturnPin || freshData.checkoutPin || freshData.pin || "").toString().trim();
                                data.firebaseKey = recordEntry[0]; // Cache exact Firebase push key
                            }
                        }
                    } catch (err) {
                        console.error("Firebase live fetch error on mobile:", err);
                    } finally {
                        window.hideGlobalSpinner();
                    }

                    // Fallback to local memory if live fetch returned empty
                    if (!liveStoredPin) {
                        liveStoredPin = (data.keyReturnPin || data.checkoutPin || data.pin || "").toString().trim();
                    }

                    // Prompt user for 4-digit PIN
                    const pinInput = prompt("🔑 KEY RETURN PIN REQUIRED\nEnter 4-digit PIN shown on Security Dashboard:");
                    const enteredPin = (pinInput || "").toString().trim();
                    if (!liveStoredPin || enteredPin === "" || enteredPin !== liveStoredPin) {
                        alert(`❌ Invalid PIN.\n\nPlease enter the exact 4-digit PIN displayed on the Security Dashboard.`);
                        return;
                    }
                }

                // 3. PROCEED TO SIGN OUT UPON VALIDATION
                window.showGlobalSpinner("Finalizing Exit...");
                try {
                    const now = new Date();
                    const outTime = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true});
                    const mode = data.mode || (data.contractorId ? 'contractor' : 'visitor');
                    const dbNode = mode === 'contractor' ? 'contractor_logs' : 'visitor_logs';
                    const targetKey = data.firebaseKey || data.id;

                    await update(ref(db, `${dbNode}/${targetKey}`), {
                        outTime: outTime,
                        status: 'SIGNED OUT',
                        keyReturned: 'YES'
                    });

                    // Clear mobile local storage session
                    localStorage.removeItem('vActive');
                    window.triggerSuccessPopup("Signed Out Successfully! 👋");
                    window.checkVisitorSession();
                } catch (e) {
                    alert("Error during sign-out: " + e.message);
                } finally {
                    window.hideGlobalSpinner();
                }
            };
        }
    } else {
        if (signInArea) signInArea.classList.remove('hidden');
        if (signOutArea) signOutArea.classList.add('hidden');
        // Ensure form is initialized when session is clear
        window.initVisitorForm();
    }
};

window.initVisitorForm = async () => {
    const vId = document.getElementById('v-id');
    const vDate = document.getElementById('v-date');
    if (!vId || !vDate) return;
    const now = new Date();
    const mode = window.portalMode || 'visitor';

    try {
        const counterPath = mode === 'contractor' ? 'counters/contractors' : 'counters/visitors';
        const snap = await get(ref(db, counterPath));
        let count = 1;
        if (snap.exists()) {
            count = parseInt(snap.val()) + 1;
        }
        const prefix = mode === 'contractor' ? 'JYS-C' : 'JYS-V';
        vId.value = prefix + count.toString().padStart(3, '0');
        window.currentSequenceCount = count; // Save for incrementing on save
    } catch (e) {
        console.error("ID Generation Error:", e);
        vId.value = (mode === 'contractor' ? 'JYS-C' : 'JYS-V') + Math.floor(Math.random() * 900 + 100);
    }

    // Force visibility and set date/time
    vDate.value = now.toLocaleDateString('en-US') + " " + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true});

    // Ensure the fields are not being hidden by CSS inline
    vId.parentElement.style.display = "block";
    vDate.parentElement.style.display = "block";

    setTimeout(window.initVisitorCanvas, 50);
};
