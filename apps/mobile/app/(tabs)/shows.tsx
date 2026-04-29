import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useApiClient } from '../../src/hooks/useApi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShowListItem {
  id: string;
  title: string;
  description: string | null;
  status: 'LIVE' | 'SCHEDULED';
  scheduledAt: string | null;
  seller: { id: string; name: string | null };
  _count: { queueItems: number };
}

interface ShowsResponse {
  data: ShowListItem[];
  meta: { total: number; page: number; perPage: number };
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ShowsScreen() {
  const api = useApiClient();
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<'LIVE' | 'SCHEDULED'>('LIVE');

  const {
    data: resp,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<ShowsResponse>({
    queryKey: ['shows-list'],
    queryFn: () => api.get<ShowsResponse>('/v1/shows?perPage=100'),
    refetchInterval: 30_000,
  });

  const filtered = resp?.data.filter((s) => s.status === activeFilter) ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Shows</Text>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        <Pressable
          style={[styles.filterTab, activeFilter === 'LIVE' && styles.filterTabActive]}
          onPress={() => setActiveFilter('LIVE')}
        >
          <Text
            style={[
              styles.filterTabText,
              activeFilter === 'LIVE' && styles.filterTabTextActive,
            ]}
          >
            Ao Vivo
          </Text>
        </Pressable>
        <Pressable
          style={[styles.filterTab, activeFilter === 'SCHEDULED' && styles.filterTabActive]}
          onPress={() => setActiveFilter('SCHEDULED')}
        >
          <Text
            style={[
              styles.filterTabText,
              activeFilter === 'SCHEDULED' && styles.filterTabTextActive,
            ]}
          >
            Programados
          </Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#f97316" size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#f97316" />
          }
          contentContainerStyle={filtered.length === 0 ? styles.listEmpty : styles.list}
          renderItem={({ item: show }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/show/${show.id}`)}>
              <View style={styles.cardTop}>
                <View
                  style={[
                    styles.badge,
                    show.status === 'LIVE' ? styles.badgeLive : styles.badgeScheduled,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      show.status === 'LIVE'
                        ? styles.badgeTextLive
                        : styles.badgeTextScheduled,
                    ]}
                  >
                    {show.status === 'LIVE' ? 'Ao vivo' : 'Agendado'}
                  </Text>
                </View>
                <Text style={styles.cardItemCount}>
                  {show._count.queueItems}{' '}
                  {show._count.queueItems === 1 ? 'item' : 'itens'}
                </Text>
              </View>

              <Text style={styles.cardTitle} numberOfLines={2}>
                {show.title}
              </Text>
              {show.description ? (
                <Text style={styles.cardDesc} numberOfLines={2}>
                  {show.description}
                </Text>
              ) : null}
              <Text style={styles.cardSeller}>
                por {show.seller?.name ?? 'Vendedor'}
              </Text>
              {show.scheduledAt ? (
                <Text style={styles.cardSchedule}>
                  {new Date(show.scheduledAt).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              ) : null}
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                {activeFilter === 'LIVE'
                  ? 'Nenhum show ao vivo no momento.'
                  : 'Nenhum show programado no momento.'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: '#111' },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#e5e7eb',
  },
  filterTabActive: { backgroundColor: '#f97316' },
  filterTabText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  filterTabTextActive: { color: '#fff' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 20, gap: 12 },
  listEmpty: { flex: 1, padding: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeLive: { backgroundColor: '#fee2e2' },
  badgeScheduled: { backgroundColor: '#dbeafe' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextLive: { color: '#b91c1c' },
  badgeTextScheduled: { color: '#1d4ed8' },
  cardItemCount: { fontSize: 12, color: '#9ca3af' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 4 },
  cardDesc: { fontSize: 13, color: '#6b7280', marginBottom: 4 },
  cardSeller: { fontSize: 13, color: '#6b7280' },
  cardSchedule: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, color: '#9ca3af', textAlign: 'center' },
});
