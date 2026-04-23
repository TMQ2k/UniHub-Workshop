/**
 * A single pending check-in payload stored in AsyncStorage.
 * Follows the schema defined in CLAUDE.md §5.5.
 */
export type PendingCheckIn = {
  studentQR: string;
  workshopId: string;
  scannedAt: string; // ISO 8601 timestamp (local)
  syncStatus: 'pending' | 'synced' | 'failed';
};

/**
 * API response envelope used by the backend.
 */
export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  meta?: { timestamp: string };
  error?: { code: string; message: string };
};

/**
 * Shape returned by POST /checkins/sync.
 */
export type SyncResponseData = {
  synced: number;
  failed: number;
  results: Array<{
    registrationId: string;
    status: 'synced' | 'failed';
    reason?: string;
  }>;
};
