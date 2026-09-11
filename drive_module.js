import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, get, set, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================================ */
// ✅ DYNAMIC GOOGLE DRIVE SYNC ENGINE (v6.7 - AUTONOMOUS)          */
// ================================================================ */

/**
 * ✅ Fetch Active Apps Script URL with Smart Caching
 * Ensures 24/7 connectivity without hardcoded links
 */
window.getActiveDriveUrl = async function() {
    const CACHE_KEY = 'jys_active_drive_script_url';

    try {
        // 1. Check Firebase Master Config (Primary Source)
        const snapshot = await get(ref(db, 'settings/driveUrl'));
        if (snapshot.exists()) {
            const url = snapshot.val();
            if (url && url.startsWith('https://script.google.com/macros/s/')) {
                localStorage.setItem(CACHE_KEY, url);
                return url;
            }
        }
    } catch (e) {
        console.warn("📡 Firebase Drive URL unreachable, checking local cache.");
    }

    // 2. Check LocalStorage (Resilience for staff devices with restricted auth)
    const cachedUrl = localStorage.getItem(CACHE_KEY);
    if (cachedUrl) return cachedUrl;

    // 3. Last Resort Fallback (If Config is completely missing from DB)
    console.error("❌ Critical: No Google Drive script URL configured in System Settings.");
    return null;
};

/**
 * ✅ 24/7 AUTONOMOUS CLOUD SYNC
 * Sends data DIRECTLY from user device to Google Drive
 */
window.uploadToDrive = async function(payload = {}) {
    try {
        const activeStaff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || '{}');
        const targetUrl = await window.getActiveDriveUrl();

        if (!targetUrl) {
            throw new Error("Cloud Storage not configured. Contact Admin.");
        }

        // 1. DATA PREPARATION: Strip DataURL headers & ensure clean Base64
        let base64 = payload.image || payload.base64Data || "";
        if (base64.includes(',')) base64 = base64.split(',')[1];

        if (!base64 || base64.length < 50) {
            console.warn("⚠️ Sync Aborted: Empty or invalid payload.");
            return { status: 'skipped', fileUrl: 'N/A' };
        }

        // 2. CONSTRUCT AUTONOMOUS CLOUD PAYLOAD
        const cloudPayload = {
            action: 'upload',
            adekPassNumber: payload.adekPassNumber || activeStaff.adekPass || activeStaff.mobile || "PORTAL_UPLOAD",
            documentType: payload.documentType || payload.category || "DOCUMENT",
            fileName: payload.fileName || `FILE_${Date.now()}.jpg`,
            mimeType: payload.mimeType || "image/jpeg",
            category: payload.category || 'GENERAL',
            base64Data: base64,
            timestamp: Date.now()
        };

        // 3. EXECUTE DIRECT CLOUD FETCH (Bypassing CORS Pre-flight)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s Mobile Network Buffer

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(cloudPayload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`Google Cloud Error: ${response.status}`);

        const result = await response.json();

        if (result.status === 'success' || result.fileUrl) {
            console.log("🚀 Cloud Sync Active: Success", result.fileUrl);
            return {
                status: 'success',
                fileUrl: result.fileUrl,
                folderPath: result.folderPath || ""
            };
        }

        throw new Error(result.message || "Cloud Engine rejected upload");

    } catch (err) {
        console.error("❌ Direct Cloud Sync Failed:", err.message);
        // Fallback for UI continuity
        return {
            status: 'fallback',
            fileUrl: `https://ui-avatars.com/api/?name=UPLOAD_ERROR`,
            message: err.message
        };
    }
};

/**
 * ✅ [ADMIN] Save Cloud Configuration to Firebase
 */
window.saveGoogleDriveConfig = async function() {
    const input = document.getElementById('driveUrlInput');
    const url = input?.value?.trim();

    if (!url || !url.startsWith('https://script.google.com/macros/s/')) {
        alert("❌ Invalid URL! Must be a Google Apps Script 'Exec' URL.");
        return;
    }

    if (window.showGlobalSpinner) window.showGlobalSpinner("Syncing Cloud Configuration...");

    try {
        // Test connection first
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'checkConnection' })
        });

        if (!response.ok) throw new Error("Connection failed on Apps Script side.");

        const testResult = await response.json();

        // Save to Firebase Permanent Storage
        await set(ref(db, 'settings/driveUrl'), url);
        localStorage.setItem('jys_active_drive_script_url', url);

        // Update UI
        window.updateDriveUI(true, testResult);
        if (window.hideGlobalSpinner) window.hideGlobalSpinner();

        alert("✅ Cloud Sync Configured Successfully!\nStaff can now upload documents 24/7.");

    } catch (e) {
        if (window.hideGlobalSpinner) window.hideGlobalSpinner();
        window.updateDriveUI(false);
        alert("❌ Config Error: " + e.message);
    }
};

/**
 * UI Sync for Admin Dashboard
 */
window.updateDriveUI = function(isConnected, data = null) {
    const dot = document.getElementById('driveStatusDot');
    const text = document.getElementById('driveStatusText');
    const storageBox = document.getElementById('driveStorageInfo');

    if (isConnected) {
        if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-500 animate-pulse";
        if (text) text.innerText = "Cloud Sync: Active 24/7";
        if (storageBox && data) {
            storageBox.classList.remove('hidden');
            if (document.getElementById('driveStorageUsed')) document.getElementById('driveStorageUsed').innerText = data.storageUsed || "0 MB";
            if (document.getElementById('driveStorageTotal')) document.getElementById('driveStorageTotal').innerText = data.storageTotal || "15 GB";
        }
    } else {
        if (dot) dot.className = "w-2 h-2 rounded-full bg-rose-500";
        if (text) text.innerText = "Cloud Sync: Offline";
    }
};

window.loadGoogleDriveConfig = async function() {
    const input = document.getElementById('driveUrlInput');
    const url = await window.getActiveDriveUrl();
    if (url && input) {
        input.value = url;
        // Ping for stats
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'checkConnection' })
        }).then(r => r.json()).then(data => window.updateDriveUI(data.status === 'success', data)).catch(() => window.updateDriveUI(false));
    }
};

// Initial Sync on load
document.addEventListener('DOMContentLoaded', () => setTimeout(window.loadGoogleDriveConfig, 1000));

console.log("✅ Drive Engine Re-engineered (v6.7 Autonomous Cloud Sync)");
