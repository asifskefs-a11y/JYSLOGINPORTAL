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
                if (data.keyCollected === 'YES') {
                    window.showGlobalSpinner("Fetching Security PIN...");

                    // 1. DETERMINE REALTIME DB PATH & RECORD KEY
                    const mode = data.mode || 'visitor';
                    const dbNode = mode === 'contractor' ? 'contractor_logs' : 'visitor_logs';
                    const recordId = data.firebaseKey || data.key || data.id; // Support Push Key or System ID

                    let liveRecord = null;

                    try {
                        // Fetch fresh live record directly from Firebase Database
                        const snap = await get(ref(db, dbNode));
                        if (snap.exists()) {
                            const allLogs = snap.val();
                            // Find record by key or by ID
                            const foundEntry = Object.entries(allLogs).find(([k, v]) => k === recordId || v.id === data.id || v.contractorId === data.id);
                            if (foundEntry) {
                                liveRecord = foundEntry[1];
                                data.firebaseKey = foundEntry[0]; // Save actual DB key
                            }
                        }
                    } catch (err) {
                        console.error("Error fetching live record:", err);
                    } finally {
                        window.hideGlobalSpinner();
                    }

                    // 2. GET LIVE STORED PIN
                    const targetObj = liveRecord || data;
                    const storedPin = (targetObj.keyReturnPin || targetObj.checkoutPin || targetObj.pin || "").toString().trim();

                    // 3. PROMPT USER FOR PIN
                    const pinInput = prompt(`🔑 KEY RETURN PIN REQUIRED\nEnter 4-digit PIN (Shown on Security Dashboard):`);
                    const enteredPin = (pinInput || "").toString().trim();

                    if (!storedPin || storedPin !== enteredPin || enteredPin === "") {
                        alert(`❌ Invalid PIN (${enteredPin}).\nPlease enter the correct 4-digit PIN shown on the Security Dashboard.`);
                        return;
                    }
                }

                // 4. PROCEED WITH SIGN-OUT UPON SUCCESSFUL PIN VERIFICATION
                window.showGlobalSpinner("Finalizing Exit...");
                try {
                    const now = new Date();
                    const outTime = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true});

                    const mode = data.mode || 'visitor';
                    const dbNode = mode === 'contractor' ? 'contractor_logs' : 'visitor_logs';
                    const targetKey = data.firebaseKey || data.id;

                    await update(ref(db, `${dbNode}/${targetKey}`), {
                        outTime: outTime,
                        status: 'SIGNED OUT',
                        keyReturned: 'YES'
                    });

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
