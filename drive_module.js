import { db, UPLOAD_CONFIG } from './firebase_config.js';

// ================================================================ */
// DYNAMIC GOOGLE DRIVE SYNC ENGINE                                 */
// ================================================================ */

window.uploadToDrive = async (payloadOrBase64, folderCategoryParam = 'PROFILE_PHOTOS') => {
    const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyXZpA-mlmctWy4HTdEiu_EsS1gmTuEe5SREu5KQ0_3LliIWzGwDNhXQArqVuz4PM-ygA/exec";
    try {
        const config = await window.driveConfigCache?.getConfig() || { url: APPS_SCRIPT_URL };
        const scriptUrl = config.url || APPS_SCRIPT_URL;

        // Support both Object payload AND Legacy (base64, category) parameters
        let imageBase64 = '';
        let folderCategory = 'PROFILE_PHOTOS';
        let filename = `upload_${Date.now()}.png`;

        if (typeof payloadOrBase64 === 'object' && payloadOrBase64 !== null) {
            imageBase64 = payloadOrBase64.image || payloadOrBase64.base64 || '';
            folderCategory = payloadOrBase64.category || payloadOrBase64.folderCategory || 'PROFILE_PHOTOS';
            filename = payloadOrBase64.fileName || payloadOrBase64.filename || filename;
        } else {
            imageBase64 = payloadOrBase64;
            folderCategory = folderCategoryParam;
        }

        if (!imageBase64) {
            throw new Error('No Base64 image data provided.');
        }

        const uploadPayload = {
            image: imageBase64,
            folderCategory: folderCategory,
            filename: filename,
            action: 'upload',
            timestamp: Date.now()
        };

        const response = await fetch(scriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Bypass CORS pre-flight triggers
            body: JSON.stringify(uploadPayload)
        });

        if (!response.ok) throw new Error(`HTTP Error Status: ${response.status}`);

        const result = await response.json();
        const fileUrl = result.fileUrl || result.url || result.link || result.downloadUrl || null;

        if (fileUrl) {
            return { status: 'success', fileUrl: fileUrl };
        }

        if (result.fileId || result.id) {
            const generatedUrl = `https://lh3.googleusercontent.com/d/${result.fileId || result.id}`;
            return { status: 'success', fileUrl: generatedUrl };
        }

        throw new Error(result.message || 'No Drive URL returned.');
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

console.log("✅ drive_module.js loaded (Google Drive Sync Engine)");
