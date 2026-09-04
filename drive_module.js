import { db, UPLOAD_CONFIG } from './firebase_config.js';

// ================================================================ */
// DYNAMIC GOOGLE DRIVE SYNC ENGINE                                 */
// ================================================================ */

window.uploadToDrive = async function(paramsOrBase64, categoryParam = 'PROFILES_AND_SIGS') {
    const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyXZpA-mlmctWy4HTdEiu_EsS1gmTuEe5SREu5KQ0_3LliIWzGwDNhXQArqVuz4PM-ygA/exec";

    try {
        const config = await window.driveConfigCache?.getConfig() || { url: APPS_SCRIPT_URL };
        const scriptUrl = config.url || APPS_SCRIPT_URL;

        const activeStaff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || '{}');

        let image = '';
        let category = 'PROFILES_AND_SIGS';
        let documentType = 'GENERAL';
        let adekPassNumber = '';
        let creatorAdekPass = '';
        let closerAdekPass = '';
        let fileName = '';

        // Handle both Object payload and Legacy (base64, category)
        if (typeof paramsOrBase64 === 'object' && paramsOrBase64 !== null) {
            image = paramsOrBase64.image || paramsOrBase64.base64 || '';
            category = paramsOrBase64.category || paramsOrBase64.folderCategory || 'PROFILES_AND_SIGS';
            documentType = paramsOrBase64.documentType || category;
            adekPassNumber = paramsOrBase64.adekPassNumber || paramsOrBase64.userId || '';
            creatorAdekPass = paramsOrBase64.creatorAdekPass || '';
            closerAdekPass = paramsOrBase64.closerAdekPass || '';
            fileName = paramsOrBase64.fileName || paramsOrBase64.filename || '';
        } else {
            image = paramsOrBase64;
            category = categoryParam;
            documentType = category;
        }

        if (!image) throw new Error('No Base64 image data provided.');

        // SAFE SANITIZATION FALLBACK FIX
        const safeAdekPass = String(adekPassNumber || activeStaff.adekPass || activeStaff.adekPassNumber || activeStaff.mobile || "UNKNOWN_ADEK").replace(/[.#$\[\]/]/g, '_');
        const safeFileName = String(fileName || `${safeAdekPass}_${documentType}_${Date.now()}.jpg`).replace(/[.#$\[\]/]/g, '_');
        const safeCategory = String(category || 'GENERAL').replace(/[.#$\[\]/]/g, '_');
        const safeDocumentType = String(documentType || safeCategory).replace(/[.#$\[\]/]/g, '_');

        if (!image || image.length < 100) {
            console.warn("⚠️ Upload aborted: Base64 image payload is missing or invalid.");
            return { status: 'skipped', fileUrl: 'N/A' };
        }

        const payload = {
            adekPassNumber: safeAdekPass,
            creatorAdekPass: String(creatorAdekPass || safeAdekPass).replace(/[.#$\[\]/]/g, '_'),
            closerAdekPass: String(closerAdekPass || safeAdekPass).replace(/[.#$\[\]/]/g, '_'),
            category: safeCategory,
            documentType: safeDocumentType,
            fileName: safeFileName,
            base64Data: image,
            action: 'upload',
            timestamp: Date.now()
        };

        const response = await fetch(scriptUrl, {
            method: 'POST',
            body: JSON.stringify(payload)
            // Removed headers to prevent CORS pre-flight (OPTIONS) request
        });

        if (!response.ok) throw new Error(`HTTP Error Status: ${response.status}`);

        const resultText = await response.text();
        let result;
        try {
            result = JSON.parse(resultText);
        } catch (e) {
            throw new Error("Invalid JSON response from Drive API: " + resultText.substring(0, 50));
        }

        if (!result) throw new Error("Empty response from Drive API");

        if (result.status === 'success' || result.fileUrl) {
            return {
                status: 'success',
                fileUrl: result.fileUrl || "",
                fileId: result.fileId || "",
                folderPath: result.folderPath || ""
            };
        }

        // Defensive check for message
        const errMsg = result.message ? result.message.toString() : 'No Drive URL returned.';
        throw new Error(errMsg);
    } catch (error) {
        console.error('❌ Google Drive Sync Error:', error);
        return { status: 'error', message: error.message };
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
