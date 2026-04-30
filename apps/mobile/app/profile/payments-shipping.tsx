import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../src/hooks/useApi';
import type { Order, OrderStatus, FulfillmentStatus } from '@arremate/types';

// ─── Labels / colours ────────────────────────────────────────────────────────

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Aguardando',
  PAID: 'Pago',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Reembolsado',
};

const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  PENDING: 'Pendente',
  PROCESSING: 'Em processamento',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  RETURNED: 'Devolvido',
};

const FULFILLMENT_ICONS: Record<FulfillmentStatus, keyof typeof Ionicons.glyphMap> = {
  PENDING: 'time-outline',
  PROCESSING: 'construct-outline',
  SHIPPED: 'car-outline',
  DELIVERED: 'checkmark-circle-outline',
  RETURNED: 'return-up-back-outline',
};

const STATUS_COLORS: Record<OrderStatus, { bg: string; text: string }> = {
  PENDING_PAYMENT: { bg: '#fef9c3', text: '#854d0e' },
  PAID: { bg: '#dcfce7', text: '#166534' },
  CANCELLED: { bg: '#f3f4f6', text: '#6b7280' },
  REFUNDED: { bg: '#fef2f2', text: '#991b1b' },
};

function formatBrl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PaymentsShippingScreen() {
  const api = useApiClient();
  const router = useRouter();

  const { data: orders, isLoading, refetch, isRefetching, error } = useQuery<Order[]>({
    queryKey: ['buyer-orders-payments'],
    queryFn: () => api.get<Order[]>('/v1/buyer/orders'),
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={24} color="#111" />
        </Pressable>
        <Text style={styles.headerTitle}>Pagamentos &amp; Envio</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Erro ao carregar dados.</Text>
          <Pressable onPress={() => void refetch()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={orders ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#f97316" />
          }
          contentContainerStyle={
            (orders ?? []).length === 0 ? styles.emptyContainer : styles.listContent
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="card-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyTitle}>Sem histórico de pagamentos</Text>
              <Text style={styles.emptySubtitle}>
                Suas compras e informações de envio aparecerão aqui.
              </Text>
            </View>
          }
          renderItem={({ item: order }) => {
            const status = order.status as OrderStatus;
            const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.CANCELLED;
            const chargeAmount = order.buyerTotalCents ?? order.totalCents;
            const payment = order.payments?.[0];
            const shipment = order.shipment;

            return (
              <Pressable
                style={styles.card}
                onPress={() => router.push(`/order/${order.id}`)}
                accessibilityLabel={`Pedido ${order.id.slice(-8).toUpperCase()}`}
              >
                {/* Order ref & date */}
                <View style={styles.cardRow}>
                  <Text style={styles.orderRef}>
                    #{order.id.slice(-8).toUpperCase()}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: statusColor.text }]}>
                      {PAYMENT_STATUS_LABELS[status] ?? status}
                    </Text>
                  </View>
                </View>

                {/* Item title */}
                {order.lines?.[0] ? (
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {order.lines[0].title}
                  </Text>
                ) : null}

                {/* Amount */}
                <Text style={styles.amount}>{formatBrl(chargeAmount)}</Text>

                {/* Payment method */}
                {payment ? (
                  <View style={styles.detailRow}>
                    <Ionicons name="cash-outline" size={14} color="#6b7280" />
                    <Text style={styles.detailText}>
                      {payment.provider === 'pix' ? 'PIX' : payment.provider}
                      {' · '}
                      {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                    </Text>
                  </View>
                ) : null}

                {/* Shipping */}
                {shipment ? (
                  <View style={styles.detailRow}>
                    <Ionicons
                      name={
                        FULFILLMENT_ICONS[shipment.status as FulfillmentStatus] ?? 'cube-outline'
                      }
                      size={14}
                      color="#6b7280"
                    />
                    <Text style={styles.detailText}>
                      {FULFILLMENT_LABELS[shipment.status as FulfillmentStatus] ??
                        shipment.status}
                      {shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ''}
                    </Text>
                  </View>
                ) : null}

                <Text style={styles.date}>
                  {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                </Text>

                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color="#d1d5db"
                  style={styles.chevron}
                />
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
    gap: 4,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  orderRef: {
    fontSize: 11,
    color: '#9ca3af',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  statusBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  itemTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  amount: { fontSize: 17, fontWeight: '700', color: '#111' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { fontSize: 12, color: '#6b7280' },
  date: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  chevron: { position: 'absolute', right: 16, top: '50%' },
});
