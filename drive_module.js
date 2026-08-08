import { db, UPLOAD_CONFIG } from './firebase_config.js';

// ================================================================ */
// DYNAMIC GOOGLE DRIVE SYNC ENGINE - COMPLETE FIX                 */
// ================================================================ */

// ================================================================ */
// MAIN UPLOAD FUNCTION - SUPPORTS FOLDER PATH                     */
// ================================================================ */

window.uploadToDrive = async (payloadOrBase64, folderCategoryParam = 'PROFILE_PHOTOS') => {
    const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyXZpA-mlmctWy4HTdEiu_EsS1gmTuEe5SREu5KQ0_3LliIWzGwDNhXQArqVuz4PM-ygA/exec";

    try {
        // Get config
        const config = await window.driveConfigCache?.getConfig() || { url: APPS_SCRIPT_URL };
        const scriptUrl = config.url || APPS_SCRIPT_URL;

        // ========================================================== */
        // SUPPORT BOTH: Object payload AND Legacy parameters        */
        // ========================================================== */

        let imageBase64 = '';
        let folderCategory = 'PROFILE_PHOTOS';
        let filename = `upload_${Date.now()}.png`;
        let folderPath = '';
        let staffName = '';
        let staffAdek = '';
        let date = '';

        if (typeof payloadOrBase64 === 'object' && payloadOrBase64 !== null) {
            // Object payload
            imageBase64 = payloadOrBase64.image || payloadOrBase64.base64 || '';
            folderCategory = payloadOrBase64.category || payloadOrBase64.folderCategory || 'PROFILE_PHOTOS';
            filename = payloadOrBase64.fileName || payloadOrBase64.filename || `upload_${Date.now()}.png`;
            folderPath = payloadOrBase64.folderPath || '';
            staffName = payloadOrBase64.staffName || '';
            staffAdek = payloadOrBase64.staffAdek || '';
            date = payloadOrBase64.date || new Date().toISOString().split('T')[0];
        } else {
            // Legacy: (base64, category)
            imageBase64 = payloadOrBase64;
            folderCategory = folderCategoryParam;
        }

        if (!imageBase64) {
            throw new Error('No Base64 image data provided.');
        }

        // ========================================================== */
        // BUILD UPLOAD PAYLOAD                                        */
        // ========================================================== */

        const uploadPayload = {
            image: imageBase64,
            folderCategory: folderCategory,
            filename: filename,
            action: 'upload',
            timestamp: Date.now(),
            // Folder structure support
            folderPath: folderPath,
            staffName: staffName,
            staffAdek: staffAdek,
            date: date
        };

        // ========================================================== */
        // LOG FOR DEBUGGING                                           */
        // ========================================================== */

        console.log(`📤 Uploading: ${filename}`);
        if (folderPath) {
            console.log(`📁 Folder Path: ${folderPath}`);
        }
        console.log(`📂 Category: ${folderCategory}`);

        // ========================================================== */
        // SEND TO GOOGLE APPS SCRIPT                                  */
        // ========================================================== */

        const response = await fetch(scriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(uploadPayload)
        });

        if (!response.ok) {
            throw new Error(`HTTP Error Status: ${response.status}`);
        }

        const result = await response.json();
        console.log('📥 Upload Response:', result);

        // ========================================================== */
        // PARSE RESPONSE                                              */
        // ========================================================== */

        const fileUrl = result.fileUrl || result.url || result.link || result.downloadUrl || null;
        const fileId = result.fileId || result.id || null;

        if (fileUrl) {
            return {
                status: 'success',
                fileUrl: fileUrl,
                fileId: fileId,
                folderPath: folderPath,
                fileName: filename
            };
        }

        if (fileId) {
            const generatedUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
            return {
                status: 'success',
                fileUrl: generatedUrl,
                fileId: fileId,
                folderPath: folderPath,
                fileName: filename
            };
        }

        throw new Error(result.message || 'No Drive URL returned.');

    } catch (error) {
        console.error('❌ Google Drive Sync Error:', error);
        return {
            status: 'error',
            message: error.message,
            error: error
        };
    }
};

// ================================================================ */
// UPLOAD WITH RETRY                                                */
// ================================================================ */

window.uploadToDriveWithRetry = async (payload, retries = 3) => {
    let lastError = null;

    for (let i = 0; i < retries; i++) {
        try {
            console.log(`🔄 Upload attempt ${i + 1}/${retries}`);
            const res = await window.uploadToDrive(payload);

            if (res.status === 'success') {
                console.log(`✅ Upload successful on attempt ${i + 1}`);
                return res;
            }

            lastError = res.message || 'Upload failed';

            // Don't retry if it's a validation error
            if (res.message && (
                res.message.includes('invalid') ||
                res.message.includes('configuration') ||
                res.message.includes('not configured')
            )) {
                break;
            }

        } catch (error) {
            lastError = error.message;
            console.warn(`⚠️ Attempt ${i + 1} failed:`, lastError);
        }

        // Wait before retry (exponential backoff)
        if (i < retries - 1) {
            const delay = 1000 * Math.pow(2, i);
            console.log(`⏳ Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    return {
        status: 'error',
        message: lastError || 'All retry attempts failed',
        attempts: retries
    };
};

// ================================================================ */
// UPLOAD WITH PROGRESS                                             */
// ================================================================ */

window.uploadToDriveWithProgress = async (payload, onProgress) => {
    const progressSteps = [10, 25, 40, 55, 70, 85, 90, 95, 100];
    let progressIndex = 0;

    const progressInterval = setInterval(() => {
        if (onProgress && progressIndex < progressSteps.length) {
            onProgress(progressSteps[progressIndex]);
            progressIndex++;
        }
    }, 300);

    try {
        const result = await window.uploadToDrive(payload);
        clearInterval(progressInterval);

        if (onProgress) {
            onProgress(result.status === 'success' ? 100 : 0);
        }

        return result;
    } catch (error) {
        clearInterval(progressInterval);
        throw error;
    }
};

// ================================================================ */
// STAFF ATTENDANCE UPLOAD HELPER                                   */
// ================================================================ */

window.uploadStaffAttendanceSignature = async (staffData, sigData, type = 'checkin') => {
    const { name, adekPass, mobile } = staffData;
    const dateKey = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });

    const cleanName = name.replace(/[^a-zA-Z0-9]/g, '_');
    const cleanAdek = adekPass.replace(/[^a-zA-Z0-9]/g, '_');
    const typeLabel = type === 'checkin' ? 'CheckIn' : 'CheckOut';
    const fileName = `${typeLabel}_${dateKey}_${time.replace(/:/g, '-')}.png`;
    const folderPath = `${cleanName}_${cleanAdek}/${dateKey}`;

    console.log(`📁 Uploading ${type} signature to: ${folderPath}/${fileName}`);

    const payload = {
        image: sigData,
        category: UPLOAD_CONFIG.CATEGORIES.STAFF_ATTENDANCE,
        fileName: fileName,
        folderPath: folderPath,
        staffName: cleanName,
        staffAdek: cleanAdek,
        date: dateKey,
        type: type,
        timestamp: Date.now()
    };

    return window.uploadToDriveWithRetry(payload);
};

// ================================================================ */
// ASSET UPLOAD HELPERS                                             */
// ================================================================ */

window.uploadAssetPhoto = async (barcode, photoData, photoType = 'asset') => {
    const payload = {
        image: photoData,
        category: UPLOAD_CONFIG.CATEGORIES.ASSET_TRANSFER_PHOTOS,
        fileName: `Asset_${barcode}_${photoType}_${Date.now()}.jpg`,
        metadata: {
            barcode: barcode,
            photoType: photoType,
            timestamp: Date.now()
        }
    };

    return window.uploadToDriveWithRetry(payload);
};

window.uploadTransferSignature = async (barcode, signerType, sigData) => {
    const payload = {
        image: sigData,
        category: UPLOAD_CONFIG.CATEGORIES.ASSET_TRANSFER_SIGNATURES,
        fileName: `Transfer_Sig_${barcode}_${signerType}_${Date.now()}.png`,
        metadata: {
            barcode: barcode,
            signerType: signerType,
            timestamp: Date.now()
        }
    };

    return window.uploadToDriveWithRetry(payload);
};

// ================================================================ */
// PROFILE PHOTO UPLOAD HELPER                                      */
// ================================================================ */

window.uploadProfilePhoto = async (staffMobile, photoData) => {
    const payload = {
        image: photoData,
        category: UPLOAD_CONFIG.CATEGORIES.PROFILE_PHOTOS,
        fileName: `Profile_${staffMobile}_${Date.now()}.jpg`,
        metadata: {
            staffMobile: staffMobile,
            timestamp: Date.now()
        }
    };

    return window.uploadToDriveWithRetry(payload);
};

// ================================================================ */
// TASK PHOTO UPLOAD HELPER                                         */
// ================================================================ */

window.uploadTaskPhoto = async (taskId, photoData, photoType = 'before') => {
    const payload = {
        image: photoData,
        category: UPLOAD_CONFIG.CATEGORIES.TASK_PHOTOS,
        fileName: `Task_${taskId}_${photoType}_${Date.now()}.jpg`,
        metadata: {
            taskId: taskId,
            photoType: photoType,
            timestamp: Date.now()
        }
    };

    return window.uploadToDriveWithRetry(payload);
};

// ================================================================ */
// VISITOR SIGNATURE UPLOAD HELPER                                  */
// ================================================================ */

window.uploadVisitorSignature = async (visitorId, visitorName, sigData) => {
    const payload = {
        image: sigData,
        category: UPLOAD_CONFIG.CATEGORIES.VISITORS,
        fileName: `Visitor_Sig_${visitorId}_${Date.now()}.png`,
        metadata: {
            visitorId: visitorId,
            visitorName: visitorName,
            timestamp: Date.now()
        }
    };

    return window.uploadToDriveWithRetry(payload);
};

// ================================================================ */
// DISPOSAL PHOTO UPLOAD HELPER                                     */
// ================================================================ */

window.uploadDisposalPhoto = async (barcode, photoData, photoType = 'before') => {
    const payload = {
        image: photoData,
        category: UPLOAD_CONFIG.CATEGORIES.DISPOSAL,
        fileName: `Disp_${barcode}_${photoType}_${Date.now()}.jpg`,
        metadata: {
            barcode: barcode,
            photoType: photoType,
            timestamp: Date.now()
        }
    };

    return window.uploadToDriveWithRetry(payload);
};

// ================================================================ */
// LEGACY SUPPORT - OLD FUNCTION SIGNATURE                          */
// ================================================================ */

window.getDirectDriveImageUrl = function(driveUrl) {
    if (!driveUrl || driveUrl === 'N/A' || driveUrl === '-') {
        return 'https://placehold.co/400x300/e2e8f0/64748b?text=No+Photo';
    }
    if (driveUrl.startsWith('data:image')) return driveUrl;

    let fileId = null;
    const match = driveUrl.match(/\/file\/d\/([^\/]+)/) ||
                  driveUrl.match(/[?&]id=([^&]+)/) ||
                  driveUrl.match(/([a-zA-Z0-9_-]{25,})/);
    if (match) fileId = match[1];

    return fileId ? `https://lh3.googleusercontent.com/d/${fileId}` : driveUrl;
};

// ================================================================ */
// DRIVE CONFIG CACHE HELPER                                        */
// ================================================================ */

window.getDriveConfig = async function(forceRefresh = false) {
    try {
        const config = await window.driveConfigCache?.getConfig(forceRefresh);
        return config || { url: null, enabled: false };
    } catch (error) {
        console.error('Failed to get drive config:', error);
        return { url: null, enabled: false, error: error.message };
    }
};

// ================================================================ */
// TEST UPLOAD FUNCTION                                             */
// ================================================================ */

window.testDriveUpload = async function() {
    console.log('🧪 Testing Drive Upload...');

    // Create a test image (small black square)
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#4F46E5';
    ctx.fillRect(0, 0, 100, 100);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '12px Arial';
    ctx.fillText('TEST', 25, 55);
    const testImage = canvas.toDataURL('image/png');

    const result = await window.uploadToDrive({
        image: testImage,
        category: 'PROFILE_PHOTOS',
        fileName: `test_upload_${Date.now()}.png`
    });

    if (result.status === 'success') {
        console.log('✅ Test upload successful!');
        console.log('📎 URL:', result.fileUrl);
        alert(`✅ Test upload successful!\n\nURL: ${result.fileUrl}`);
    } else {
        console.error('❌ Test upload failed:', result.message);
        alert(`❌ Test upload failed: ${result.message}`);
    }

    return result;
};

console.log("✅ drive_module.js loaded (COMPLETE FIX - FOLDER STRUCTURE SUPPORT)");
