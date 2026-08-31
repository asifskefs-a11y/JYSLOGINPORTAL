/**
 * Centralized Firebase Path Manager for SchoolLog
 * Provides single source of truth for all database locations.
 */

export const PATHS = {
    STAFF: 'staff',
    TASKS: 'tasks',
    ASSETS: 'assets',
    ACTIVE_SESSIONS: 'active_staff_sessions',
    ATTENDANCE: 'staff_attendance',
    SECURITY_KEYS: 'security_key_control',
    TOKEN_RESERVATIONS: 'token_reservations',
    STAFF_DOCUMENTS: 'staff_documents',
    USERS: 'users',
    DISPOSAL_REQUESTS: 'asset_disposal_requests',
    TRANSFERS: 'asset_transfers',
    MOVEMENT_LOGS: 'movement_logs',
    STAFF_MOVEMENT_LOGS: 'staff_movement_logs',
    CONTRACTORS: 'contractors',
    ROLE_DOCS: 'role_required_docs',
    SYSTEM_COUNTERS: 'system_counters',
    DISPOSED_ASSETS: 'disposed_assets',
    VISITORS: 'visitors',
    DISPOSAL_REGISTRY: 'ASSET_DISPOSAL_REGISTRY'
};

const WHITELIST = Object.values(PATHS);

export class FirebasePathValidator {
    /**
     * Validates if a root path or constructed path is in the whitelist.
     */
    static validatePath(path) {
        if (!path) return false;
        const root = path.split('/')[0];
        return WHITELIST.includes(root);
    }

    /**
     * Validates schema for specific collections.
     * Add more schemas as needed.
     */
    static validateSchema(path, data) {
        if (data === null) return true; // Deletion is always valid schema-wise
        const root = path.split('/')[0];

        try {
            switch(root) {
                case PATHS.TASKS:
                    return !!(data.id && data.location && data.status);
                case PATHS.ATTENDANCE:
                    return !!(data.staffId && data.type);
                case PATHS.ASSETS:
                    return !!(data.assetBarcode || data.barcode);
                default:
                    return true;
            }
        } catch (e) {
            return false;
        }
    }

    /**
     * Logs database operations (sanitized).
     */
    static logOperation(type, path, data = null) {
        const timestamp = new Date().toISOString();
        const root = path.split('/')[0];
        console.log(`[DB_${type.toUpperCase()}] ${timestamp} | Path: ${root}/...`);
        // We don't log full data to avoid sensitive information leaks in console
    }
}

/**
 * Migration Utility for schema changes.
 */
export const MigrationUtility = {
    async migrate(oldPath, newPath, transformFn) {
        console.warn(`🚀 Starting migration from ${oldPath} to ${newPath}`);
        // Logic for fetching old, transforming, and setting new would go here.
        // This is a placeholder for the requested utility.
    }
};

/**
 * Fallback Path Logic
 */
export function getPathWithFallback(primary, fallback) {
    if (FirebasePathValidator.validatePath(primary)) return primary;
    console.warn(`⚠️ Path ${primary} invalid, using fallback ${fallback}`);
    return fallback;
}
