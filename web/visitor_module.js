import { visitorLookup, visitorCheckOut, apiErrorMessage } from './visitor_api.js';

/**
 * VISITOR SYSTEM CORE (v5.0 - Phase 2)
 * ---------------------------------------------------------------
 * Changes vs v4.0:
 *  - No direct database access: lookup / check-out go through Cloud Functions
 *  - Phone lookup is debounced (was firing a DB query on every keystroke)
 *    and ignores out-of-date responses
 *  - Mobile numbers are compared in normalised form on the server
 *  - Check-out uses SERVER time; key-holding visitors must confirm their PIN
 *  - Removed dead code (token reservation timers, unused date helper)
 */

const digitsOnly = (v) => String(v || '').replace(/\D/g, '');
const spin = (m) => window.showGlobalSpinner && window.showGlobalSpinner(m);
const unspin = () => window.hideGlobalSpinner && window.hideGlobalSpinner();
const modeName = () => ((window.portalMode || 'visitor').toLowerCase().includes('contractor') ? 'contractor' : 'visitor');

/** 1. PLACEHOLDERS (real sequence number is assigned by the server on confirm) */
window.reservePortalToken = async function (mode = 'visitor') {
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode') || window.portalMode || mode;
    const prefix = modeParam.toLowerCase().includes('contractor') ? 'JYSC' : 'JYSV';

    const vId = document.getElementById('v-id');
    const badgeEl = document.getElementById('contractor-token-badge');
    const vDate = document.getElementById('v-date');

    if (vDate) vDate.value = new Date().toLocaleDateString('en-US'); // display only
    if (localStorage.getItem('vActive')) return;

    if (vId) vId.value = `${prefix}---`;
    if (badgeEl) badgeEl.innerText = 'TOKEN #--';
};

/** 2. ACTIVE-STAY EVALUATION (debounced, stale-response safe) */
let lookupSeq = 0;
let lookupTimer = null;

async function runPhoneLookup(enteredMobile) {
    const cleanMobile = String(enteredMobile || '').trim();
    if (digitsOnly(cleanMobile).length < 8) return;

    const mySeq = ++lookupSeq;
    const mode = modeName();

    try {
        const { active, lastProfile } = await visitorLookup(mode, cleanMobile);
        if (mySeq !== lookupSeq) return; // user kept typing - ignore this answer

        if (active) {
            // SCENARIO A: currently inside -> switch to check-out view.
            // Keep the PIN if THIS device checked the visitor in earlier.
            let previous = null;
            try { previous = JSON.parse(localStorage.getItem('vActive') || 'null'); } catch (_) { /* ignore */ }
            const keepPin = previous && previous.firebaseKey === active.firebaseKey ? previous : {};
            localStorage.setItem('vActive', JSON.stringify({ ...keepPin, ...active, mobile: cleanMobile, mode }));
            window.checkVisitorSession();
        } else {
            // SCENARIO B: no active stay -> fresh check-in form
            if (localStorage.getItem('vActive')) {
                localStorage.removeItem('vActive');
                window.checkVisitorSession();
            }
            window.autoFillVisitorForm(lastProfile || { name: '', company: '', contractorId: '' });
        }
    } catch (err) {
        console.warn('Lookup failed:', err && err.code, err && err.message);
        // Silent for the user while typing; real errors surface on submit.
    }
}

window.handlePhoneLookup = (enteredMobile) => {
    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(() => runPhoneLookup(enteredMobile), 600);
};

window.autoFillVisitorForm = (profile) => {
    const vName = document.getElementById('v-name');
    const vCompany = document.getElementById('v-company');
    const contractorId = document.getElementById('contractorId');

    if (vName) vName.value = profile.name || '';
    if (vCompany) vCompany.value = profile.company || '';
    if (contractorId) contractorId.value = profile.contractorId || '';

    if (profile.name || profile.company) {
        [vName, vCompany, contractorId].forEach((el) => {
            if (el && el.value) {
                el.style.backgroundColor = '#EEF2FF';
                setTimeout(() => { el.style.backgroundColor = ''; }, 1500);
            }
        });
    }
};

/** 3. SESSION VIEW (sign-in form  <->  sign-out card) */
window.checkVisitorSession = () => {
    const active = localStorage.getItem('vActive');
    const signInArea = document.getElementById('v-signin-area');
    const signOutArea = document.getElementById('v-signout-area');
    const signOutBtn = document.getElementById('v-signout-btn');

    if (!active) {
        if (signInArea) signInArea.classList.remove('hidden');
        if (signOutArea) signOutArea.classList.add('hidden');
        window.initVisitorForm();
        return;
    }

    let data;
    try { data = JSON.parse(active); } catch (_) { localStorage.removeItem('vActive'); return window.checkVisitorSession(); }

    if (signInArea) signInArea.classList.add('hidden');
    if (signOutArea) {
        signOutArea.classList.remove('hidden');
        const setText = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
        setText('v-active-name', data.name || data.fullName || 'Visitor');
        setText('v-active-id', data.id || '-');
        setText('v-active-timein', data.timeIn || '-');
        setText('v-active-pin', data.checkoutPin || data.keyReturnPin || '----');
        const badgeEl = document.getElementById('contractor-token-badge');
        if (badgeEl) badgeEl.innerText = `TOKEN #${data.tokenNumber || '--'}`;
    }

    if (signOutBtn) {
        signOutBtn.onclick = async () => {
            if (signOutBtn.disabled) return;
            signOutBtn.disabled = true;
            spin('Logging Departure...');
            try {
                const mode = data.mode === 'contractor' ? 'contractor' : 'visitor';
                let pin = data.checkoutPin || data.keyReturnPin || '';
                try {
                    await visitorCheckOut(mode, data.mobile, pin);
                } catch (err) {
                    // Visitor is holding a key and this device doesn't know the PIN
                    if (err && err.code === 'functions/failed-precondition') {
                        unspin();
                        pin = (window.prompt('Enter the Key PIN you received at check-in:') || '').trim();
                        if (!pin) throw new Error('PIN is required to check out while holding a key.');
                        spin('Logging Departure...');
                        await visitorCheckOut(mode, data.mobile, pin);
                    } else {
                        throw err;
                    }
                }

                localStorage.removeItem('vActive');
                unspin();
                if (window.showPortalAnimation) window.showPortalAnimation('exit');
                setTimeout(() => {
                    if (window.hidePortalAnimation) window.hidePortalAnimation();
                    window.checkVisitorSession();
                }, 2000);
            } catch (e) {
                unspin();
                alert('Check-Out Failed: ' + (e && e.code ? apiErrorMessage(e) : e.message));
            } finally {
                signOutBtn.disabled = false;
            }
        };
    }
};

/** 4. FORM INIT */
window.initVisitorForm = async () => {
    const vId = document.getElementById('v-id');
    const vDate = document.getElementById('v-date');
    if (!vId || !vDate) return;

    const clear = (id) => { const el = document.getElementById(id); if (el) el.value = ''; };
    vId.value = 'Generating...';
    vDate.value = new Date().toLocaleDateString('en-US');
    ['v-name', 'v-company', 'v-purpose', 'contractorId'].forEach(clear);

    const mobileFromUrl = new URLSearchParams(window.location.search).get('mobile');
    const vMobile = document.getElementById('v-mobile');
    if (vMobile) vMobile.value = mobileFromUrl || '';

    await window.reservePortalToken(window.portalMode || 'visitor');
    if (mobileFromUrl && digitsOnly(mobileFromUrl).length >= 8) runPhoneLookup(mobileFromUrl);

    if (window.initVisitorCanvas) window.initVisitorCanvas();
};

/** 5. SIGNATURE BLANK CHECK */
window.isCanvasBlank = (id) => {
    const pad = window.sigPadManager && window.sigPadManager.getPad(id);
    if (!pad) return true;
    if (typeof pad.isEmpty === 'function') return pad.isEmpty();
    return !pad.canvas || pad.canvas.toDataURL().length < 2000;
};
