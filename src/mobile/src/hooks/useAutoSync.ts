import { useEffect, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import { useNetwork } from '../contexts/NetworkContext';
import { useCheckInQueue } from '../contexts/CheckInQueueContext';
import { useAuth } from '../contexts/AuthContext';
import { syncCheckIns } from '../services/api';

/**
 * useAutoSync — Background auto-sync hook.
 *
 * Watches network connectivity via NetworkContext.
 * When the device regains connectivity and there are pending items
 * in the check-in queue, it automatically:
 *   1. Reads the pending queue from AsyncStorage (via context).
 *   2. POSTs to /checkins/sync using the real staff access token.
 *   3. If HTTP 200 → clears the queue from AsyncStorage.
 *   4. If non-200 → keeps the queue intact for retry.
 */
export function useAutoSync(): void {
  const { isConnected } = useNetwork();
  const { queue, clearQueue, refreshQueue } = useCheckInQueue();
  const { accessToken } = useAuth();
  const isSyncing = useRef(false);
  const prevConnected = useRef(isConnected);

  const performSync = useCallback(async () => {
    // Guard: no token
    if (!accessToken) return;

    // Guard: no pending items
    const pendingItems = queue.filter((i) => i.syncStatus === 'pending');
    if (pendingItems.length === 0) return;

    // Guard: already syncing
    if (isSyncing.current) return;

    isSyncing.current = true;

    try {
      const { status, body } = await syncCheckIns(
        pendingItems,
        accessToken,
      );

      if (status === 200) {
        // Spec requirement: clear queue on HTTP 200
        await clearQueue();

        Alert.alert(
          'Đồng bộ thành công',
          `✅ ${body.data.synced} thành công, ${body.data.failed} thất bại.`,
        );
      } else {
        // Non-200 → keep queue for retry
        console.warn('[AutoSync] Sync returned non-200:', status);
      }
    } catch (error) {
      // Network error during sync → silently keep queue
      console.warn('[AutoSync] Sync failed, will retry:', error);
    } finally {
      isSyncing.current = false;
      // Refresh in-memory state regardless of outcome
      await refreshQueue();
    }
  }, [queue, clearQueue, refreshQueue, accessToken]);

  useEffect(() => {
    // Detect transition from offline → online
    const wasDisconnected = !prevConnected.current;
    const isNowConnected = isConnected;
    prevConnected.current = isConnected;

    if (wasDisconnected && isNowConnected) {
      performSync();
    }
  }, [isConnected, performSync]);
}
