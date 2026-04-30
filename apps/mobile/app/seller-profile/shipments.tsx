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

interface Shipment {
  status: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'RETURNED';
  carrier: string | null;
  trackingNumber: string | null;
  estimatedDelivery: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
}

interface OrderLine {
  title: string;
}

interface Buyer {
  id: string;
  name: string | null;
  email: string;
}

interface Order {
  id: string;
  status: 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED' | 'REFUNDED';
  totalCents: number;
  createdAt: string;
  buyer: Buyer;
  lines: OrderLine[];
  shipment: Shipment | null;
}

const SHIPMENT_STATUS_LABELS: Record<Shipment['status'], string> = {
  PENDING: 'Pendente',
  PROCESSING: 'Processando',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  RETURNED: 'Devolvido',
};

const SHIPMENT_STATUS_COLORS: Record<Shipment['status'], { bg: string; text: string }> = {
  PENDING: { bg: '#fef9c3', text: '#92400e' },
  PROCESSING: { bg: '#dbeafe', text: '#1d4ed8' },
  SHIPPED: { bg: '#ede9fe', text: '#6d28d9' },
  DELIVERED: { bg: '#dcfce7', text: '#166534' },
  RETURNED: { bg: '#fee2e2', text: '#b91c1c' },
};

function formatBrl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SellerShipmentsScreen() {
  const api = useApiClient();
  const router = useRouter();

  const { data, isLoading, refetch, isRefetching, error } = useQuery<Order[]>({
    queryKey: ['seller-shipments'],
    queryFn: () => api.get<Order[]>('/v1/seller/orders'),
  });

  const ordersWithShipment = (data ?? []).filter((o) => o.shipment !== null);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={24} color="#111" />
        </Pressable>
        <Text style={styles.headerTitle}>Envios</Text>
        {data ? (
          <Text style={styles.totalCount}>{ordersWithShipment.length}</Text>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Erro ao carregar envios.</Text>
          <Pressable onPress={() => void refetch()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={ordersWithShipment}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#f97316" />
          }
          contentContainerStyle={
            ordersWithShipment.length === 0 ? styles.emptyContainer : styles.listContent
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="car-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyTitle}>Nenhum envio ainda</Text>
              <Text style={styles.emptySubtitle}>
                Pedidos com informações de envio aparecerão aqui.
              </Text>
            </View>
          }
          renderItem={({ item: order }) => {
            const shipment = order.shipment!;
            const colors = SHIPMENT_STATUS_COLORS[shipment.status];
            const firstLine = order.lines[0]?.title ?? '—';
            const extraCount = order.lines.length - 1;
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.cardLeft}>
                    <Text style={styles.orderItem} numberOfLines={1}>
                      {firstLine}
                      {extraCount > 0 ? ` +${extraCount}` : ''}
                    </Text>
                    <Text style={styles.buyerName} numberOfLines={1}>
                      {order.buyer.name ?? order.buyer.email}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
                    <Text style={[styles.statusText, { color: colors.text }]}>
                      {SHIPMENT_STATUS_LABELS[shipment.status]}
                    </Text>
                  </View>
                </View>
                {(shipment.carrier || shipment.trackingNumber) ? (
                  <View style={styles.trackingRow}>
                    <Ionicons name="location-outline" size={14} color="#9ca3af" />
                    <Text style={styles.trackingText} numberOfLines={1}>
                      {[shipment.carrier, shipment.trackingNumber].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.cardFooter}>
                  <Text style={styles.orderDate}>
                    {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                  </Text>
                  <Text style={styles.orderTotal}>{formatBrl(order.totalCents)}</Text>
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
    gap: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardLeft: { flex: 1, gap: 3 },
  orderItem: { fontSize: 15, fontWeight: '600', color: '#111' },
  buyerName: { fontSize: 12, color: '#6b7280' },
  statusBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  statusText: { fontSize: 11, fontWeight: '700' },
  trackingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trackingText: { fontSize: 12, color: '#6b7280', flex: 1 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderDate: { fontSize: 11, color: '#9ca3af' },
  orderTotal: { fontSize: 14, fontWeight: '700', color: '#111' },
});
