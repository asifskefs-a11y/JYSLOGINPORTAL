import { db, UPLOAD_CONFIG } from './firebase_config.js';

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

        const normalizedPayload = {
            ...payload,
            adekPassNumber: safeAdekPass,
            documentType: safeDocType,
            fileName: safeFileName,
            category: safeCategory,
            base64Data: base64Image,
            action: 'upload',
            timestamp: Date.now()
        };

        // Get script URL from cache or storage
        const savedUrl = localStorage.getItem('jys_drive_script_url');
        const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyXZpA-mlmctWy4HTdEiu_EsS1gmTuEe5SREu5KQ0_3LliIWzGwDNhXQArqVuz4PM-ygA/exec";
        const targetScriptUrl = savedUrl || (await window.driveConfigCache?.getConfig())?.url || APPS_SCRIPT_URL;

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

    if (!url || !url.startsWith('https://script.google.com')) {
        alert("❌ Please enter a valid Google Apps Script Web App URL.");
        return;
    }

    window.showGlobalSpinner("Testing Connection...");

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'checkConnection' })
        });

        if (!response.ok) throw new Error("Script URL is invalid or not deployed correctly.");

        const result = await response.json();

        // Even if it returns "No file data provided", it means the connection works!
        if (result.status === 'success' || (result.status === 'error' && result.message.includes('No file data'))) {
            localStorage.setItem('jys_drive_script_url', url);
            window.updateDriveUI(true, result.status === 'success' ? result : null);
            window.hideGlobalSpinner();

            const msg = result.status === 'success'
                ? "✅ Connected!\nStorage: " + result.storageUsed + " used of " + result.storageTotal
                : "✅ Connected! (Please update Code.gs to v5.3 for storage info)";
            alert(msg);
        } else {
            throw new Error(result.message || "Failed to verify connection.");
        }

    } catch (e) {
        window.hideGlobalSpinner();
        window.updateDriveUI(false);
        alert("❌ Connection Failed: " + e.message);
    }
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
    const savedUrl = localStorage.getItem('jys_drive_script_url');
    const input = document.getElementById('driveUrlInput');

    if (savedUrl && input) {
        input.value = savedUrl;
        try {
            const response = await fetch(savedUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'checkConnection' })
            });
            if (response.ok) {
                const result = await response.json();
                window.updateDriveUI(result.status === 'success' || (result.status === 'error' && result.message.includes('No file data')), result.status === 'success' ? result : null);
            } else {
                window.updateDriveUI(false);
            }
        } catch (e) {
            window.updateDriveUI(false);
        }
    } else {
        window.updateDriveUI(false);
    }
};

// Auto-load on init
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(window.loadGoogleDriveConfig, 1000);
});

console.log("✅ drive_module.js loaded (Google Drive Sync Engine)");
