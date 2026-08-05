// ================================================
// DYNAMIC HEADER NORMALIZATION & FUZZY MATCHING
// CROSS-DEVICE SUPPORT: Mobile, Desktop, Laptop
// ================================================

/**
 * FIELD NORMALIZATION ENGINE
 * Handles all 16 Target Fields with intelligent matching
 */

class FieldNormalizer {
    constructor() {
        // Define EXACT headers and sequence (15 Fields)
        this.fieldMap = {
            'barcode': {
                label: 'ASSET BARCODE',
                variations: ['barcode', 'assetbarcode', 'asset barcode', 'code'],
                default: 'N/A'
            },
            'description': {
                label: 'ASSET DESCRIPTION',
                variations: ['description', 'asset description', 'assetdesc', 'modeldescription', 'model_desc'],
                default: 'N/A'
            },
            'vendor': {
                label: 'ASSET VENDOR NAME',
                variations: ['vendor', 'vendor name', 'vendorname', 'supplier'],
                default: 'N/A'
            },
            'category': {
                label: 'CATEGORY',
                variations: ['category', 'cat', 'categoryname', 'type'],
                default: 'N/A'
            },
            'serviceDate': {
                label: 'DATE PLACE IN SERVICE',
                variations: ['servicedate', 'service date', 'dateinservice', 'date in service', 'f8_service_date', 'lastservicedate', 'service_dt'],
                default: 'N/A'
            },
            'floorDesc': {
                label: 'FLOOR DISCRETION',
                variations: ['floordesc', 'floor description', 'floor_desc', 'floor discretion'],
                default: 'N/A'
            },
            'floorNo': {
                label: 'FLOOR NO',
                variations: ['floorno', 'floor no', 'floor_no', 'floor'],
                default: 'N/A'
            },
            'location': {
                label: 'LOCATION NAME',
                variations: ['location', 'location name', 'locationname', 'loc'],
                default: 'N/A'
            },
            'majorCategory': {
                label: 'MAJOR CATEGORY',
                variations: ['majorcategory', 'major category', 'major_category'],
                default: 'N/A'
            },
            'minorCategory': {
                label: 'MINOR CATEGORY',
                variations: ['minorcategory', 'minor category', 'minor_category', 'classification', 'class'],
                default: 'N/A'
            },
            'building': {
                label: 'SCHOOL BUILDING NAME',
                variations: ['building', 'building name', 'buildingname', 'schoolbuilding', 'school building name'],
                default: 'N/A'
            },
            'roomNo': {
                label: 'ROOM NUMBER',
                variations: ['roomno', 'room no', 'room_no', 'room number', 'roomnumber'],
                default: 'N/A'
            },
            'roomName': {
                label: 'ROOM NAME',
                variations: ['roomname', 'room name', 'room_name'],
                default: 'N/A'
            },
            'subMinorCategory': {
                label: 'SUB MINOR CATEGORY',
                variations: ['subminorcategory', 'sub minor category', 'sub_minor_category'],
                default: 'N/A'
            },
            'photo': {
                label: 'AUDIT PHOTO',
                variations: ['auditphoto', 'auditphotourl', 'photo', 'photourl', 'image'],
                default: 'N/A'
            }
        };

        this.normalizationCache = new Map();
        this.fuzzyMatchCache = new Map();
    }

    /**
     * PRIMARY NORMALIZATION FUNCTION
     * Trims, lowercases, removes special characters
     */
    normalizeKey(str) {
        if (!str) return '';

        // Check cache
        if (this.normalizationCache.has(str)) {
            return this.normalizationCache.get(str);
        }

        let normalized = String(str)
            .trim()
            .toLowerCase()
            // Remove special characters except letters and numbers
            .replace(/[^a-z0-9]/g, '')
            // Remove extra spaces
            .replace(/\s+/g, '')
            // Handle common abbreviations
            .replace(/no/g, 'number')
            .replace(/desc/g, 'description')
            .replace(/dt/g, 'date')
            .replace(/img/g, 'image')
            .replace(/url/g, 'photo');

        this.normalizationCache.set(str, normalized);
        return normalized;
    }

    /**
     * SMART EXACT MATCHING
     * Checks if key matches any variation of a field
     */
    exactMatch(fieldName, key) {
        const normalizedKey = this.normalizeKey(key);
        const fieldConfig = this.fieldMap[fieldName];

        if (!fieldConfig) return false;

        // Check direct match
        if (this.normalizeKey(fieldName) === normalizedKey) {
            return true;
        }

        // Check variations
        for (let variation of fieldConfig.variations) {
            if (this.normalizeKey(variation) === normalizedKey) {
                return true;
            }
        }

        return false;
    }

    /**
     * FUZZY MATCHING ENGINE
     * Handles 1-2 character spelling errors
     */
    fuzzyMatch(fieldName, key) {
        const normalizedKey = this.normalizeKey(key);
        const fieldConfig = this.fieldMap[fieldName];

        if (!fieldConfig) return { match: false, score: 0 };

        // Check cache
        const cacheKey = `${fieldName}:${normalizedKey}`;
        if (this.fuzzyMatchCache.has(cacheKey)) {
            return this.fuzzyMatchCache.get(cacheKey);
        }

        let bestScore = 0;
        let bestMatch = false;

        // Compare with field name
        const fieldNormalized = this.normalizeKey(fieldName);
        let score = this.calculateSimilarity(normalizedKey, fieldNormalized);
        if (score > bestScore) {
            bestScore = score;
            bestMatch = score >= 0.7; // 70% similarity threshold
        }

        // Compare with variations
        for (let variation of fieldConfig.variations) {
            const variationNormalized = this.normalizeKey(variation);
            score = this.calculateSimilarity(normalizedKey, variationNormalized);

            if (score > bestScore) {
                bestScore = score;
                bestMatch = score >= 0.7;
            }
        }

        const result = { match: bestMatch, score: bestScore };
        this.fuzzyMatchCache.set(cacheKey, result);
        return result;
    }

    /**
     * LEVENSHTEIN DISTANCE WITH OPTIMIZATION
     * For 1-2 character spelling errors
     */
    calculateSimilarity(str1, str2) {
        if (str1 === str2) return 1.0;
        if (str1.length === 0 || str2.length === 0) return 0.0;

        // Early exit for big differences
        if (Math.abs(str1.length - str2.length) > 2) {
            return 0.0;
        }

        const len1 = str1.length;
        const len2 = str2.length;

        // Use optimized Levenshtein
        const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

        for (let i = 0; i <= len1; i++) matrix[i][0] = i;
        for (let j = 0; j <= len2; j++) matrix[0][j] = j;

        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i-1] === str2[j-1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i-1][j] + 1,
                    matrix[i][j-1] + 1,
                    matrix[i-1][j-1] + cost
                );
            }
        }

        const distance = matrix[len1][len2];
        const maxLen = Math.max(len1, len2);
        return 1.0 - (distance / maxLen);
    }

    /**
     * SMART FIELD MAPPING
     * Main function to map Firebase data to target fields
     */
    mapFields(rawData) {
        if (!rawData || typeof rawData !== 'object') {
            return this.getDefaultMapping();
        }

        const mappedData = {};
        const unmatchedKeys = [];

        // Process each target field
        for (let fieldName of Object.keys(this.fieldMap)) {
            const fieldConfig = this.fieldMap[fieldName];
            let found = false;
            let value = fieldConfig.default;

            // Iterate through raw data keys
            for (let rawKey of Object.keys(rawData)) {
                // 1. Try exact match
                if (this.exactMatch(fieldName, rawKey)) {
                    value = rawData[rawKey] || fieldConfig.default;
                    found = true;
                    console.log(`✅ Exact match: ${fieldName} ← ${rawKey}`);
                    break;
                }

                // 2. Try fuzzy match if exact fails
                const fuzzyResult = this.fuzzyMatch(fieldName, rawKey);
                if (fuzzyResult.match) {
                    value = rawData[rawKey] || fieldConfig.default;
                    found = true;
                    console.log(`🔄 Fuzzy match: ${fieldName} ← ${rawKey} (score: ${Math.round(fuzzyResult.score * 100)}%)`);
                    break;
                }
            }

            // If no match found, try to find by partial match
            if (!found) {
                // Check if any key contains the field name
                const normalizedField = this.normalizeKey(fieldName);
                for (let rawKey of Object.keys(rawData)) {
                    const normalizedKey = this.normalizeKey(rawKey);
                    if (normalizedKey.includes(normalizedField) || normalizedField.includes(normalizedKey)) {
                        value = rawData[rawKey] || fieldConfig.default;
                        found = true;
                        console.log(`🔍 Partial match: ${fieldName} ← ${rawKey}`);
                        break;
                    }
                }
            }

            if (!found) {
                console.log(`❌ No match found for: ${fieldName}`);
            }

            mappedData[fieldName] = value;
        }

        return mappedData;
    }

    /**
     * GET DEFAULT MAPPING
     * Returns N/A for all fields
     */
    getDefaultMapping() {
        const mapping = {};
        for (let fieldName of Object.keys(this.fieldMap)) {
            mapping[fieldName] = this.fieldMap[fieldName].default;
        }
        return mapping;
    }

    /**
     * SMART ASSET CLASS
     * Creates asset object from mapped data
     */
    createAsset(mappedData, barcode) {
        return {
            barcode: barcode || mappedData.barcode || 'N/A',
            description: mappedData.description || 'N/A',
            vendor: mappedData.vendor || 'N/A',
            category: mappedData.category || 'N/A',
            serviceDate: mappedData.serviceDate || 'N/A',
            floorDesc: mappedData.floorDesc || 'N/A',
            floorNo: mappedData.floorNo || 'N/A',
            location: mappedData.location || 'N/A',
            majorCategory: mappedData.majorCategory || 'N/A',
            minorCategory: mappedData.minorCategory || 'N/A',
            building: mappedData.building || 'N/A',
            roomNo: mappedData.roomNo || 'N/A',
            roomName: mappedData.roomName || 'N/A',
            subMinorCategory: mappedData.subMinorCategory || 'N/A',
            photo: mappedData.photo || 'N/A',
            raw: mappedData,
            timestamp: Date.now()
        };
    }

    /**
     * FOR DISPLAY ON STAFF DASHBOARD
     * Formats mapped data for preview
     */
    toDisplayObject(asset) {
        if (!asset) return {
            desc: 'N/A', vendor: 'N/A', category: 'N/A', location: 'N/A', building: 'N/A',
            floor: 'N/A', room: 'N/A', serial: 'N/A', manufacturer: 'N/A', photo: 'N/A',
            barcode: 'N/A', model: 'N/A', serviceDate: 'N/A', floorDesc: 'N/A', roomBC: 'N/A',
            majorCategory: 'N/A', classification: 'N/A', assetStatus: 'Registered',
            minorCategory: 'N/A', subMinorCategory: 'N/A'
        };

        return {
            barcode: asset.barcode || 'N/A',
            desc: asset.description || 'N/A',
            vendor: asset.vendor || 'N/A',
            category: asset.category || 'N/A',
            serviceDate: asset.serviceDate || 'N/A',
            floorDesc: asset.floorDesc || 'N/A',
            floor: asset.floorNo || 'N/A',
            location: asset.location || 'N/A',
            majorCategory: asset.majorCategory || 'N/A',
            minorCategory: asset.minorCategory || 'N/A',
            building: asset.building || 'N/A',
            roomNo: asset.roomNo || 'N/A',
            roomName: asset.roomName || 'N/A',
            subMinorCategory: asset.subMinorCategory || 'N/A',
            photo: asset.photo || 'N/A',
            assetStatus: asset.raw?.assetStatus || asset.raw?.status || 'Registered'
        };
    }
}

// ================================================
// EXPORT & GLOBAL INSTANCE
// ================================================

// Create global instance
window.fieldNormalizer = new FieldNormalizer();

// Export for module use
export { FieldNormalizer };
