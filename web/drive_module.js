import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, get, set, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================================ */
// ✅ 24/7 PERMANENT CLOUD DRIVE ENGINE (v7.5)                      */
// ================================================================ */

/**
 * 🛠️ ADMIN: Connect Global Cloud Link
 * Stores state in Firebase (Source of Truth) for all devices
 */
window.connectGoogleDrive = async function() {
    const urlInput = document.getElementById('driveUrlInput');
    const url = urlInput?.value?.trim();

    if (!url || !url.startsWith('https://script.google.com/macros/s/')) {
        alert("❌ Invalid URL! Please deploy Code.gs as 'Web App', 'Execute as Me', and Access 'Anyone'.");
        return;
    }

    if (window.showGlobalSpinner) window.showGlobalSpinner("Establishing Permanent Cloud Link...");

    try {
        // 1. Perform PING_TEST to verify the script is deployed correctly as an autonomous API
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: "PING_TEST" }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        if (!response.ok) throw new Error("Google API rejected connection test.");

        // 2. COMMIT TO FIREBASE (Source of Truth)
        const configRef = ref(db, 'system/settings/drive');
        await set(configRef, {
            webAppUrl: url,
            isConnected: true,
            lastConnected: Date.now(),
            adminNode: "CLOUD_API_MASTER"
        });

        alert("✅ SUCCESS: Google Drive is now permanently linked 24/7.\nYou can close your browser or turn off your laptop; uploads remain active.");

        // Refresh UI state
        if (window.loadGoogleDriveConfig) window.loadGoogleDriveConfig();

    } catch (e) {
        console.error("❌ Cloud Link Failed:", e);
        alert("❌ Link Failed: " + e.message);
    } finally {
        if (window.hideGlobalSpinner) window.hideGlobalSpinner();
    }
};

/**
 * 🛠️ ADMIN: Disconnect Global Cloud Link
 */
window.disconnectGoogleDrive = async function() {
    if (!confirm("⚠️ CAUTION: This will disable ALL visitor and staff document uploads immediately. Continue?")) return;

    if (window.showGlobalSpinner) window.showGlobalSpinner("Terminating Cloud Link...");

    try {
        await set(ref(db, 'system/settings/drive/isConnected'), false);
        alert("🔌 Disconnected. Google Drive sync is now disabled system-wide.");
        if (window.loadGoogleDriveConfig) window.loadGoogleDriveConfig();
    } catch (e) {
        alert("Error: " + e.message);
    } finally {
        if (window.hideGlobalSpinner) window.hideGlobalSpinner();
    }
};

/**
 * 🛠️ ADMIN: Sync UI state with Firebase Cloud
 */
window.loadGoogleDriveConfig = async function() {
    const input = document.getElementById('driveUrlInput');
    const dot = document.getElementById('driveStatusDot');
    const text = document.getElementById('driveStatusText');
    const storageBox = document.getElementById('driveStorageInfo');

    try {
        const snap = await get(ref(db, 'system/settings/drive'));
        if (snap.exists()) {
            const config = snap.val();
            if (input) input.value = config.webAppUrl || "";

            if (config.isConnected === true) {
                if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-500 animate-pulse";
                if (text) text.innerText = "Cloud Sync: Permanent (24/7)";
                if (storageBox) storageBox.classList.remove('hidden');
            } else {
                if (dot) dot.className = "w-2 h-2 rounded-full bg-rose-500";
                if (text) text.innerText = "Cloud Sync: Offline / Disabled";
                if (storageBox) storageBox.classList.add('hidden');
            }
        }
    } catch (e) { console.warn("⚠️ Drive Config sync failed:", e); }
};

/**
 * 📡 CLIENT: Perform Direct Device-to-Drive Upload
 * Reads global status from Firebase before every upload
 */
window.uploadToDrive = async function(payload = {}) {
    try {
        // 1. Fetch Cloud "Source of Truth"
        const driveSnap = await get(ref(db, 'system/settings/drive'));
        const config = driveSnap.val();

        if (!config || config.isConnected !== true || !config.webAppUrl) {
            console.warn("⚠️ Drive Sync is DISABLED by Admin.");
            return { status: 'disabled', message: 'Sync disabled by Admin' };
        }

        // 2. Prepare Base64 (Strip headers)
        let base64 = payload.image || payload.base64Data || "";
        if (base64.includes(',')) base64 = base64.split(',')[1];

        if (!base64 || base64.length < 50) return { status: 'skipped' };

        // 3. Dispatch DIRECT to Google Cloud API
        const cloudPayload = {
            action: 'upload',
            adekPassNumber: payload.adekPassNumber || "SYSTEM",
            documentType: payload.documentType || "DOCUMENT",
            category: payload.category || 'GENERAL',
            fileName: payload.fileName || `FILE_${Date.now()}.jpg`,
            base64Data: base64
        };

        const response = await fetch(config.webAppUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(cloudPayload)
        });

        if (!response.ok) throw new Error("Google API connection error");

        const result = await response.json();
        if (result.status === 'success' || result.fileUrl) {
            return { status: 'success', fileUrl: result.fileUrl };
        }

        throw new Error(result.message || "Cloud rejected upload");

    } catch (err) {
        console.error("❌ Direct Device-to-Drive Failed:", err.message);
        return { status: 'error', message: err.message };
    }
};

// Initial state sync for Admin view
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('admin.html')) {
        setTimeout(window.loadGoogleDriveConfig, 1500);
    }
});

// Admin UI Event Aliases (Backward compatibility for admin.html)
window.saveGoogleDriveConfig = window.connectGoogleDrive;

console.log("✅ Drive Architecture Overhauled: 24/7 Permanent Cloud Mode Active");
