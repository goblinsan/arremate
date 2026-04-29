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
import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import type { Order, OrderStatus, FulfillmentStatus } from '@arremate/types';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Aguardando pagamento',
  PAID: 'Pago',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Reembolsado',
};

const STATUS_COLORS: Record<OrderStatus, { bg: string; text: string }> = {
  PENDING_PAYMENT: { bg: '#fef9c3', text: '#854d0e' },
  PAID: { bg: '#dcfce7', text: '#166534' },
  CANCELLED: { bg: '#f3f4f6', text: '#6b7280' },
  REFUNDED: { bg: '#fef2f2', text: '#991b1b' },
};

const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  PENDING: 'Pendente',
  PROCESSING: 'Em processamento',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  RETURNED: 'Devolvido',
};

function formatBrl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function OrdersScreen() {
  const { isAuthenticated, isLoading: authLoading, getAccessToken } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(
    async (silent = false) => {
      const token = getAccessToken();
      if (!token) return;
      if (!silent) setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/v1/buyer/orders`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as Order[];
        setOrders(data);
      } catch {
        setError('Erro ao carregar seus pedidos.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [getAccessToken],
  );

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      void fetchOrders();
    }
  }, [authLoading, isAuthenticated, fetchOrders]);

  function handleRefresh() {
    setIsRefreshing(true);
    void fetchOrders(true);
  }

  if (authLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Minhas Compras</Text>
        </View>
        <View style={styles.centerContent}>
          <Ionicons name="bag-outline" size={48} color="#d1d5db" />
          <Text style={styles.emptyTitle}>Faca login para ver suas compras</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.push('/login')}>
            <Text style={styles.primaryBtnText}>Entrar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Minhas Compras</Text>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void fetchOrders()} style={styles.retryBtn}>
            <Ionicons name="refresh-outline" size={14} color="#f97316" />
            <Text style={styles.retryBtnText}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : null}

      {isLoading && !isRefreshing ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={orders.length === 0 ? styles.emptyContainer : styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={['#f97316']}
              tintColor="#f97316"
            />
          }
          ListEmptyComponent={
            <View style={styles.centerContent}>
              <Ionicons name="bag-handle-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyTitle}>Nenhum pedido ainda</Text>
              <Text style={styles.emptySubtitle}>
                Participe de um show ao vivo para fazer sua primeira compra.
              </Text>
              <Pressable style={styles.primaryBtn} onPress={() => router.push('/(tabs)/shows')}>
                <Text style={styles.primaryBtnText}>Ver shows ao vivo</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item: order }) => {
            const status = order.status as OrderStatus;
            const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.CANCELLED;
            const chargeAmountCents = order.buyerTotalCents ?? order.totalCents;

            return (
              <Pressable
                style={styles.orderCard}
                onPress={() => router.push(`/order/${order.id}`)}
                accessibilityLabel={`Pedido ${order.id.slice(-8).toUpperCase()}`}
              >
                <View style={styles.orderCardRow}>
                  <View style={styles.orderCardLeft}>
                    <Text style={styles.orderRef}>#{order.id.slice(-8).toUpperCase()}</Text>
                    {order.lines?.[0] ? (
                      <Text style={styles.orderTitle} numberOfLines={1}>
                        {order.lines[0].title}
                      </Text>
                    ) : null}
                    {order.shipment ? (
                      <Text style={styles.orderShipment}>
                        Envio: {FULFILLMENT_LABELS[order.shipment.status as FulfillmentStatus] ?? order.shipment.status}
                        {order.shipment.status === 'SHIPPED' && order.shipment.trackingNumber
                          ? ` · ${order.shipment.trackingNumber}`
                          : ''}
                      </Text>
                    ) : null}
                    <Text style={styles.orderDate}>
                      {new Date(order.createdAt).toLocaleString('pt-BR')}
                    </Text>
                  </View>
                  <View style={styles.orderCardRight}>
                    <Text style={styles.orderAmount}>{formatBrl(chargeAmountCents)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: statusColor.text }]}>
                        {STATUS_LABELS[status]}
                      </Text>
                    </View>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#111' },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
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
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  errorText: { color: '#dc2626', fontSize: 13, flex: 1 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  retryBtnText: { color: '#f97316', fontSize: 13, fontWeight: '600' },
  orderCard: {
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
  orderCardRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  orderCardLeft: { flex: 1, gap: 2 },
  orderCardRight: { alignItems: 'flex-end', gap: 6 },
  orderRef: { fontSize: 11, color: '#9ca3af', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  orderTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  orderShipment: { fontSize: 12, color: '#6b7280' },
  orderDate: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  orderAmount: { fontSize: 16, fontWeight: '700', color: '#111' },
  statusBadge: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  chevron: { flexShrink: 0 },
});
