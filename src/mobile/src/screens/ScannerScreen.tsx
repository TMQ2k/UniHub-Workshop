import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNetwork } from '../contexts/NetworkContext';
import { useCheckInQueue } from '../contexts/CheckInQueueContext';
import { useAuth } from '../contexts/AuthContext';
import { syncCheckIns } from '../services/api';
import { API_BASE_URL } from '../constants';

/**
 * ScannerScreen — Camera-based QR scanner for check-in staff (native).
 *
 * Flow:
 * 1. Staff selects a workshop from the list
 * 2. Scans student QR code (base64 JSON)
 * 3. Decodes → validates workshopId → syncs check-in
 * 4. Offline → enqueues to AsyncStorage for later sync
 */
export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [lastResult, setLastResult] = useState<{
    type: 'success' | 'pending' | 'error';
    message: string;
  } | null>(null);

  // Workshop selection
  const [workshops, setWorkshops] = useState<any[]>([]);
  const [selectedWorkshop, setSelectedWorkshop] = useState<any | null>(null);
  const [loadingWorkshops, setLoadingWorkshops] = useState(true);

  const { isConnected } = useNetwork();
  const { addToQueue, pendingCount, refreshQueue } = useCheckInQueue();
  const { accessToken, logout, userName } = useAuth();

  // Load queue on mount
  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  // Fetch workshops
  useEffect(() => {
    const fetchWorkshops = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/workshops?page=1&limit=50`, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        });
        const json = await res.json();
        const list = json.data || [];
        setWorkshops(list);
        if (list.length > 0) setSelectedWorkshop(list[0]);
      } catch (err) {
        console.warn('Failed to fetch workshops:', err);
      } finally {
        setLoadingWorkshops(false);
      }
    };
    fetchWorkshops();
  }, [accessToken]);

  // ── Decode base64 QR payload ─────────────────────────────
  const decodeQR = useCallback((raw: string): { registrationId: string; workshopId: string } | null => {
    try {
      // Try base64 decode
      const decoded = atob(raw);
      const parsed = JSON.parse(decoded);
      if (parsed.registrationId && parsed.workshopId) {
        return { registrationId: parsed.registrationId, workshopId: parsed.workshopId };
      }
    } catch {
      // Not base64 — try direct JSON
      try {
        const parsed = JSON.parse(raw);
        if (parsed.registrationId && parsed.workshopId) {
          return { registrationId: parsed.registrationId, workshopId: parsed.workshopId };
        }
      } catch {
        // Not JSON either — treat raw string as registrationId
      }
    }
    return null;
  }, []);

  // ─── QR scanned handler ──────────────────────────────────
  const handleBarcodeScanned = async ({ data }: { type: string; data: string }) => {
    if (scanned) return;
    setScanned(true);

    if (!selectedWorkshop) {
      setLastResult({ type: 'error', message: '❌ Chưa chọn workshop!' });
      return;
    }

    if (!accessToken) {
      setLastResult({ type: 'error', message: '❌ Chưa đăng nhập!' });
      return;
    }

    const scannedAt = new Date().toISOString();

    // Decode QR
    const decoded = decodeQR(data);
    if (!decoded) {
      setLastResult({ type: 'error', message: '❌ QR code không hợp lệ!' });
      return;
    }

    // Validate workshop match
    if (decoded.workshopId !== selectedWorkshop.id) {
      setLastResult({
        type: 'error',
        message: '❌ QR này không thuộc workshop đang chọn!',
      });
      return;
    }

    // Use decoded registrationId (UUID) — NOT the raw QR string
    const registrationId = decoded.registrationId;

    if (!isConnected) {
      // ── OFFLINE: enqueue ──────────────
      await addToQueue({
        studentQR: registrationId,
        workshopId: selectedWorkshop.id,
        scannedAt,
      });
      setLastResult({ type: 'pending', message: '⏳ Đã lưu offline — chờ đồng bộ' });
    } else {
      // ── ONLINE: sync immediately ──────
      try {
        const { status, body } = await syncCheckIns(
          [{ studentQR: registrationId, workshopId: selectedWorkshop.id, scannedAt, syncStatus: 'pending' }],
          accessToken,
        );

        if (status === 200 && body.success) {
          const result = body.data?.results?.[0];
          if (result?.status === 'error') {
            setLastResult({ type: 'error', message: `❌ ${result.reason}` });
          } else {
            setLastResult({ type: 'success', message: '✅ Check-in thành công!' });
          }
        } else {
          await addToQueue({ studentQR: registrationId, workshopId: selectedWorkshop.id, scannedAt });
          setLastResult({ type: 'error', message: '❌ Lỗi server — đã lưu offline.' });
        }
      } catch {
        await addToQueue({ studentQR: registrationId, workshopId: selectedWorkshop.id, scannedAt });
        setLastResult({ type: 'pending', message: '⏳ Lỗi mạng — đã lưu offline.' });
      }
    }
  };

  // ── Permission handling ─────────────────────────────────
  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#6366F1" />
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

  // ── Loading workshops ───────────────────────────────────
  if (loadingWorkshops) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.message}>Đang tải danh sách workshop…</Text>
      </View>
    );
  }

  // ── Workshop selector ───────────────────────────────────
  if (!selectedWorkshop) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Không tìm thấy workshop nào.</Text>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Đăng xuất</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main Scanner UI ─────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.staffName}>📱 {userName}</Text>
          <TouchableOpacity onPress={logout}>
            <Text style={styles.logoutText}>Đăng xuất</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.networkDot, { backgroundColor: isConnected ? '#34D399' : '#F87171' }]} />
          <Text style={styles.statusText}>{isConnected ? 'Online' : 'Offline'}</Text>
          {pendingCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingCount}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Workshop selector */}
      <View style={styles.workshopBar}>
        <Text style={styles.workshopLabel}>Workshop:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.workshopScroll}>
          {workshops.map((w) => (
            <TouchableOpacity
              key={w.id}
              onPress={() => setSelectedWorkshop(w)}
              style={[
                styles.workshopChip,
                selectedWorkshop?.id === w.id && styles.workshopChipActive,
              ]}
            >
              <Text
                style={[
                  styles.workshopChipText,
                  selectedWorkshop?.id === w.id && styles.workshopChipTextActive,
                ]}
                numberOfLines={1}
              >
                {w.title}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Camera */}
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      >
        <View style={styles.overlay}>
          <Text style={styles.scanLabel}>Quét QR sinh viên</Text>
          <Text style={styles.scanSubLabel}>{selectedWorkshop.title}</Text>
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
          style={styles.scanAgainBtn}
          onPress={() => {
            setScanned(false);
            setLastResult(null);
          }}
        >
          <Text style={styles.buttonText}>🔄 Quét lại</Text>
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
    marginTop: 16,
  },
  header: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  staffName: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
  },
  logoutBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  logoutText: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '600',
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
  workshopBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 90 : 70,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    zIndex: 15,
  },
  workshopLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginRight: 8,
  },
  workshopScroll: {
    flexGrow: 0,
  },
  workshopChip: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginRight: 8,
  },
  workshopChipActive: {
    backgroundColor: '#6366F1',
  },
  workshopChipText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '500',
    maxWidth: 150,
  },
  workshopChipTextActive: {
    color: '#FFF',
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
  scanLabel: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  scanSubLabel: {
    color: '#A5B4FC',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 20,
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
    backgroundColor: '#6366F1',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 16,
  },
  scanAgainBtn: {
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
