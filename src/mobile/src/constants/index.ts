/** AsyncStorage key for the pending check-in queue. */
export const STORAGE_KEY_PENDING_CHECKINS = 'PendingCheckIn';

/** Maximum pending records before warning the user. */
export const MAX_PENDING_RECORDS = 500;

/**
 * Base URL of the backend API.
 * In a real deployment this would come from an env config;
 * kept here as a named constant (no magic strings).
 */
export const API_BASE_URL = 'http://localhost:3000';
