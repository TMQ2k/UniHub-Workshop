import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { Alert } from 'react-native';
import { PendingCheckIn } from '../types';
import {
  enqueueCheckIn,
  getPendingQueue,
  clearPendingQueue,
  savePendingQueue,
} from '../services/storage';
import { MAX_PENDING_RECORDS } from '../constants';

// ─── Context shape ───────────────────────────────────────
type CheckInQueueContextValue = {
  /** Current in-memory snapshot of the pending queue. */
  queue: PendingCheckIn[];
  /** Number of pending (un-synced) items. */
  pendingCount: number;
  /** Add a scanned check-in to the queue. */
  addToQueue: (item: Omit<PendingCheckIn, 'syncStatus'>) => Promise<void>;
  /** Reload queue from AsyncStorage into memory. */
  refreshQueue: () => Promise<void>;
  /** Clear all items from the queue (after successful sync). */
  clearQueue: () => Promise<void>;
  /** Replace the in-memory + persisted queue (used after sync). */
  setQueue: (items: PendingCheckIn[]) => Promise<void>;
};

const CheckInQueueContext = createContext<CheckInQueueContextValue>(
  {} as CheckInQueueContextValue,
);

// ─── Provider ────────────────────────────────────────────
export function CheckInQueueProvider({ children }: { children: ReactNode }) {
  const [queue, setQueueState] = useState<PendingCheckIn[]>([]);

  const pendingCount = queue.filter((i) => i.syncStatus === 'pending').length;

  const refreshQueue = useCallback(async () => {
    const stored = await getPendingQueue();
    setQueueState(stored);
  }, []);

  const addToQueue = useCallback(
    async (item: Omit<PendingCheckIn, 'syncStatus'>) => {
      const newItem: PendingCheckIn = { ...item, syncStatus: 'pending' };
      const newLength = await enqueueCheckIn(newItem);

      // Refresh in-memory state
      const updated = await getPendingQueue();
      setQueueState(updated);

      if (newLength >= MAX_PENDING_RECORDS) {
        Alert.alert(
          'Cảnh báo',
          `Hàng chờ đã đạt ${MAX_PENDING_RECORDS} bản ghi. Vui lòng đồng bộ sớm.`,
        );
      }
    },
    [],
  );

  const clearQueueHandler = useCallback(async () => {
    await clearPendingQueue();
    setQueueState([]);
  }, []);

  const setQueue = useCallback(async (items: PendingCheckIn[]) => {
    await savePendingQueue(items);
    setQueueState(items);
  }, []);

  return (
    <CheckInQueueContext.Provider
      value={{
        queue,
        pendingCount,
        addToQueue,
        refreshQueue,
        clearQueue: clearQueueHandler,
        setQueue,
      }}
    >
      {children}
    </CheckInQueueContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────
export function useCheckInQueue(): CheckInQueueContextValue {
  return useContext(CheckInQueueContext);
}
