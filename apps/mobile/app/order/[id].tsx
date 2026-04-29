import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import type {
  Order,
  OrderStatus,
  FulfillmentStatus,
  Payment,
  SupportTicket,
} from '@arremate/types';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
const POLL_PAYMENT_MS = 5_000;

// ─── Label maps ───────────────────────────────────────────────────────────────

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Aguardando pagamento',
  PAID: 'Pago',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Reembolsado',
};

const ORDER_STATUS_COLORS: Record<OrderStatus, { bg: string; text: string }> = {
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

const FULFILLMENT_COLORS: Record<FulfillmentStatus, { bg: string; text: string }> = {
  PENDING: { bg: '#f3f4f6', text: '#6b7280' },
  PROCESSING: { bg: '#dbeafe', text: '#1e40af' },
  SHIPPED: { bg: '#e0e7ff', text: '#3730a3' },
  DELIVERED: { bg: '#dcfce7', text: '#166534' },
  RETURNED: { bg: '#fef2f2', text: '#991b1b' },
};

const TICKET_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em andamento',
  RESOLVED: 'Resolvido',
  CLOSED: 'Fechado',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBrl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatTime(isoDate: string | Date | null): string {
  if (!isoDate) return '';
  const d = typeof isoDate === 'string' ? new Date(isoDate) : isoDate;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function safeJsonParse<T = { message?: string }>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={cardStyles.card}>
      <Text style={cardStyles.title}>{title}</Text>
      {children}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  title: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 10 },
});

// ─── Pix section ──────────────────────────────────────────────────────────────

interface PixSectionProps {
  order: Order;
  onPaymentCreated: (payment: Payment) => void;
  onPaymentConfirmed: () => void;
}

function PixSection({ order, onPaymentCreated, onPaymentConfirmed }: PixSectionProps) {
  const { getAccessToken } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Find the active pending Pix payment
  const pendingPix = order.payments?.find((p) => p.status === 'PENDING' && p.pixCode);

  // Start polling if there is a pending Pix
  useEffect(() => {
    if (!pendingPix || order.status !== 'PENDING_PAYMENT') return;
    const token = getAccessToken();
    if (!token) return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/v1/orders/${order.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as Order;
        if (data.status === 'PAID') {
          if (pollRef.current) clearInterval(pollRef.current);
          onPaymentConfirmed();
        }
      } catch {
        // Best-effort polling; silenced.
      }
    }, POLL_PAYMENT_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pendingPix?.id, order.id, order.status, getAccessToken, onPaymentConfirmed]);

  async function handleCreatePix() {
    const token = getAccessToken();
    if (!token) return;
    setError(null);
    setIsCreating(true);
    try {
      const res = await fetch(`${API_URL}/v1/orders/${order.id}/pix-payment`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await safeJsonParse(res);
        setError(body.message ?? 'Erro ao gerar Pix.');
        return;
      }
      const payment = (await res.json()) as Payment;
      onPaymentCreated(payment);
    } catch {
      setError('Erro ao gerar Pix. Verifique sua conexão e tente novamente.');
    } finally {
      setIsCreating(false);
    }
  }

  if (order.status === 'PAID') {
    return (
      <SectionCard title="Pagamento">
        <View style={pixStyles.paidRow}>
          <Ionicons name="checkmark-circle" size={22} color="#22c55e" />
          <Text style={pixStyles.paidText}>Pagamento confirmado</Text>
        </View>
      </SectionCard>
    );
  }

  if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
    return null;
  }

  return (
    <SectionCard title="Pagamento Pix">
      {error ? (
        <View style={pixStyles.errorRow}>
          <Text style={pixStyles.errorText}>{error}</Text>
          <Pressable onPress={() => void handleCreatePix()} style={pixStyles.retryBtn}>
            <Ionicons name="refresh-outline" size={14} color="#f97316" />
            <Text style={pixStyles.retryBtnText}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : null}

      {pendingPix ? (
        <View style={pixStyles.block}>
          {pendingPix.pixQrCodeBase64 ? (
            <View style={pixStyles.qrWrapper}>
              <Image
                source={{ uri: `data:image/png;base64,${pendingPix.pixQrCodeBase64}` }}
                style={pixStyles.qrImage}
                resizeMode="contain"
                accessibilityLabel="QR Code Pix"
              />
            </View>
          ) : null}

          <Text style={pixStyles.label}>Pix copia e cola</Text>
          <Text style={pixStyles.code} selectable>
            {pendingPix.pixCode ?? '—'}
          </Text>

          <Text style={pixStyles.amount}>
            Valor: {formatBrl(pendingPix.amountCents)}
          </Text>

          {pendingPix.pixExpiresAt ? (
            <Text style={pixStyles.expiry}>
              Expira em: {formatTime(pendingPix.pixExpiresAt)}
            </Text>
          ) : null}

          <Pressable
            style={pixStyles.copyBtn}
            accessibilityLabel="Copiar código Pix"
            onPress={() => {
              if (!pendingPix.pixCode) return;
              Share.share({ message: pendingPix.pixCode, title: 'Pix Arremate' }).catch(() => {
                /* silenced */
              });
            }}
          >
            <Ionicons name="copy-outline" size={16} color="#f97316" />
            <Text style={pixStyles.copyBtnText}>Copiar código Pix</Text>
          </Pressable>

          <View style={pixStyles.pendingRow}>
            <ActivityIndicator size="small" color="#9ca3af" />
            <Text style={pixStyles.pendingText}>Aguardando confirmação de pagamento…</Text>
          </View>
        </View>
      ) : (
        <View style={pixStyles.block}>
          <Text style={pixStyles.hint}>
            Gere o código Pix para concluir o pagamento deste pedido.
          </Text>
          <Pressable
            style={[pixStyles.generateBtn, isCreating && pixStyles.generateBtnDisabled]}
            onPress={() => void handleCreatePix()}
            disabled={isCreating}
          >
            {isCreating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={pixStyles.generateBtnText}>Gerar Pix</Text>
            )}
          </Pressable>
        </View>
      )}
    </SectionCard>
  );
}

const pixStyles = StyleSheet.create({
  block: { gap: 10 },
  errorRow: { gap: 4, marginBottom: 8 },
  errorText: { color: '#dc2626', fontSize: 13 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  retryBtnText: { color: '#f97316', fontSize: 13, fontWeight: '600' },
  paidRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  paidText: { fontSize: 15, fontWeight: '600', color: '#22c55e' },
  qrWrapper: { alignItems: 'center' },
  qrImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  label: { fontSize: 12, color: '#9ca3af' },
  code: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111',
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  amount: { fontSize: 14, color: '#374151' },
  expiry: { fontSize: 12, color: '#9ca3af' },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  copyBtnText: { color: '#f97316', fontWeight: '600', fontSize: 14 },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  pendingText: { fontSize: 12, color: '#9ca3af', flex: 1 },
  hint: { fontSize: 14, color: '#6b7280' },
  generateBtn: {
    backgroundColor: '#f97316',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  generateBtnDisabled: { opacity: 0.6 },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function OrderDetailScreen() {
  const { id: orderId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated, getAccessToken } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    const token = getAccessToken();
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/v1/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) {
        setError('Pedido não encontrado.');
        return;
      }
      if (res.status === 403) {
        setError('Você não tem permissão para ver este pedido.');
        return;
      }
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Order;
      setOrder(data);
      if (data.status === 'PAID') setPaymentConfirmed(true);
    } catch {
      setError('Erro ao carregar pedido. Verifique sua conexão e tente novamente.');
    } finally {
      setIsLoading(false);
    }
  }, [orderId, getAccessToken]);

  useEffect(() => {
    if (isAuthenticated) void fetchOrder();
  }, [isAuthenticated, fetchOrder]);

  function handlePaymentCreated(payment: Payment) {
    // Merge new payment into order state
    setOrder((prev) => {
      if (!prev) return prev;
      const existing = prev.payments ?? [];
      const updated = existing.filter((p) => p.id !== payment.id);
      return { ...prev, payments: [...updated, payment] };
    });
  }

  function handlePaymentConfirmed() {
    setPaymentConfirmed(true);
    setOrder((prev) => (prev ? { ...prev, status: 'PAID' } : prev));
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color="#111" />
          </Pressable>
          <Text style={styles.topBarTitle}>Detalhes do pedido</Text>
          <View style={styles.topBarSpacer} />
        </View>
        <View style={styles.centerContent}>
          <Text style={styles.errorMsg}>Faça login para ver seus pedidos.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.push('/login')}>
            <Text style={styles.primaryBtnText}>Entrar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color="#111" />
          </Pressable>
          <Text style={styles.topBarTitle}>Detalhes do pedido</Text>
          <View style={styles.topBarSpacer} />
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !order) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color="#111" />
          </Pressable>
          <Text style={styles.topBarTitle}>Detalhes do pedido</Text>
          <View style={styles.topBarSpacer} />
        </View>
        <View style={styles.centerContent}>
          <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
          <Text style={styles.errorMsg}>{error ?? 'Pedido não encontrado.'}</Text>
          <Pressable style={styles.primaryBtn} onPress={() => void fetchOrder()}>
            <Ionicons name="refresh-outline" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>Tentar novamente</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => router.back()}>
            <Text style={styles.secondaryBtnText}>Voltar para meus pedidos</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const orderStatus = order.status as OrderStatus;
  const statusColor = ORDER_STATUS_COLORS[orderStatus] ?? ORDER_STATUS_COLORS.CANCELLED;
  const chargeAmountCents = order.buyerTotalCents ?? order.totalCents;
  const hasFeeSnapshot = order.subtotalCents != null && order.buyerTotalCents != null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#111" />
        </Pressable>
        <Text style={styles.topBarTitle}>Pedido #{order.id.slice(-8).toUpperCase()}</Text>
        <View style={styles.topBarSpacer} />
      </View>

      {paymentConfirmed && orderStatus !== 'PAID' ? (
        // Transient banner when polling detects PAID before the local order refreshes
        <View style={styles.confirmedBanner}>
          <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
          <Text style={styles.confirmedBannerText}>Pagamento confirmado!</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ── Order header ── */}
        <SectionCard title="Resumo do pedido">
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text style={styles.orderRef}>#{order.id.slice(-8).toUpperCase()}</Text>
              <Text style={styles.orderDate}>{new Date(order.createdAt).toLocaleString('pt-BR')}</Text>
              {order.seller ? (
                <Text style={styles.sellerName}>
                  Vendedor: {order.seller.name ?? order.seller.email ?? '—'}
                </Text>
              ) : null}
            </View>
            <View>
              <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
                <Text style={[styles.statusBadgeText, { color: statusColor.text }]}>
                  {ORDER_STATUS_LABELS[orderStatus]}
                </Text>
              </View>
              <Text style={styles.totalAmount}>{formatBrl(chargeAmountCents)}</Text>
            </View>
          </View>
        </SectionCard>

        {/* ── Pix payment ── */}
        {order.status === 'PENDING_PAYMENT' || order.status === 'PAID' ? (
          <PixSection
            order={order}
            onPaymentCreated={handlePaymentCreated}
            onPaymentConfirmed={handlePaymentConfirmed}
          />
        ) : null}

        {/* ── Items ── */}
        {order.lines && order.lines.length > 0 ? (
          <SectionCard title="Itens">
            {order.lines.map((line, idx) => (
              <View
                key={line.id}
                style={[
                  styles.lineItem,
                  idx < order.lines!.length - 1 && styles.lineItemBorder,
                ]}
              >
                <Text style={styles.lineTitle} numberOfLines={2}>
                  {line.title} x{line.quantity}
                </Text>
                <Text style={styles.linePrice}>{formatBrl(line.priceCents)}</Text>
              </View>
            ))}
          </SectionCard>
        ) : null}

        {/* ── Fee breakdown ── */}
        {hasFeeSnapshot ? (
          <SectionCard title="Detalhamento de valores">
            <View style={styles.feeRow}>
              <Text style={styles.feeLabel}>Subtotal</Text>
              <Text style={styles.feeValue}>{formatBrl(order.subtotalCents!)}</Text>
            </View>
            {(order.shippingCents ?? 0) > 0 ? (
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Frete</Text>
                <Text style={styles.feeValue}>{formatBrl(order.shippingCents!)}</Text>
              </View>
            ) : null}
            {order.promotionCode ? (
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>
                  Desconto{' '}
                  <Text style={styles.promotionCode}>({order.promotionCode})</Text>
                </Text>
                <Text style={[styles.feeValue, styles.discountValue]}>
                  -{formatBrl(Math.round((order.subtotalCents! * (order.promotionDiscountBps ?? 0)) / 10000))}
                </Text>
              </View>
            ) : null}
            <View style={[styles.feeRow, styles.feeTotalRow]}>
              <Text style={styles.feeTotalLabel}>Total cobrado</Text>
              <Text style={styles.feeTotalValue}>{formatBrl(order.buyerTotalCents!)}</Text>
            </View>
          </SectionCard>
        ) : null}

        {/* ── Fulfillment / Shipment ── */}
        <SectionCard title="Envio">
          {order.shipment ? (
            <View style={styles.shipmentBlock}>
              {(() => {
                const fs = order.shipment.status as FulfillmentStatus;
                const fc = FULFILLMENT_COLORS[fs] ?? FULFILLMENT_COLORS.PENDING;
                return (
                  <View style={[styles.fulfillmentBadge, { backgroundColor: fc.bg }]}>
                    <Text style={[styles.fulfillmentBadgeText, { color: fc.text }]}>
                      {FULFILLMENT_LABELS[fs] ?? order.shipment.status}
                    </Text>
                  </View>
                );
              })()}
              {order.shipment.carrier ? (
                <Text style={styles.shipmentDetail}>
                  Transportadora:{' '}
                  <Text style={styles.shipmentDetailValue}>{order.shipment.carrier}</Text>
                </Text>
              ) : null}
              {order.shipment.trackingNumber ? (
                <Text style={styles.shipmentDetail}>
                  Código de rastreio:{' '}
                  <Text
                    style={[styles.shipmentDetailValue, styles.trackingCode]}
                    selectable
                  >
                    {order.shipment.trackingNumber}
                  </Text>
                </Text>
              ) : null}
              {order.shipment.estimatedDelivery ? (
                <Text style={styles.shipmentDetail}>
                  Previsão de entrega:{' '}
                  <Text style={styles.shipmentDetailValue}>
                    {new Date(order.shipment.estimatedDelivery).toLocaleDateString('pt-BR')}
                  </Text>
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.emptyNote}>Informações de envio ainda não disponíveis.</Text>
          )}
        </SectionCard>

        {/* ── Support tickets ── */}
        {order.supportTickets && order.supportTickets.length > 0 ? (
          <SectionCard title="Suporte">
            {(order.supportTickets as SupportTicket[]).map((ticket) => (
              <View key={ticket.id} style={styles.ticketItem}>
                <View style={styles.ticketHeader}>
                  <Text style={styles.ticketSubject}>{ticket.subject}</Text>
                  <Text style={styles.ticketStatus}>
                    {TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}
                  </Text>
                </View>
                <Text style={styles.ticketMessage}>{ticket.message}</Text>
                <Text style={styles.ticketDate}>
                  {new Date(ticket.createdAt).toLocaleString('pt-BR')}
                </Text>
              </View>
            ))}
          </SectionCard>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  topBarSpacer: { width: 36 },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  errorMsg: { fontSize: 15, color: '#ef4444', textAlign: 'center' },
  primaryBtn: {
    backgroundColor: '#f97316',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: { paddingVertical: 10, paddingHorizontal: 20 },
  secondaryBtnText: { color: '#6b7280', fontSize: 14, fontWeight: '500' },
  confirmedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0fdf4',
    borderBottomWidth: 1,
    borderBottomColor: '#bbf7d0',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  confirmedBannerText: { fontSize: 14, fontWeight: '600', color: '#166534' },
  scrollContent: { padding: 16, paddingBottom: 32 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerLeft: { flex: 1, gap: 2 },
  orderRef: {
    fontSize: 12,
    color: '#9ca3af',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  orderDate: { fontSize: 12, color: '#9ca3af' },
  sellerName: { fontSize: 13, color: '#374151', marginTop: 4 },
  statusBadge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-end',
    marginBottom: 4,
  },
  statusBadgeText: { fontSize: 12, fontWeight: '600' },
  totalAmount: { fontSize: 18, fontWeight: '800', color: '#111', textAlign: 'right' },
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    gap: 12,
  },
  lineItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  lineTitle: { flex: 1, fontSize: 14, color: '#374151' },
  linePrice: { fontSize: 14, fontWeight: '600', color: '#111', flexShrink: 0 },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f9fafb',
  },
  feeLabel: { fontSize: 14, color: '#6b7280' },
  feeValue: { fontSize: 14, fontWeight: '500', color: '#111' },
  promotionCode: { fontSize: 12, color: '#f97316' },
  discountValue: { color: '#16a34a' },
  feeTotalRow: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    borderBottomWidth: 0,
    paddingTop: 10,
  },
  feeTotalLabel: { fontSize: 15, fontWeight: '700', color: '#111' },
  feeTotalValue: { fontSize: 15, fontWeight: '800', color: '#111' },
  shipmentBlock: { gap: 8 },
  fulfillmentBadge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  fulfillmentBadgeText: { fontSize: 12, fontWeight: '600' },
  shipmentDetail: { fontSize: 13, color: '#6b7280' },
  shipmentDetailValue: { fontWeight: '600', color: '#111' },
  trackingCode: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#f97316',
  },
  emptyNote: { fontSize: 13, color: '#9ca3af' },
  ticketItem: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 4,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  ticketSubject: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111' },
  ticketStatus: { fontSize: 12, color: '#6b7280', flexShrink: 0 },
  ticketMessage: { fontSize: 13, color: '#6b7280' },
  ticketDate: { fontSize: 11, color: '#9ca3af' },
});
