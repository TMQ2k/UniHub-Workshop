import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNetwork } from '../contexts/NetworkContext';
import { useCheckInQueue } from '../contexts/CheckInQueueContext';
import { useAuth } from '../contexts/AuthContext';
import { syncCheckIns } from '../services/api';
import { API_BASE_URL } from '../constants';

/**
 * Decode a QR code (base64 JSON) into its structured data.
 * QR format: base64({ registrationId, studentId, workshopId, signature })
 */
function decodeQrPayload(raw: string): {
  registrationId: string;
  studentId: string;
  workshopId: string;
  signature: string;
} | null {
  try {
    const decoded = atob(raw);
    const parsed = JSON.parse(decoded);
    if (parsed.registrationId && parsed.workshopId) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

type WorkshopInfo = {
  id: string;
  title: string;
  room: string | null;
  startTime: string;
};

/**
 * ScannerScreen (Web version) — Real QR-based check-in for CHECKIN_STAFF.
 *
 * Flow:
 * 1. Select a workshop from the published list
 * 2. Paste or enter the QR code content (base64 string from student's registration)
 * 3. System decodes it, validates workshopId match, and sends check-in to backend
 */
export default function ScannerScreen() {
  const { user, accessToken, logout } = useAuth();
  const { isConnected } = useNetwork();
  const { addToQueue, pendingCount, queue, refreshQueue } = useCheckInQueue();

  const [scanned, setScanned] = useState(false);
  const [qrInput, setQrInput] = useState('');
  const [lastResult, setLastResult] = useState<{
    type: 'success' | 'pending' | 'error';
    message: string;
  } | null>(null);

  // Workshop selection
  const [workshops, setWorkshops] = useState<WorkshopInfo[]>([]);
  const [selectedWorkshop, setSelectedWorkshop] = useState<WorkshopInfo | null>(null);
  const [loadingWorkshops, setLoadingWorkshops] = useState(true);

  // Load queue on mount
  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  // Load published workshops
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/workshops?page=1&limit=50&status=PUBLISHED`,
        );
        const json = await res.json();
        if (json.success && json.data) {
          setWorkshops(json.data);
          if (json.data.length > 0) {
            setSelectedWorkshop(json.data[0]);
          }
        }
      } catch {
        // silently fail
      }
      setLoadingWorkshops(false);
    })();
  }, []);

  // ─── QR scan handler ──────────────────────────────────
  const handleScan = async () => {
    if (!qrInput.trim() || !selectedWorkshop || !accessToken) return;
    setScanned(true);

    const scannedAt = new Date().toISOString();
    const raw = qrInput.trim();

    // Try to decode as base64 QR
    const decoded = decodeQrPayload(raw);
    let registrationId: string;
    let workshopId: string;

    if (decoded) {
      registrationId = decoded.registrationId;
      workshopId = decoded.workshopId;

      // Validate workshop match
      if (workshopId !== selectedWorkshop.id) {
        setLastResult({
          type: 'error',
          message: `❌ QR này thuộc workshop khác, không phải "${selectedWorkshop.title}"`,
        });
        return;
      }
    } else {
      // Fallback: treat raw input as registrationId directly (for testing)
      registrationId = raw;
      workshopId = selectedWorkshop.id;
    }

    if (!isConnected) {
      // ── OFFLINE: enqueue ──────────────────────
      await addToQueue({
        studentQR: registrationId,
        workshopId,
        scannedAt,
      });
      setLastResult({
        type: 'pending',
        message: `⏳ Đã ghi nhận offline (chờ đồng bộ)`,
      });
    } else {
      // ── ONLINE: send directly ─────────────────
      try {
        const { status, body } = await syncCheckIns(
          [
            {
              studentQR: registrationId,
              workshopId,
              scannedAt,
              syncStatus: 'pending',
            },
          ],
          accessToken,
        );

        if (status === 200 && body.success) {
          const item = body.data.results[0];
          if (item?.status === 'synced') {
            setLastResult({
              type: 'success',
              message: `✅ Check-in thành công!\nRegistration: ${registrationId.substring(0, 8)}...`,
            });
          } else {
            setLastResult({
              type: 'error',
              message: `❌ Check-in thất bại: ${item?.reason || 'Unknown error'}`,
            });
          }
        } else {
          await addToQueue({
            studentQR: registrationId,
            workshopId,
            scannedAt,
          });
          setLastResult({
            type: 'error',
            message: `❌ Lỗi server — đã lưu offline.`,
          });
        }
      } catch {
        await addToQueue({
          studentQR: registrationId,
          workshopId,
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
    <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
      <View style={styles.container}>
        {/* Header with user info */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>📱 UniHub Check-In</Text>
          <View style={styles.userBadge}>
            <Text style={styles.userBadgeText}>👤 {user?.name}</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutText}>Đăng xuất</Text>
          </TouchableOpacity>
        </View>

        {/* Status bar */}
        <View style={styles.statusBar}>
          <View
            style={[
              styles.networkDot,
              { backgroundColor: isConnected ? '#34D399' : '#F87171' },
            ]}
          />
          <Text style={styles.statusText}>
            {isConnected ? '🟢 Online' : '🔴 Offline'}
          </Text>
          {pendingCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingCount} chờ đồng bộ</Text>
            </View>
          )}
        </View>

        {/* Workshop Selector */}
        <View style={styles.workshopSection}>
          <Text style={styles.sectionTitle}>🎯 Chọn Workshop đang diễn ra</Text>
          {loadingWorkshops ? (
            <ActivityIndicator color="#6366F1" />
          ) : workshops.length === 0 ? (
            <Text style={styles.emptyText}>Chưa có workshop nào được publish.</Text>
          ) : (
            <View style={styles.workshopList}>
              {workshops.map((w) => (
                <TouchableOpacity
                  key={w.id}
                  style={[
                    styles.workshopItem,
                    selectedWorkshop?.id === w.id && styles.workshopItemSelected,
                  ]}
                  onPress={() => setSelectedWorkshop(w)}
                >
                  <Text style={[
                    styles.workshopItemTitle,
                    selectedWorkshop?.id === w.id && styles.workshopItemTitleSelected,
                  ]}>
                    {w.title}
                  </Text>
                  <Text style={styles.workshopItemMeta}>
                    {w.room ? `📍 ${w.room}` : ''}{' '}
                    {new Date(w.startTime).toLocaleString('vi-VN', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Scanner Area */}
        {selectedWorkshop && (
          <>
            <View style={styles.cameraSimulation}>
              <View style={styles.scanFrame}>
                <View style={styles.scanCornerTL} />
                <View style={styles.scanCornerTR} />
                <View style={styles.scanCornerBL} />
                <View style={styles.scanCornerBR} />
                <Text style={styles.scanText}>📷 Quét QR</Text>
                <Text style={styles.scanSubText}>
                  Đang quét cho:{'\n'}
                  <Text style={{ color: '#A5B4FC', fontWeight: '700' }}>
                    {selectedWorkshop.title}
                  </Text>
                </Text>
              </View>
            </View>

            {/* QR Input */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>
                Nhập mã QR code (base64) hoặc Registration ID:
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder="Paste QR code content hoặc Registration UUID..."
                placeholderTextColor="#64748B"
                value={qrInput}
                onChangeText={(text) => {
                  setQrInput(text);
                  if (scanned) {
                    setScanned(false);
                    setLastResult(null);
                  }
                }}
                editable={!scanned}
                multiline
                numberOfLines={2}
              />
              <TouchableOpacity
                style={[styles.scanButton, (scanned || !qrInput.trim()) && styles.scanButtonDisabled]}
                onPress={handleScan}
                disabled={scanned || !qrInput.trim()}
              >
                <Text style={styles.scanButtonText}>
                  {scanned ? '✓ Đã quét' : '📷 Xác nhận Check-in'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

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

        {/* Scan again */}
        {scanned && (
          <TouchableOpacity
            style={styles.resetButton}
            onPress={() => {
              setScanned(false);
              setLastResult(null);
              setQrInput('');
            }}
          >
            <Text style={styles.resetButtonText}>🔄 Quét tiếp</Text>
          </TouchableOpacity>
        )}

        {/* Quick Test with real QR */}
        {selectedWorkshop && (
          <View style={styles.testSection}>
            <Text style={styles.testTitle}>🧪 Test nhanh (dán QR code của sinh viên)</Text>
            <Text style={styles.testHint}>
              Sinh viên SV001 đã đăng ký workshop này.{'\n'}
              Lấy QR code từ: GET /api/registrations/me (đăng nhập SV001)
            </Text>
          </View>
        )}

        {/* Pending Queue */}
        {queue.length > 0 && (
          <View style={styles.queueSection}>
            <Text style={styles.queueTitle}>📋 Hàng chờ ({queue.length})</Text>
            {queue.slice(0, 10).map((item, i) => (
              <View key={i} style={styles.queueItem}>
                <Text style={styles.queueItemText}>
                  {item.syncStatus === 'pending' ? '⏳' : item.syncStatus === 'synced' ? '✅' : '❌'}{' '}
                  {item.studentQR.substring(0, 20)}{item.studentQR.length > 20 ? '...' : ''}
                </Text>
                <Text style={styles.queueItemTime}>
                  {new Date(item.scannedAt).toLocaleTimeString('vi-VN')}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────
const styles = StyleSheet.create({
  scrollContainer: { flex: 1, backgroundColor: '#0F172A' },
  scrollContent: { flexGrow: 1 },
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    padding: 20,
    paddingTop: Platform.OS === 'web' ? 20 : 60,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
    maxWidth: 500,
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 28,
    fontWeight: '800',
  },
  userBadge: {
    backgroundColor: '#6366F120',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 6,
  },
  userBadgeText: { color: '#A5B4FC', fontSize: 13, fontWeight: '600' },
  logoutBtn: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  logoutText: { color: '#F87171', fontSize: 13, fontWeight: '600' },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    width: '100%',
    maxWidth: 500,
  },
  networkDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  statusText: { color: '#CBD5E1', fontSize: 14, fontWeight: '600', flex: 1 },
  badge: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { color: '#FFF', fontSize: 12, fontWeight: '700' },

  // Workshop selector
  workshopSection: {
    width: '100%',
    maxWidth: 500,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  emptyText: { color: '#64748B', fontSize: 14 },
  workshopList: { gap: 8 },
  workshopItem: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: '#334155',
  },
  workshopItemSelected: {
    borderColor: '#6366F1',
    backgroundColor: '#6366F110',
  },
  workshopItemTitle: {
    color: '#CBD5E1',
    fontSize: 15,
    fontWeight: '600',
  },
  workshopItemTitleSelected: {
    color: '#A5B4FC',
  },
  workshopItemMeta: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 4,
  },

  // Camera simulation
  cameraSimulation: {
    width: '100%',
    maxWidth: 500,
    aspectRatio: 1.4,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#334155',
    borderStyle: 'dashed',
  },
  scanFrame: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  scanCornerTL: {
    position: 'absolute', top: 0, left: 0, width: 30, height: 30,
    borderTopWidth: 3, borderLeftWidth: 3, borderColor: '#6366F1', borderTopLeftRadius: 8,
  },
  scanCornerTR: {
    position: 'absolute', top: 0, right: 0, width: 30, height: 30,
    borderTopWidth: 3, borderRightWidth: 3, borderColor: '#6366F1', borderTopRightRadius: 8,
  },
  scanCornerBL: {
    position: 'absolute', bottom: 0, left: 0, width: 30, height: 30,
    borderBottomWidth: 3, borderLeftWidth: 3, borderColor: '#6366F1', borderBottomLeftRadius: 8,
  },
  scanCornerBR: {
    position: 'absolute', bottom: 0, right: 0, width: 30, height: 30,
    borderBottomWidth: 3, borderRightWidth: 3, borderColor: '#6366F1', borderBottomRightRadius: 8,
  },
  scanText: { color: '#94A3B8', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  scanSubText: { color: '#64748B', fontSize: 12, textAlign: 'center', lineHeight: 18 },

  // Input
  inputSection: { width: '100%', maxWidth: 500, marginBottom: 16 },
  inputLabel: { color: '#94A3B8', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  textInput: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#F8FAFC',
    fontSize: 14,
    marginBottom: 12,
    minHeight: 60,
  },
  scanButton: {
    backgroundColor: '#6366F1',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  scanButtonDisabled: { backgroundColor: '#334155' },
  scanButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  // Result
  resultCard: {
    width: '100%',
    maxWidth: 500,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  resultSuccess: { backgroundColor: '#065F46' },
  resultPending: { backgroundColor: '#78350F' },
  resultError: { backgroundColor: '#7F1D1D' },
  resultText: { color: '#FFF', fontSize: 16, fontWeight: '600', textAlign: 'center' },

  resetButton: {
    backgroundColor: '#6366F1',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 20,
  },
  resetButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  // Test section
  testSection: { width: '100%', maxWidth: 500, marginBottom: 20 },
  testTitle: { color: '#94A3B8', fontSize: 14, fontWeight: '700', marginBottom: 6 },
  testHint: { color: '#64748B', fontSize: 13, lineHeight: 20 },

  // Queue
  queueSection: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  queueTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  queueItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  queueItemText: { color: '#CBD5E1', fontSize: 13, fontWeight: '500' },
  queueItemTime: { color: '#64748B', fontSize: 12 },
});
