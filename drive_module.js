import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, get, set, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================================ */
// ✅ DYNAMIC GOOGLE DRIVE SYNC ENGINE (v6.7 - AUTONOMOUS)          */
// ================================================================ */

/**
 * ✅ Multi-Tiered Persistent URL Caching Engine (v7.0)
 * Ensures 24/7 connectivity with robust fallbacks
 */
window.getActiveDriveUrl = async function() {
    const LOCAL_KEY = 'app_drive_script_url';
    const FIREBASE_PATH = 'settings/driveUrl';
    const DEFAULT_SYSTEM_URL = "https://script.google.com/macros/s/AKfycbyXZpA-mlmctWy4HTdEiu_EsS1gmTuEe5SREu5KQ0_3LliIWzGwDNhXQArqVuz4PM-ygA/exec";

    // 🛡️ TIER 1: Permanent Local Storage (Fast & Persistent)
    let savedUrl = localStorage.getItem(LOCAL_KEY);
    if (savedUrl && savedUrl.startsWith('https://script.google.com')) {
        return savedUrl;
    }

    // 📡 TIER 2: Firebase Dynamic Remote (Source of Truth)
    try {
        const snapshot = await get(ref(db, FIREBASE_PATH));
        if (snapshot.exists()) {
            const firebaseUrl = snapshot.val();
            if (firebaseUrl && firebaseUrl.startsWith('https://script.google.com')) {
                localStorage.setItem(LOCAL_KEY, firebaseUrl); // Persist for offline/restart
                return firebaseUrl;
            }
        }
    } catch (e) {
        console.warn("⚠️ Cloud config fetch bypassed:", e.message);
    }

    // 🆘 TIER 3: Emergency System Fallback (Built-in Resilience)
    return savedUrl || DEFAULT_SYSTEM_URL;
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

        // ✅ MANDATED FIX: Dual-Layer Persistence (Firebase + Local)
        await set(ref(db, 'settings/driveUrl'), url);
        localStorage.setItem('app_drive_script_url', url);

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
