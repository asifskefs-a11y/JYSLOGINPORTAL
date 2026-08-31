/**
 * Modal Payload Builders and Schema Validators
 * Ensures consistent data structure across all dynamic modals.
 */

export const ModalPayloadSchema = {
    STAFF: ['id', 'name', 'role', 'mobile'],
    ASSET: ['barcode', 'description', 'status'],
    TASK: ['id', 'location', 'details', 'status'],
    TRANSFER: ['id', 'initiator', 'source', 'destination'],
    DOC_REVIEW: ['mobile'],
    ATTENDANCE: ['staffKey']
};

export const ModalPayloadBuilders = {
    attendance(data) {
        this._validate('ATTENDANCE', data);
        return {
            title: 'Attendance Details',
            type: 'attendance',
            data: {
                staffKey: data.staffKey || ''
            }
        };
    },

    docReview(data) {
        this._validate('DOC_REVIEW', data);
        return {
            title: 'Staff Document Review',
            type: 'docReview',
            data: {
                mobile: data.mobile || data.adekPass || '',
                name: data.name || data.fullName || ''
            }
        };
    },

    staff(data) {
        this._validate('STAFF', data);
        return {
            title: data.firebaseKey ? 'Edit Staff Member' : 'Add New Staff',
            type: 'staff',
            data: {
                firebaseKey: data.firebaseKey || null,
                id: data.id || data.adekPass || '',
                name: data.name || data.fullName || '',
                role: data.role || '',
                mobile: data.mobile || '',
                branch: data.branch || data.school || '',
                password: data.password || ''
            }
        };
    },

    asset(data) {
        this._validate('ASSET', data);
        return {
            title: 'Asset Details',
            type: 'asset',
            data: {
                barcode: data.assetBarcode || data.barcode || '',
                description: data.assetDescription || data.description || '',
                status: data.assetStatus || data.status || 'Active',
                category: data.category || '',
                location: data.location || '',
                photo: data.photoUrl || data.photo || ''
            }
        };
    },

    task(data) {
        this._validate('TASK', data);
        return {
            title: 'Task Inspection',
            type: 'task',
            data: {
                id: data.id || '',
                location: data.location || '',
                details: data.details || '',
                status: data.status || 'Open',
                raisedBy: data.raisedByName || '',
                timestamp: data.timestamp || Date.now(),
                beforePhoto: data.beforePhotoUrl || '',
                afterPhoto: data.afterPhotoUrl || ''
            }
        };
    },

    transfer(data) {
        this._validate('TRANSFER', data);
        return {
            title: 'Transfer Details',
            type: 'transfer',
            data: {
                id: data.id || data.firebaseKey || '',
                initiator: data.securityName || data.initiator || '',
                source: data.locationName || data.source || '',
                destination: data.companyName || data.destination || '',
                collector: data.collectorName || '',
                date: data.collectionDate || '',
                assets: data.assets || []
            }
        };
    },

    _validate(type, data) {
        const required = ModalPayloadSchema[type];
        if (!required) return;

        const missing = required.filter(field => {
            // Check common variations
            if (field === 'id') return !(data.id || data.firebaseKey || data.adekPass || data.assetBarcode || data.barcode);
            if (field === 'name') return !(data.name || data.fullName || data.raisedByName);
            return !data[field];
        });

        if (missing.length > 0) {
            console.warn(`⚠️ Modal Payload Validation Warning [${type}]: Missing fields - ${missing.join(', ')}`);
        }
    }
};
