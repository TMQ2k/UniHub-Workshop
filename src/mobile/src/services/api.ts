import { ApiEnvelope, PendingCheckIn, SyncResponseData } from '../types';
import { API_BASE_URL } from '../constants';

/**
 * POST /checkins/sync — send the pending offline check-ins to the backend.
 *
 * Transforms PendingCheckIn[] into the BatchSyncCheckInDto shape the
 * backend expects: { checkins: [{ registrationId, workshopId, scannedAt }] }.
 *
 * Returns the raw HTTP response status and parsed body so the caller
 * can decide how to handle success / failure.
 */
export async function syncCheckIns(
  items: PendingCheckIn[],
  accessToken: string,
): Promise<{ status: number; body: ApiEnvelope<SyncResponseData> }> {
  // Sort by scannedAt (FIFO — spec requirement §5.5)
  const sorted = [...items].sort(
    (a, b) => new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime(),
  );

  const payload = {
    checkins: sorted.map((item) => ({
      registrationId: item.studentQR, // studentQR carries the registrationId from the QR
      workshopId: item.workshopId,
      scannedAt: item.scannedAt,
    })),
  };

  const response = await fetch(`${API_BASE_URL}/checkins/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as ApiEnvelope<SyncResponseData>;

  return { status: response.status, body };
}
