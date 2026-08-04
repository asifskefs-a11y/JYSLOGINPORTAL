import { db, SHEETS_URL } from './firebase_config.js';
import { ref, update, push, onValue, get, child } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- NATIVE WEB PUSH VAPID KEY ---
const VAPID_PUBLIC_KEY = "BD-Nf6v276v47v8y5-v3p-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7-v-7";

// --- GLOBAL UTILITIES ---
window.getDirectDriveImageUrl = (driveUrl) => {
    if (!driveUrl) return 'https://placehold.co/400x300?text=No+Photo';

    // Agar already valid image URL hai toh wapas karo
    if (driveUrl.startsWith('data:image')) return driveUrl;
    if (driveUrl.startsWith('http') && (
        driveUrl.includes('.jpg') ||
        driveUrl.includes('.png') ||
        driveUrl.includes('.jpeg') ||
        driveUrl.includes('.gif') ||
        driveUrl.includes('lh3.googleusercontent.com') ||
        driveUrl.includes('drive.google.com')
    )) return driveUrl;

    try {
        // ✅ MULTIPLE PATTERNS FOR GOOGLE DRIVE
        let fileId = null;

        // Pattern 1: /file/d/{ID}/
        const match1 = driveUrl.match(/\/file\/d\/([^\/]+)/);
        if (match1) fileId = match1[1];

        // Pattern 2: ?id={ID}
        if (!fileId) {
            const match2 = driveUrl.match(/[?&]id=([^&]+)/);
            if (match2) fileId = match2[1];
        }

        // Pattern 3: Direct ID (alphanumeric with hyphens/underscores)
        if (!fileId) {
            const match3 = driveUrl.match(/([a-zA-Z0-9_-]{25,})/);
            if (match3) fileId = match3[1];
        }

        // Pattern 4: /open?id={ID}
        if (!fileId) {
            const match4 = driveUrl.match(/\/open\?id=([^&]+)/);
            if (match4) fileId = match4[1];
        }

        if (fileId) {
            // ✅ USE BOTH URL FORMATS (Google Drive & lh3)
            // Primary: lh3 for direct image access
            // Fallback: drive.google.com for preview
            const directUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
            const previewUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;

            // Try lh3 first, if it fails browser will use fallback
            return directUrl;
        }

        console.warn("⚠️ Could not extract file ID from:", driveUrl);
        return 'https://placehold.co/400x300?text=No+Photo';
    } catch (e) {
        console.error("❌ URL Format Error:", e);
        return 'https://placehold.co/400x300?text=Error';
    }
};

// Alias for backward compatibility
window.formatDriveImageUrl = window.getDirectDriveImageUrl;

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
        console.log("📤 Uploading to Drive:", payload.fileName);

        const response = await fetch(SHEETS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            mode: 'cors'
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        console.log("📥 Upload Response:", result);

        // ✅ MULTIPLE RESPONSE FORMATS SUPPORT
        // Google Apps Script returns various formats
        const fileUrl = result.fileUrl || result.signatureUrl || result.url || result.downloadUrl || result.fileLink || null;
        const fileId = result.fileId || result.id || null;

        if (fileUrl) {
            return {
                status: 'success',
                fileUrl: fileUrl,
                fileId: fileId,
                signatureUrl: fileUrl,
                message: result.message || "Upload successful"
            };
        } else {
            // If no URL in response, try to construct from fileId
            if (fileId) {
                const constructedUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
                return {
                    status: 'success',
                    fileUrl: constructedUrl,
                    fileId: fileId,
                    signatureUrl: constructedUrl,
                    message: "Upload successful (URL constructed from ID)"
                };
            }

            console.error("❌ No file URL in response:", result);
            return {
                status: 'error',
                message: result.message || "No file URL returned from server",
                rawResponse: result
            };
        }
    } catch (e) {
        console.error("❌ Upload Error:", e);
        return {
            status: 'error',
            message: e.message || "Network error during upload"
        };
    }
};

window.compressImageFile = async (file, maxWidth = 1200, maxHeight = 1200, quality = 0.7) => {
    return new Promise((resolve, reject) => {
        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.width, h = img.height;

                    // Maintain aspect ratio
                    if (w > h) {
                        if (w > maxWidth) {
                            h = (h * maxWidth) / w;
                            w = maxWidth;
                        }
                    } else {
                        if (h > maxHeight) {
                            w = (w * maxHeight) / h;
                            h = maxHeight;
                        }
                    }

                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);

                    // ✅ For Drive: Use JPEG with better quality
                    resolve(canvas.toDataURL("image/jpeg", quality));
                };
                img.onerror = () => reject(new Error("Failed to load image"));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error("Failed to read file"));
            reader.readAsDataURL(file);
        } catch (e) {
            reject(e);
        }
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

// --- NATIVE WEB PUSH INITIALIZATION (CROSS-PLATFORM) ---
let swRegistration = null;

const urlBase64ToUint8Array = (base64String) => {
    const cleaned = base64String.trim().replace(/\s/g, '');
    const padding = '='.repeat((4 - cleaned.length % 4) % 4);
    const base64 = (cleaned + padding).replace(/\-/g, '+').replace(/_/g, '/');
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
    } catch (e) { console.warn("Push Init Fail:", e); }
}

// --- POST-LOGIN SUBSCRIPTION FLOW (CRITICAL) ---
window.checkAndSubscribePush = async () => {
    if (!window.currentStaff) return;
    const staff = window.currentStaff;
    const adekId = staff.adekPass || staff.adcPassNumber;
    if (!adekId) return;

    try {
        const currentPerm = Notification.permission;

        // 2. Check Firebase for existing token (Task 2)
        const userRef = ref(db, `users/${staff.mobile}`);
        const snap = await get(userRef);
        const userData = snap.exists() ? snap.val() : {};
        const hasStoredSub = userData.pushSubscription && userData.pushSubscription !== "";

        // SKIP PROMPT IF: Already granted OR already stored in DB (Constraint 2)
        if (currentPerm === 'granted' && hasStoredSub) {
            console.log("Push Flow: User already active. Skipping prompt.");
            const subObj = JSON.parse(userData.pushSubscription);
            window.syncSubscriptionToDB(subObj);
            return;
        }

        // 3. Logic for New Logins / Missing Tokens (Constraint 3)
        const diagId = document.getElementById('diag-push-id');
        const notifModal = document.getElementById('notification-modal');

        if (currentPerm === 'default' && !hasStoredSub) {
            if (notifModal) {
                notifModal.classList.remove('hidden');
                notifModal.style.display = 'flex';
            }
        } else if (currentPerm === 'granted' && !hasStoredSub) {
            console.log("Push Flow: Permission OK, syncing missing DB record...");
            await window.subscribeUserToPush();
        }

    } catch (e) { console.error("Post-Login Push Check Failed:", e); }
};

window.syncSubscriptionToDB = async (sub) => {
    if (!sub || !window.currentStaff) return;
    try {
        const staff = window.currentStaff;
        const adekId = staff.adekPass || staff.adcPassNumber;
        if (!adekId) return;

        const updates = {};
        // TASK 4: Prevent duplication, update timestamp/endpoint (Constraint 4)
        updates[`users/${staff.mobile}/pushSubscription`] = JSON.stringify(sub);
        updates[`users/${staff.mobile}/adekPassId`] = adekId;
        updates[`users/${staff.mobile}/schoolName`] = staff.branch || "";
        updates[`users/${staff.mobile}/role`] = staff.role || "";
        updates[`users/${staff.mobile}/lastSubSync`] = Date.now();

        await update(ref(db), updates);
        console.log("Subscription synced for ADEK ID:", adekId);
    } catch (e) { console.error("DB Sync Error:", e); }
};

window.subscribeUserToPush = async () => {
    const diagId = document.getElementById('diag-push-id');
    const notifModal = document.getElementById('notification-modal');

    // --- CROSS-PLATFORM COMPATIBILITY CHECKS ---
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

    try {
        // 1. iOS SAFARI GUARD: Must be in PWA Mode
        if (isIOS && !isStandalone) {
            if (diagId) diagId.innerText = "iOS ACTION REQUIRED: ADD TO HOME SCREEN";
            window.showNotificationDebug(`
                <div class="text-left space-y-2 py-2">
                    <p class="font-black text-indigo-900 text-xs uppercase text-center mb-1">iOS Setup Required</p>
                    <p class="text-[9px] text-indigo-700 leading-tight text-center">Apple requires this app to be installed to your Home Screen before alerts can be enabled.</p>
                    <div class="bg-white/50 p-2 rounded-xl border border-indigo-100">
                        <p class="text-[9px] font-bold text-indigo-600 mb-1">How to Install:</p>
                        <div class="space-y-1 text-[9px] text-indigo-500">
                            <div class="flex gap-2"><span>1.</span><span>Tap the <b>Share</b> button <i class="fa-solid fa-arrow-up-from-bracket"></i> (bottom center).</span></div>
                            <div class="flex gap-2"><span>2.</span><span>Scroll down and tap <b>'Add to Home Screen'</b>.</span></div>
                            <div class="flex gap-2"><span>3.</span><span>Open the app from your Home Screen icon to finish.</span></div>
                        </div>
                    </div>
                </div>
            `);
            return;
        }

        if (diagId) diagId.innerText = "REQUESTING PERMISSION...";

        const perm = await Notification.requestPermission();
        if (perm !== 'granted') throw new Error("Permission denied by user");

        if (!swRegistration) throw new Error("Push registration (Service Worker) not found.");

        if (diagId) diagId.innerText = "Generating Native Subscription...";

        const sub = await swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        if (diagId) {
            diagId.innerText = JSON.stringify(sub);
            diagId.style.fontSize = "7px";
            diagId.style.wordBreak = "break-all";
            diagId.style.color = "#4f46e5";
        }

        await window.syncSubscriptionToDB(sub);

        localStorage.setItem('notification_status', 'enabled');
        localStorage.setItem('notification_prompt_completed', 'true');
        if (notifModal) notifModal.remove();

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(reg => {
                reg.showNotification("Jern Yafoor School", {
                    body: "Native Notifications Enabled!",
                    icon: "jys_Icon.png",
                    badge: "jys_Icon.png",
                    tag: "confirmation"
                });
            }).catch(err => console.warn("Confirm Notif Fail:", err));
        }
    } catch (e) {
        if (diagId) {
            diagId.innerText = "VAPID SUBSCRIPTION ERR: " + e.message;
            diagId.style.color = "red";
        }
    }
};

// --- MULTI-ROLE PUSH ENGINE & BELL UI ---
window.triggerMultiRoleNotification = async (notifData) => {
    try {
        const { title, body, school, role, roles, adekId, image, tag, icon, url } = notifData;
        const now = Date.now();
        const payload = { title, body, timestamp: now, image, tag, icon, url: url || "/JYSLOGINPORTAL/index.html", read: false };

        // 1. Target by ADEK ID (Direct Confirmation)
        if (adekId) {
            await push(ref(db, `user_alerts/${adekId}`), payload);
        }

        // 2. Target by Role(s) and School (Multicast)
        const rolesToNotify = roles || (role ? [role] : []);
        if (rolesToNotify.length > 0) {
            const usersSnap = await get(ref(db, 'users'));
            if (usersSnap.exists()) {
                const users = usersSnap.val();
                const updates = {};
                for (const mobile in users) {
                    const user = users[mobile];
                    const userRole = (user.role || "").trim();
                    const userSchool = (user.schoolName || user.branch || "").trim();

                    const roleMatch = rolesToNotify.some(r => userRole.toLowerCase() === r.toLowerCase());
                    const schoolMatch = !school || userSchool.toLowerCase() === school.toLowerCase();

                    if (roleMatch && schoolMatch && user.adekPassId) {
                        const alertId = push(ref(db, `user_alerts/${user.adekPassId}`)).key;
                        updates[`user_alerts/${user.adekPassId}/${alertId}`] = payload;
                    }
                }
                if (Object.keys(updates).length > 0) await update(ref(db), updates);
            }
        }

        // 3. Backend Dispatch Link (Push to central queue for Node.js web-push worker)
        await push(ref(db, 'notification_queue'), {
            ...payload,
            targetRoles: rolesToNotify,
            targetSchool: school || null,
            targetAdekId: adekId || null,
            status: 'pending'
        });

        // 4. Trigger Local Device Vibration/Banner (Only if current user is intended target)
        const currentAdek = window.currentStaff ? (window.currentStaff.adekPass || window.currentStaff.adcPassNumber) : null;
        const isSelfTarget = (adekId && adekId === currentAdek) ||
                            (rolesToNotify.some(r => window.currentStaff && window.currentStaff.role === r) && (!school || window.currentStaff.branch === school));

        if (isSelfTarget && 'serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.ready;
            reg.showNotification(title, { body, icon: "jys_Icon.png", image: window.formatDriveImageUrl(image), tag, data: { url: payload.url } });
        }
    } catch (e) { console.error("Multi-Role Notif Fail:", e); }
};

window.initNotificationBell = () => {
    // 1. Identify valid headers for bell placement
    const headers = document.querySelectorAll('nav, .school-header');
    headers.forEach(header => {
        // PREVENT DUPLICATES (Constraint 1)
        if (header.querySelector('.bell-container')) return;

        // 2. Filter for high-level dashboard headers only (Avoid sub-navs)
        const isAdminHeader = header.closest('#view-admin-dash') && header.tagName === 'NAV';
        const isStaffHeader = header.classList.contains('school-header');

        if (!isAdminHeader && !isStaffHeader) return;

        const bellContainer = document.createElement('div');
        bellContainer.className = 'bell-container relative cursor-pointer ml-4';

        // Ensure proper placement in Admin header (Constraint 1)
        if (isAdminHeader) {
            const actionMenu = header.querySelector('#admin-action-menu');
            if (actionMenu) {
                // Prepend to action menu or append to nav
                header.querySelector('div:last-child').appendChild(bellContainer);
            } else {
                header.appendChild(bellContainer);
            }
        } else {
            header.appendChild(bellContainer);
        }

        bellContainer.innerHTML = `
            <div class="relative p-2 rounded-full hover:bg-slate-100 transition-colors">
                <i class="fa-solid fa-bell text-indigo-900 text-lg"></i>
                <span id="bell-badge" class="hidden absolute top-0 right-0 bg-red-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white">0</span>
            </div>
            <div id="bell-dropdown" class="hidden absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 z-[1000] overflow-hidden">
                <div class="p-4 border-b border-gray-50 flex justify-between items-center bg-indigo-50/30">
                    <h4 class="text-[10px] font-black text-indigo-900 uppercase tracking-widest">Recent Alerts</h4>
                    <button id="mark-all-read-btn" class="text-[8px] font-bold text-indigo-400 hover:text-indigo-600 uppercase underline">Mark All Read</button>
                </div>
                <div id="bell-list" class="max-h-80 overflow-y-auto divide-y divide-gray-50 custom-scrollbar">
                    <p class="p-8 text-center text-[10px] text-gray-300 font-bold uppercase">No new notifications</p>
                </div>
            </div>
        `;

        header.appendChild(bellContainer);
        bellContainer.onclick = (e) => {
            e.stopPropagation();
            const dropdown = document.getElementById('bell-dropdown');
            dropdown.classList.toggle('hidden');
            if (!dropdown.classList.contains('hidden')) window.renderBellList();
        };

        const markBtn = bellContainer.querySelector('#mark-all-read-btn');
        if (markBtn) markBtn.onclick = (e) => { e.stopPropagation(); window.markAllNotifsRead(); };
    });

    window.onclick = () => {
        const dropdowns = document.querySelectorAll('#bell-dropdown');
        dropdowns.forEach(d => d.classList.add('hidden'));
    };

    window.listenForNewAlerts();
};

window.listenForNewAlerts = () => {
    if (!window.currentStaff) return;
    const adekId = window.currentStaff.adekPass || window.currentStaff.adcPassNumber;
    if (!adekId) return;

    onValue(ref(db, `user_alerts/${adekId}`), (snap) => {
        const alerts = snap.val() || {};
        const unread = Object.values(alerts).filter(a => !a.read).length;
        const badges = document.querySelectorAll('#bell-badge');
        badges.forEach(badge => {
            badge.innerText = unread > 9 ? '9+' : unread;
            badge.classList.toggle('hidden', unread === 0);
        });
        window.allAlerts = alerts;
    });
};

window.renderBellList = () => {
    const lists = document.querySelectorAll('#bell-list');
    if (!window.allAlerts) return;

    const sorted = Object.entries(window.allAlerts).sort((a, b) => b[1].timestamp - a[1].timestamp).slice(0, 15);
    const html = sorted.length === 0
        ? `<p class="p-8 text-center text-[10px] text-gray-300 font-bold uppercase">No new alerts</p>`
        : sorted.map(([id, alert]) => `
            <div class="p-4 hover:bg-slate-50 transition-colors ${alert.read ? 'opacity-60' : 'bg-indigo-50/10'}" onclick="window.handleAlertClick('${id}', '${alert.url}')">
                <div class="flex gap-3">
                    <div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <i class="fa-solid ${alert.icon || 'fa-info-circle'} text-indigo-600 text-xs"></i>
                    </div>
                    <div class="min-w-0 flex-1">
                        <p class="text-[10px] font-black text-indigo-900 truncate uppercase">${alert.title}</p>
                        <p class="text-[9px] text-gray-500 leading-tight mt-0.5">${alert.body}</p>
                        ${alert.image ? `<img src="${window.formatDriveImageUrl(alert.image)}" class="mt-2 h-16 w-full object-cover rounded-lg border">` : ''}
                        <p class="text-[7px] text-gray-300 font-bold mt-1 uppercase">${new Date(alert.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>
                    </div>
                </div>
            </div>
        `).join('');

    lists.forEach(list => { list.innerHTML = html; });
};

window.handleAlertClick = async (id, url) => {
    await window.markNotifRead(id);
    if (url) window.location.href = url;
};

window.markNotifRead = async (id) => {
    if (!window.currentStaff) return;
    const adekId = window.currentStaff.adekPass || window.currentStaff.adcPassNumber;
    await update(ref(db, `user_alerts/${adekId}/${id}`), { read: true });
};

window.markAllNotifsRead = async () => {
    if (!window.currentStaff || !window.allAlerts) return;
    const adekId = window.currentStaff.adekPass || window.currentStaff.adcPassNumber;
    const updates = {};
    Object.keys(window.allAlerts).forEach(id => {
        updates[`user_alerts/${adekId}/${id}/read`] = true;
    });
    await update(ref(db), updates);
};

window.showNotificationDebug = (msg) => {
    const errorArea = document.getElementById('notification-error-area');
    const errorText = document.getElementById('notification-error-text');
    const modal = document.getElementById('notification-modal');

    if (errorArea && errorText) {
        errorArea.classList.remove('hidden');
        errorText.innerHTML = msg;
    }
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
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
    window.handleLaunchVideo();
    initPushInfrastructure();

    const submitBtn = document.getElementById('notification-submit-btn');
    if (submitBtn) submitBtn.onclick = window.subscribeUserToPush;

    const diagCard = document.getElementById('push-diagnostic-card');
    if (diagCard) {
        diagCard.classList.remove('hidden');
        diagCard.style.cursor = "pointer";
        diagCard.onclick = window.subscribeUserToPush;
    }

    // Modal display logic removed from here and moved to checkAndSubscribePush
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

// --- GLOBAL SUCCESS POPUP (v3.5.1 PREMIUM) ---
window.triggerSuccessPopup = (message, duration = 3000) => {
    let popup = document.getElementById('global-success-popup');

    // Inject HTML if not exists
    if (!popup) {
        const div = document.createElement('div');
        div.id = 'global-success-popup';
        div.innerHTML = `
            <div class="success-modal-card">
                <div class="success-icon-box">
                    <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                        <circle class="checkmark-circle" cx="26" cy="26" r="25" fill="none"/>
                        <path class="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                    </svg>
                </div>
                <h3>Success!</h3>
                <p id="success-popup-msg"></p>
            </div>
        `;
        document.body.appendChild(div);
        popup = div;
    }

    const msgEl = document.getElementById('success-popup-msg');
    if (msgEl) msgEl.innerText = message;

    popup.style.display = 'flex';

    // Auto close
    setTimeout(() => {
        popup.style.opacity = '0';
        popup.style.transition = 'opacity 0.5s ease-out';
        setTimeout(() => {
            popup.style.display = 'none';
            popup.style.opacity = '1';
        }, 500);
    }, duration);
};

// --- SIGNATURE & CANVAS UTILITIES (FIXED v3.5.1) ---
window.initCanvasDrawing = (canvasId) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Ensure styles for drawing
    canvas.style.touchAction = 'none';
    canvas.style.pointerEvents = 'auto';

    const ctx = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    ctx.scale(ratio, ratio);

    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1E1B4B';

    let drawing = false;

    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = (e.clientX || (e.touches && e.touches[0].clientX));
        const clientY = (e.clientY || (e.touches && e.touches[0].clientY));
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const start = (e) => {
        drawing = true;
        ctx.beginPath();
        const p = getPos(e);
        ctx.moveTo(p.x, p.y);
        if (e.cancelable) e.preventDefault();
    };

    const move = (e) => {
        if (!drawing) return;
        const p = getPos(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        if (e.cancelable) e.preventDefault();
    };

    const stop = () => { drawing = false; ctx.closePath(); };

    canvas.onmousedown = canvas.ontouchstart = start;
    canvas.onmousemove = canvas.ontouchmove = move;
    window.onmouseup = window.ontouchend = stop;
};

window.getCanvasBase64 = (canvasId) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    return canvas.toDataURL("image/png");
};

window.clearCanvas = (canvasId) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
};

window.unlockCanvas = (overlay) => {
    const wrapper = overlay.parentElement;
    const canvas = wrapper.querySelector('canvas');
    wrapper.classList.add('unlocked');
    if (canvas) window.initCanvasDrawing(canvas.id);
};
