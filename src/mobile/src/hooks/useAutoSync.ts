import { useEffect, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import { useNetwork } from '../contexts/NetworkContext';
import { useCheckInQueue } from '../contexts/CheckInQueueContext';
import { useAuth } from '../contexts/AuthContext';
import { syncCheckIns } from '../services/api';
import { getPendingQueue } from '../services/storage';

/** Interval between automatic sync retries (ms). */
const SYNC_INTERVAL_MS = 30_000; // 30 seconds

/**
 * useAutoSync — Background auto-sync hook.
 *
 * CRITICAL: reads queue directly from AsyncStorage (not from React state)
 * to avoid stale closure issues on real devices.
 *
 * Triggers sync in THREE scenarios:
 *   1. Network transitions from offline → online.
 *   2. Periodic retry every 30s while online + pending items exist.
 *   3. Immediately when pending count changes while online.
 *
 * Returns a `syncNow` function for manual trigger from UI.
 */
export function useAutoSync(): { syncNow: () => Promise<void> } {
  const { isConnected } = useNetwork();
  const { clearQueue, refreshQueue, pendingCount } = useCheckInQueue();
  const { accessToken } = useAuth();
  const isSyncing = useRef(false);
  const prevConnected = useRef<boolean | null>(null); // null = first render

  // Use refs for values needed in performSync to avoid stale closures
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;

  const performSync = useCallback(async () => {
    const token = accessTokenRef.current;

    // Guard: no token
    if (!token) {
      console.log('[AutoSync] No access token, skipping sync');
      return;
    }

    // Guard: already syncing
    if (isSyncing.current) {
      console.log('[AutoSync] Already syncing, skipping');
      return;
    }

    isSyncing.current = true;

    try {
      // ── Read directly from AsyncStorage — avoids stale closure ──
      const storedQueue = await getPendingQueue();
      const pendingItems = storedQueue.filter((i) => i.syncStatus === 'pending');

      if (pendingItems.length === 0) {
        console.log('[AutoSync] No pending items in AsyncStorage');
        return;
      }

      console.log(`[AutoSync] Syncing ${pendingItems.length} item(s)...`);

      const { status, body } = await syncCheckIns(pendingItems, token);

      console.log(`[AutoSync] Response: status=${status}, body=`, JSON.stringify(body));

      if (status === 200 && body.success) {
        // Spec requirement: clear queue on HTTP 200
        await clearQueue();

        Alert.alert(
          'Đồng bộ thành công',
          `✅ ${body.data.synced} thành công, ${body.data.failed} thất bại.`,
        );
      } else {
        // Non-200 → keep queue for retry
        const errorMsg = body.error?.message || `HTTP ${status}`;
        console.warn(`[AutoSync] Sync returned non-200: ${errorMsg}`);

        Alert.alert(
          'Đồng bộ thất bại',
          `❌ ${errorMsg}\n\nSẽ tự động thử lại sau 30 giây.`,
        );
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn('[AutoSync] Sync failed:', errMsg);

      // Show alert on first failure so user knows something is wrong
      Alert.alert(
        'Lỗi đồng bộ',
        `Không thể kết nối server.\n\n${errMsg}\n\nSẽ tự động thử lại sau 30 giây.`,
      );
    } finally {
      isSyncing.current = false;
      // Refresh in-memory state regardless of outcome
      await refreshQueue();
    }
  }, [clearQueue, refreshQueue]); // NO dependency on queue — reads from AsyncStorage

  // ── Trigger 1: offline → online transition ─────────────
  useEffect(() => {
    // First render — just record the initial state, don't trigger sync
    if (prevConnected.current === null) {
      prevConnected.current = isConnected;
      return;
    }

    const wasDisconnected = !prevConnected.current;
    const isNowConnected = isConnected;
    prevConnected.current = isConnected;

    if (wasDisconnected && isNowConnected) {
      console.log('[AutoSync] Network restored — triggering sync');
      performSync();
    }
  }, [isConnected, performSync]);

  // ── Trigger 2: periodic retry while online ─────────────
  useEffect(() => {
    if (!isConnected || pendingCount === 0) return;

    console.log(`[AutoSync] Setting up 30s interval (${pendingCount} pending)`);

    const timer = setInterval(() => {
      console.log('[AutoSync] Periodic retry triggered');
      performSync();
    }, SYNC_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isConnected, pendingCount, performSync]);

  // ── Trigger 3: immediate sync when queue grows while online ──
  useEffect(() => {
    if (isConnected && pendingCount > 0) {
      console.log(`[AutoSync] Queue changed (${pendingCount} pending) — scheduling sync in 2s`);
      const timeout = setTimeout(() => {
        performSync();
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [isConnected, pendingCount, performSync]);

  return { syncNow: performSync };
}
