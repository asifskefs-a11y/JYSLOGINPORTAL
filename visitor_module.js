import { db } from './firebase_config.js';
import { ref, set } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- VISITOR SYSTEM ---
let vCanvas, vCtx;
window.initVisitorCanvas = () => {
    vCanvas = document.getElementById('v-sig-pad');
    if (!vCanvas) return;
    vCtx = vCanvas.getContext('2d');
    const getPos = (e) => { const rect = vCanvas.getBoundingClientRect(); return { x: (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left, y: (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top }; };
    const start = (e) => { vCtx.beginPath(); const p = getPos(e); vCtx.moveTo(p.x, p.y); };
    const move = (e) => { e.preventDefault(); const p = getPos(e); vCtx.lineTo(p.x, p.y); vCtx.stroke(); };
    vCanvas.addEventListener('mousedown', start); vCanvas.addEventListener('mousemove', (e) => { if(e.buttons==1) move(e); });
    vCanvas.addEventListener('touchstart', start, {passive: false}); vCanvas.addEventListener('touchmove', move, {passive: false});
    vCanvas.width = vCanvas.parentElement.offsetWidth;
    vCanvas.height = vCanvas.parentElement.offsetHeight;
    vCtx.lineWidth = 2; vCtx.strokeStyle = '#4f46e5';
};

window.clearVisitorSig = () => {
    if (vCtx) vCtx.clearRect(0, 0, vCanvas.width, vCanvas.height);
};

window.checkVisitorSession = () => {
    const active = localStorage.getItem('vActive');
    const signInArea = document.getElementById('v-signin-area');
    const signOutArea = document.getElementById('v-signout-area');
    if(active) {
        const data = JSON.parse(active);
        if (signInArea) signInArea.classList.add('hidden');
        if (signOutArea) {
            signOutArea.classList.remove('hidden');
            const activeName = document.getElementById('v-active-name');
            const activeId = document.getElementById('v-active-id');
            const activeTimeIn = document.getElementById('v-active-timein');
            if (activeName) activeName.innerText = data.name;
            if (activeId) activeId.innerText = data.id;
            if (activeTimeIn) activeTimeIn.innerText = data.timeIn;
        }
    } else {
        if (signInArea) signInArea.classList.remove('hidden');
        if (signOutArea) signOutArea.classList.add('hidden');
        window.initVisitorForm();
    }
};

window.initVisitorForm = () => {
    const vId = document.getElementById('v-id');
    const vDate = document.getElementById('v-date');
    if (!vId || !vDate) return;
    const now = new Date();
    vId.value = "VIS-" + Math.random().toString(36).substring(2, 7).toUpperCase();
    vDate.value = now.toLocaleDateString('en-US') + " " + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true});
    setTimeout(window.initVisitorCanvas, 50);
};
