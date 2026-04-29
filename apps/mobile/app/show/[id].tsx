import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useApiClient } from '../../src/hooks/useApi';
import { useAuth } from '../../src/contexts/AuthContext';
import type { ItemCondition } from '@arremate/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShowQueueEntry {
  id: string;
  position: number;
  inventoryItem: {
    id: string;
    title: string;
    description: string | null;
    condition: ItemCondition;
    startingPrice: number;
  };
}

interface ShowDetailSeller {
  id: string;
  name: string | null;
  brandName: string | null;
  brandLogoUrl: string | null;
  metrics: {
    ratingAverage: number | null;
    ratingCount: number;
    averageShippingDays: number | null;
    completedSalesCount: number;
  };
}

interface ShowDetail {
  id: string;
  title: string;
  description: string | null;
  status: 'LIVE' | 'SCHEDULED';
  scheduledAt: string | null;
  seller: ShowDetailSeller;
  queueItems: ShowQueueEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONDITION_LABELS: Record<ItemCondition, string> = {
  NEW: 'Novo',
  USED: 'Usado',
  REFURBISHED: 'Recondicionado',
};

function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <View style={starStyles.row}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text key={i} style={i <= filled ? starStyles.filled : starStyles.empty}>
          {i <= filled ? '\u2605' : '\u2606'}
        </Text>
      ))}
    </View>
  );
}

const starStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2 },
  filled: { color: '#f59e0b', fontSize: 14 },
  empty: { color: '#d1d5db', fontSize: 14 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ShowDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApiClient();
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const {
    data: show,
    isLoading,
    error,
  } = useQuery<ShowDetail>({
    queryKey: ['show', id],
    queryFn: () => api.get<ShowDetail>(`/v1/shows/${id}`),
    enabled: !!id,
  });

  function handleEnterLive() {
    if (!isAuthenticated) {
      Alert.alert('Login necessario', 'Faca login para entrar no show ao vivo.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Entrar', onPress: () => router.push('/login') },
      ]);
      return;
    }
    // Live room navigation placeholder — will be wired up when live room screen is built
    Alert.alert('Show ao vivo', 'A sala ao vivo sera implementada em breve!');
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#f97316" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !show) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Show nao encontrado.</Text>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Voltar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isLive = show.status === 'LIVE';
  const { seller } = show;
  const sellerDisplayName = seller.brandName ?? seller.name ?? 'Vendedor';
  const sellerInitial = sellerDisplayName.charAt(0).toUpperCase();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Navigation bar */}
      <View style={styles.nav}>
        <Pressable onPress={() => router.back()} style={styles.navBack} hitSlop={12}>
          <Text style={styles.navBackText}>Voltar</Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Status + scheduled time */}
        <View style={styles.statusRow}>
          <View style={[styles.badge, isLive ? styles.badgeLive : styles.badgeScheduled]}>
            <Text
              style={[styles.badgeText, isLive ? styles.badgeTextLive : styles.badgeTextScheduled]}
            >
              {isLive ? 'Ao vivo' : 'Agendado'}
            </Text>
          </View>
          {show.scheduledAt && !isLive && (
            <Text style={styles.scheduledTime}>
              {new Date(show.scheduledAt).toLocaleString('pt-BR', {
                weekday: 'short',
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          )}
        </View>

        {/* Title + description */}
        <Text style={styles.title}>{show.title}</Text>
        {show.description ? (
          <Text style={styles.description}>{show.description}</Text>
        ) : null}

        {/* Seller card */}
        <View style={styles.sellerCard}>
          <View style={styles.sellerTop}>
            <View style={styles.sellerAvatar}>
              <Text style={styles.sellerAvatarText}>{sellerInitial}</Text>
            </View>
            <View style={styles.sellerInfo}>
              <Text style={styles.sellerName}>{sellerDisplayName}</Text>
              {seller.metrics.ratingCount > 0 && (
                <View style={styles.ratingRow}>
                  <StarRating rating={seller.metrics.ratingAverage ?? 0} />
                  <Text style={styles.ratingCount}>({seller.metrics.ratingCount})</Text>
                </View>
              )}
            </View>
          </View>

          {/* Seller metrics */}
          <View style={styles.metricsRow}>
            {seller.metrics.completedSalesCount > 0 && (
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{seller.metrics.completedSalesCount}</Text>
                <Text style={styles.metricLabel}>vendas</Text>
              </View>
            )}
            {seller.metrics.averageShippingDays != null && (
              <View style={styles.metric}>
                <Text style={styles.metricValue}>
                  {seller.metrics.averageShippingDays.toFixed(1)}d
                </Text>
                <Text style={styles.metricLabel}>envio medio</Text>
              </View>
            )}
            {seller.metrics.ratingAverage != null && (
              <View style={styles.metric}>
                <Text style={styles.metricValue}>
                  {seller.metrics.ratingAverage.toFixed(1)}
                </Text>
                <Text style={styles.metricLabel}>avaliacao</Text>
              </View>
            )}
          </View>
        </View>

        {/* Queue items */}
        {show.queueItems.length > 0 && (
          <View style={styles.queueSection}>
            <Text style={styles.sectionTitle}>
              Itens do show ({show.queueItems.length})
            </Text>
            {show.queueItems.map((entry, index) => (
              <View key={entry.id} style={styles.queueItem}>
                <View style={styles.queueIndex}>
                  <Text style={styles.queueIndexText}>{index + 1}</Text>
                </View>
                <View style={styles.queueItemBody}>
                  <Text style={styles.queueItemTitle} numberOfLines={2}>
                    {entry.inventoryItem.title}
                  </Text>
                  <View style={styles.queueItemMeta}>
                    <Text style={styles.queueItemCondition}>
                      {CONDITION_LABELS[entry.inventoryItem.condition] ??
                        entry.inventoryItem.condition}
                    </Text>
                    <Text style={styles.queueItemPrice}>
                      {formatBrl(Number(entry.inventoryItem.startingPrice))}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Primary CTA — only shown for live shows */}
      {isLive && (
        <View style={styles.ctaContainer}>
          <Pressable style={styles.ctaButton} onPress={handleEnterLive}>
            <Text style={styles.ctaButtonText}>Entrar ao Vivo</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  errorText: { fontSize: 16, color: '#6b7280', textAlign: 'center' },
  backBtn: {
    backgroundColor: '#f97316',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  backBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  nav: { paddingHorizontal: 20, paddingVertical: 12 },
  navBack: { alignSelf: 'flex-start' },
  navBackText: { fontSize: 16, color: '#f97316', fontWeight: '600' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 32 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  badge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  badgeLive: { backgroundColor: '#fee2e2' },
  badgeScheduled: { backgroundColor: '#dbeafe' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgeTextLive: { color: '#b91c1c' },
  badgeTextScheduled: { color: '#1d4ed8' },
  scheduledTime: { fontSize: 13, color: '#6b7280' },
  title: { fontSize: 24, fontWeight: '800', color: '#111', marginBottom: 8 },
  description: { fontSize: 15, color: '#555', marginBottom: 20, lineHeight: 22 },
  sellerCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  sellerTop: { flexDirection: 'row', gap: 12, marginBottom: 12, alignItems: 'center' },
  sellerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerAvatarText: { color: '#fff', fontWeight: '800', fontSize: 20 },
  sellerInfo: { flex: 1 },
  sellerName: { fontSize: 16, fontWeight: '700', color: '#111' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  ratingCount: { fontSize: 12, color: '#6b7280' },
  metricsRow: { flexDirection: 'row', gap: 24 },
  metric: { alignItems: 'center' },
  metricValue: { fontSize: 18, fontWeight: '800', color: '#111' },
  metricLabel: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  queueSection: { marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 12 },
  queueItem: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  queueIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  queueIndexText: { fontSize: 12, fontWeight: '700', color: '#6b7280' },
  queueItemBody: { flex: 1 },
  queueItemTitle: { fontSize: 14, fontWeight: '600', color: '#111' },
  queueItemMeta: { flexDirection: 'row', gap: 8, marginTop: 4 },
  queueItemCondition: { fontSize: 12, color: '#9ca3af' },
  queueItemPrice: { fontSize: 12, color: '#f97316', fontWeight: '600' },
  ctaContainer: {
    padding: 20,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    backgroundColor: '#fff',
  },
  ctaButton: {
    backgroundColor: '#ef4444',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaButtonText: { color: '#fff', fontWeight: '800', fontSize: 18 },
});
