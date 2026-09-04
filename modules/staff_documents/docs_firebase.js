import { db } from '../../firebase_config.js';
import { ref, get, update, set, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ================================================================ */
// ✅ FIREBASE HELPERS - FIXED v2.0                                 */
// ================================================================ */

/**
 * ✅ Get role requirements (case-insensitive)
 */
window.getRoleRequirements = async function(roleId) {
    try {
        if (!roleId) return {};

        roleId = String(roleId).trim();

        // ✅ Try multiple case variations
        const variations = [
            roleId,
            roleId.toLowerCase(),
            roleId.toUpperCase(),
            roleId.charAt(0).toUpperCase() + roleId.slice(1).toLowerCase()
        ];

        for (const variant of variations) {
            const roleRef = ref(db, `role_required_docs/${variant}`);
            const snap = await get(roleRef);
            if (snap.exists()) {
                const data = snap.val();
                // ✅ Handle both data structures
                const docs = data.required_docs || data.docs || data || {};
                console.log(`✅ Found requirements for: ${variant}`, docs);
                return docs;
            }
        }

        console.log(`ℹ️ No requirements found for role: ${roleId}`);
        // Return defaults as fallback if admin hasn't set anything yet
        return getDefaultRequirements(roleId);

    } catch (error) {
        console.error("❌ Error fetching role requirements:", error);
        return {};
    }
};

/**
 * ✅ Save role requirements (Admin)
 */
window.saveRoleRequirements = async function(roleId, selectedDocs) {
    try {
        if (!roleId) throw new Error("Role ID is required");
        if (!selectedDocs || Object.keys(selectedDocs).length === 0) {
            throw new Error("Select at least one document");
        }

        // ✅ Prepare data
        const requirements = {};
        Object.entries(selectedDocs).forEach(([id, value]) => {
            requirements[id] = {
                name: value.name || id,
                mandatory: value.mandatory !== false,
                icon: value.icon || (window.getDocIcon ? window.getDocIcon(id) : 'fa-file')
            };
        });

        // ✅ Save to Firebase
        const roleRef = ref(db, `role_required_docs/${roleId}`);
        await set(roleRef, {
            required_docs: requirements,
            updatedAt: Date.now(),
            updatedBy: 'admin'
        });

        console.log(`✅ Requirements saved for role: ${roleId}`);
        return true;

    } catch (error) {
        console.error("❌ Error saving requirements:", error);
        throw error;
    }
};

/**
 * ✅ Default requirements for roles
 */
function getDefaultRequirements(role) {
    const defaults = {
        'Security': {
            'EMIRATES_ID': { name: 'EMIRATES_ID', mandatory: true },
            'PASSPORT': { name: 'PASSPORT', mandatory: true },
            'SIRA_LICENSE': { name: 'SIRA_LICENSE', mandatory: true },
            'POLICE_CLEARANCE': { name: 'POLICE CLEARANCE', mandatory: true }
        },
        'Cleaner': {
            'EMIRATES_ID': { name: 'EMIRATES_ID', mandatory: true },
            'PASSPORT': { name: 'PASSPORT', mandatory: true },
            'MEDICAL_REPORT': { name: 'MEDICAL REPORT', mandatory: true }
        },
        'Cleaner Leader': {
            'EMIRATES_ID': { name: 'EMIRATES_ID', mandatory: true },
            'PASSPORT': { name: 'PASSPORT', mandatory: true },
            'MEDICAL_REPORT': { name: 'MEDICAL REPORT', mandatory: true },
            'LEADERSHIP_CERTIFICATE': { name: 'LEADERSHIP CERTIFICATE', mandatory: true }
        },
        'Technician': {
            'EMIRATES_ID': { name: 'EMIRATES_ID', mandatory: true },
            'PASSPORT': { name: 'PASSPORT', mandatory: true },
            'TECHNICAL_LICENSE': { name: 'TECHNICAL LICENSE', mandatory: true },
            'MEDICAL_REPORT': { name: 'MEDICAL REPORT', mandatory: true }
        },
        'Gardener': {
            'EMIRATES_ID': { name: 'EMIRATES_ID', mandatory: true },
            'PASSPORT': { name: 'PASSPORT', mandatory: true },
            'MEDICAL_REPORT': { name: 'MEDICAL REPORT', mandatory: true }
        },
        'Admin': {
            'EMIRATES_ID': { name: 'EMIRATES_ID', mandatory: true },
            'PASSPORT': { name: 'PASSPORT', mandatory: true },
            'DEGREE_CERTIFICATE': { name: 'DEGREE CERTIFICATE', mandatory: true },
            'EXPERIENCE_LETTER': { name: 'EXPERIENCE LETTER', mandatory: true }
        },
        'Bus Monitor': {
            'EMIRATES_ID': { name: 'EMIRATES_ID', mandatory: true },
            'PASSPORT': { name: 'PASSPORT', mandatory: true },
            'MEDICAL_REPORT': { name: 'MEDICAL REPORT', mandatory: true },
            'POLICE_CLEARANCE': { name: 'POLICE CLEARANCE', mandatory: true }
        },
        'Bus Driver': {
            'EMIRATES_ID': { name: 'EMIRATES_ID', mandatory: true },
            'PASSPORT': { name: 'PASSPORT', mandatory: true },
            'DRIVING_LICENSE': { name: 'DRIVING LICENSE', mandatory: true },
            'MEDICAL_REPORT': { name: 'MEDICAL REPORT', mandatory: true },
            'POLICE_CLEARANCE': { name: 'POLICE CLEARANCE', mandatory: true }
        },
        'Supervisor': {
            'EMIRATES_ID': { name: 'EMIRATES_ID', mandatory: true },
            'PASSPORT': { name: 'PASSPORT', mandatory: true },
            'SUPERVISOR_CERTIFICATE': { name: 'SUPERVISOR CERTIFICATE', mandatory: true },
            'MEDICAL_REPORT': { name: 'MEDICAL REPORT', mandatory: true },
            'EXPERIENCE_LETTER': { name: 'EXPERIENCE LETTER', mandatory: true }
        }
    };

    // ✅ Find matching role (case-insensitive)
    const roleKey = Object.keys(defaults).find(key =>
        key.toLowerCase() === (role || '').toLowerCase()
    );

    return roleKey ? defaults[roleKey] : {};
}

/**
 * ✅ Get staff documents
 */
window.getStaffDocuments = async function(userId) {
    try {
        if (!userId) {
            return { docs: {}, isAccountActivated: false, verificationProgress: "0%" };
        }

        // ✅ MANDATED FIX: Check both Pass ID and Mobile variations for resolution
        const variations = [userId];
        const staff = window.currentStaff || JSON.parse(sessionStorage.getItem('active_staff_user') || '{}');
        if (staff.mobile && staff.mobile !== userId) variations.push(staff.mobile);
        if (staff.adekPass && staff.adekPass !== userId) variations.push(staff.adekPass);

        for (const id of variations) {
            const docRef = ref(db, `staff_documents/${id}`);
            const snap = await get(docRef);

            if (snap.exists()) {
                const data = snap.val();
                console.log(`✅ Documents resolved using key: ${id}`);
                return {
                    docs: data.docs || {},
                    isAccountActivated: data.isAccountActivated || false,
                    verificationProgress: data.verificationProgress || "0%"
                };
            }
        }

        return { docs: {}, isAccountActivated: false, verificationProgress: "0%" };

    } catch (error) {
        console.error("Error fetching staff documents:", error);
        return { docs: {}, isAccountActivated: false, verificationProgress: "0%" };
    }
};

/**
 * ✅ Get latest staff data by ADEK Pass or Mobile
 */
window.getLatestStaffData = async function(uniqueId) {
    try {
        if (!uniqueId) return null;

        const staffSnap = await get(ref(db, 'staff'));
        if (!staffSnap.exists()) return null;

        const rawData = staffSnap.val();
        const allStaff = Array.isArray(rawData) ? rawData.filter(x => x) : Object.values(rawData);
        const cleanId = String(uniqueId).trim().toLowerCase();

        // ✅ Search in all staff records
        for (const staff of allStaff) {
            const adekPass = String(staff.adekPass || "").toLowerCase();
            const mobile = String(staff.mobile || "").toLowerCase();

            if (adekPass === cleanId || mobile === cleanId) {
                return staff;
            }
        }

        return null;

    } catch (error) {
        console.error("Error fetching staff data:", error);
        return null;
    }
};

/**
 * ✅ Save document metadata
 */
window.saveDocMetadata = async function(userId, docKey, metadata) {
    try {
        if (!userId || !docKey) {
            throw new Error("Missing userId or docKey");
        }

        const updates = {};
        const path = `staff_documents/${userId}/docs/${docKey}/`;

        updates[path + 'driveFileUrl'] = metadata.driveFileUrl || '';
        updates[path + 'status'] = metadata.status || 'PENDING REVIEW';
        updates[path + 'uploadedAt'] = Date.now();
        updates[path + 'issueDate'] = metadata.issueDate || '';
        updates[path + 'expiryDate'] = metadata.expiryDate || '';
        updates[path + 'documentType'] = metadata.documentType || docKey;

        await update(ref(db), updates);

        // ✅ Recalculate progress
        return await window.recalculateVerificationProgress(userId);

    } catch (error) {
        console.error("Error saving document metadata:", error);
        throw error;
    }
};

/**
 * ✅ Recalculate verification progress
 */
window.recalculateVerificationProgress = async function(userId) {
    try {
        if (!userId) return;

        const node = await window.getStaffDocuments(userId);
        const docs = node.docs || {};
        const docKeys = Object.keys(docs);
        const total = docKeys.length;

        if (total === 0) {
            // ✅ Update with 0%
            const updates = {};
            updates[`staff_documents/${userId}/verificationProgress`] = "0%";
            updates[`staff_documents/${userId}/isAccountActivated`] = false;
            await update(ref(db), updates);
            return;
        }

        // ✅ Count approved documents
        const approved = docKeys.filter(key =>
            docs[key] && docs[key].status === 'APPROVED'
        ).length;

        const progress = Math.round((approved / total) * 100);
        const isActivated = (progress === 100);

        const updates = {};
        updates[`staff_documents/${userId}/verificationProgress`] = progress + "%";
        updates[`staff_documents/${userId}/isAccountActivated`] = isActivated;

        await update(ref(db), updates);

        // ✅ MANDATED FIX: Sync Activation to Master Staff User Node (v5.0)
        if (isActivated) {
            const staffSnap = await get(ref(db, 'staff'));
            if (staffSnap.exists()) {
                const allStaff = staffSnap.val();
                let staffKey = null;
                for (const [key, val] of Object.entries(allStaff)) {
                    if ((val.adekPass === userId || val.mobile === userId)) {
                        staffKey = key;
                        break;
                    }
                }
                if (staffKey) {
                    await update(ref(db, `staff/${staffKey}`), { isAccountActive: true });
                    console.log(`✅ Staff account ${userId} auto-activated!`);
                }
            }
        }

        console.log(`📊 Progress updated: ${progress}% (${approved}/${total})`);

        return { progress, isActivated };

    } catch (error) {
        console.error("Error recalculating progress:", error);
        throw error;
    }
};

/**
 * ✅ Process document upload (Complete Pipeline)
 */
window.processDocUpload = async function(userId, docType, base64, metadata = {}) {
    try {
        console.log(`📤 Processing upload for: ${docType}`);

        if (!userId) throw new Error("User ID is required");
        if (!docType) throw new Error("Document type is required");
        if (!base64) throw new Error("File data is required");

        // ✅ Step 1: Upload to Google Drive
        let driveFileUrl = '';
        if (window.uploadToDrive) {
            const uploadRes = await window.uploadToDrive({
                category: 'DOCUMENTS',
                documentType: docType,
                adekPassNumber: userId,
                fileName: `${userId}_${docType}_${Date.now()}.jpg`,
                image: base64
            });

            if (uploadRes && uploadRes.status === 'success') {
                driveFileUrl = uploadRes.fileUrl;
            } else {
                throw new Error("Drive upload failed: " + (uploadRes?.message || 'Unknown error'));
            }
        } else {
            console.warn("⚠️ uploadToDrive is not available");
        }

        // ✅ Step 2: Save metadata to Firebase
        const docData = {
            driveFileUrl: driveFileUrl,
            status: 'PENDING REVIEW',
            uploadedAt: Date.now(),
            issueDate: metadata.issueDate || '',
            expiryDate: metadata.expiryDate || '',
            documentType: docType
        };

        await window.saveDocMetadata(userId, docType, docData);

        // ✅ Step 3: Recalculate progress
        await window.recalculateVerificationProgress(userId);

        console.log(`✅ Upload completed for: ${docType}`);
        return true;

    } catch (error) {
        console.error("Process upload error:", error);
        throw error;
    }
};

/**
 * ✅ UPDATE STAFF BIO-DATA (v5.0)
 */
window.updateStaffBioData = async function(staffKey, bioData) {
    try {
        await update(ref(db, `staff/${staffKey}`), {
            bioData: bioData,
            bioDataLastUpdated: Date.now()
        });
        return true;
    } catch (e) {
        console.error("Bio-Data Save Error:", e);
        throw e;
    }
};

console.log("✅ docs_firebase.js v5.0 Loaded");
