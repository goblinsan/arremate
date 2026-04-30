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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../src/hooks/useApi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SavedShowItem {
  id: string;
  showId: string;
  createdAt: string;
  show: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    scheduledAt: string | null;
    seller: { id: string; name: string | null };
    _count: { queueItems: number };
  };
}

interface SavedShowsResponse {
  data: SavedShowItem[];
  meta: { total: number; page: number; perPage: number };
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SavedShowsScreen() {
  const api = useApiClient();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isRefetching, error } = useQuery<SavedShowsResponse>({
    queryKey: ['buyer-saved-shows'],
    queryFn: () => api.get<SavedShowsResponse>('/v1/buyer/saved-shows?perPage=50'),
  });

  const unsaveMutation = useMutation({
    mutationFn: (showId: string) => api.del(`/v1/buyer/saved-shows/${showId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['buyer-saved-shows'] });
    },
  });

  const savedShows = data?.data ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={24} color="#111" />
        </Pressable>
        <Text style={styles.headerTitle}>Shows Salvos</Text>
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
          <Text style={styles.errorText}>Erro ao carregar shows salvos.</Text>
          <Pressable onPress={() => void refetch()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={savedShows}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#f97316" />
          }
          contentContainerStyle={
            savedShows.length === 0 ? styles.emptyContainer : styles.listContent
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="bookmark-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyTitle}>Nenhum show salvo</Text>
              <Text style={styles.emptySubtitle}>
                Salve shows para acompanhá-los facilmente.
              </Text>
              <Pressable style={styles.primaryBtn} onPress={() => router.push('/(tabs)/shows')}>
                <Text style={styles.primaryBtnText}>Explorar shows</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item: entry }) => {
            const show = entry.show;
            const isLive = show.status === 'LIVE';
            const isScheduled = show.status === 'SCHEDULED';

            return (
              <Pressable
                style={styles.card}
                onPress={() => router.push(`/show/${show.id}`)}
                accessibilityLabel={`Ver show: ${show.title}`}
              >
                <View style={styles.cardTop}>
                  {isLive ? (
                    <View style={styles.badgeLive}>
                      <Text style={styles.badgeTextLive}>Ao vivo</Text>
                    </View>
                  ) : isScheduled ? (
                    <View style={styles.badgeScheduled}>
                      <Text style={styles.badgeTextScheduled}>Agendado</Text>
                    </View>
                  ) : (
                    <View style={styles.badgeEnded}>
                      <Text style={styles.badgeTextEnded}>Encerrado</Text>
                    </View>
                  )}
                  <Text style={styles.itemCount}>
                    {show._count.queueItems}{' '}
                    {show._count.queueItems === 1 ? 'item' : 'itens'}
                  </Text>
                </View>

                <Text style={styles.showTitle} numberOfLines={2}>
                  {show.title}
                </Text>
                {show.description ? (
                  <Text style={styles.showDesc} numberOfLines={1}>
                    {show.description}
                  </Text>
                ) : null}
                <Text style={styles.sellerName}>
                  por {show.seller?.name ?? 'Vendedor'}
                </Text>
                {show.scheduledAt && isScheduled ? (
                  <Text style={styles.scheduledAt}>
                    {new Date(show.scheduledAt).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                ) : null}

                {/* Remove bookmark button */}
                <Pressable
                  style={styles.unsaveBtn}
                  onPress={() => unsaveMutation.mutate(show.id)}
                  accessibilityLabel={`Remover ${show.title} dos salvos`}
                  hitSlop={8}
                >
                  <Ionicons
                    name="bookmark"
                    size={20}
                    color={unsaveMutation.isPending ? '#d1d5db' : '#f97316'}
                  />
                </Pressable>
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
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    gap: 4,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  badgeLive: {
    backgroundColor: '#fee2e2',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeTextLive: { fontSize: 11, fontWeight: '700', color: '#b91c1c' },
  badgeScheduled: {
    backgroundColor: '#dbeafe',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeTextScheduled: { fontSize: 11, fontWeight: '700', color: '#1d4ed8' },
  badgeEnded: {
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeTextEnded: { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  itemCount: { fontSize: 12, color: '#9ca3af' },
  showTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  showDesc: { fontSize: 13, color: '#6b7280' },
  sellerName: { fontSize: 13, color: '#6b7280' },
  scheduledAt: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  unsaveBtn: { position: 'absolute', top: 14, right: 14 },
});
