/* --- STAFF DOCUMENT DRIVE & FIREBASE SYNC ENGINE --- */
import { db } from '../../firebase_config.js';
import { ref, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

/**
 * Uploads a document to Google Drive and syncs metadata to Firebase
 * @param {string} userId - User's unique ID
 * @param {string} docKey - Document type ID (e.g., 'PASSPORT')
 * @param {string} base64Data - Document file in base64 format
 * @param {Object} metadata - { issueDate, expiryDate }
 */
window.processDocUpload = async function(userId, docKey, base64Data, metadata) {
    window.showGlobalSpinner("Uploading document to secure storage...");

    try {
        // 1. Upload to Drive
        const uploadRes = await window.uploadToDrive({
            category: 'STAFF_DOCUMENTS',
            fileName: `Doc_${userId}_${docKey}_${Date.now()}.jpg`,
            image: base64Data
        });

        if (uploadRes.status !== 'success') {
            throw new Error(uploadRes.message || "Failed to upload to Google Drive");
        }

        // 2. Prepare Metadata
        const docMetadata = {
            driveFileUrl: uploadRes.fileUrl,
            issueDate: metadata.issueDate,
            expiryDate: metadata.expiryDate,
            status: "PENDING", // Ready for Admin review
            rejectionReason: ""
        };

        // 3. Sync to Firebase
        await window.saveDocMetadata(userId, docKey, docMetadata);

        window.triggerSuccessPopup("✅ Document uploaded successfully!");
        return true;

    } catch (error) {
        console.error("❌ Upload Workflow Error:", error);
        alert("Failed to process document: " + error.message);
        return false;
    } finally {
        window.hideGlobalSpinner();
    }
};

console.log("✅ docs_drive.js initialized");
