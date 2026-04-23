/** AsyncStorage key for the pending check-in queue. */
export const STORAGE_KEY_PENDING_CHECKINS = 'PendingCheckIn';

/** Maximum pending records before warning the user. */
export const MAX_PENDING_RECORDS = 500;

/**
 * Base URL of the backend API.
 * 
 * ⚠️ Use your computer's LAN IP (not localhost) for Expo Go on real phones.
 *    Find your IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
 *    Replace the IP below with yours if different.
 * 
 * For web testing: 'http://localhost:3000/api'
 * For real phone: 'http://<YOUR_LAN_IP>:3000/api'
 */
export const API_BASE_URL = 'http://192.168.1.15:3000/api';
