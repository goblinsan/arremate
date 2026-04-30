import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../src/hooks/useApi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BidItem {
  id: string;
  amount: string;
  createdAt: string;
  queueItem: {
    inventoryItem: { id: string; title: string };
    show: { id: string; title: string; status: string };
  };
  session: { id: string; status: string };
}

interface BidsResponse {
  data: BidItem[];
  meta: { total: number; page: number; perPage: number };
}

function formatBrl(amount: string | number): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function BidsOffersScreen() {
  const api = useApiClient();
  const router = useRouter();

  const { data, isLoading, refetch, isRefetching, error } = useQuery<BidsResponse>({
    queryKey: ['buyer-bids'],
    queryFn: () => api.get<BidsResponse>('/v1/buyer/bids?perPage=50'),
  });

  const bids = data?.data ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={24} color="#111" />
        </Pressable>
        <Text style={styles.headerTitle}>Lances &amp; Ofertas</Text>
        {data ? (
          <Text style={styles.totalCount}>{data.meta.total}</Text>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Erro ao carregar lances.</Text>
          <Pressable onPress={() => void refetch()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={bids}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#f97316" />
          }
          contentContainerStyle={bids.length === 0 ? styles.emptyContainer : styles.listContent}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="podium-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyTitle}>Nenhum lance ainda</Text>
              <Text style={styles.emptySubtitle}>
                Seus lances em shows ao vivo aparecerão aqui.
              </Text>
              <Pressable style={styles.primaryBtn} onPress={() => router.push('/(tabs)/shows')}>
                <Text style={styles.primaryBtnText}>Ver shows</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item: bid }) => {
            const isLive = bid.queueItem.show.status === 'LIVE';
            return (
              <Pressable
                style={styles.card}
                onPress={() =>
                  isLive
                    ? router.push(`/live/${bid.session.id}`)
                    : router.push(`/show/${bid.queueItem.show.id}`)
                }
                accessibilityLabel={`Lance em ${bid.queueItem.inventoryItem.title}`}
              >
                <View style={styles.cardRow}>
                  <View style={styles.cardLeft}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {bid.queueItem.inventoryItem.title}
                    </Text>
                    <Text style={styles.showTitle} numberOfLines={1}>
                      {bid.queueItem.show.title}
                    </Text>
                    <Text style={styles.bidDate}>
                      {new Date(bid.createdAt).toLocaleString('pt-BR')}
                    </Text>
                  </View>
                  <View style={styles.cardRight}>
                    <Text style={styles.bidAmount}>{formatBrl(bid.amount)}</Text>
                    {isLive ? (
                      <View style={styles.liveBadge}>
                        <Text style={styles.liveBadgeText}>Ao vivo</Text>
                      </View>
                    ) : (
                      <View style={styles.endedBadge}>
                        <Text style={styles.endedBadgeText}>Encerrado</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#d1d5db" style={styles.chevron} />
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 8,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111', flex: 1 },
  totalCount: { fontSize: 13, color: '#9ca3af', fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  emptyContainer: { flex: 1 },
  listContent: { padding: 16, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#374151', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
  primaryBtn: {
    backgroundColor: '#f97316',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: 4,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  errorText: { fontSize: 15, color: '#dc2626', textAlign: 'center' },
  retryBtn: {
    backgroundColor: '#f97316',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardLeft: { flex: 1, gap: 2 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  showTitle: { fontSize: 12, color: '#6b7280' },
  bidDate: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  bidAmount: { fontSize: 16, fontWeight: '700', color: '#111' },
  liveBadge: {
    backgroundColor: '#fee2e2',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveBadgeText: { fontSize: 11, fontWeight: '700', color: '#b91c1c' },
  endedBadge: {
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  endedBadgeText: { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  chevron: { flexShrink: 0 },
});
