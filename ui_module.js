import { db, SHEETS_URL } from './firebase_config.js';
import { ref, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- NATIVE WEB PUSH VAPID KEY ---
const VAPID_PUBLIC_KEY = "BD-Nf6v276v47v8y5-v3p-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7";

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

// --- NATIVE WEB PUSH INITIALIZATION ---
(function initNativePush() {
    window.addEventListener('DOMContentLoaded', async () => {
        const diagId = document.getElementById('diag-push-id');
        const diagSW = document.getElementById('diag-sw-status');
        const notifModal = document.getElementById('notification-modal');

        // 1. REGISTER NATIVE SERVICE WORKER (sw.js)
        let swRegistration = null;
        if ('serviceWorker' in navigator) {
            try {
                // Clear any legacy workers
                const regs = await navigator.serviceWorker.getRegistrations();
                for (let r of regs) await r.unregister();

                swRegistration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
                if (diagSW) diagSW.innerText = "Active (sw.js Registered)";
            } catch (err) {
                if (diagSW) diagSW.innerText = "SW REG ERROR: " + err.message;
            }
        }

        // 2. VAPID SUBSCRIPTION HANDLER
        window.subscribeUserToPush = async () => {
            try {
                if (diagId) diagId.innerText = "REQUESTING PERMISSION...";
                const perm = await Notification.requestPermission();
                if (perm !== 'granted') throw new Error("Permission denied");

                if (!swRegistration) throw new Error("Service Worker not active");

                if (diagId) diagId.innerText = "GENERATING SUBSCRIPTION...";

                const urlBase64ToUint8Array = (base64String) => {
                    const padding = '='.repeat((4 - base64String.length % 4) % 4);
                    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
                    const rawData = window.atob(base64);
                    const outputArray = new Uint8Array(rawData.length);
                    for (let i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
                    return outputArray;
                };

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
                if (notifModal) notifModal.remove();

                new Notification("Jern Yafoor School", { body: "Native Notifications Enabled!", icon: "jys_Icon.png" });

            } catch (e) {
                if (diagId) diagId.innerText = "VAPID ERR: " + e.message;
            }
        };

        const submitBtn = document.getElementById('notification-submit-btn');
        if (submitBtn) submitBtn.onclick = window.subscribeUserToPush;

        // Check if already subscribed
        if (swRegistration) {
            const sub = await swRegistration.pushManager.getSubscription();
            if (sub && diagId) diagId.innerText = JSON.stringify(sub);
        }
    });
})();

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
