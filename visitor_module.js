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
                    const pinInput = prompt("🔑 KEY RETURN PIN REQUIRED\nEnter 4-digit PIN:");
                    if (pinInput !== data.keyReturnPin) {
                        alert("Incorrect PIN!");
                        return;
                    }
                }

                window.showGlobalSpinner("Finalizing Exit...");
                try {
                    const now = new Date();
                    const outTime = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true});

                    await update(ref(db, 'visitors/' + data.id), {
                        outTime: outTime,
                        status: 'SIGNED OUT'
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

    // ... logic for vId generation ...

    // ADD KEY GENERATION LOGIC IN FORM SUBMIT
    // (This would be in your saveVisitor function, assuming you add it there)

    // Force visibility and set date/time
    vDate.value = now.toLocaleDateString('en-US') + " " + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true});

    // Ensure the fields are not being hidden by CSS inline
    vId.parentElement.style.display = "block";
    vDate.parentElement.style.display = "block";

    setTimeout(window.initVisitorCanvas, 50);
};
