import AsyncStorage from '@react-native-async-storage/async-storage';
import { PendingCheckIn } from '../types';
import { STORAGE_KEY_PENDING_CHECKINS } from '../constants';

/**
 * Read the entire pending check-in queue from AsyncStorage.
 */
export async function getPendingQueue(): Promise<PendingCheckIn[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY_PENDING_CHECKINS);
  if (!raw) return [];
  return JSON.parse(raw) as PendingCheckIn[];
}

/**
 * Overwrite the pending check-in queue in AsyncStorage.
 */
export async function savePendingQueue(
  queue: PendingCheckIn[],
): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEY_PENDING_CHECKINS,
    JSON.stringify(queue),
  );
}

/**
 * Append a single check-in to the pending queue.
 * Returns the updated queue length.
 */
export async function enqueueCheckIn(
  item: PendingCheckIn,
): Promise<number> {
  const queue = await getPendingQueue();
  queue.push(item);
  await savePendingQueue(queue);
  return queue.length;
}

/**
 * Remove all items that have been synced (syncStatus === 'synced')
 * and return the cleaned queue.
 */
export async function clearSyncedItems(): Promise<PendingCheckIn[]> {
  const queue = await getPendingQueue();
  const remaining = queue.filter((item) => item.syncStatus !== 'synced');
  await savePendingQueue(remaining);
  return remaining;
}

/**
 * Completely clear the pending queue from storage.
 */
export async function clearPendingQueue(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY_PENDING_CHECKINS);
}
