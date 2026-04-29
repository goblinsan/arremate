import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useApiClient } from '../../src/hooks/useApi';
import { useAuth } from '../../src/contexts/AuthContext';

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

// ─── Components ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'LIVE' | 'SCHEDULED' }) {
  const isLive = status === 'LIVE';
  return (
    <View style={[styles.badge, isLive ? styles.badgeLive : styles.badgeScheduled]}>
      <Text style={[styles.badgeText, isLive ? styles.badgeTextLive : styles.badgeTextScheduled]}>
        {isLive ? 'Ao vivo' : 'Agendado'}
      </Text>
    </View>
  );
}

function ShowCard({
  show,
  horizontal,
}: {
  show: ShowListItem;
  horizontal?: boolean;
}) {
  const router = useRouter();
  return (
    <Pressable
      style={[styles.card, horizontal && styles.cardHorizontal]}
      onPress={() => router.push(`/show/${show.id}`)}
    >
      <View style={styles.cardTop}>
        <StatusBadge status={show.status} />
        <Text style={styles.cardItemCount}>
          {show._count.queueItems} {show._count.queueItems === 1 ? 'item' : 'itens'}
        </Text>
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>
        {show.title}
      </Text>
      <Text style={styles.cardSeller} numberOfLines={1}>
        por {show.seller?.name ?? 'Vendedor'}
      </Text>
      {show.scheduledAt && show.status !== 'LIVE' && (
        <Text style={styles.cardSchedule}>
          {new Date(show.scheduledAt).toLocaleString('pt-BR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      )}
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const api = useApiClient();
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const {
    data: showsResp,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<ShowsResponse>({
    queryKey: ['shows-home'],
    queryFn: () => api.get<ShowsResponse>('/v1/shows?perPage=50'),
    refetchInterval: 30_000,
  });

  const liveShows = showsResp?.data.filter((s) => s.status === 'LIVE') ?? [];
  const upcomingShows = showsResp?.data.filter((s) => s.status === 'SCHEDULED') ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#f97316" />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerBrand}>Arremate</Text>
          {!isAuthenticated && (
            <Pressable onPress={() => router.push('/login')} style={styles.loginBtn}>
              <Text style={styles.loginBtnText}>Entrar</Text>
            </Pressable>
          )}
        </View>

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#f97316" size="large" />
          </View>
        ) : (
          <>
            {/* Live Now Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.liveDot} />
                <Text style={styles.sectionTitle}>Ao Vivo Agora</Text>
              </View>
              {liveShows.length === 0 ? (
                <Text style={styles.empty}>Nenhum show ao vivo no momento.</Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.horizontalList}
                >
                  {liveShows.map((show) => (
                    <ShowCard key={show.id} show={show} horizontal />
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Upcoming Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Em Breve</Text>
                {upcomingShows.length > 3 && (
                  <Pressable onPress={() => router.push('/(tabs)/shows')}>
                    <Text style={styles.seeAll}>Ver todos</Text>
                  </Pressable>
                )}
              </View>
              {upcomingShows.length === 0 ? (
                <Text style={styles.empty}>Nenhum show programado no momento.</Text>
              ) : (
                upcomingShows
                  .slice(0, 5)
                  .map((show) => <ShowCard key={show.id} show={show} />)
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerBrand: { fontSize: 24, fontWeight: '800', color: '#f97316' },
  loginBtn: {
    backgroundColor: '#f97316',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  loginBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  loading: { alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  section: { paddingHorizontal: 20, paddingBottom: 28 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    marginRight: 8,
  },
  sectionTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#111' },
  seeAll: { fontSize: 13, color: '#f97316', fontWeight: '600' },
  empty: { fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingVertical: 16 },
  horizontalList: { paddingRight: 20, gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHorizontal: { width: 220, marginBottom: 0 },
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
  cardSeller: { fontSize: 13, color: '#6b7280' },
  cardSchedule: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
});
