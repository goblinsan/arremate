import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Share,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import type { ItemCondition } from '@arremate/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
const POLL_SESSION_MS = 5_000;
const POLL_CHAT_MS = 3_000;
const BASTAO_COUNTDOWN_S = 5;
const MAX_CHAT_VISIBLE = 5;

// ─── Local types ──────────────────────────────────────────────────────────────

interface InventoryItem {
  id: string;
  title: string;
  startingPrice: number;
  condition: ItemCondition;
}

interface PinnedItem {
  id: string;
  currentBid: number | null;
  bidCount: number;
  soldOut: boolean;
  inventoryItem: InventoryItem;
}

interface LiveSession {
  id: string;
  showId: string;
  status: 'LIVE' | 'STARTING' | 'ENDED';
  playbackUrl: string | null;
  viewerCount?: number;
  pinnedItemId: string | null;
  pinnedItem?: PinnedItem;
  raidedToShowId: string | null;
  endedAt: string | null;
}

interface PublicShow {
  id: string;
  title: string;
  status: 'SCHEDULED' | 'LIVE' | 'ENDED';
  seller: {
    id: string;
    name: string | null;
    brandName: string | null;
    metrics: {
      ratingAverage: number | null;
      ratingCount: number;
      completedSalesCount: number;
      averageShippingDays: number | null;
    };
  };
}

interface ChatMessage {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string | null };
}

interface LiveClaim {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';
  expiresAt: string | null;
}

interface LiveOrder {
  id: string;
  status: string;
  totalCents: number;
  buyerTotalCents: number | null;
}

interface LivePayment {
  id: string;
  status: string;
  pixCode: string | null;
  pixQrCodeBase64: string | null;
  pixExpiresAt: string | null;
  amountCents: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONDITION_LABELS: Record<ItemCondition, string> = {
  NEW: 'Novo',
  USED: 'Usado',
  REFURBISHED: 'Recondicionado',
};

function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatTime(isoDate: string | null): string {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Parses a bid string that may use comma or period as the decimal separator. */
function parseBidAmount(raw: string): number {
  // Remove spaces and the 'R$' currency symbol as a unit, then normalize decimal separator
  const cleaned = raw.replace(/\s/g, '').replace(/R\$/g, '').replace('$', '').replace(',', '.');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : NaN;
}

/** Safely parses a JSON response body; returns an empty object on failure. */
async function safeJsonParse<T = { message?: string }>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SellerStrip({ show }: { show: PublicShow }) {
  const name = show.seller.brandName ?? show.seller.name ?? 'Vendedor';
  const initial = name.charAt(0).toUpperCase();
  const rating = show.seller.metrics.ratingAverage;
  const sales = show.seller.metrics.completedSalesCount;

  return (
    <View style={stripStyles.row}>
      <View style={stripStyles.avatar}>
        <Text style={stripStyles.avatarText}>{initial}</Text>
      </View>
      <View style={stripStyles.info}>
        <Text style={stripStyles.name} numberOfLines={1}>{name}</Text>
        {(rating !== null || sales > 0) && (
          <Text style={stripStyles.meta}>
            {rating !== null ? `${rating.toFixed(1)} ` : ''}
            {sales > 0 ? `${sales} vendas` : ''}
          </Text>
        )}
      </View>
    </View>
  );
}

const stripStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  info: { flex: 1 },
  name: { color: '#fff', fontWeight: '700', fontSize: 14 },
  meta: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 1 },
});

function PinnedItemCard({ item }: { item: PinnedItem }) {
  const currentBid = item.currentBid !== null ? Number(item.currentBid) : null;
  const startingPrice = Number(item.inventoryItem.startingPrice);
  const displayPrice = currentBid ?? startingPrice;
  const conditionLabel = CONDITION_LABELS[item.inventoryItem.condition] ?? item.inventoryItem.condition;

  return (
    <View style={pinnedStyles.card}>
      <View style={pinnedStyles.left}>
        <Ionicons name="pricetag-outline" size={14} color="#f97316" />
        <View style={pinnedStyles.textBlock}>
          <Text style={pinnedStyles.title} numberOfLines={1}>
            {item.inventoryItem.title}
          </Text>
          <Text style={pinnedStyles.condition}>{conditionLabel}</Text>
        </View>
      </View>
      <View style={pinnedStyles.right}>
        <Text style={pinnedStyles.price}>{formatBrl(displayPrice)}</Text>
        {item.bidCount > 0 && (
          <Text style={pinnedStyles.bids}>{item.bidCount} lance{item.bidCount !== 1 ? 's' : ''}</Text>
        )}
      </View>
    </View>
  );
}

const pinnedStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  textBlock: { flex: 1 },
  title: { color: '#fff', fontWeight: '600', fontSize: 13 },
  condition: { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 1 },
  right: { alignItems: 'flex-end' },
  price: { color: '#f97316', fontWeight: '800', fontSize: 16 },
  bids: { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 1 },
});

function ChatList({ messages }: { messages: ChatMessage[] }) {
  const visible = messages.slice(-MAX_CHAT_VISIBLE);
  if (visible.length === 0) return null;
  return (
    <View style={chatListStyles.container} pointerEvents="none">
      {visible.map((msg) => (
        <View key={msg.id} style={chatListStyles.row}>
          <Text style={chatListStyles.user} numberOfLines={1}>
            {msg.user.name ?? 'Usuário'}
          </Text>
          <Text style={chatListStyles.content} numberOfLines={2}>
            {msg.content}
          </Text>
        </View>
      ))}
    </View>
  );
}

const chatListStyles = StyleSheet.create({
  container: { paddingHorizontal: 12, paddingBottom: 4, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap' },
  user: {
    color: '#f97316',
    fontWeight: '700',
    fontSize: 12,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  content: {
    color: '#fff',
    fontSize: 12,
    flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

// ─── Claim / Checkout panel ───────────────────────────────────────────────────

interface CheckoutPanelProps {
  claim: LiveClaim | null;
  order: LiveOrder | null;
  payment: LivePayment | null;
  isLoading: boolean;
  error: string | null;
  paymentConfirmed: boolean;
  onCreateOrder: () => void;
  onCreatePayment: () => void;
  onRetry: () => void;
  onGoToOrders: () => void;
  onClose: () => void;
}

function CheckoutPanel({
  claim,
  order,
  payment,
  isLoading,
  error,
  paymentConfirmed,
  onCreateOrder,
  onCreatePayment,
  onRetry,
  onGoToOrders,
  onClose,
}: CheckoutPanelProps) {
  if (!claim) return null;

  const chargeAmountCents = order
    ? (order.buyerTotalCents ?? order.totalCents)
    : null;

  return (
    <View style={checkoutStyles.panel}>
      <View style={checkoutStyles.header}>
        <Text style={checkoutStyles.title}>
          {paymentConfirmed
            ? 'Pagamento confirmado'
            : payment
            ? 'Pagamento Pix'
            : order
            ? 'Pedido criado'
            : 'Item reservado'}
        </Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={20} color="#9ca3af" />
        </Pressable>
      </View>

      {error ? (
        <View style={checkoutStyles.errorRow}>
          <Text style={checkoutStyles.error}>{error}</Text>
          <Pressable onPress={onRetry} style={checkoutStyles.retryBtn}>
            <Ionicons name="refresh-outline" size={14} color="#f97316" />
            <Text style={checkoutStyles.retryBtnText}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : null}

      {paymentConfirmed ? (
        // Payment confirmed state
        <View style={checkoutStyles.confirmedBlock}>
          <Ionicons name="checkmark-circle" size={48} color="#22c55e" />
          <Text style={checkoutStyles.confirmedTitle}>Pagamento recebido!</Text>
          <Text style={checkoutStyles.confirmedSub}>
            Seu pedido foi confirmado e sera processado em breve.
          </Text>
          <Pressable style={checkoutStyles.goOrdersBtn} onPress={onGoToOrders}>
            <Text style={checkoutStyles.goOrdersBtnText}>Ver meus pedidos</Text>
            <Ionicons name="chevron-forward" size={16} color="#f97316" />
          </Pressable>
        </View>
      ) : payment ? (
        // PIX payment display
        <View style={checkoutStyles.pixBlock}>
          {payment.pixQrCodeBase64 ? (
            <View style={checkoutStyles.qrWrapper}>
              <Image
                source={{ uri: `data:image/png;base64,${payment.pixQrCodeBase64}` }}
                style={checkoutStyles.qrImage}
                resizeMode="contain"
                accessibilityLabel="QR Code Pix"
              />
            </View>
          ) : null}

          <Text style={checkoutStyles.pixLabel}>Pix copia e cola</Text>
          <Text style={checkoutStyles.pixKey} selectable>
            {payment.pixCode ?? '—'}
          </Text>
          <Text style={checkoutStyles.pixAmount}>
            Valor: {(payment.amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </Text>

          {payment.pixExpiresAt ? (
            <Text style={checkoutStyles.pixExpiry}>
              Expira em: {formatTime(payment.pixExpiresAt)}
            </Text>
          ) : null}

          <Pressable
            style={checkoutStyles.shareBtn}
            accessibilityLabel="Copiar codigo Pix"
            onPress={() => {
              if (!payment.pixCode) return;
              Share.share({ message: payment.pixCode, title: 'Pix Arremate' }).catch(() => {
                /* silenced: share cancellation is not an error */
              });
            }}
          >
            <Ionicons name="copy-outline" size={16} color="#f97316" />
            <Text style={checkoutStyles.shareBtnText}>Copiar codigo Pix</Text>
          </Pressable>

          <View style={checkoutStyles.pendingRow}>
            <ActivityIndicator size="small" color="#9ca3af" />
            <Text style={checkoutStyles.pendingText}>Aguardando confirmacao de pagamento…</Text>
          </View>

          <Pressable style={checkoutStyles.goOrdersBtn} onPress={onGoToOrders}>
            <Text style={checkoutStyles.goOrdersBtnText}>Ver meus pedidos</Text>
            <Ionicons name="chevron-forward" size={16} color="#f97316" />
          </Pressable>
        </View>
      ) : order ? (
        // Order created — trigger payment
        <View style={checkoutStyles.orderBlock}>
          <Text style={checkoutStyles.orderInfo}>
            Pedido criado. Total:{' '}
            {(chargeAmountCents! / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </Text>
          <Pressable
            style={[checkoutStyles.actionBtn, isLoading && checkoutStyles.actionBtnDisabled]}
            onPress={onCreatePayment}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={checkoutStyles.actionBtnText}>Gerar Pix</Text>
            )}
          </Pressable>
        </View>
      ) : (
        // Claim confirmed — create order
        <View style={checkoutStyles.claimBlock}>
          <Text style={checkoutStyles.claimInfo}>
            Item reservado{claim.expiresAt ? ` · expira ${formatTime(claim.expiresAt)}` : ''}
          </Text>
          <Pressable
            style={[checkoutStyles.actionBtn, isLoading && checkoutStyles.actionBtnDisabled]}
            onPress={onCreateOrder}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={checkoutStyles.actionBtnText}>Finalizar compra</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const checkoutStyles = StyleSheet.create({
  panel: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#111' },
  errorRow: { gap: 6, marginBottom: 12 },
  error: { color: '#ef4444', fontSize: 13 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  retryBtnText: { color: '#f97316', fontSize: 13, fontWeight: '600' },
  claimBlock: { gap: 12 },
  claimInfo: { fontSize: 14, color: '#555' },
  orderBlock: { gap: 12 },
  orderInfo: { fontSize: 14, color: '#555' },
  pixBlock: { gap: 10 },
  qrWrapper: {
    alignItems: 'center',
    marginBottom: 4,
  },
  qrImage: {
    width: 180,
    height: 180,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  pixLabel: { fontSize: 13, color: '#9ca3af' },
  pixKey: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111',
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  pixAmount: { fontSize: 14, color: '#555' },
  pixExpiry: { fontSize: 12, color: '#9ca3af' },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  shareBtnText: { color: '#f97316', fontWeight: '600', fontSize: 14 },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  pendingText: { fontSize: 12, color: '#9ca3af', flex: 1 },
  confirmedBlock: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  confirmedTitle: { fontSize: 17, fontWeight: '700', color: '#22c55e' },
  confirmedSub: { fontSize: 13, color: '#6b7280', textAlign: 'center' },
  goOrdersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  goOrdersBtnText: { color: '#f97316', fontWeight: '600', fontSize: 14 },
  actionBtn: {
    backgroundColor: '#f97316',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

// ─── Bid Input Panel ──────────────────────────────────────────────────────────

interface BidPanelProps {
  minBid: number;
  bidAmount: string;
  isBidding: boolean;
  bidError: string | null;
  onChangeBid: (v: string) => void;
  onSubmitBid: () => void;
  onClose: () => void;
}

function BidPanel({
  minBid,
  bidAmount,
  isBidding,
  bidError,
  onChangeBid,
  onSubmitBid,
  onClose,
}: BidPanelProps) {
  return (
    <View style={bidStyles.panel}>
      <View style={bidStyles.header}>
        <Text style={bidStyles.title}>Dar lance</Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={20} color="#9ca3af" />
        </Pressable>
      </View>
      <Text style={bidStyles.minBidHint}>Lance mínimo: {formatBrl(minBid)}</Text>
      {bidError ? <Text style={bidStyles.error}>{bidError}</Text> : null}
      <View style={bidStyles.inputRow}>
        <Text style={bidStyles.currency}>R$</Text>
        <TextInput
          style={bidStyles.input}
          value={bidAmount}
          onChangeText={onChangeBid}
          keyboardType="decimal-pad"
          placeholder={`${minBid.toFixed(2)}`}
          placeholderTextColor="#9ca3af"
          returnKeyType="done"
          onSubmitEditing={onSubmitBid}
          autoFocus
        />
      </View>
      <Pressable
        style={[bidStyles.submitBtn, isBidding && bidStyles.submitBtnDisabled]}
        onPress={onSubmitBid}
        disabled={isBidding}
      >
        {isBidding ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={bidStyles.submitBtnText}>Confirmar lance</Text>
        )}
      </Pressable>
    </View>
  );
}

const bidStyles = StyleSheet.create({
  panel: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#111' },
  minBidHint: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  error: { color: '#ef4444', fontSize: 13, marginBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#f97316',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    gap: 6,
  },
  currency: { fontSize: 18, fontWeight: '700', color: '#111' },
  input: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    padding: 0,
  },
  submitBtn: {
    backgroundColor: '#f97316',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LiveRoomScreen() {
  const { id: showId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getAccessToken } = useAuth();

  // ─── Show / session state ────────────────────────────────────────────────────
  const [show, setShow] = useState<PublicShow | null>(null);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [isLoadingShow, setIsLoadingShow] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [bastaoTargetId, setBastaoTargetId] = useState<string | null>(null);
  const [bastaoCountdown, setBastaoCountdown] = useState<number | null>(null);

  // ─── Chat state ──────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingMsg, setIsSendingMsg] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // ─── Bid state ───────────────────────────────────────────────────────────────
  const [showBidPanel, setShowBidPanel] = useState(false);
  const [bidAmount, setBidAmount] = useState('');
  const [isBidding, setIsBidding] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);

  // ─── Claim / checkout state ──────────────────────────────────────────────────
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claim, setClaim] = useState<LiveClaim | null>(null);
  const [order, setOrder] = useState<LiveOrder | null>(null);
  const [payment, setPayment] = useState<LivePayment | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [showCheckoutPanel, setShowCheckoutPanel] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  // ─── Video player ────────────────────────────────────────────────────────────
  // Initialize with null so the hook call is stable; the source is replaced
  // via player.replace() once the session's playbackUrl becomes available.
  const playbackUrlRef = useRef<string | null>(null);
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.muted = false;
  });

  // Replace video source when playback URL arrives or changes
  useEffect(() => {
    const url = session?.playbackUrl ?? null;
    if (url && url !== playbackUrlRef.current) {
      playbackUrlRef.current = url;
      player.replace(url);
      player.play();
    }
  }, [session?.playbackUrl, player]);

  // ─── Session polling ─────────────────────────────────────────────────────────
  const fetchSession = useCallback(async () => {
    if (!showId) return;
    try {
      const res = await fetch(`${API_URL}/v1/shows/${showId}/session`);
      if (res.ok) {
        const data = (await res.json()) as LiveSession;
        setSession(data);
        setSessionError(null);
        if (data.status === 'ENDED' && data.raidedToShowId) {
          setShow((prev) => (prev ? { ...prev, status: 'ENDED' } : prev));
          setBastaoTargetId(data.raidedToShowId);
          setBastaoCountdown(BASTAO_COUNTDOWN_S);
        }
      } else if (res.status === 404) {
        setSession(null);
      } else {
        setSessionError('Erro ao buscar sessão.');
      }
    } catch {
      setSessionError('Erro ao buscar sessão.');
    }
  }, [showId]);

  // Initial load
  useEffect(() => {
    if (!showId) return;
    setIsLoadingShow(true);
    fetch(`${API_URL}/v1/shows/${showId}`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json() as Promise<PublicShow>;
      })
      .then((data) => {
        setShow(data);
        if (data.status === 'LIVE') {
          void fetchSession();
        }
      })
      .catch(() => {
        // handled via null state
      })
      .finally(() => setIsLoadingShow(false));
  }, [showId, fetchSession]);

  // Poll session while LIVE
  const showStatus = show?.status;
  useEffect(() => {
    if (showStatus !== 'LIVE') return;
    const interval = setInterval(() => void fetchSession(), POLL_SESSION_MS);
    return () => clearInterval(interval);
  }, [showStatus, fetchSession]);

  // Bastão countdown
  useEffect(() => {
    if (bastaoCountdown === null || !bastaoTargetId) return;
    if (bastaoCountdown <= 0) {
      router.replace(`/live/${bastaoTargetId}`);
      return;
    }
    const timer = setTimeout(
      () => setBastaoCountdown((c) => (c !== null ? c - 1 : null)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [bastaoCountdown, bastaoTargetId, router]);

  // ─── Chat polling ─────────────────────────────────────────────────────────────
  const fetchMessages = useCallback(async (sid: string) => {
    try {
      const res = await fetch(`${API_URL}/v1/sessions/${sid}/chat`);
      if (res.ok) {
        const data = (await res.json()) as ChatMessage[];
        setMessages(data);
      }
    } catch {
      // Best-effort polling
    }
  }, []);

  const sessionId = session?.id;
  const sessionStatus = session?.status;

  useEffect(() => {
    if (!sessionId || sessionStatus !== 'LIVE') return;
    void fetchMessages(sessionId);
    const interval = setInterval(() => void fetchMessages(sessionId), POLL_CHAT_MS);
    return () => clearInterval(interval);
  }, [sessionId, sessionStatus, fetchMessages]);

  // ─── Chat send ───────────────────────────────────────────────────────────────
  async function handleSendMessage() {
    if (!session || !chatInput.trim()) return;
    const token = getAccessToken();
    if (!token) {
      Alert.alert('Login necessário', 'Faça login para enviar mensagens.', [
        { text: 'OK' },
      ]);
      return;
    }
    setChatError(null);
    setIsSendingMsg(true);
    try {
      const res = await fetch(`${API_URL}/v1/sessions/${session.id}/chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: chatInput.trim() }),
      });
      if (res.status === 429) {
        setChatError('Aguarde um momento antes de enviar outra mensagem.');
        return;
      }
      if (!res.ok) {
        const body = await safeJsonParse(res);
        setChatError(body.message ?? 'Erro ao enviar mensagem.');
        return;
      }
      const newMsg = (await res.json()) as ChatMessage;
      setMessages((prev) => [...prev, newMsg]);
      setChatInput('');
      setChatError(null);
    } catch {
      setChatError('Erro ao enviar mensagem.');
    } finally {
      setIsSendingMsg(false);
    }
  }

  // ─── Bid ─────────────────────────────────────────────────────────────────────
  async function handlePlaceBid() {
    if (!session || !session.pinnedItem) return;
    const token = getAccessToken();
    if (!token) {
      Alert.alert('Login necessário', 'Faça login para dar lances.', [{ text: 'OK' }]);
      return;
    }
    const amount = parseBidAmount(bidAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setBidError('Informe um valor de lance válido.');
      return;
    }
    setBidError(null);
    setIsBidding(true);
    try {
      const res = await fetch(`${API_URL}/v1/sessions/${session.id}/bids`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) {
        const body = await safeJsonParse<{ message?: string; minimumBid?: number }>(res);
        const minLabel = body.minimumBid != null ? ` Lance mínimo: ${formatBrl(body.minimumBid)}.` : '';
        setBidError((body.message ?? 'Não foi possível registrar seu lance.') + minLabel);
        return;
      }
      const data = (await res.json()) as { queueItem: PinnedItem };
      setSession((prev) =>
        prev ? { ...prev, pinnedItem: data.queueItem } : prev,
      );
      setBidAmount('');
      setShowBidPanel(false);
    } catch {
      setBidError('Não foi possível registrar seu lance.');
    } finally {
      setIsBidding(false);
    }
  }

  // ─── Claim ───────────────────────────────────────────────────────────────────
  async function handleClaim() {
    if (!session) return;
    const token = getAccessToken();
    if (!token) {
      Alert.alert('Login necessário', 'Faça login para comprar.', [{ text: 'OK' }]);
      return;
    }
    setClaimError(null);
    setIsClaiming(true);
    try {
      const res = await fetch(`${API_URL}/v1/sessions/${session.id}/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await safeJsonParse(res);
        setClaimError(body.message ?? 'Erro ao reservar item.');
        return;
      }
      const newClaim = (await res.json()) as LiveClaim;
      setClaim(newClaim);
      setShowCheckoutPanel(true);
    } catch {
      setClaimError('Erro ao reservar item.');
    } finally {
      setIsClaiming(false);
    }
  }

  // ─── Create order ────────────────────────────────────────────────────────────
  async function handleCreateOrder() {
    if (!claim) return;
    const token = getAccessToken();
    if (!token) return;
    setCheckoutError(null);
    setIsCreatingOrder(true);
    try {
      const res = await fetch(`${API_URL}/v1/claims/${claim.id}/order`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await safeJsonParse(res);
        setCheckoutError(body.message ?? 'Erro ao criar pedido.');
        return;
      }
      const newOrder = (await res.json()) as LiveOrder;
      setOrder(newOrder);
    } catch {
      setCheckoutError('Erro ao criar pedido.');
    } finally {
      setIsCreatingOrder(false);
    }
  }

  // ─── Create PIX payment ──────────────────────────────────────────────────────
  async function handleCreatePayment() {
    if (!order) return;
    const token = getAccessToken();
    if (!token) return;
    setCheckoutError(null);
    setIsCreatingPayment(true);
    try {
      const res = await fetch(`${API_URL}/v1/orders/${order.id}/pix-payment`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await safeJsonParse(res);
        setCheckoutError(body.message ?? 'Erro ao gerar Pix.');
        return;
      }
      const newPayment = (await res.json()) as LivePayment;
      setPayment(newPayment);
    } catch {
      setCheckoutError('Erro ao gerar Pix.');
    } finally {
      setIsCreatingPayment(false);
    }
  }

  // ─── Payment status polling ──────────────────────────────────────────────────
  // Poll the order status every 5 s while a Pix payment is pending.
  const orderId = order?.id;
  useEffect(() => {
    if (!payment || !orderId || paymentConfirmed) return;
    const token = getAccessToken();
    if (!token) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/v1/orders/${orderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { status: string };
        if (data.status === 'PAID') {
          setPaymentConfirmed(true);
          clearInterval(interval);
        }
      } catch {
        // Best-effort polling; errors are silenced.
      }
    }, 5_000);

    return () => clearInterval(interval);
  }, [payment, orderId, paymentConfirmed, getAccessToken]);

  // ─── Retry checkout ──────────────────────────────────────────────────────────
  function handleRetryCheckout() {
    setCheckoutError(null);
    if (!order) {
      // Retry order creation
      void handleCreateOrder();
    } else if (!payment) {
      // Retry Pix generation
      void handleCreatePayment();
    }
  }

  // ─── Derived values ──────────────────────────────────────────────────────────
  const pinnedItem = session?.pinnedItem;
  const livePrice =
    pinnedItem
      ? Number(pinnedItem.currentBid ?? pinnedItem.inventoryItem.startingPrice)
      : null;
  const minNextBid = livePrice !== null ? livePrice + 1 : null;
  const viewerCount = session?.viewerCount ?? 0;
  const isLive = show?.status === 'LIVE';
  const isEnded = show?.status === 'ENDED';

  // ─── Loading state ───────────────────────────────────────────────────────────
  if (isLoadingShow) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  if (!show) {
    return (
      <SafeAreaView style={styles.errorContainer} edges={['top']}>
        <Text style={styles.errorText}>Show não encontrado.</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Voltar</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* Video background */}
      {session?.playbackUrl ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          nativeControls={false}
          contentFit="cover"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.videoPlaceholder]}>
          {isLive && (
            <Text style={styles.videoPlaceholderText}>
              {session ? 'Aguardando transmissão…' : 'Conectando…'}
            </Text>
          )}
        </View>
      )}

      {/* Full-screen overlay */}
      <View style={[styles.overlay, { paddingTop: insets.top }]}>
        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={styles.topBarBack}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </Pressable>

          <View style={styles.topBarRight}>
            {isLive && (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveBadgeText}>AO VIVO</Text>
              </View>
            )}
            {viewerCount > 0 && (
              <View style={styles.viewerBadge}>
                <Ionicons name="eye-outline" size={13} color="rgba(255,255,255,0.85)" />
                <Text style={styles.viewerText}>{viewerCount}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Ended state ── */}
        {isEnded && (
          <View style={styles.endedOverlay}>
            {bastaoTargetId ? (
              <View style={styles.bastaoBox}>
                <Ionicons name="radio-outline" size={32} color="#a78bfa" />
                <Text style={styles.bastaoTitle}>O bastão foi passado!</Text>
                <Text style={styles.bastaoSub}>
                  Redirecionando em{' '}
                  <Text style={styles.bastaoCount}>{bastaoCountdown ?? 0}</Text>
                  {' '}segundo{(bastaoCountdown ?? 0) !== 1 ? 's' : ''}…
                </Text>
                <Pressable
                  style={styles.bastaoBtn}
                  onPress={() => router.replace(`/live/${bastaoTargetId}`)}
                >
                  <Text style={styles.bastaoGoBtnText}>Ir agora</Text>
                  <Ionicons name="chevron-forward" size={16} color="#fff" />
                </Pressable>
              </View>
            ) : (
              <Text style={styles.endedText}>A transmissão foi encerrada.</Text>
            )}
          </View>
        )}

        {/* ── Not live yet ── */}
        {!isLive && !isEnded && (
          <View style={styles.endedOverlay}>
            <Text style={styles.endedText}>O show ainda não começou.</Text>
          </View>
        )}

        {/* ── Bottom section (live only) ── */}
        {isLive && (
          <KeyboardAvoidingView
            style={styles.bottomSection}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
          >
            {/* Seller info strip */}
            <SellerStrip show={show} />

            {/* Pinned item */}
            {pinnedItem && <PinnedItemCard item={pinnedItem} />}

            {/* Checkout panel (replaces action bar when visible) */}
            {showCheckoutPanel && claim ? (
              <CheckoutPanel
                claim={claim}
                order={order}
                payment={payment}
                isLoading={isCreatingOrder || isCreatingPayment}
                error={checkoutError}
                paymentConfirmed={paymentConfirmed}
                onCreateOrder={handleCreateOrder}
                onCreatePayment={handleCreatePayment}
                onRetry={handleRetryCheckout}
                onGoToOrders={() => router.push('/(tabs)/orders')}
                onClose={() => setShowCheckoutPanel(false)}
              />
            ) : showBidPanel && minNextBid !== null ? (
              // Bid input panel
              <BidPanel
                minBid={minNextBid}
                bidAmount={bidAmount}
                isBidding={isBidding}
                bidError={bidError}
                onChangeBid={(v) => {
                  setBidAmount(v);
                  setBidError(null);
                }}
                onSubmitBid={handlePlaceBid}
                onClose={() => {
                  setShowBidPanel(false);
                  setBidAmount('');
                  setBidError(null);
                }}
              />
            ) : (
              // Normal: chat + action bar
              <>
                {/* Chat messages */}
                <ChatList messages={messages} />

                {sessionError && (
                  <Text style={styles.sessionError}>{sessionError}</Text>
                )}

                {/* Action bar */}
                <View style={[styles.actionBar, { paddingBottom: insets.bottom + 8 }]}>
                  {/* Chat input */}
                  <View style={styles.chatInputRow}>
                    <TextInput
                      style={styles.chatInput}
                      value={chatInput}
                      onChangeText={(v) => {
                        setChatInput(v);
                        setChatError(null);
                      }}
                      placeholder="Mensagem…"
                      placeholderTextColor="rgba(255,255,255,0.45)"
                      returnKeyType="send"
                      onSubmitEditing={handleSendMessage}
                      blurOnSubmit={false}
                    />
                    <Pressable
                      style={[
                        styles.chatSendBtn,
                        (!chatInput.trim() || isSendingMsg) && styles.chatSendBtnDisabled,
                      ]}
                      onPress={handleSendMessage}
                      disabled={!chatInput.trim() || isSendingMsg}
                    >
                      {isSendingMsg ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="send" size={16} color="#fff" />
                      )}
                    </Pressable>
                  </View>

                  {chatError && (
                    <Text style={styles.chatErrorText}>{chatError}</Text>
                  )}

                  {/* Commerce buttons */}
                  {pinnedItem && !pinnedItem.soldOut && (
                    <View style={styles.commerceRow}>
                      {/* Bid button */}
                      {minNextBid !== null && (
                        <Pressable
                          style={styles.bidBtn}
                          onPress={() => {
                            setShowBidPanel(true);
                            setBidError(null);
                          }}
                        >
                          <Ionicons name="hammer-outline" size={16} color="#fff" />
                          <Text style={styles.bidBtnText}>Lance</Text>
                          <Text style={styles.bidBtnMin}>{formatBrl(minNextBid)}</Text>
                        </Pressable>
                      )}

                      {/* Claim/buy button */}
                      {!claim && (
                        <Pressable
                          style={[styles.claimBtn, isClaiming && styles.claimBtnDisabled]}
                          onPress={handleClaim}
                          disabled={isClaiming}
                        >
                          {isClaiming ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <>
                              <Ionicons name="bag-outline" size={16} color="#fff" />
                              <Text style={styles.claimBtnText}>Comprar</Text>
                            </>
                          )}
                        </Pressable>
                      )}

                      {/* Reopen checkout if claim exists */}
                      {claim && !showCheckoutPanel && (
                        <Pressable
                          style={styles.claimBtn}
                          onPress={() => setShowCheckoutPanel(true)}
                        >
                          <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                          <Text style={styles.claimBtnText}>Finalizar</Text>
                        </Pressable>
                      )}
                    </View>
                  )}

                  {claimError && (
                    <Text style={styles.chatErrorText}>{claimError}</Text>
                  )}
                </View>
              </>
            )}
          </KeyboardAvoidingView>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  errorText: { color: '#9ca3af', fontSize: 16, textAlign: 'center' },
  backBtn: {
    backgroundColor: '#f97316',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  backBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Video placeholder (shown while URL loads)
  videoPlaceholder: {
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlaceholderText: { color: '#6b7280', fontSize: 14 },

  // Overlay
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  topBarBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveBadgeText: { color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },
  viewerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  viewerText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },

  // Ended / not live overlays
  endedOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  endedText: { color: '#9ca3af', fontSize: 16, textAlign: 'center' },
  bastaoBox: { alignItems: 'center', gap: 12 },
  bastaoTitle: { color: '#fff', fontWeight: '700', fontSize: 20, textAlign: 'center' },
  bastaoSub: { color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center' },
  bastaoCount: { color: '#a78bfa', fontWeight: '800' },
  bastaoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#7c3aed',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  bastaoGoBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Bottom section
  bottomSection: { justifyContent: 'flex-end' },

  // Session error
  sessionError: {
    color: '#fca5a5',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // Action bar
  actionBar: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatInput: {
    flex: 1,
    height: 38,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 19,
    paddingHorizontal: 14,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  chatSendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendBtnDisabled: { opacity: 0.45 },
  chatErrorText: {
    color: '#fca5a5',
    fontSize: 11,
    paddingHorizontal: 4,
  },

  // Commerce row
  commerceRow: {
    flexDirection: 'row',
    gap: 8,
  },
  bidBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  bidBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  bidBtnMin: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  claimBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: 10,
  },
  claimBtnDisabled: { opacity: 0.6 },
  claimBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
