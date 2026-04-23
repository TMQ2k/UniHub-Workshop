import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNetwork } from '../contexts/NetworkContext';
import { useCheckInQueue } from '../contexts/CheckInQueueContext';
import { syncCheckIns } from '../services/api';

/** Placeholder workshop ID — in production, selected from a list. */
const PLACEHOLDER_WORKSHOP_ID = '00000000-0000-0000-0000-000000000000';
const PLACEHOLDER_TOKEN = '__CHECKIN_STAFF_TOKEN__';

/**
 * ScannerScreen — Camera-based QR scanner for check-in staff.
 *
 * Behaviour:
 * - Online  → POST directly to /checkins/sync and show ✅.
 * - Offline → Save to AsyncStorage queue and show ⏳.
 */
export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [lastResult, setLastResult] = useState<{
    type: 'success' | 'pending' | 'error';
    message: string;
  } | null>(null);

  const { isConnected } = useNetwork();
  const { addToQueue, pendingCount, refreshQueue } = useCheckInQueue();

  // Load queue on mount
  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  // ─── Permission handling ─────────────────────────────
  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Đang kiểm tra quyền camera…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>
          Ứng dụng cần quyền truy cập camera để quét mã QR.
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Cấp quyền Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── QR scanned handler ──────────────────────────────
  const handleBarcodeScanned = async ({
    data,
  }: {
    type: string;
    data: string;
  }) => {
    if (scanned) return; // debounce
    setScanned(true);

    const scannedAt = new Date().toISOString();
    const studentQR = data; // raw QR payload

    if (!isConnected) {
      // ── OFFLINE: enqueue to AsyncStorage ──────────
      await addToQueue({
        studentQR,
        workshopId: PLACEHOLDER_WORKSHOP_ID,
        scannedAt,
      });

      setLastResult({
        type: 'pending',
        message: `⏳ Đã ghi nhận (chờ đồng bộ)`,
      });
    } else {
      // ── ONLINE: send directly ─────────────────────
      try {
        const { status, body } = await syncCheckIns(
          [
            {
              studentQR,
              workshopId: PLACEHOLDER_WORKSHOP_ID,
              scannedAt,
              syncStatus: 'pending',
            },
          ],
          PLACEHOLDER_TOKEN,
        );

        if (status === 200 && body.success) {
          setLastResult({
            type: 'success',
            message: `✅ Check-in thành công!`,
          });
        } else {
          // Server returned an error — still save locally
          await addToQueue({
            studentQR,
            workshopId: PLACEHOLDER_WORKSHOP_ID,
            scannedAt,
          });
          setLastResult({
            type: 'error',
            message: `❌ Lỗi server — đã lưu offline.`,
          });
        }
      } catch {
        // Network error despite isConnected = true (race condition)
        await addToQueue({
          studentQR,
          workshopId: PLACEHOLDER_WORKSHOP_ID,
          scannedAt,
        });
        setLastResult({
          type: 'pending',
          message: `⏳ Lỗi mạng — đã lưu offline.`,
        });
      }
    }
  };

  // ─── UI ──────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Status bar */}
      <View style={styles.statusBar}>
        <View
          style={[
            styles.networkDot,
            { backgroundColor: isConnected ? '#34D399' : '#F87171' },
          ]}
        />
        <Text style={styles.statusText}>
          {isConnected ? 'Online' : 'Offline'}
        </Text>
        {pendingCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pendingCount}</Text>
          </View>
        )}
      </View>

      {/* Camera */}
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      >
        {/* Scanner overlay */}
        <View style={styles.overlay}>
          <View style={styles.scanArea} />
        </View>
      </CameraView>

      {/* Result feedback */}
      {lastResult && (
        <View
          style={[
            styles.resultCard,
            lastResult.type === 'success' && styles.resultSuccess,
            lastResult.type === 'pending' && styles.resultPending,
            lastResult.type === 'error' && styles.resultError,
          ]}
        >
          <Text style={styles.resultText}>{lastResult.message}</Text>
        </View>
      )}

      {/* Scan again button */}
      {scanned && (
        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            setScanned(false);
            setLastResult(null);
          }}
        >
          <Text style={styles.buttonText}>Quét lại</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    color: '#E2E8F0',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  statusBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  networkDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  statusText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '600',
  },
  badge: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanArea: {
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: '#6366F1',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  resultCard: {
    position: 'absolute',
    bottom: 140,
    left: 24,
    right: 24,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  resultSuccess: { backgroundColor: '#065F46' },
  resultPending: { backgroundColor: '#78350F' },
  resultError: { backgroundColor: '#7F1D1D' },
  resultText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  button: {
    position: 'absolute',
    bottom: 60,
    backgroundColor: '#6366F1',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
