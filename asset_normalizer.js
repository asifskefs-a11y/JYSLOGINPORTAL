/**
 * ASSET DATA NORMALIZER - Universal Asset Data Mapping Engine
 * Handles mapping between Admin Dashboard headers and frontend field names
 * Version: 2.0 - Fixed for actual database structure with 14 required fields
 */

// ================================================================ */
// COMPLETE FIELD MAPPING - Matches ACTUAL database structure      */
// ================================================================ */

const ASSET_FIELD_MAPPING = {
    // Identity Fields
    'barcode': {
        keys: ['barcode', 'assetBarcode', 'asset_barcode', 'ASSET BARCODE', 'asset_code', 'code', 'id', 'assetId', 'asset_id', '_id'],
        default: '-'
    },
    'assetName': {
        keys: ['assetName', 'asset_name', 'name', 'ASSET NAME', 'itemName', 'item_name', 'title', 'assetDescription', 'asset_description', 'Asset Description', 'description'],
        default: 'Unknown Asset'
    },
    'description': {
        keys: ['description', 'assetDescription', 'asset_description', 'ASSET DESCRIPTION', 'desc', 'itemDescription', 'item_description', 'Description', 'assetName', 'name'],
        default: '-'
    },
    'serialNo': {
        keys: ['serialNo', 'serial_number', 'serialNumber', 'SERIAL NO', 'serial', 'sn', 'Serial No.', 'Serial No', 'f2_serial_no'],
        default: '-'
    },

    // Category Fields
    'category': {
        keys: ['category', 'CATEGORY', 'assetCategory', 'asset_category', 'type', 'assetType', 'asset_type', 'Classification', 'f15_category'],
        default: 'NON IT'
    },
    'majorCategory': {
        keys: ['majorCategory', 'major_category', 'MAJOR CATEGORY', 'major', 'category_major', 'Major Category', 'f10_major_cat'],
        default: '-'
    },
    'minorCategory': {
        keys: ['minorCategory', 'minor_category', 'MINOR CATEGORY', 'minor', 'classification', 'class', 'Minor Category', 'f16_class'],
        default: '-'
    },
    'subMinorCategory': {
        keys: ['subMinorCategory', 'sub_minor_category', 'SUB MINOR CATEGORY', 'sub_minor', 'subMinor', 'subcategory', 'Sub Minor Category', 'f12_sub_minor'],
        default: '-'
    },

    // Location Fields
    'location': {
        keys: ['location', 'LOCATION', 'locationName', 'location_name', 'LOCATION NAME', 'loc', 'site', 'Location Name', 'f17_location'],
        default: '-'
    },
    'building': {
        keys: ['building', 'BUILDING', 'schoolBuilding', 'school_building', 'SCHOOL BUILDING NAME', 'buildingName', 'building_name', 'School Building Name', 'f19_school_building'],
        default: '-'
    },
    'roomNo': {
        keys: ['roomNo', 'room_no', 'ROOM NO', 'roomNumber', 'room_number', 'ROOM NUMBER', 'room', 'Room No.', 'Room No', 'f21_room_no'],
        default: '-'
    },
    'roomName': {
        keys: ['roomName', 'room_name', 'ROOM NAME', 'room', 'Room Name', 'f20_room_name'],
        default: '-'
    },
    'floorNo': {
        keys: ['floorNo', 'floor_no', 'FLOOR NO', 'floor', 'floorNumber', 'floor_number', 'Floor No.', 'Floor No', 'f23_floor_no'],
        default: '-'
    },
    'floorDescription': {
        keys: ['floorDescription', 'floor_description', 'FLOOR DESCRIPTION', 'floorDesc', 'floor_desc', 'FLOOR DISCRETION', 'Floor Description', 'f24_floor_desc'],
        default: '-'
    },

    // Vendor & Purchase Fields
    'vendor': {
        keys: ['vendor', 'VENDOR', 'assetVendor', 'asset_vendor', 'ASSET VENDOR NAME', 'supplier', 'manufacturer', 'Vendor Name', 'Asset Vendor Name', 'f30_vendor', 'assetVendorName'],
        default: '-'
    },
    'manufacturer': {
        keys: ['manufacturer', 'MANUFACTURER', 'brand', 'make', 'model', 'Manufacturer', 'f9_manufacturer'],
        default: '-'
    },
    'model': {
        keys: ['model', 'MODEL', 'modelDescription', 'model_description', 'MODEL DESCRIPTION', 'productModel', 'Model Description', 'f3_model_desc'],
        default: '-'
    },

    // Date Fields
    'dateInService': {
        keys: ['dateInService', 'date_in_service', 'DATE PLACE IN SERVICE', 'serviceDate', 'service_date', 'purchaseDate', 'purchase_date', 'Date Place in Service', 'f8_service_date'],
        default: '-'
    },

    // Status Fields
    'assetStatus': {
        keys: ['assetStatus', 'asset_status', 'ASSET STATUS', 'status', 'condition', 'Asset Status', 'f26_asset_stat'],
        default: 'Existing'
    },
    'condition': {
        keys: ['condition', 'CONDITION', 'assetCondition', 'asset_condition', 'ASSET CONDITION', 'state', 'Asset Condition', 'f4_asset_cond'],
        default: 'Good'
    },

    // Assignment Fields
    'custodian': {
        keys: ['custodian', 'CUSTODIAN', 'assignedTo', 'assigned_to', 'ASSIGNED TO', 'responsible', 'owner', 'Assigned Custodian'],
        default: 'Unassigned'
    },
    'department': {
        keys: ['department', 'DEPARTMENT', 'dept', 'division', 'costCenter', 'cost_center', 'Department'],
        default: '-'
    },

    // Photo Fields
    'photoUrl': {
        keys: ['photoUrl', 'photo_url', 'PHOTO URL', 'photo', 'imageUrl', 'image_url', 'auditPhoto', 'audit_photo', 'AUDIT PHOTO', 'profilePicUrl', 'Photo Link', 'photoURL'],
        default: null
    },

    // System Fields
    'importedAt': {
        keys: ['importedAt', 'imported_at', 'createdAt', 'created_at', 'timestamp'],
        default: '-'
    },
    'updatedAt': {
        keys: ['updatedAt', 'updated_at', 'lastUpdated', 'last_updated'],
        default: '-'
    }
};

// ================================================================ */
// NORMALIZATION HELPER FUNCTIONS                                   */
// ================================================================ */

/**
 * Normalize a single asset record
 * @param {Object} rawAsset - The raw asset data from Firebase
 * @returns {Object} Normalized asset object with standardized keys
 */
function normalizeAssetData(rawAsset) {
    if (!rawAsset || typeof rawAsset !== 'object') {
        return getDefaultAsset();
    }

    const normalized = {};

    // Process each field mapping
    Object.keys(ASSET_FIELD_MAPPING).forEach(targetKey => {
        const mapping = ASSET_FIELD_MAPPING[targetKey];
        let value = null;

        // Try each possible key in order
        for (const sourceKey of mapping.keys) {
            if (rawAsset[sourceKey] !== undefined && rawAsset[sourceKey] !== null && rawAsset[sourceKey] !== '') {
                value = rawAsset[sourceKey];
                break;
            }
        }

        // If no value found, use default
        if (value === null || value === undefined) {
            normalized[targetKey] = mapping.default;
        } else {
            // Clean up string values
            if (typeof value === 'string') {
                value = value.trim();
                if (value === 'N/A' || value === 'null' || value === 'undefined' || value === '') {
                    normalized[targetKey] = mapping.default;
                } else {
                    normalized[targetKey] = value;
                }
            } else {
                normalized[targetKey] = value;
            }
        }
    });

    // SPECIAL HANDLING: If assetName is still default, try using description or other fields
    if (normalized.assetName === 'Unknown Asset' || normalized.assetName === '-') {
        if (rawAsset.assetDescription && rawAsset.assetDescription !== 'N/A') {
            normalized.assetName = rawAsset.assetDescription;
        } else if (rawAsset.name && rawAsset.name !== 'N/A') {
            normalized.assetName = rawAsset.name;
        } else if (rawAsset.description && rawAsset.description !== 'N/A') {
            normalized.assetName = rawAsset.description;
        } else if (rawAsset.AssetDescription && rawAsset.AssetDescription !== 'N/A') {
            normalized.assetName = rawAsset.AssetDescription;
        }
    }

    // SPECIAL HANDLING: If location is '-', try other location fields
    if (normalized.location === '-') {
        if (rawAsset.locationName && rawAsset.locationName !== 'N/A') {
            normalized.location = rawAsset.locationName;
        } else if (rawAsset['Location Name'] && rawAsset['Location Name'] !== 'N/A') {
            normalized.location = rawAsset['Location Name'];
        } else if (rawAsset.roomName && rawAsset.roomName !== 'N/A') {
            normalized.location = rawAsset.roomName;
        } else if (rawAsset.RoomName && rawAsset.RoomName !== 'N/A') {
            normalized.location = rawAsset.RoomName;
        } else if (rawAsset.location && rawAsset.location !== 'N/A') {
            normalized.location = rawAsset.location;
        }
    }

    // SPECIAL HANDLING: If vendor is '-', try other vendor fields
    if (normalized.vendor === '-') {
        if (rawAsset.assetVendorName && rawAsset.assetVendorName !== 'N/A') {
            normalized.vendor = rawAsset.assetVendorName;
        } else if (rawAsset['Asset Vendor Name'] && rawAsset['Asset Vendor Name'] !== 'N/A') {
            normalized.vendor = rawAsset['Asset Vendor Name'];
        } else if (rawAsset.vendor && rawAsset.vendor !== 'N/A') {
            normalized.vendor = rawAsset.vendor;
        } else if (rawAsset.assetVendor && rawAsset.assetVendor !== 'N/A') {
            normalized.vendor = rawAsset.assetVendor;
        }
    }

    // SPECIAL HANDLING: If category is '-', try other category fields
    if (normalized.category === '-' || normalized.category === 'NON IT') {
        if (rawAsset.category && rawAsset.category !== 'N/A' && rawAsset.category !== '') {
            normalized.category = rawAsset.category;
        } else if (rawAsset.Category && rawAsset.Category !== 'N/A') {
            normalized.category = rawAsset.Category;
        } else if (rawAsset.classification && rawAsset.classification !== 'N/A') {
            normalized.category = rawAsset.classification;
        } else if (rawAsset.Classification && rawAsset.Classification !== 'N/A') {
            normalized.category = rawAsset.Classification;
        }
    }

    // SPECIAL HANDLING: If barcode is '-', try other barcode fields
    if (normalized.barcode === '-') {
        if (rawAsset.assetBarcode && rawAsset.assetBarcode !== 'N/A') {
            normalized.barcode = rawAsset.assetBarcode;
        } else if (rawAsset['Asset Barcode'] && rawAsset['Asset Barcode'] !== 'N/A') {
            normalized.barcode = rawAsset['Asset Barcode'];
        } else if (rawAsset.barcode && rawAsset.barcode !== 'N/A') {
            normalized.barcode = rawAsset.barcode;
        }
    }

    // SPECIAL HANDLING: If condition is '-', try other condition fields
    if (normalized.condition === 'Good' || normalized.condition === '-') {
        if (rawAsset.assetCondition && rawAsset.assetCondition !== 'N/A') {
            normalized.condition = rawAsset.assetCondition;
        } else if (rawAsset['Asset Condition'] && rawAsset['Asset Condition'] !== 'N/A') {
            normalized.condition = rawAsset['Asset Condition'];
        } else if (rawAsset.condition && rawAsset.condition !== 'N/A') {
            normalized.condition = rawAsset.condition;
        }
    }

    // SPECIAL HANDLING: If floorNo is '-', try other floor fields
    if (normalized.floorNo === '-') {
        if (rawAsset.floorNo && rawAsset.floorNo !== 'N/A') {
            normalized.floorNo = rawAsset.floorNo;
        } else if (rawAsset['Floor No.'] && rawAsset['Floor No.'] !== 'N/A') {
            normalized.floorNo = rawAsset['Floor No.'];
        } else if (rawAsset.floor && rawAsset.floor !== 'N/A') {
            normalized.floorNo = rawAsset.floor;
        }
    }

    // SPECIAL HANDLING: If dateInService is '-', try other date fields
    if (normalized.dateInService === '-') {
        if (rawAsset.datePlaceInService && rawAsset.datePlaceInService !== 'N/A') {
            normalized.dateInService = rawAsset.datePlaceInService;
        } else if (rawAsset['Date Place in Service'] && rawAsset['Date Place in Service'] !== 'N/A') {
            normalized.dateInService = rawAsset['Date Place in Service'];
        } else if (rawAsset.serviceDate && rawAsset.serviceDate !== 'N/A') {
            normalized.dateInService = rawAsset.serviceDate;
        }
    }

    // Add raw data reference for debugging
    normalized._raw = rawAsset;
    normalized._foundKeys = {};

    // Track which keys were found for debugging
    Object.keys(rawAsset).forEach(key => {
        if (rawAsset[key] !== undefined && rawAsset[key] !== null && rawAsset[key] !== '') {
            normalized._foundKeys[key] = rawAsset[key];
        }
    });

    return normalized;
}

/**
 * Get default asset object with all fields set to '-'
 */
function getDefaultAsset() {
    const defaultAsset = {};
    Object.keys(ASSET_FIELD_MAPPING).forEach(key => {
        defaultAsset[key] = ASSET_FIELD_MAPPING[key].default || '-';
    });
    // Override specific defaults
    defaultAsset.assetName = 'Unknown Asset';
    defaultAsset.category = 'NON IT';
    defaultAsset.assetStatus = 'Existing';
    defaultAsset.custodian = 'Unassigned';
    return defaultAsset;
}

/**
 * Format asset for disposal display with 14 required fields
 */
function formatAssetForDisposal(asset) {
    if (!asset) return null;

    return {
        ASSET_BARCODE: asset.barcode || '-',
        ASSET_DESCRIPTION: asset.assetName || asset.description || 'Unknown Asset',
        ASSET_VENDOR_NAME: asset.vendor || '-',
        CATEGORY: asset.category || 'NON IT',
        DATE_PLACE_IN_SERVICE: asset.dateInService || '-',
        FLOOR_DISCRETION: asset.floorDescription || '-',
        FLOOR_NO: asset.floorNo || '-',
        LOCATION_NAME: asset.location || '-',
        MAJOR_CATEGORY: asset.majorCategory || '-',
        MINOR_CATEGORY: asset.minorCategory || '-',
        SCHOOL_BUILDING_NAME: asset.building || '-',
        ROOM_NUMBER: asset.roomNo || '-',
        ROOM_NAME: asset.roomName || '-',
        SUB_MINOR_CATEGORY: asset.subMinorCategory || '-',
        AUDIT_PHOTO: asset.photoUrl || null,
        ASSET_STATUS: asset.assetStatus || 'Existing',
        CONDITION: asset.condition || 'Good',
        CUSTODIAN: asset.custodian || 'Unassigned',
        DEPARTMENT: asset.department || '-',
        MODEL: asset.model || '-',
        MANUFACTURER: asset.manufacturer || '-',
        SERIAL_NO: asset.serialNo || '-'
    };
}

/**
 * Get the field mapping for debugging
 */
function getFieldMapping() {
    return ASSET_FIELD_MAPPING;
}

// ================================================================ */
// EXPOSE GLOBALLY                                                   */
// ================================================================ */

window.normalizeAssetData = normalizeAssetData;
window.getDefaultAsset = getDefaultAsset;
window.formatAssetForDisposal = formatAssetForDisposal;
window.getFieldMapping = getFieldMapping;
window.ASSET_FIELD_MAPPING = ASSET_FIELD_MAPPING;

console.log('✅ asset_normalizer.js v2.0 loaded');