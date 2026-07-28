import { db, SHEETS_URL } from './firebase_config.js';
import { ref, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- GLOBAL UTILITIES ---
window.formatDriveImageUrl = (driveUrl) => {
    if (!driveUrl) return null;

    // If it's already a base64 string, return as is
    if (driveUrl.startsWith('data:image')) return driveUrl;

    try {
        // Extract ID from various formats
        const idMatch = driveUrl.match(/\/file\/d\/([^\/]+)/) ||
                        driveUrl.match(/[?&]id=([^&]+)/) ||
                        driveUrl.match(/[-\w]{25,}/);

        if (idMatch) {
            const fileId = Array.isArray(idMatch) ? (idMatch[1] || idMatch[0]) : idMatch;
            return `https://lh3.googleusercontent.com/d/${fileId}`;
        }
    } catch (e) {
        console.error("URL Format Error:", e);
    }

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
        const passNum = staff.adcPassNumber || staff.adekPass || "NOPASS";
        const cleanName = (staff.name || "Unknown").replace(/\s+/g, '_');

        const payload = {
            type: 'active_asset', // Using existing route logic for images
            folderType: 'Staff_Profile_Photos',
            fileName: `Profile_${passNum}_${cleanName}.jpg`,
            image: base64
        };

        const res = await window.uploadToDrive(payload);
        if (res.status === 'success' && (res.fileUrl || res.signatureUrl)) {
            const fileUrl = res.fileUrl || res.signatureUrl;
            const directUrl = window.formatDriveImageUrl(fileUrl);

            // Save to Firebase
            const updates = { profilePicUrl: fileUrl };
            await update(ref(db, 'staff/' + staff.mobile), updates);
            await update(ref(db, 'users/' + staff.mobile), updates);

            // Update local state and UI
            staff.profilePicUrl = fileUrl;
            localStorage.setItem('loggedStaff', JSON.stringify(staff));

            // Instant UI Render with fallback
            const initials = (staff.name || "JY").split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
            avatar.innerHTML = `
                <span class="avatar-initials">${initials}</span>
                <img src="${directUrl}" referrerpolicy="no-referrer" class="profile-img-circle absolute inset-0 w-full h-full object-cover rounded-full" style="display:block;" onerror="this.style.display='none'">
            `;
            alert("Profile photo updated!");
        } else {
            throw new Error(res.message || "Upload failed");
        }
    } catch (err) {
        alert("Upload error: " + err.message);
        avatar.innerHTML = originalContent;
    }
};

window.uploadToDrive = async (payload) => {
    // Retry logic for slow internet
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            attempt++;
            const type = payload.type || 'task_photo';
            if (type === 'active_asset' || type === 'disposed_asset') {
                payload.folderType = type;
            }
            payload.type = type;

            const controller = new AbortController();
            // 60-second timeout for very slow networks
            const timeoutId = setTimeout(() => controller.abort(), 60000);

            const response = await fetch(SHEETS_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
                mode: 'cors',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const result = await response.json();
            console.log("UPLOAD_DEBUG", `Attempt ${attempt} Result: ` + JSON.stringify(result));

            if (result.status === 'success' || result.fileUrl || result.signatureUrl) {
                return result;
            } else {
                console.error("UPLOAD_ERROR", "Server reported failure:", result.message || "Unknown reason");
                throw new Error(result.message || "Server reported failure");
            }
        } catch (e) {
            console.error("UPLOAD_CRITICAL", `Critical error during upload attempt ${attempt}:`, e);
            if (attempt >= maxRetries) {
                return { status: 'error', message: "Poor connection or server error: " + e.message };
            }
            // Wait 2 seconds before retrying
            await new Promise(res => setTimeout(res, 2000));
        }
    }
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

// --- APP LAUNCH VIDEO LOGIC (Session-Based Persistence Version) ---
const handleLaunchVideo = () => {
    const overlay = document.getElementById('launchVideoOverlay');
    const video = document.getElementById('appLaunchVideo');
    const skipBtn = document.getElementById('skipVideoBtn');

    if (!overlay || !video) return;

    // Use sessionStorage for per-tab persistence (replays on fresh link/QR)
    if (sessionStorage.getItem('videoPlayedThisSession') === 'true') {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
        overlay.remove(); // Clean up instantly
        return;
    }

    // New Session: Prepare and Show
    overlay.classList.remove('hidden');
    overlay.classList.add('flex'); // Enable layout

    const hideOverlay = () => {
        // Set session flag so it won't replay while navigating
        sessionStorage.setItem('videoPlayedThisSession', 'true');
        overlay.classList.add('fade-out');
        setTimeout(() => {
            overlay.style.display = 'none';
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 1000);
    };

    // Native ended event for local playback
    video.onended = hideOverlay;

    if (skipBtn) {
        skipBtn.onclick = hideOverlay;
    }

    // Trigger Play
    video.play().catch(err => {
        console.warn("Autoplay restriction:", err);
        // If browser blocks autoplay (e.g., battery saver), dismiss overlay to avoid blank screen
        hideOverlay();
    });
};

// Initialize if on landing page
if (document.getElementById('launchVideoOverlay')) {
    window.addEventListener('DOMContentLoaded', handleLaunchVideo);
}

// --- GLOBAL NAVIGATION ---
window.showView = (viewId) => {
    try {
        const pageMap = {
            'view-landing': 'index.html',
            'view-visitor': 'visitor.html',
            'view-staff': 'staff-login.html',
            'view-admin-auth': 'admin.html',
            'view-admin-dash': 'admin.html'
        };

        if (pageMap[viewId] && !window.location.pathname.includes(pageMap[viewId])) {
            window.location.href = pageMap[viewId];
            return;
        }

        document.querySelectorAll('.view-section').forEach(s => {
            s.classList.remove('active');
            s.classList.add('hidden');
            s.style.display = 'none';
        });

        const target = document.getElementById(viewId);
        if (target) {
            target.classList.remove('hidden');
            target.classList.add('active');
            target.style.display = 'flex';
        }
        window.scrollTo(0, 0);
        window.dispatchEvent(new CustomEvent('viewChanged', { detail: { viewId } }));

        // REMOVED: Automatic notification check on view switch to prevent loops
    } catch (e) { console.error("Nav Error:", e); }
};

// --- GLOBAL ERROR INTERCEPTION ---
window.addEventListener('error', (event) => {
    if (event.message && event.message.toLowerCase().includes('onesignal')) {
        window.showNotificationDebug(`Window Error: ${event.message}`);
    }
});
window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason ? String(event.reason) : "";
    if (reason.toLowerCase().includes('onesignal')) {
        window.showNotificationDebug(`Promise Rejection: ${reason}`);
    }
});

// --- ONESIGNAL NOTIFICATION LOGIC ---
(function initNotificationGate() {
    window.addEventListener('DOMContentLoaded', async () => {
        const diagCard = document.getElementById('push-diagnostic-card');
        const diagId = document.getElementById('diag-push-id');
        const diagSW = document.getElementById('diag-sw-status');
        const notifModal = document.getElementById('notification-modal');

        // TASK: CLEAN START - REMOVE ALL LOOPS
        if (diagId) diagId.innerText = "INITIALIZING PUSH...";

        // TASK 3: Absolute subpath for JYSLOGINPORTAL
        if ('serviceWorker' in navigator) {
            try {
                console.log("Registering Service Worker for JYSLOGINPORTAL...");
                const registration = await navigator.serviceWorker.register('/JYSLOGINPORTAL/OneSignalSDKWorker.js', { scope: '/JYSLOGINPORTAL/' });
                if (diagSW) diagSW.innerText = "Active (Subpath Scope: /JYSLOGINPORTAL/)";
            } catch (err) {
                if (diagSW) diagSW.innerText = "FAILED: " + err.message;
            }
        }

        // STEP 2: ONESIGNAL INIT WITH HARD TIMEOUT
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async function(OneSignal) {
            try {
                if (diagCard) diagCard.classList.remove('hidden');

                // MONITOR TOKEN GENERATION (HANDSHAKE)
                const updatePushID = async () => {
                    const pushId = OneSignal.User.PushSubscription.id;
                    if (pushId) {
                        if (diagId) diagId.innerText = pushId;
                        localStorage.setItem('notification_status', 'enabled');
                        return true;
                    }
                    return false;
                };

                // HARD 3-SECOND TIMEOUT FALLBACK
                const timeoutHandler = setTimeout(() => {
                    if (!OneSignal.User.PushSubscription.id && diagId) {
                        diagId.innerHTML = `<span class="text-red-600 font-black uppercase">SW SCOPE BLOCKED</span><br><button id="resync-trigger" class="mt-1 bg-red-600 text-white px-2 py-1 rounded text-[8px] font-bold">RE-SYNC TOKEN</button>`;
                        document.getElementById('resync-trigger').onclick = () => OneSignal.Notifications.requestPermission();
                        console.warn("OneSignal: Handshake timed out. Infrastructure block suspected.");
                    }
                }, 3000);

                // ATTEMPT DIRECT OPT-IN (NO LOOPS)
                if (Notification.permission === 'granted') {
                    await OneSignal.User.PushSubscription.optIn();
                    if (await updatePushID()) clearTimeout(timeoutHandler);
                } else if (Notification.permission === 'default') {
                    if (notifModal) {
                        notifModal.classList.remove('hidden');
                        notifModal.style.display = 'flex';
                    }
                }

                OneSignal.User.PushSubscription.addEventListener("change", updatePushID);

            } catch (e) {
                if (diagId) diagId.innerText = "SDK ERROR: " + e.message;
            }
        });
    });
})();

window.showNotificationDebug = (msg) => {
    const errorArea = document.getElementById('notification-error-area');
    const errorText = document.getElementById('notification-error-text');
    const modal = document.getElementById('notification-modal');

    console.error("NOTIFICATION_DEBUG:", msg);

    if (errorArea && errorText) {
        errorArea.classList.remove('hidden');
        errorArea.classList.add('bg-red-50', 'border-red-200');
        errorText.innerHTML = `<div class="text-left font-mono text-[9px] uppercase font-bold text-red-600">
            <p class="mb-1 border-b border-red-100 pb-1">Notification Debug Info</p>
            <p>${msg}</p>
        </div>`;
    }

    // Force modal visibility if diagnostic triggered
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
};

window.checkNotificationStatus = async () => {
    // Permanent Guard
    const status = localStorage.getItem('notification_prompt_completed') || localStorage.getItem('notification_status');
    if (status === 'enabled' || status === 'dismissed' || status === 'true') return;

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function(OneSignal) {
        try {
            const permission = await OneSignal.Notifications.permission;
            if (permission) {
                localStorage.setItem('notification_status', 'enabled');
                localStorage.setItem('notification_prompt_completed', 'true');
                return;
            }

            const modal = document.getElementById('notification-modal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.style.display = 'flex';
            }
        } catch (e) {
            window.showNotificationDebug(`OneSignal Status Check Error: ${e.message}`);
        }
    });
};

window.requestNotificationPermission = async () => {
    const errorArea = document.getElementById('notification-error-area');
    const errorText = document.getElementById('notification-error-text');
    const submitBtn = document.getElementById('notification-submit-btn');

    if (errorArea) errorArea.classList.add('hidden');

    // TASK: ONE-CLICK DIRECT PERMISSION RESET FLOW (for 'denied' state)
    if ("Notification" in window && Notification.permission === 'denied') {
        if (errorArea && errorText) {
            errorArea.classList.remove('hidden');
            errorArea.classList.add('bg-indigo-50', 'border-indigo-100');
            errorArea.classList.remove('bg-red-50', 'border-red-100');

            errorText.innerHTML = `
                <div class="text-left space-y-2 py-2">
                    <p class="font-black text-indigo-900 text-xs uppercase text-center mb-2">How to Enable Notifications:</p>
                    <div class="flex items-start gap-2 text-[10px] text-indigo-700 leading-tight">
                        <span class="bg-indigo-600 text-white w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 font-bold">1</span>
                        <p>Tap the <b>Tune/Lock icon (🔒)</b> next to the URL at the top.</p>
                    </div>
                    <div class="flex items-start gap-2 text-[10px] text-indigo-700 leading-tight">
                        <span class="bg-indigo-600 text-white w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 font-bold">2</span>
                        <p>Go to <b>Permissions</b> → <b>Notifications</b>.</p>
                    </div>
                    <div class="flex items-start gap-2 text-[10px] text-indigo-700 leading-tight">
                        <span class="bg-indigo-600 text-white w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 font-bold">3</span>
                        <p>Switch to <b>Allow</b> and return here.</p>
                    </div>
                </div>
            `;
        }
        if (submitBtn) {
            submitBtn.innerText = "I'VE ENABLED IT - REFRESH";
            submitBtn.classList.remove('bg-indigo-600');
            submitBtn.classList.add('bg-green-600');
            submitBtn.onclick = () => location.reload();
        }

        // AUTO-DETECT RESET
        const detectChange = () => {
            if (Notification.permission === 'granted') {
                window.removeEventListener('focus', detectChange);
                window.removeEventListener('visibilitychange', detectChange);
                location.reload(); // Force full reload to trigger initNotificationGate
            }
        };
        window.addEventListener('focus', detectChange);
        window.addEventListener('visibilitychange', detectChange);
        return;
    }

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = "WAITING FOR BROWSER...";
        }

        const result = await Notification.requestPermission();
        if (result === 'granted') {
            localStorage.setItem('notification_status', 'enabled');
            localStorage.setItem('notification_prompt_completed', 'true');

            // Immediate Native Trigger
            try {
                new Notification("Jern Yafoor School", {
                    body: "Notifications successfully enabled! You are now subscribed to real-time updates.",
                    icon: "jys_Icon.png"
                });
            } catch (ne) { window.showNotificationDebug(`Native Notif Trigger Error: ${ne.message}`); }

            const modal = document.getElementById('notification-modal');
            if (modal) modal.remove();

            // OneSignal Sync
            window.OneSignalDeferred = window.OneSignalDeferred || [];
            window.OneSignalDeferred.push(async function(OneSignal) {
                try {
                    await OneSignal.User.PushSubscription.optOut();
                    await OneSignal.User.PushSubscription.optIn();
                } catch (oe) { window.showNotificationDebug(`OneSignal Post-Grant OptIn Error: ${oe.message}`); }
            });

            setTimeout(() => { location.reload(); }, 500);
        } else {
            // Re-query actual browser state
            const actualState = window.Notification.permission;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = "Try Again";
            }
            if (errorArea && errorText) {
                errorArea.classList.remove('hidden');
                errorText.innerText = actualState === 'denied'
                    ? "PERMISSION DENIED: PLEASE ENABLE NOTIFICATIONS MANUALLY IN SITE SETTINGS."
                    : "CONSENT NOT DETECTED: PLEASE ALLOW NOTIFICATIONS TO PROCEED.";
            }
        }
    } catch (e) {
        window.showNotificationDebug(`Permission Workflow Exception: ${e.message}`);
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = "Try Again";
        }
    }
};

window.dismissNotificationModal = () => {
    localStorage.setItem('notification_status', 'dismissed');
    localStorage.setItem('notification_prompt_completed', 'true');
    const modal = document.getElementById('notification-modal');
    if (modal) modal.remove();
};

// --- PWA INSTALLATION LOGIC ---
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredInstallPrompt = e;
    console.log("PWA_DEBUG: Install prompt stashed.");

    // Optional: Show an install button in the UI if needed
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) installBtn.classList.remove('hidden');
});

window.triggerPwaInstall = async () => {
    if (!deferredInstallPrompt) {
        console.log("PWA_DEBUG: No install prompt available.");
        return;
    }
    // Show the prompt
    deferredInstallPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredInstallPrompt.userChoice;
    console.log(`PWA_DEBUG: User response to install prompt: ${outcome}`);
    // We've used the prompt, and can't use it again, throw it away
    deferredInstallPrompt = null;
};

window.addEventListener('appinstalled', (evt) => {
    console.log('PWA_DEBUG: SchoolLog was installed.');
});

window.testOneSignalDiagnostics = async () => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function(OneSignal) {
        console.log("--- ONESIGNAL DIAGNOSTIC START ---");

        // 1. Check Permission
        const permission = await OneSignal.Notifications.permission;
        console.log("1. Notification Permission:", permission ? "GRANTED" : "NOT GRANTED");

        // 2. Check Service Worker
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            console.log("2. Active Service Workers:", regs.length);
            regs.forEach(r => console.log("   SW Script:", r.active ? r.active.scriptURL : "Inactive"));
        } else {
            console.warn("2. Service Workers not supported by this browser.");
        }

        // 3. Check Subscription & ID
        const userId = await OneSignal.User.PushSubscription.id;
        console.log("3. OneSignal Subscription ID:", userId || "NONE (User Not Subscribed)");

        console.log("--- ONESIGNAL DIAGNOSTIC END ---");

        if (!permission) {
            alert("Diagnostics: Notifications are NOT enabled. Click 'Enable Alerts' to fix.");
        } else if (!userId) {
            alert("Diagnostics: SW registered but no Subscription ID found. Try refreshing.");
        } else {
            alert(`Success! OneSignal is active.\nID: ${userId}\nCheck console for full log.`);
        }
    });
};
