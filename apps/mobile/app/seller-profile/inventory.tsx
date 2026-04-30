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

interface InventoryItem {
  id: string;
  title: string;
  description: string | null;
  condition: string | null;
  startingPrice: string;
  status: string;
  createdAt: string;
}

interface InventoryResponse {
  data: InventoryItem[];
  meta: { total: number; page: number; perPage: number };
}

function formatBrl(amount: string): string {
  const value = parseFloat(amount);
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SellerInventoryScreen() {
  const api = useApiClient();
  const router = useRouter();

  const { data, isLoading, refetch, isRefetching, error } = useQuery<InventoryResponse>({
    queryKey: ['seller-inventory'],
    queryFn: () => api.get<InventoryResponse>('/v1/seller/inventory?perPage=50'),
  });

  const items = data?.data ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={24} color="#111" />
        </Pressable>
        <Text style={styles.headerTitle}>Estoque</Text>
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
          <Text style={styles.errorText}>Erro ao carregar estoque.</Text>
          <Pressable onPress={() => void refetch()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#f97316" />
          }
          contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.listContent}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="cube-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyTitle}>Estoque vazio</Text>
              <Text style={styles.emptySubtitle}>
                Seus itens de estoque aparecerão aqui.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <View style={styles.iconContainer}>
                  <Ionicons name="cube-outline" size={22} color="#f97316" />
                </View>
                <View style={styles.cardLeft}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {item.description ? (
                    <Text style={styles.itemDesc} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}
                  {item.condition ? (
                    <Text style={styles.itemCondition}>{item.condition}</Text>
                  ) : null}
                </View>
                <Text style={styles.itemPrice}>{formatBrl(item.startingPrice)}</Text>
              </View>
            </View>
          )}
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
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLeft: { flex: 1, gap: 3 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  itemDesc: { fontSize: 12, color: '#6b7280' },
  itemCondition: { fontSize: 11, color: '#9ca3af' },
  itemPrice: { fontSize: 15, fontWeight: '700', color: '#111' },
});
