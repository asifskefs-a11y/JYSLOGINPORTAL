import { db } from './firebase_config.js';
import { ref, set, get, update, runTransaction, push, remove, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- VISITOR SYSTEM (v3.5.1 - FIXED) ---
let vCanvas, vCtx, vDrawing = false;

// Session state for current reserved token
window.currentReservedToken = null;
window.tokenTimer = null;

/**
 * ASSIGN IMMEDIATE UNIQUE TOKEN ON FORM OPEN
 */
window.reservePortalToken = async function(mode = 'visitor') {
    const counterPath = mode === 'contractor' ? 'system_counters/contractor_daily' : 'system_counters/visitor_daily';
    const counterRef = ref(db, counterPath);
    const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    try {
        let assignedSeq = 1;

        // Atomic Transaction ensures no two devices get the same integer even in the exact same millisecond
        await runTransaction(counterRef, (currentData) => {
            if (currentData && currentData.date === todayStr) {
                assignedSeq = (currentData.lastSeq || 0) + 1;
                return { date: todayStr, lastSeq: assignedSeq };
            } else {
                // Reset counter for a new day
                assignedSeq = 1;
                return { date: todayStr, lastSeq: 1 };
            }
        });

        // Reserve temporary token in Firebase
        const reservationRef = push(ref(db, 'token_reservations'));
        const tokenId = reservationRef.key;

        const tokenData = {
            tokenId: tokenId,
            sequenceNo: assignedSeq,
            status: 'RESERVED',
            mode: mode,
            createdAt: Date.now(),
            expiresAt: Date.now() + (5 * 60 * 1000) // Expire after 5 minutes
        };

        await set(reservationRef, tokenData);

        window.currentReservedToken = tokenData;

        // Display Token ID on the screen
        const badgeEl = document.getElementById('contractor-token-badge');
        if (badgeEl) badgeEl.innerText = `Token #${assignedSeq}`;

        // Sync ID field with sequence
        const vId = document.getElementById('v-id');
        if (vId) {
            const prefix = mode === 'contractor' ? 'JYS-C' : 'JYS-V';
            vId.value = prefix + assignedSeq.toString().padStart(3, '0');
        }

        // Start 5-Minute Auto-Expiry Safeguard
        startTokenExpiryTimer(tokenId, assignedSeq);

    } catch (err) {
        console.error("Atomic reservation error:", err);
    }
};

/**
 * AUTO-EXPIRY & QUEUE RE-INDEXING IF ABANDONED
 */
function startTokenExpiryTimer(tokenId, seqNo) {
    if (window.tokenTimer) clearTimeout(window.tokenTimer);

    window.tokenTimer = setTimeout(async () => {
        if (window.currentReservedToken && window.currentReservedToken.tokenId === tokenId) {
            console.warn(`Token #${seqNo} expired without signature. Recycling token...`);

            // Remove unsubmitted token
            await remove(ref(db, `token_reservations/${tokenId}`));

            // Mark token as recycled so queue auto-shifts
            window.currentReservedToken = null;
            alert("⏰ Session expired due to inactivity. Please reopen the form.");
            window.location.reload();
        }
    }, 5 * 60 * 1000); // 5 Minutes
}

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
    if (document.getElementById('v-sig-pad') && window.sigPadManager) {
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
                window.showGlobalSpinner("Fetching Security PIN...");
                let liveStoredPin = null;
                const mode = data.mode || (data.contractorId ? 'contractor' : 'visitor');
                const dbNode = mode === 'contractor' ? 'contractors' : 'visitors';
                try {
                    // 1. ALWAYS FORCE A FRESH FIREBASE LOOKUP FOR ALL CHECKOUTS
                    const snap = await get(ref(db, dbNode));
                    if (snap.exists()) {
                        const logs = snap.val();
                        const recordEntry = Object.entries(logs).find(([key, record]) =>
                            key === data.firebaseKey ||
                            (record.id && data.id && record.id.toString().trim() === data.id.toString().trim()) ||
                            (record.contractorId && data.contractorId && record.contractorId.toString().trim() === data.contractorId.toString().trim()) ||
                            (record.mobile && data.mobile && record.mobile.toString().trim() === data.mobile.toString().trim())
                        );
                        if (recordEntry) {
                            const freshData = recordEntry[1];
                            liveStoredPin = (freshData.keyReturnPin || freshData.checkoutPin || freshData.pin || "").toString().trim();
                            data.firebaseKey = recordEntry[0];
                        }
                    }
                } catch (err) {
                    console.error("Firebase fetch error:", err);
                } finally {
                    window.hideGlobalSpinner();
                }
                // Fallback to local data if fetch returned empty
                if (!liveStoredPin) {
                    liveStoredPin = (data.keyReturnPin || data.checkoutPin || data.pin || "").toString().trim();
                }
                // 2. MOBILE-SAFE PIN PROMPT LOGIC
                // If key was issued or if a PIN is stored in DB
                const keyIssued = data.keyCollected === 'YES' || data.keyCollected === 'Yes' || data.keyCollected === true || data.keyStatus === 'HELD' || (liveStoredPin !== "" && liveStoredPin !== null);
                if (keyIssued) {
                    // Use a standard prompt with clean string trimming
                    const userEntered = prompt(`🔑 KEY RETURN PIN REQUIRED\n\nPlease enter the 4-digit PIN shown on Security Dashboard:`);

                    if (userEntered === null) {
                        // User clicked Cancel
                        return;
                    }
                    const enteredPin = userEntered.toString().trim();
                    if (!liveStoredPin || enteredPin === "" || enteredPin !== liveStoredPin) {
                        alert(`❌ Invalid PIN!\n\nSystem Expected: [${liveStoredPin || 'No PIN found'}]\nYou Entered: [${enteredPin || 'Empty'}]\n\nPlease enter the exact 4-digit PIN displayed on the Security Dashboard.`);
                        return;
                    }
                }
                // 3. EXECUTE SIGN OUT
                window.showGlobalSpinner("Finalizing Exit...");
                try {
                    const now = new Date();
                    const outTime = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true});
                    const targetKey = data.firebaseKey || data.id;
                    await update(ref(db, `${dbNode}/${targetKey}`), {
                        outTime: outTime,
                        status: 'SIGNED OUT',
                        keyReturned: 'YES'
                    });

                    // REMOVE FROM SECURITY KEY CONTROL (RESTORED)
                    await remove(ref(db, `security_key_control/${data.mobile || data.id}`));

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

    // Start Atomic Transaction Reservation
    await window.reservePortalToken(mode);

    // Set date/time
    vDate.value = now.toLocaleDateString('en-US') + " " + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true});

    // Ensure the fields are visible
    vId.parentElement.style.display = "block";
    vDate.parentElement.style.display = "block";

    setTimeout(window.initVisitorCanvas, 50);
};
