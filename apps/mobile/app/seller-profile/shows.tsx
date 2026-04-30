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

interface Show {
  id: string;
  title: string;
  description: string | null;
  status: 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
  scheduledAt: string | null;
  createdAt: string;
}

interface ShowsResponse {
  data: Show[];
  meta: { total: number; page: number; perPage: number };
}

const STATUS_LABELS: Record<Show['status'], string> = {
  SCHEDULED: 'Agendado',
  LIVE: 'Ao vivo',
  ENDED: 'Encerrado',
  CANCELLED: 'Cancelado',
};

const STATUS_COLORS: Record<Show['status'], { bg: string; text: string }> = {
  SCHEDULED: { bg: '#dbeafe', text: '#1d4ed8' },
  LIVE: { bg: '#fee2e2', text: '#b91c1c' },
  ENDED: { bg: '#f3f4f6', text: '#6b7280' },
  CANCELLED: { bg: '#fef9c3', text: '#92400e' },
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SellerShowsScreen() {
  const api = useApiClient();
  const router = useRouter();

  const { data, isLoading, refetch, isRefetching, error } = useQuery<ShowsResponse>({
    queryKey: ['seller-shows'],
    queryFn: () => api.get<ShowsResponse>('/v1/seller/shows?perPage=50'),
  });

  const shows = data?.data ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={24} color="#111" />
        </Pressable>
        <Text style={styles.headerTitle}>Meus Shows</Text>
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
          <Text style={styles.errorText}>Erro ao carregar shows.</Text>
          <Pressable onPress={() => void refetch()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={shows}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#f97316" />
          }
          contentContainerStyle={shows.length === 0 ? styles.emptyContainer : styles.listContent}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="videocam-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyTitle}>Nenhum show ainda</Text>
              <Text style={styles.emptySubtitle}>
                Seus shows aparecerão aqui quando você criá-los.
              </Text>
            </View>
          }
          renderItem={({ item: show }) => {
            const colors = STATUS_COLORS[show.status];
            return (
              <View style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={styles.cardLeft}>
                    <Text style={styles.showTitle} numberOfLines={1}>
                      {show.title}
                    </Text>
                    {show.description ? (
                      <Text style={styles.showDesc} numberOfLines={2}>
                        {show.description}
                      </Text>
                    ) : null}
                    <Text style={styles.showDate}>
                      {show.scheduledAt
                        ? new Date(show.scheduledAt).toLocaleString('pt-BR')
                        : new Date(show.createdAt).toLocaleDateString('pt-BR')}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
                    <Text style={[styles.statusText, { color: colors.text }]}>
                      {STATUS_LABELS[show.status]}
                    </Text>
                  </View>
                </View>
              </View>
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
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardLeft: { flex: 1, gap: 4 },
  showTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  showDesc: { fontSize: 13, color: '#6b7280' },
  showDate: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  statusBadge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  statusText: { fontSize: 12, fontWeight: '700' },
});
