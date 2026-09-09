import { db, UPLOAD_CONFIG } from './firebase_config.js';
import { ref, get, set, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================================ */
// DYNAMIC GOOGLE DRIVE SYNC ENGINE                                 */
// ================================================================ */

window.uploadToDrive = async function(payload = {}) {
    try {
        const activeStaff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || '{}');

        // SAFE STRING FALLBACKS TO PREVENT REGEX REPLACE CRASHES
        const rawAdekPass = payload.adekPassNumber || payload.staffId || payload.userId || activeStaff.adekPass || activeStaff.adekPassNumber || activeStaff.mobile || "UNKNOWN_ADEK";
        const safeAdekPass = String(rawAdekPass).replace(/[.#$\[\]/]/g, '_');

        const rawDocType = payload.documentType || payload.docType || payload.category || "DOCUMENT";
        const safeDocType = String(rawDocType).replace(/[.#$\[\]/]/g, '_');

        const rawFileName = payload.fileName || payload.filename || `${safeAdekPass}_${safeDocType}_${Date.now()}.jpg`;
        const safeFileName = String(rawFileName).replace(/[.#$\[\]/]/g, '_');

        const safeCategory = String(payload.category || 'DOCUMENTS').replace(/[.#$\[\]/]/g, '_');
        let base64Image = payload.image || payload.base64Data || payload.fileData || "";

        if (!base64Image || base64Image.length < 50) {
            console.warn("⚠️ Upload aborted: Invalid or empty image payload provided.");
            return { status: 'skipped', fileUrl: 'N/A' };
        }

        // ✅ AUTO-FIX: Strip Data URL prefix if present (e.g. data:image/jpeg;base64,)
        if (base64Image.includes(',')) {
            base64Image = base64Image.split(',')[1];
        }

        // Get script URL (Prioritize Firebase, then LocalStorage, then Default)
        const targetScriptUrl = await window.getActiveDriveUrl();

        if (!targetScriptUrl) {
            throw new Error("Missing Google Apps Script Web App URL in System Configuration.");
        }

        // --- UPLOAD ATTEMPT: fetch with text/plain header to bypass CORS preflight ---
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for heavy docs

        try {
            const response = await fetch(targetScriptUrl, {
                method: 'POST',
                headers: {
                    "Content-Type": "text/plain;charset=utf-8"
                },
                body: JSON.stringify(normalizedPayload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`HTTP Error Status: ${response.status}`);

            const resultText = await response.text();
            let result;
            try {
                result = JSON.parse(resultText);
            } catch (e) {
                throw new Error("Invalid JSON response from Drive API: " + resultText.substring(0, 50));
            }

            if (result.status === 'success' || result.fileUrl) {
                return {
                    status: 'success',
                    fileUrl: result.fileUrl || "",
                    fileId: result.fileId || "",
                    folderPath: result.folderPath || ""
                };
            }

            throw new Error(result.message || 'No Drive URL returned.');

        } catch (fetchErr) {
            clearTimeout(timeoutId);
            if (fetchErr.name === 'AbortError') {
                throw new Error("Upload timed out (60s). The document might be too heavy for the network.");
            }
            throw fetchErr;
        }
    } catch (error) {
        console.error("❌ Google Drive Sync Error:", error);

        // Final Fallback: Local UI Avatar
        const fallbackName = payload.adekPassNumber || "JYS";
        return {
            status: 'fallback',
            fileUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=4f46e5&color=fff`,
            message: error.message
        };
    }
};

/**
 * ✅ Fetch Drive Link directly from Database on every upload request (24/7 Connectivity)
 */
window.getActiveDriveUrl = async function() {
    try {
        // 1. Try Firebase First (settings/driveUrl is the master path)
        const snapshot = await get(ref(db, 'settings/driveUrl'));
        const dbUrl = snapshot.exists() ? snapshot.val() : null;

        if (dbUrl && dbUrl.trim().startsWith("https://script.google.com")) {
            localStorage.setItem('jys_drive_script_url', dbUrl);
            return dbUrl;
        }
    } catch (e) {
        console.warn("⚠️ Firebase fetch for Drive URL failed, checking local cache.");
    }

    // 2. LocalStorage Fallback (cached from previous successful syncs)
    const localUrl = localStorage.getItem('jys_drive_script_url');
    if (localUrl) return localUrl;

    // 3. Drive Config Cache Fallback (from firebase_config.js)
    if (window.driveConfigCache) {
        const cachedObj = await window.driveConfigCache.getConfig();
        if (cachedObj && cachedObj.url) return cachedObj.url;
    }

    // 4. Final System Default Fallback
    return "https://script.google.com/macros/s/AKfycbyXZpA-mlmctWy4HTdEiu_EsS1gmTuEe5SREu5KQ0_3LliIWzGwDNhXQArqVuz4PM-ygA/exec";
};

/**
 * ✅ Direct Google Drive Upload Pipeline
 * Bypasses CORS by using text/plain and explicit Base64 content
 */
window.uploadDocumentToDrive = async function(docType, base64Content, mimeType) {
    try {
        const activeDriveUrl = await window.getActiveDriveUrl();
        if (!activeDriveUrl) throw new Error("No active Google Drive connection found.");

        const adekPass = window.currentStaff?.adekPass || window.currentStaff?.mobile || "STAFF";

        // Clean Base64: Ensure no DataURL header is sent
        const pureBase64 = base64Content.includes(',') ? base64Content.split(',')[1] : base64Content;

        const payload = {
            fileName: `DOC_${docType.toUpperCase()}_${adekPass}_${Date.now()}.jpg`,
            mimeType: mimeType || "image/jpeg",
            base64Data: pureBase64,
            adekPassNumber: adekPass,
            action: 'upload'
        };

        // Bypassing CORS with text/plain + AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s for heavy files

        const response = await fetch(activeDriveUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const resultText = await response.text();
        let result;
        try {
            result = JSON.parse(resultText);
        } catch (e) {
            throw new Error("Invalid response from Drive API: " + resultText.substring(0, 50));
        }

        if (result.status === "success" && result.fileUrl) {
            console.log("✅ Direct Drive Sync Success:", result.fileUrl);
            return result.fileUrl;
        } else {
            throw new Error(result.message || "Drive engine upload failed.");
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            console.error("❌ Upload Timed Out (60s)");
            throw new Error("Upload timed out. File might be too large or network slow.");
        }
        console.error("❌ Direct Upload Exception:", err);
        throw err;
    }
};

window.uploadToDriveWithRetry = async (payload, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        const res = await window.uploadToDrive(payload);
        if (res.status === 'success') return res;
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
    return { status: 'error', message: 'All retry attempts failed' };
};

// ================================================================ */
// CONFIGURATION MANAGEMENT (v5.0)                                  */
// ================================================================ */

window.saveGoogleDriveConfig = async function() {
    const input = document.getElementById('driveUrlInput');
    const url = input?.value.trim();

    if (!url || !url.startsWith('https://script.google.com/macros/s/')) {
        alert("❌ Please enter a valid Google Apps Script Web App URL.");
        return;
    }

    window.showGlobalSpinner("Testing & Syncing Connection...");

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'checkConnection' })
        });

        if (!response.ok) throw new Error("Script URL is invalid or not deployed correctly.");

        const result = await response.json();

        if (result.status === 'success' || (result.status === 'error' && result.message.includes('No file data'))) {
            // ✅ Save to LocalStorage for instant access
            localStorage.setItem('jys_drive_script_url', url);

            // ✅ Save to Firebase Permanent Storage for 24/7 access (Unifying Paths)
            try {
                await set(ref(db, 'settings/driveUrl'), url);
            } catch (fbErr) {
                console.warn("Firebase set failed, using legacy shim:", fbErr);
                const database = window.firebase.database();
                await database.ref('settings/driveUrl').set(url);
            }

            // Real-time UI Update with verified data
            window.updateDriveUI(true, result.status === 'success' ? result : null);
            window.hideGlobalSpinner();

            alert("✅ Google Drive Web App URL saved permanently to Firebase! Connection Active 24/7.");
        } else {
            throw new Error(result.message || "Failed to verify connection.");
        }

    } catch (e) {
        window.hideGlobalSpinner();
        window.updateDriveUI(false);
        alert("❌ Connection Failed: " + e.message);
    }
};

/**
 * ✅ Ping Verification: Verifies live connectivity and fetches storage stats
 */
window.verifyDriveConnectivity = async function(url) {
    if (!url || !url.startsWith('https://script.google.com')) return null;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'checkConnection' })
        });

        if (!response.ok) return null;

        const result = await response.json();
        return (result.status === 'success') ? result : null;
    } catch (e) {
        console.warn("🌐 Drive Ping Failed:", e.message);
        return null;
    }
};

/**
 * Auto-load saved URL when Admin Dashboard opens
 */
window.loadSavedDriveUrlOnAdminLaunch = function() {
    const urlRef = ref(db, 'settings/driveUrl');
    onValue(urlRef, async (snapshot) => {
        const url = snapshot.val();
        const inputField = document.getElementById('driveUrlInput');
        if (url) {
            if (inputField) inputField.value = url;
            localStorage.setItem('jys_drive_script_url', url);

            // ✅ LIVE PING VERIFICATION
            const stats = await window.verifyDriveConnectivity(url);
            window.updateDriveUI(!!stats, stats);

            if (stats) console.log("📡 Drive URL verified & synced from Firebase.");
            else console.warn("📡 Drive URL found in Firebase but Ping failed.");
        }
    });
};

window.updateDriveUI = function(isConnected, data = null) {
    const dot = document.getElementById('driveStatusDot');
    const text = document.getElementById('driveStatusText');
    const storageBox = document.getElementById('driveStorageInfo');

    if (isConnected) {
        if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-500 animate-pulse";
        if (text) text.innerText = "Status: Connected & Active";
        if (storageBox && data) {
            storageBox.classList.remove('hidden');
            if (document.getElementById('driveStorageUsed')) document.getElementById('driveStorageUsed').innerText = data.storageUsed;
            if (document.getElementById('driveStorageTotal')) document.getElementById('driveStorageTotal').innerText = data.storageTotal;
        } else if (storageBox) {
             storageBox.classList.add('hidden'); // Hide if old script version
        }
    } else {
        if (dot) dot.className = "w-2 h-2 rounded-full bg-rose-500";
        if (text) text.innerText = "Status: Disconnected";
        if (storageBox) storageBox.classList.add('hidden');
    }
};

window.loadGoogleDriveConfig = async function() {
    // Priority: LocalStorage (Fast) -> Firebase (Permanent)
    const savedUrl = localStorage.getItem('jys_drive_script_url');
    const input = document.getElementById('driveUrlInput');

    if (savedUrl && input) {
        input.value = savedUrl;
        // ✅ Initial verification for cached URL
        const stats = await window.verifyDriveConnectivity(savedUrl);
        window.updateDriveUI(!!stats, stats);
    }

    // Always trigger Firebase sync in background
    if (window.loadSavedDriveUrlOnAdminLaunch) {
        window.loadSavedDriveUrlOnAdminLaunch();
    }
};

// Auto-load on init
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(window.loadGoogleDriveConfig, 1000);
});

console.log("✅ drive_module.js loaded (Google Drive Sync Engine)");
