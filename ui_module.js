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

        // Check Notification Permission after dashboard loads
        if (viewId === 'view-admin-dash' || viewId === 'staff-dash-area' || document.getElementById('staff-dash-area')) {
            window.checkNotificationStatus();
        }
    } catch (e) { console.error("Nav Error:", e); }
};

// --- ONESIGNAL NOTIFICATION LOGIC ---
window.OneSignalDeferred = window.OneSignalDeferred || [];
window.OneSignalDeferred.push(async function(OneSignal) {
    console.log("ONESIGNAL_DEBUG: Syncing Listeners on Evaluation");
    OneSignal.Notifications.addEventListener("permissionChange", (permission) => {
        console.log("ONESIGNAL_DEBUG: Permission changed:", permission);
    });

    OneSignal.Notifications.addEventListener("click", (event) => {
        console.log("ONESIGNAL_DEBUG: Notification clicked:", event);
    });
});

window.checkNotificationStatus = async () => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function(OneSignal) {
        try {
            // Verify Service Worker for Mobile Origin
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(registrations => {
                    console.log("ONESIGNAL_DEBUG: Active Service Workers:", registrations.length);
                });
            }

            const permission = await OneSignal.Notifications.permission;
            console.log("ONESIGNAL_DEBUG: Current Permission:", permission);

            // permission is true if granted, false if not
            if (permission) {
                console.log("ONESIGNAL_DEBUG: Permission already granted.");
                return;
            }

            const modal = document.getElementById('notification-modal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.style.display = 'flex';
            }
        } catch (e) { console.error("OneSignal Status Error:", e); }
    });
};

window.requestNotificationPermission = async () => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function(OneSignal) {
        try {
            console.log("Requesting OneSignal Permission...");
            const result = await OneSignal.Notifications.requestPermission();
            console.log("Permission Result:", result);

            const modal = document.getElementById('notification-modal');
            if (modal) {
                modal.classList.add('hidden');
                modal.style.display = 'none';
            }

            if (result) {
                alert("Notifications Enabled Successfully!");
                // Force reload to ensure registration is fully active on mobile
                location.reload();
            }
        } catch (e) {
            console.error("Permission Request Error:", e);
            alert("Error: Could not enable notifications. Please check browser settings.");
        }
    });
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
