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
        // Define all 16 target fields with their possible variations
        this.fieldMap = {
            'barcode': {
                variations: ['barcode', 'bar code', 'barcodeid', 'assetbarcode', 'assetcode', 'code', 'scancode'],
                default: 'N/A'
            },
            'description': {
                variations: ['description', 'asset description', 'assetdesc', 'asset_desc', 'modeldescription',
                           'model_desc', 'itemdescription', 'item_desc', 'name', 'asset name', 'assetname'],
                default: 'N/A'
            },
            'vendor': {
                variations: ['vendor', 'vendor name', 'vendorname', 'vendor_name', 'supplier', 'supplier name',
                           'manufacturer', 'brand', 'provider'],
                default: 'N/A'
            },
            'category': {
                variations: ['category', 'cat', 'majorcategory', 'categoryname', 'classification', 'type',
                           'assetcategory', 'asset type', 'group', 'class', 'category badge'],
                default: 'N/A'
            },
            'serviceDate': {
                variations: ['servicedate', 'service date', 'service_date', 'lastservicedate', 'service dt',
                           'maintenance date', 'last_maintenance', 'serviced on', 'dateinservice'],
                default: 'N/A'
            },
            'floorDesc': {
                variations: ['floordesc', 'floor description', 'floor_desc', 'floor description desc',
                           'floorlevel', 'floor name', 'level', 'floor_text'],
                default: 'N/A'
            },
            'floorNo': {
                variations: ['floorno', 'floor no', 'floor_no', 'floor number', 'floornumber', 'floor#',
                           'floor', 'level number'],
                default: 'N/A'
            },
            'location': {
                variations: ['location', 'location name', 'locationname', 'location_name', 'loc', 'site',
                           'area', 'zone', 'placement'],
                default: 'N/A'
            },
            'manufacturer': {
                variations: ['manufacturer', 'manufacturername', 'manufacturer_name', 'maker', 'company',
                           'producer', 'creator', 'brand', 'make'],
                default: 'N/A'
            },
            'model': {
                variations: ['model', 'model name', 'modelname', 'model_no', 'modelno', 'model number',
                           'version', 'type'],
                default: 'N/A'
            },
            'roomBC': {
                variations: ['roombc', 'room bc', 'room_bc', 'roombarcode', 'room barcode', 'room code'],
                default: 'N/A'
            },
            'roomName': {
                variations: ['roomname', 'room name', 'room_name', 'room', 'location room', 'room description'],
                default: 'N/A'
            },
            'roomNo': {
                variations: ['roomno', 'room no', 'room_no', 'room number', 'room#', 'roomnumber'],
                default: 'N/A'
            },
            'building': {
                variations: ['building', 'building name', 'buildingname', 'building_name', 'schoolbuilding',
                           'block', 'tower', 'campus', 'site building'],
                default: 'N/A'
            },
            'photo': {
                variations: ['auditphotourl', 'auditphoto', 'photourl', 'photo', 'imageurl', 'image',
                           'beforephoto', 'before_photo', 'assetphoto', 'assetimage', 'img'],
                default: 'N/A'
            },
            'serialNumber': {
                variations: ['serialnumber', 'serial no', 'serial_no', 'serialno', 'sno', 'serial',
                           'sn', 'assetid', 'deviceid', 'identity', 's_no'],
                default: 'N/A'
            }
        };

        // Cache for normalized keys
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
            manufacturer: mappedData.manufacturer || 'N/A',
            model: mappedData.model || 'N/A',
            roomBC: mappedData.roomBC || 'N/A',
            roomName: mappedData.roomName || 'N/A',
            roomNo: mappedData.roomNo || 'N/A',
            building: mappedData.building || 'N/A',
            photo: mappedData.photo || 'N/A',
            serialNumber: mappedData.serialNumber || 'N/A',
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
            majorCategory: 'N/A', classification: 'N/A', assetStatus: 'Registered'
        };

        return {
            desc: asset.description || 'N/A',
            vendor: asset.vendor || 'N/A',
            category: asset.category || 'N/A',
            location: asset.location || 'N/A',
            building: asset.building || 'N/A',
            floor: asset.floorNo || 'N/A',
            room: asset.roomNo || asset.roomName || 'N/A',
            roomName: asset.roomName || 'N/A',
            roomNo: asset.roomNo || 'N/A',
            serial: asset.serialNumber || 'N/A',
            manufacturer: asset.manufacturer || 'N/A',
            photo: asset.photo || 'N/A',
            barcode: asset.barcode || 'N/A',
            model: asset.model || 'N/A',
            serviceDate: asset.serviceDate || 'N/A',
            floorDesc: asset.floorDesc || 'N/A',
            roomBC: asset.roomBC || 'N/A',
            majorCategory: asset.raw?.majorCategory || asset.raw?.major_category || 'N/A',
            classification: asset.raw?.classification || asset.raw?.class || 'N/A',
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
