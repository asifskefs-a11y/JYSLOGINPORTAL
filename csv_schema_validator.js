/**
 * CSV Schema Validator for SchoolLog Asset Import
 * Defines expected headers, data types, and validation rules.
 */

export const ASSET_SCHEMA = {
    'Asset Barcode': { type: 'string', required: true, unique: true },
    'Serial No.': { type: 'string', required: false },
    'Model Description': { type: 'string', required: false },
    'Asset Condition': { type: 'string', required: false },
    'Price Status': { type: 'string', required: false },
    'Asset Unit Cost': { type: 'number', required: false },
    'Asset Description': { type: 'string', required: false },
    'Date Place in Service': { type: 'date', required: false },
    'Manufacturer': { type: 'string', required: false },
    'Major Category': { type: 'string', required: false },
    'Minor Category': { type: 'string', required: false },
    'Sub Minor Category': { type: 'string', required: false },
    'DOF Major': { type: 'string', required: false },
    'DOF Minor': { type: 'string', required: false },
    'Category': { type: 'string', required: false },
    'Classification (Aset Name)': { type: 'string', required: false },
    'Location Name': { type: 'string', required: false },
    'School ESIS ID': { type: 'string', required: false },
    'School Building Name': { type: 'string', required: false },
    'Room Name': { type: 'string', required: false },
    'Room No.': { type: 'string', required: false },
    'Room Barcode': { type: 'string', required: false },
    'Floor No.': { type: 'string', required: false },
    'Floor Description': { type: 'string', required: false },
    'Barcode Status': { type: 'string', required: false },
    'Asset Status': { type: 'string', required: false },
    'Old School Name': { type: 'string', required: false },
    'Transaction No.': { type: 'string', required: false },
    'Asset Useful Life': { type: 'string', required: false },
    'Asset Vendor Name': { type: 'string', required: false },
    'Old Asset Barcode': { type: 'string', required: false },
    'Exiting Old Asset Barcode From FAR': { type: 'string', required: false },
    'PO No.': { type: 'string', required: false },
    'Invoice No.': { type: 'string', required: false },
    'DN No.': { type: 'string', required: false },
    'Remarks': { type: 'string', required: false },
    'Physical Asset Register No.': { type: 'string', required: false },
    'Fixed Asset Register No.': { type: 'string', required: false },
    'Mapping Criteria': { type: 'string', required: false }
};

export class CSVSchemaValidator {
    constructor(schema = ASSET_SCHEMA) {
        this.schema = schema;
        this.errors = [];
        this.warnings = [];
    }

    /**
     * Requirement 2: Validate headers against schema
     */
    validateHeaders(headers) {
        this.errors = [];
        const schemaHeaders = Object.keys(this.schema);
        const requiredHeaders = schemaHeaders.filter(h => this.schema[h].required);

        // Check for missing required headers
        const missing = requiredHeaders.filter(h => !headers.includes(h));
        if (missing.length > 0) {
            this.errors.push(`Missing required headers: ${missing.join(', ')}`);
            return false;
        }

        return true;
    }

    /**
     * Requirement 3: Data type inference and validation
     */
    validateRow(row, rowIndex) {
        const rowErrors = [];
        Object.entries(this.schema).forEach(([header, rules]) => {
            const value = row[header];

            // Required check
            if (rules.required && (value === undefined || value === null || value === '')) {
                rowErrors.push(`Row ${rowIndex}: Column "${header}" is required but empty.`);
                return;
            }

            if (value === undefined || value === null || value === '') return;

            // Type validation
            if (rules.type === 'number') {
                if (isNaN(parseFloat(value))) {
                    rowErrors.push(`Row ${rowIndex}: Column "${header}" expects a number, got "${value}".`);
                }
            } else if (rules.type === 'date') {
                const date = new Date(value);
                if (isNaN(date.getTime())) {
                    rowErrors.push(`Row ${rowIndex}: Column "${header}" expects a valid date, got "${value}".`);
                }
            }
        });

        if (rowErrors.length > 0) {
            this.errors.push(...rowErrors);
            return false;
        }
        return true;
    }

    getReport() {
        return {
            valid: this.errors.length === 0,
            errors: this.errors,
            warnings: this.warnings
        };
    }
}
