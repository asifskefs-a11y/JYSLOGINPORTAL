import { db } from './firebase_config.js';
import { ref, set, get, update, runTransaction, push, remove, onValue, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- VISITOR SYSTEM CORE (v4.0 OVERHAUL) ---
window.currentReservedToken = null;
window.tokenTimer = null;

const getLocalTodayStr = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/**
 * 1. ASSIGN PLACEHOLDERS (Atomic sequence only happens on Submit)
 */
window.reservePortalToken = async function(mode = 'visitor') {
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode') || window.portalMode || mode;
    const prefix = modeParam.toLowerCase().includes('contractor') ? 'JYSC' : 'JYSV';

    const vId = document.getElementById('v-id');
    const badgeEl = document.getElementById('contractor-token-badge');
    const vDate = document.getElementById('v-date');

    if (vDate) vDate.value = new Date().toLocaleDateString('en-US');
    if (localStorage.getItem('vActive')) return;

    if (vId) vId.value = `${prefix}---`;
    if (badgeEl) badgeEl.innerText = `TOKEN #--`;

    console.log(`🌐 System: ${prefix} Portal ready. Sequence will be assigned by server on confirm.`);
};

/**
 * 2. STRICT ACTIVE-ONLY EVALUATION (The Core Interlock)
 */
window.handlePhoneLookup = async function(enteredMobile) {
    const cleanMobile = (enteredMobile || "").toString().trim();
    if (cleanMobile.length < 8) return;

    console.log("🔍 Evaluating Session for:", cleanMobile);

    const mode = window.portalMode || 'visitor';
    const dbNode = mode === 'contractor' ? 'contractors' : 'visitors';

    try {
        const q = query(ref(db, dbNode), orderByChild('mobile'), equalTo(cleanMobile));
        const snapshot = await get(q);

        let activeRecord = null;
        let lastProfile = null;

        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const data = child.val();
                data.firebaseKey = child.key;
                if (data.status === 'active') {
                    activeRecord = data;
                } else {
                    if (!lastProfile || (data.timestamp || 0) > (lastProfile.timestamp || 0)) {
                        lastProfile = data;
                    }
                }
            });
        }

        if (activeRecord) {
            // SCENARIO A: Visitor is CURRENTLY inside -> Force Check-Out
            console.log("⚠️ Active Stay Detected. Switching to Check-Out View.");
            localStorage.setItem('vActive', JSON.stringify({ ...activeRecord, mode: mode }));
            window.checkVisitorSession();
        } else {
            // SCENARIO B: No active stay (New or Completed) -> Open Fresh Check-In
            console.log("🆕 No active stay. Opening Fresh Check-In Form.");

            const wasActive = localStorage.getItem('vActive');
            if (wasActive) {
                localStorage.removeItem('vActive');
                window.checkVisitorSession(); // Resets UI to sign-in form
            }

            if (lastProfile) {
                // UX Feature: Pre-fill past details for speed
                window.autoFillVisitorForm({
                    name: lastProfile.name || lastProfile.fullName || '',
                    company: lastProfile.company || '',
                    contractorId: lastProfile.contractorId || ''
                });
            } else {
                window.autoFillVisitorForm({ name: '', company: '', contractorId: '' });
            }
        }
    } catch (err) { console.error("❌ Evaluation Error:", err); }
};

window.autoFillVisitorForm = (profile) => {
    const vName = document.getElementById('v-name');
    const vCompany = document.getElementById('v-company');
    const contractorId = document.getElementById('contractorId');

    if (vName) vName.value = profile.name || '';
    if (vCompany) vCompany.value = profile.company || '';
    if (contractorId) contractorId.value = profile.contractorId || '';

    if (profile.name || profile.company) {
        [vName, vCompany, contractorId].forEach(el => {
            if (el && el.value) {
                el.style.backgroundColor = '#EEF2FF';
                setTimeout(() => { el.style.backgroundColor = ''; }, 1500);
            }
        });
    }
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
            if (document.getElementById('v-active-name')) document.getElementById('v-active-name').innerText = data.name || data.fullName || 'Visitor';
            if (document.getElementById('v-active-id')) document.getElementById('v-active-id').innerText = data.id || '-';
            if (document.getElementById('v-active-timein')) document.getElementById('v-active-timein').innerText = data.timeIn || '-';

            const badgeEl = document.getElementById('contractor-token-badge');
            if (badgeEl) badgeEl.innerText = `TOKEN #${data.tokenNumber || '--'}`;

            const pinEl = document.getElementById('v-active-pin');
            if (pinEl) pinEl.innerText = data.checkoutPin || data.keyReturnPin || "----";
        }

        if (signOutBtn) {
            signOutBtn.onclick = async () => {
                window.showGlobalSpinner("Logging Departure...");
                try {
                    const dbNode = data.mode === 'contractor' ? 'contractors' : 'visitors';
                    const outTime = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true});

                    const targetKey = data.firebaseKey || data.id;
                    await update(ref(db, `${dbNode}/${targetKey}`), {
                        outTime: outTime,
                        status: 'completed',
                        timestamp_out: Date.now()
                    });

                    await remove(ref(db, `security_key_control/${data.mobile || data.id}`)).catch(()=>{});
                    localStorage.removeItem('vActive');
                    window.hideGlobalSpinner();
                    if (window.showPortalAnimation) window.showPortalAnimation('exit');
                    setTimeout(() => {
                        if (window.hidePortalAnimation) window.hidePortalAnimation();
                        window.checkVisitorSession();
                    }, 2000);
                } catch (e) { alert("Check-Out Failed: " + e.message); window.hideGlobalSpinner(); }
            };
        }
    } else {
        if (signInArea) signInArea.classList.remove('hidden');
        if (signOutArea) signOutArea.classList.add('hidden');
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

    vId.value = "Generating...";
    vDate.value = new Date().toLocaleDateString('en-US');
    if (vName) vName.value = '';
    if (vCompany) vCompany.value = '';
    if (vPurpose) vPurpose.value = '';
    if (contractorId) contractorId.value = '';

    const params = new URLSearchParams(window.location.search);
    const mobileFromUrl = params.get('mobile');
    if (vMobile) vMobile.value = mobileFromUrl || '';

    const mode = window.portalMode || 'visitor';
    await window.reservePortalToken(mode);
    if (mobileFromUrl && mobileFromUrl.length >= 8) window.handlePhoneLookup(mobileFromUrl);

    if (window.initVisitorCanvas) window.initVisitorCanvas();
};

window.isCanvasBlank = (id) => {
    if (window.sigPadManager) {
        const pad = window.sigPadManager.getPad(id);
        if (pad && pad.canvas) {
            return pad.isEmpty() || pad.canvas.toDataURL().length < 2000;
        }
    }
    return true;
};
