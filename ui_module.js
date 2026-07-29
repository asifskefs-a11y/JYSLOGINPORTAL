import { db, SHEETS_URL } from './firebase_config.js';
import { ref, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- NATIVE WEB PUSH VAPID KEY ---
// Structurally Valid P-256 Public Key (Starts with 0x04)
const VAPID_PUBLIC_KEY = "BJm7_Q1_p9-8n7p7Z5G8_v5_A3-z9Q7N8z9V7W9X9Y9Z9A9B9C9D9E9F9G9H9I9J9K9L9M9N9O9P9Q9R9S9T9U1V2W3";

// --- GLOBAL UTILITIES ---
window.formatDriveImageUrl = (driveUrl) => {
    if (!driveUrl) return null;
    if (driveUrl.startsWith('data:image')) return driveUrl;
    try {
        const idMatch = driveUrl.match(/\/file\/d\/([^\/]+)/) || driveUrl.match(/[?&]id=([^&]+)/) || driveUrl.match(/[-\w]{25,}/);
        if (idMatch) {
            const fileId = Array.isArray(idMatch) ? (idMatch[1] || idMatch[0]) : idMatch;
            return `https://lh3.googleusercontent.com/d/${fileId}`;
        }
    } catch (e) { console.error(e); }
    return driveUrl;
};

window.getDirectDriveImageUrl = (driveUrl) => {
    return window.formatDriveImageUrl(driveUrl) || 'https://placehold.co/400x300?text=No+Photo';
};

window.handleProfilePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const avatar = document.getElementById('userAvatar');
    const originalContent = avatar.innerHTML;
    avatar.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-white"></i>';
    try {
        const base64 = await window.compressImageFile(file, 500, 500, 0.7);
        const staff = window.currentStaff;
        const payload = { type: 'active_asset', folderType: 'Staff_Profile_Photos', fileName: `Profile_${staff.mobile}.jpg`, image: base64 };
        const res = await window.uploadToDrive(payload);
        if (res.status === 'success') {
            const updates = { profilePicUrl: res.fileUrl || res.signatureUrl };
            await update(ref(db, 'staff/' + staff.mobile), updates);
            await update(ref(db, 'users/' + staff.mobile), updates);
            location.reload();
        }
    } catch (err) { alert(err.message); avatar.innerHTML = originalContent; }
};

window.uploadToDrive = async (payload) => {
    try {
        const response = await fetch(SHEETS_URL, { method: 'POST', body: JSON.stringify(payload), mode: 'cors' });
        return await response.json();
    } catch (e) { return { status: 'error', message: e.message }; }
};

window.compressImageFile = async (file, maxWidth = 1200, maxHeight = 1200, quality = 0.7) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > h) { if (w > maxWidth) { h *= maxWidth / w; w = maxWidth; } }
                else { if (h > maxHeight) { w *= maxHeight / h; h = maxHeight; } }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL("image/jpeg", quality));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
};

window.openImageZoom = (url) => { if(!url || url.includes('placeholder')) return; window.open(url, '_blank'); };

// --- APP LAUNCH VIDEO LOGIC (NON-BLOCKING) ---
window.handleLaunchVideo = () => {
    const overlay = document.getElementById('launchVideoOverlay');
    const video = document.getElementById('appLaunchVideo');
    const skipBtn = document.getElementById('skipVideoBtn');

    if (!overlay || !video) return;

    if (sessionStorage.getItem('videoPlayedThisSession') === 'true') {
        overlay.remove();
        return;
    }

    overlay.classList.remove('hidden');
    overlay.classList.add('flex');

    const hideOverlay = () => {
        sessionStorage.setItem('videoPlayedThisSession', 'true');
        overlay.classList.add('opacity-0');
        setTimeout(() => overlay.remove(), 1000);
    };

    video.onended = hideOverlay;
    if (skipBtn) skipBtn.onclick = hideOverlay;

    video.play().catch(() => hideOverlay());
};

// --- NATIVE WEB PUSH INITIALIZATION (ASYNC & NON-BLOCKING) ---
let swRegistration = null;

const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
    return outputArray;
};

async function initPushInfrastructure() {
    if (!('serviceWorker' in navigator)) return;
    try {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (let r of regs) {
            if (r.active && (r.active.scriptURL.includes('OneSignal') || !r.scope.includes('/JYSLOGINPORTAL/'))) {
                await r.unregister();
            }
        }
        swRegistration = await navigator.serviceWorker.register('./sw.js', { scope: './' });

        const diagSW = document.getElementById('diag-sw-status');
        if (diagSW) diagSW.innerText = "Active (sw.js Registered)";

        const sub = await swRegistration.pushManager.getSubscription();
        if (sub) {
            const diagId = document.getElementById('diag-push-id');
            if (diagId) {
                diagId.innerText = JSON.stringify(sub);
                diagId.style.fontSize = "7px";
                diagId.style.wordBreak = "break-all";
            }
            localStorage.setItem('notification_status', 'enabled');
        }
    } catch (e) { console.warn("Push Init Fail:", e); }
}

window.subscribeUserToPush = async () => {
    const diagId = document.getElementById('diag-push-id');
    const notifModal = document.getElementById('notification-modal');

    try {
        if (diagId) diagId.innerText = "REQUESTING PERMISSION...";

        // SAFARI COMPLIANCE: Direct call in click handler
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') throw new Error("Permission denied");

        if (!swRegistration) throw new Error("Service Worker not active");

        if (diagId) diagId.innerText = "Generating Native Subscription...";

        const sub = await swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        if (diagId) {
            diagId.innerText = JSON.stringify(sub);
            diagId.style.fontSize = "7px";
            diagId.style.wordBreak = "break-all";
        }

        localStorage.setItem('notification_status', 'enabled');
        localStorage.setItem('notification_prompt_completed', 'true');
        if (notifModal) notifModal.remove();

        new Notification("Jern Yafoor School", { body: "Native Notifications Enabled!", icon: "jys_Icon.png" });
    } catch (e) {
        if (diagId) diagId.innerText = "VAPID ERR: " + e.message;
    }
};

window.dismissNotificationModal = () => {
    localStorage.setItem('notification_status', 'dismissed');
    localStorage.setItem('notification_prompt_completed', 'true');
    const modal = document.getElementById('notification-modal');
    if (modal) modal.remove();
};

// --- INITIALIZATION GATE ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Reveal UI Immediately
    window.handleLaunchVideo();

    // 2. Initialize Push in Background
    initPushInfrastructure();

    // 3. Bind UI Events
    const submitBtn = document.getElementById('notification-submit-btn');
    if (submitBtn) submitBtn.onclick = window.subscribeUserToPush;

    const diagCard = document.getElementById('push-diagnostic-card');
    if (diagCard) {
        diagCard.classList.remove('hidden');
        diagCard.style.cursor = "pointer";
        diagCard.onclick = window.subscribeUserToPush;
    }

    const notifModal = document.getElementById('notification-modal');
    const status = localStorage.getItem('notification_prompt_completed') || localStorage.getItem('notification_status');
    if (notifModal && (status === 'enabled' || status === 'dismissed' || status === 'true')) {
        notifModal.remove();
    } else if (notifModal && Notification.permission !== 'default') {
        notifModal.remove();
    } else if (notifModal) {
        setTimeout(() => {
            if (Notification.permission === 'default' && !localStorage.getItem('notification_prompt_completed')) {
                const currentModal = document.getElementById('notification-modal');
                if (currentModal) {
                    currentModal.classList.remove('hidden');
                    currentModal.style.display = 'flex';
                }
            }
        }, 3000);
    }
});

// --- GLOBAL NAVIGATION ---
window.showView = (viewId) => {
    try {
        const pageMap = { 'view-landing': 'index.html', 'view-visitor': 'visitor.html', 'view-staff': 'staff-login.html', 'view-admin-auth': 'admin.html', 'view-admin-dash': 'admin.html' };
        if (pageMap[viewId] && !window.location.pathname.includes(pageMap[viewId])) { window.location.href = pageMap[viewId]; return; }
        document.querySelectorAll('.view-section').forEach(s => { s.classList.remove('active'); s.classList.add('hidden'); s.style.display = 'none'; });
        const target = document.getElementById(viewId);
        if (target) { target.classList.remove('hidden'); target.classList.add('active'); target.style.display = 'flex'; }
        window.scrollTo(0, 0);
    } catch (e) { console.error(e); }
};
