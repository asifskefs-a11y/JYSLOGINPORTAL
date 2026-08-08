// ================================================================ */
// DYNAMIC HEADER NORMALIZATION - COMPLETE 39 FIELDS               */
// ================================================================ */

class FieldNormalizer {
    constructor() {
        this.fieldMap = {
            // ========================================================== */
            // CORE FIELDS (1-9)
            // ========================================================== */
            'assetBarcode': {
                label: 'Asset Barcode',
                variations: ['assetbarcode', 'asset barcode', 'barcode', 'code', 'assetcode'],
                default: 'N/A'
            },
            'serialNo': {
                label: 'Serial No.',
                variations: ['serialno', 'serial no', 'serialnumber', 'serial number', 'sno', 'sn'],
                default: 'N/A'
            },
            'modelDescription': {
                label: 'Model Description',
                variations: ['modeldescription', 'model description', 'modeldesc', 'model', 'model_no'],
                default: 'N/A'
            },
            'assetCondition': {
                label: 'Asset Condition',
                variations: ['assetcondition', 'asset condition', 'condition', 'cond'],
                default: 'N/A'
            },
            'priceStatus': {
                label: 'Price Status',
                variations: ['pricestatus', 'price status', 'price', 'pstatus'],
                default: 'N/A'
            },
            'assetUnitCost': {
                label: 'Asset Unit Cost',
                variations: ['assetunitcost', 'asset unit cost', 'unitcost', 'cost', 'price'],
                default: 'N/A'
            },
            'assetDescription': {
                label: 'Asset Description',
                variations: ['assetdescription', 'asset description', 'description', 'desc', 'assetdesc'],
                default: 'N/A'
            },
            'datePlaceInService': {
                label: 'Date Place in Service',
                variations: ['dateplaceinservice', 'date in service', 'servicedate', 'service date', 'dateinservice'],
                default: 'N/A'
            },
            'manufacturer': {
                label: 'Manufacturer',
                variations: ['manufacturer', 'maker', 'brand', 'company', 'producer'],
                default: 'N/A'
            },

            // ========================================================== */
            // CATEGORY FIELDS (10-16)
            // ========================================================== */
            'majorCategory': {
                label: 'Major Category',
                variations: ['majorcategory', 'major category', 'majorcat', 'major_cat'],
                default: 'N/A'
            },
            'minorCategory': {
                label: 'Minor Category',
                variations: ['minorcategory', 'minor category', 'minorcat', 'minor_cat'],
                default: 'N/A'
            },
            'subMinorCategory': {
                label: 'Sub Minor Category',
                variations: ['subminorcategory', 'sub minor category', 'subminor', 'sub_minor'],
                default: 'N/A'
            },
            'dofMajor': {
                label: 'DOF Major',
                variations: ['dofmajor', 'dof major', 'dof_major'],
                default: 'N/A'
            },
            'dofMinor': {
                label: 'DOF Minor',
                variations: ['dofminor', 'dof minor', 'dof_minor'],
                default: 'N/A'
            },
            'category': {
                label: 'Category',
                variations: ['category', 'cat', 'type', 'class'],
                default: 'N/A'
            },
            'classification': {
                label: 'Classification',
                variations: ['classification', 'class', 'asset name', 'aset name', 'classification (aset name)'],
                default: 'N/A'
            },

            // ========================================================== */
            // LOCATION FIELDS (17-24)
            // ========================================================== */
            'locationName': {
                label: 'Location Name',
                variations: ['locationname', 'location name', 'location', 'loc', 'site'],
                default: 'N/A'
            },
            'schoolEsisId': {
                label: 'School ESIS ID',
                variations: ['schooleisisid', 'school esis id', 'esisid', 'esis', 'school_id'],
                default: 'N/A'
            },
            'schoolBuildingName': {
                label: 'School Building Name',
                variations: ['schoolbuildingname', 'school building name', 'buildingname', 'building name', 'building'],
                default: 'N/A'
            },
            'roomName': {
                label: 'Room Name',
                variations: ['roomname', 'room name', 'room', 'location room'],
                default: 'N/A'
            },
            'roomNo': {
                label: 'Room No.',
                variations: ['roomno', 'room no', 'roomnumber', 'room number', 'room#'],
                default: 'N/A'
            },
            'roomBarcode': {
                label: 'Room Barcode',
                variations: ['roombarcode', 'room barcode', 'roombc', 'room_bc', 'room code'],
                default: 'N/A'
            },
            'floorNo': {
                label: 'Floor No.',
                variations: ['floorno', 'floor no', 'floornumber', 'floor number', 'floor', 'floor#'],
                default: 'N/A'
            },
            'floorDescription': {
                label: 'Floor Description',
                variations: ['floordescription', 'floor description', 'floordesc', 'floor desc', 'floordiscretion'],
                default: 'N/A'
            },

            // ========================================================== */
            // STATUS FIELDS (25-27)
            // ========================================================== */
            'barcodeStatus': {
                label: 'Barcode Status',
                variations: ['barcodestatus', 'barcode status', 'barcode_stat'],
                default: 'N/A'
            },
            'assetStatus': {
                label: 'Asset Status',
                variations: ['assetstatus', 'asset status', 'status', 'asset_stat'],
                default: 'N/A'
            },
            'oldSchoolName': {
                label: 'Old School Name',
                variations: ['oldschoolname', 'old school name', 'oldschool', 'previous school'],
                default: 'N/A'
            },

            // ========================================================== */
            // TRANSACTION FIELDS (28-32)
            // ========================================================== */
            'transactionNo': {
                label: 'Transaction No.',
                variations: ['transactionno', 'transaction no', 'transno', 'transaction'],
                default: 'N/A'
            },
            'assetUsefulLife': {
                label: 'Asset Useful Life',
                variations: ['assetusefullife', 'asset useful life', 'usefullife', 'useful life'],
                default: 'N/A'
            },
            'assetVendorName': {
                label: 'Asset Vendor Name',
                variations: ['assetvendorname', 'asset vendor name', 'vendorname', 'vendor name', 'vendor'],
                default: 'N/A'
            },
            'oldAssetBarcode': {
                label: 'Old Asset Barcode',
                variations: ['oldassetbarcode', 'old asset barcode', 'oldbarcode', 'old code'],
                default: 'N/A'
            },
            'exitingOldAssetBarcodeFromFAR': {
                label: 'Exiting Old Asset Barcode From FAR',
                variations: ['exitingoldassetbarcodefromfar', 'exiting old asset barcode from far', 'exiting_far'],
                default: 'N/A'
            },

            // ========================================================== */
            // PURCHASE FIELDS (33-35)
            // ========================================================== */
            'poNo': {
                label: 'PO No.',
                variations: ['pono', 'po no', 'ponumber', 'po number', 'purchase order'],
                default: 'N/A'
            },
            'invoiceNo': {
                label: 'Invoice No.',
                variations: ['invoiceno', 'invoice no', 'invoicenumber', 'invoice number'],
                default: 'N/A'
            },
            'dnNo': {
                label: 'DN No.',
                variations: ['dnno', 'dn no', 'dnnumber', 'dn number', 'delivery note'],
                default: 'N/A'
            },

            // ========================================================== */
            // REFERENCE FIELDS (36-39)
            // ========================================================== */
            'remarks': {
                label: 'Remarks',
                variations: ['remarks', 'remark', 'note', 'notes', 'comment'],
                default: 'N/A'
            },
            'physicalAssetRegisterNo': {
                label: 'Physical Asset Register No.',
                variations: ['physicalassetregisterno', 'physical asset register no', 'physical_reg', 'phy_reg'],
                default: 'N/A'
            },
            'fixedAssetRegisterNo': {
                label: 'Fixed Asset Register No.',
                variations: ['fixedassetregisterno', 'fixed asset register no', 'fixed_reg', 'far'],
                default: 'N/A'
            },
            'mappingCriteria': {
                label: 'Mapping Criteria',
                variations: ['mappingcriteria', 'mapping criteria', 'mapping', 'criteria'],
                default: 'N/A'
            }
        };
    }

    normalizeHeader(header) {
        if (!header) return '';
        return String(header).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    findMatchingField(excelHeader) {
        if (this.fieldMap[excelHeader]) return excelHeader;

        const normalized = this.normalizeHeader(excelHeader);
        if (!normalized) return null;

        for (const [key, value] of Object.entries(this.fieldMap)) {
            if (this.normalizeHeader(key) === normalized) return key;
            for (const variation of value.variations) {
                if (this.normalizeHeader(variation) === normalized) return key;
            }
        }

        for (const [key, value] of Object.entries(this.fieldMap)) {
            const keyNorm = this.normalizeHeader(key);
            if (normalized.includes(keyNorm) || keyNorm.includes(normalized)) return key;
        }

        return null;
    }

    mapFields(rawData) {
        const mappedData = {};
        const allFields = Object.keys(this.fieldMap);

        for (const field of allFields) {
            mappedData[field] = this.fieldMap[field].default;
        }

        for (const [key, value] of Object.entries(rawData)) {
            const matchedField = this.findMatchingField(key);
            if (matchedField) {
                const val = typeof value === 'string' ? value.trim() : value;
                mappedData[matchedField] = val || this.fieldMap[matchedField].default;
            }
        }

        return mappedData;
    }

    getAllFields() {
        return Object.keys(this.fieldMap);
    }

    getFieldLabel(field) {
        return this.fieldMap[field]?.label || field;
    }
}

window.fieldNormalizer = new FieldNormalizer();
export { FieldNormalizer };