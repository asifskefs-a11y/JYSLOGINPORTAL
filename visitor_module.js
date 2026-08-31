import { db } from './firebase_config.js';
import { ref, set, get, update, runTransaction, push, remove, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { PATHS, FirebasePathValidator } from './firebase_path_manager.js';

// --- VISITOR SYSTEM (v3.5.1 - FIXED) ---
let vCanvas, vCtx, vDrawing = false;

// Session state for current reserved token
window.currentReservedToken = null;
window.tokenTimer = null;

/**
 * ASSIGN IMMEDIATE UNIQUE TOKEN ON FORM OPEN
 */
window.reservePortalToken = async function(mode = 'visitor') {
    const counterPath = mode === 'contractor' ? `${PATHS.SYSTEM_COUNTERS}/contractor_daily` : `${PATHS.SYSTEM_COUNTERS}/visitor_daily`;
    if (!FirebasePathValidator.validatePath(counterPath)) throw new Error("Invalid Counter Path");

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
        const reservationRef = push(ref(db, PATHS.TOKEN_RESERVATIONS));
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
        const path = `${PATHS.TOKEN_RESERVATIONS}/${tokenId}`;
        if (FirebasePathValidator.validatePath(path)) {
            FirebasePathValidator.logOperation('remove', path);
            await remove(ref(db, path));
        }

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

// ✅ FIXED: Using SignaturePadEngine's isEmpty check
function isCanvasBlank(canvasId) {
    if (window.sigPadManager) {
        const pad = window.sigPadManager.getPad(canvasId);
        return pad ? pad.isEmpty() : true;
    }
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
        // Ensure pad is initialized but keep locked status from HTML/UI
        if (pad && typeof pad._setupCanvas === 'function') {
             // We don't call unlock here, the UI overlay handles it.
        }
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
                    if (!FirebasePathValidator.validatePath(dbNode)) throw new Error("Access Denied");
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
                // ✅ Check if key was issued. If 'NO', skip PIN verification.
                const keyIssued = (data.keyCollected === 'YES' || data.keyCollected === 'Yes' || data.keyCollected === true);

                if (keyIssued) {
                    // Use a standard prompt with clean string trimming
                    const userEntered = prompt(`🔑 KEY RETURN PIN REQUIRED\n\nPlease enter the 4-digit PIN shown on Security Dashboard:`);

                    if (userEntered === null) {
                        // User clicked Cancel
                        return;
                    }
                    const enteredPin = userEntered.toString().trim();
                    if (!liveStoredPin || enteredPin === "" || enteredPin !== liveStoredPin) {
                        alert(`❌ Invalid PIN!\n\nPlease enter the exact 4-digit PIN displayed on the Security Dashboard. Contact Security if you do not have it.`);
                        return;
                    }
                }
                // 3. EXECUTE SIGN OUT
                // ✅ Show Processing Spinner first
                if (window.showGlobalSpinner) window.showGlobalSpinner("Processing Check-Out...");

                try {
                    const now = new Date();
                    const outTime = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true});
                    const targetKey = data.firebaseKey || data.id;
                    const path = `${dbNode}/${targetKey}`;
                    if (!FirebasePathValidator.validatePath(path)) throw new Error("Invalid Path");
                    FirebasePathValidator.logOperation('update', path);
                    await update(ref(db, path), {
                        outTime: outTime,
                        status: 'SIGNED OUT',
                        keyReturned: 'YES'
                    });

                    // ✅ REMOVE FROM SECURITY KEY CONTROL (RESTORED)
                    // Uses exact same identifier logic as init_module.js
                    const securityRefId = data.mobile || data.id;
                    const path = `${PATHS.SECURITY_KEYS}/${securityRefId}`;
                    if (FirebasePathValidator.validatePath(path)) {
                        FirebasePathValidator.logOperation('remove', path);
                        await remove(ref(db, path));
                    }

                    localStorage.removeItem('vActive');

                    // ✅ Hide Processing Spinner
                    if (window.hideGlobalSpinner) window.hideGlobalSpinner();

                    if (window.showPortalAnimation) {
                        window.showPortalAnimation('exit');
                        setTimeout(() => {
                            window.hidePortalAnimation();
                            window.triggerSuccessPopup("Signed Out Successfully! 👋");
                            window.checkVisitorSession();
                        }, 2000);
                    } else {
                        window.triggerSuccessPopup("Signed Out Successfully! 👋");
                        window.checkVisitorSession();
                    }
                } catch (e) {
                    if (window.hidePortalAnimation) window.hidePortalAnimation();
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
    const vName = document.getElementById('v-name');
    const vMobile = document.getElementById('v-mobile');
    const vCompany = document.getElementById('v-company');
    const vPurpose = document.getElementById('v-purpose');
    const contractorId = document.getElementById('contractorId');

    if (!vId || !vDate) return;

    // ✅ FIXED: Clear all previous data for new entry
    if (vName) vName.value = '';
    if (vMobile) vMobile.value = '';
    if (vCompany) vCompany.value = '';
    if (vPurpose) vPurpose.value = '';
    if (contractorId) contractorId.value = '';

    // Reset Key Buttons to "NO"
    window.toggleVisitorKey(false);

    // Reset Signature
    window.clearVisitorSig();

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

/**
 * PROFESSIONAL SCHOOL ANIMATION OVERLAY
 */
window.showPortalAnimation = function(type = 'verify') {
    const overlay = document.getElementById('portal-animation-overlay');
    const icon = document.getElementById('anim-icon');
    const text = document.getElementById('anim-text');
    const subtext = document.getElementById('anim-subtext');

    if (!overlay) return;

    if (type === 'entry') {
        icon.className = "fa-solid fa-shield-check text-emerald-500 text-6xl animate-bounce";
        text.innerText = "ACCESS GRANTED";
        subtext.innerText = "Welcome to Jern Yafoor School";
    } else if (type === 'exit') {
        icon.className = "fa-solid fa-door-open text-orange-500 text-6xl animate-pulse";
        text.innerText = "DEPARTURE LOGGED";
        subtext.innerText = "Thank you for visiting";
    } else {
        icon.className = "fa-solid fa-user-shield text-indigo-500 text-6xl animate-pulse";
        text.innerText = "VERIFYING IDENTITY";
        subtext.innerText = "School Security Protocol Active";
    }

    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';
};

window.hidePortalAnimation = function() {
    const overlay = document.getElementById('portal-animation-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.classList.add('hidden');
            overlay.style.display = 'none';
            overlay.style.opacity = '1';
        }, 500);
    }
};
