import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Radio,
  Mic,
  Pin,
  Package,
  ShoppingCart,
  Check,
  TriangleAlert,
  ArrowLeft,
  ArrowRight,
  QrCode,
  Eye,
  Share2,
  Wallet,
  Store,
  Star,
  Truck,
} from 'lucide-react';
import type { Show, ShowSession, ItemCondition, ChatMessage, Claim, Order, Payment } from '@arremate/types';
import LivePlayer from '../components/LivePlayer';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';
const POLL_INTERVAL_MS = 5000;
const CHAT_POLL_INTERVAL_MS = 3000;
const CLAIM_EXPIRY_POLL_MS = 10000;
const BASTAO_REDIRECT_COUNTDOWN_SECONDS = 5;
const PRESENCE_HEARTBEAT_MS = 15000;

const CONDITION_LABELS: Record<ItemCondition, string> = {
  NEW: 'Novo',
  USED: 'Usado',
  REFURBISHED: 'Recondicionado',
};

interface PublicShow extends Omit<Show, 'seller'> {
  seller: {
    id: string;
    name: string | null;
    brandName: string | null;
    brandLogoUrl: string | null;
    metrics: {
      ratingAverage: number | null;
      ratingCount: number;
      averageShippingDays: number | null;
      completedSalesCount: number;
    };
  };
}

function formatExpiresAt(date: Date | string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function getSellerBadgeText(show: PublicShow): string {
  const rating = show.seller.metrics.ratingAverage;
  if (rating !== null) {
    return show.seller.metrics.ratingCount > 0
      ? `${rating.toFixed(1)} · ${show.seller.metrics.ratingCount}`
      : rating.toFixed(1);
  }
  return show.seller.metrics.completedSalesCount > 0 ? 'Confiável' : 'Novo';
}

function getShippingSpeedText(show: PublicShow): string {
  const averageDays = show.seller.metrics.averageShippingDays;
  if (averageDays === null) return 'Sem histórico';
  if (averageDays < 1) return 'Mesmo dia';
  return `${Math.round(averageDays)}d envio`;
}

function getSellerInitials(show: PublicShow): string {
  const source = show.seller.brandName ?? show.seller.name ?? 'AR';
  const parts = source.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'AR';
}

export default function LiveRoomPage() {
  const { id: showId } = useParams<{ id: string }>();
  const { isAuthenticated, getAccessToken, user } = useAuth();
  const navigate = useNavigate();

  const [show, setShow] = useState<PublicShow | null>(null);
  const [session, setSession] = useState<ShowSession | null>(null);
  const [isLoadingShow, setIsLoadingShow] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Bastão (raid) redirect state
  const [bastaoTargetShowId, setBastaoTargetShowId] = useState<string | null>(null);
  const [bastaoCountdown, setBastaoCountdown] = useState<number | null>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Claim state
  const [claim, setClaim] = useState<Claim | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [isBidding, setIsBidding] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);

  // Order / payment state
  const [order, setOrder] = useState<Order | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const viewerKeyRef = useRef<string | null>(null);

  const fetchSession = useCallback(async () => {
    if (!showId) return;
    try {
      const res = await fetch(`${API_URL}/v1/shows/${showId}/session`);
      if (res.ok) {
        const data: ShowSession = await res.json();
        setSession(data);
        setSessionError(null);
        // Detect bastão pass: ended session with raidedToShowId
        if (data.status === 'ENDED' && data.raidedToShowId) {
          setShow((prev) => prev ? { ...prev, status: 'ENDED' } : prev);
          setBastaoTargetShowId(data.raidedToShowId);
          setBastaoCountdown(BASTAO_REDIRECT_COUNTDOWN_SECONDS);
        }
      } else if (res.status === 404) {
        setSession(null);
        setSessionError(null);
      } else {
        setSessionError('Erro ao buscar sessão.');
      }
    } catch {
      setSessionError('Erro ao buscar sessão.');
    }
  }, [showId]);

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
          fetchSession();
        }
      })
      .catch(() => {/* show load error handled via null state */})
      .finally(() => setIsLoadingShow(false));
  }, [showId, fetchSession]);

  // Poll session state every POLL_INTERVAL_MS while the show is LIVE
  const showStatus = show?.status;
  useEffect(() => {
    if (showStatus !== 'LIVE') return;

    fetchSession();
    const interval = setInterval(fetchSession, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [showStatus, fetchSession]);

  useEffect(() => {
    if (!showId || showStatus !== 'LIVE') return;

    if (!viewerKeyRef.current) {
      const storageKey = `arremate.viewerKey:${showId}`;
      const existing = window.localStorage.getItem(storageKey);
      if (existing) {
        viewerKeyRef.current = existing;
      } else {
        const next = typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `viewer-${Math.random().toString(36).slice(2)}`;
        viewerKeyRef.current = next;
        window.localStorage.setItem(storageKey, next);
      }
    }

    async function sendPresence() {
      if (!viewerKeyRef.current) return;
      try {
        const res = await fetch(`${API_URL}/v1/shows/${showId}/presence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ viewerKey: viewerKeyRef.current }),
        });
        if (!res.ok) return;
        const data = await res.json() as { viewerCount: number };
        setSession((current) => current ? { ...current, viewerCount: data.viewerCount } : current);
      } catch {
        // Presence is best-effort; ignore failures.
      }
    }

    void sendPresence();
    const interval = window.setInterval(sendPresence, PRESENCE_HEARTBEAT_MS);
    return () => window.clearInterval(interval);
  }, [showId, showStatus]);

  // ─── Bastão (raid) countdown & auto-redirect ─────────────────────────────────

  useEffect(() => {
    if (bastaoCountdown === null || !bastaoTargetShowId) return;
    if (bastaoCountdown <= 0) {
      navigate(`/shows/${bastaoTargetShowId}/live`);
      return;
    }
    const timer = setTimeout(() => setBastaoCountdown((c) => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(timer);
  }, [bastaoCountdown, bastaoTargetShowId, navigate]);

  // ─── Chat polling ─────────────────────────────────────────────────────────────

  const fetchMessages = useCallback(async (sid: string) => {
    try {
      const res = await fetch(`${API_URL}/v1/sessions/${sid}/chat`);
      if (res.ok) {
        const data: ChatMessage[] = await res.json();
        setMessages(data);
      }
    } catch {
      // Silently ignore polling errors
    }
  }, []);

  const sessionId = session?.id;
  const sessionStatus = session?.status;

  useEffect(() => {
    if (!sessionId || sessionStatus !== 'LIVE') return;

    fetchMessages(sessionId);
    const interval = setInterval(() => fetchMessages(sessionId), CHAT_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [sessionId, sessionStatus, fetchMessages]);

  // Auto-scroll chat to bottom when new messages arrive (scoped to the chat
  // container so the page viewport does not scroll automatically).
  useEffect(() => {
    const el = chatContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  // ─── Claim polling ────────────────────────────────────────────────────────────

  const claimId = claim?.id;
  const claimStatus = claim?.status;

  const fetchClaimStatus = useCallback(async (id: string) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/v1/claims/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: Claim = await res.json();
        setClaim(data);
      }
    } catch {
      // Silently ignore
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (!claimId || claimStatus !== 'PENDING') return;

    const interval = setInterval(() => fetchClaimStatus(claimId), CLAIM_EXPIRY_POLL_MS);
    return () => clearInterval(interval);
  }, [claimId, claimStatus, fetchClaimStatus]);

  // ─── Chat send ────────────────────────────────────────────────────────────────

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !chatInput.trim()) return;

    const token = getAccessToken();
    if (!token) {
      setChatError('Você precisa estar logado para enviar mensagens.');
      return;
    }

    setChatError(null);
    setIsSendingMessage(true);
    try {
      const res = await fetch(`${API_URL}/v1/sessions/${session.id}/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: chatInput.trim() }),
      });

      if (res.status === 429) {
        setChatError('Mensagem enviada muito rápido. Aguarde um momento.');
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setChatError((body as { message?: string }).message ?? 'Erro ao enviar mensagem.');
        return;
      }

      const newMsg: ChatMessage = await res.json();
      setMessages((prev) => [...prev, newMsg]);
      setChatInput('');
    } catch {
      setChatError('Erro ao enviar mensagem.');
    } finally {
      setIsSendingMessage(false);
    }
  }

  // ─── Claim ────────────────────────────────────────────────────────────────────

  function isClaimExpired(c: Claim): boolean {
    return c.status === 'EXPIRED' || (c.status === 'PENDING' && new Date(c.expiresAt) <= new Date());
  }

  async function handleClaim() {
    if (!session) return;

    const token = getAccessToken();
    if (!token) {
      setClaimError('Você precisa estar logado para comprar.');
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
        const body = await res.json().catch(() => ({}));
        setClaimError((body as { message?: string }).message ?? 'Erro ao realizar compra.');
        return;
      }

      const newClaim: Claim = await res.json();
      setClaim(newClaim);
    } catch {
      setClaimError('Erro ao realizar compra.');
    } finally {
      setIsClaiming(false);
    }
  }

  async function handlePlaceBid() {
    if (!session || !session.pinnedItem) return;

    const token = getAccessToken();
    if (!token) {
      setBidError('Você precisa estar logado para dar lances.');
      return;
    }

    const amount = Number(bidAmount);
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
        const body = await res.json().catch(() => ({}));
        setBidError((body as { message?: string }).message ?? 'Não foi possível registrar seu lance.');
        return;
      }

      const data = await res.json() as {
        queueItem: NonNullable<ShowSession['pinnedItem']>;
      };

      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pinnedItem: data.queueItem,
        };
      });
      setBidAmount('');
    } catch {
      setBidError('Não foi possível registrar seu lance.');
    } finally {
      setIsBidding(false);
    }
  }

  async function handleCreateOrder() {
    if (!claim) return;
    const token = getAccessToken();
    if (!token) return;

    setOrderError(null);
    setIsCreatingOrder(true);
    try {
      const res = await fetch(`${API_URL}/v1/claims/${claim.id}/order`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setOrderError((body as { message?: string }).message ?? 'Erro ao criar pedido.');
        return;
      }

      const newOrder: Order = await res.json();
      setOrder(newOrder);
    } catch {
      setOrderError('Erro ao criar pedido.');
    } finally {
      setIsCreatingOrder(false);
    }
  }

  async function handleCreatePixPayment() {
    if (!order) return;
    const token = getAccessToken();
    if (!token) return;

    setOrderError(null);
    setIsCreatingPayment(true);
    try {
      const res = await fetch(`${API_URL}/v1/orders/${order.id}/pix-payment`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setOrderError((body as { message?: string }).message ?? 'Erro ao gerar Pix.');
        return;
      }

      const newPayment: Payment = await res.json();
      setPayment(newPayment);
    } catch {
      setOrderError('Erro ao gerar Pix.');
    } finally {
      setIsCreatingPayment(false);
    }
  }

  async function handleShare() {
    const shareUrl = typeof window !== 'undefined' ? window.location.href : `${API_URL}/shows/${showId}/live`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: show?.title ?? 'Arremate Live',
          text: `Assista ao vivo: ${show?.title ?? 'show no Arremate'}`,
          url: shareUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      setShareFeedback('Link copiado');
      window.setTimeout(() => setShareFeedback(null), 1800);
    } catch {
      setShareFeedback('Não foi possível compartilhar');
      window.setTimeout(() => setShareFeedback(null), 1800);
    }
  }

  if (isLoadingShow) {
    return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-400">Carregando…</div>;
  }

  if (!show) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 mb-4">Show não encontrado.</p>
        <Link to="/shows" className="text-brand-500 hover:underline text-sm inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Ver todos os shows</Link>
      </div>
    );
  }

  const isLive = show.status === 'LIVE';
  const isEnded = show.status === 'ENDED';
  const pinnedItem = session?.pinnedItem;
  const livePrice = pinnedItem ? Number(pinnedItem.currentBid ?? pinnedItem.inventoryItem.startingPrice) : null;
  const minNextBid = livePrice !== null ? livePrice + 1 : null;
  const sellerBrandName = show.seller.brandName ?? show.seller.name ?? 'Arremate Seller';
  const viewerCount = session?.viewerCount ?? Math.max(1, new Set(messages.map((msg) => msg.userId)).size + (pinnedItem?.bidCount ?? 0));

  return (
    <div className={`mx-auto px-4 py-8 sm:py-10 ${isLive ? 'max-w-[1200px]' : 'max-w-4xl'}`}>
      <Link to={`/shows/${show.id}`} className="text-gray-400 hover:text-gray-600 text-sm mb-6 inline-flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5" /> Detalhes do show
      </Link>

      {/* Show header */}
      <div className={`mb-6 ${isLive ? '' : 'bg-white rounded-2xl p-6 shadow-sm border border-gray-100'}`}>
        <div className="flex items-center gap-3 mb-2">
          {isLive && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700 animate-pulse">
              <Radio className="w-3 h-3" /> Ao vivo agora
            </span>
          )}
          {isEnded && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
              Encerrado
            </span>
          )}
        </div>
        <h1 className={`font-bold mb-2 ${isLive ? 'text-3xl text-gray-950' : 'text-2xl text-gray-900'}`}>{show.title}</h1>
        {show.description && (
          <p className="text-gray-600 text-sm mb-2 max-w-3xl">{show.description}</p>
        )}
        <p className="text-sm text-gray-500">
          Vendedor:{' '}
          <span className="font-medium text-gray-700">{sellerBrandName}</span>
        </p>
      </div>

      {/* Not live yet */}
      {!isLive && !isEnded && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-8 text-center text-blue-700 mb-6">
          <p className="font-semibold mb-1">O show ainda não começou.</p>
          <p className="text-sm">Volte quando o vendedor iniciar a transmissão.</p>
        </div>
      )}

      {/* Ended */}
      {isEnded && (
        <div className="bg-gray-50 rounded-2xl p-8 text-center text-gray-500 mb-6">
          {bastaoTargetShowId ? (
            <div className="space-y-3">
              <Mic className="w-8 h-8 text-purple-600 mx-auto" />
              <p className="font-semibold text-gray-700 text-lg">O bastão foi passado!</p>
              <p className="text-sm text-gray-600">
                Você será redirecionado para outro show ao vivo em{' '}
                <span className="font-bold text-purple-600">{bastaoCountdown ?? 0}</span>{' '}
                segundo{(bastaoCountdown ?? 0) !== 1 ? 's' : ''}…
              </p>
              <Link
                to={`/shows/${bastaoTargetShowId}/live`}
                className="inline-flex items-center gap-1 mt-2 text-purple-600 font-semibold hover:underline text-sm"
              >
                Ir agora <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            'A transmissão foi encerrada.'
          )}
        </div>
      )}

      {/* Live content */}
      {isLive && (
        <>
          {sessionError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">
              {sessionError}
            </div>
          )}

          <div className="relative overflow-hidden rounded-[32px] bg-neutral-950 min-h-[78vh] border border-gray-950/80 shadow-[0_32px_80px_rgba(15,23,42,0.28)]">
            <LivePlayer
              playbackUrl={session?.playbackUrl}
              controls={false}
              containerClassName="absolute inset-0 h-full w-full mb-0 rounded-none bg-black"
              videoClassName="h-full w-full object-cover"
              placeholderClassName="absolute inset-0 h-full w-full rounded-none bg-gray-950 flex items-center justify-center text-gray-300 text-sm"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/10 to-black/80" />
            <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/45 to-transparent" />

            <div className="absolute left-4 top-4 right-24 sm:left-6 sm:top-6 sm:right-32">
              <div className="inline-flex max-w-full items-center gap-3 rounded-2xl border border-white/15 bg-black/35 px-3 py-3 text-white shadow-lg backdrop-blur-xl">
                {show.seller.brandLogoUrl ? (
                  <img
                    src={show.seller.brandLogoUrl}
                    alt={sellerBrandName}
                    className="h-14 w-14 shrink-0 rounded-full bg-white object-cover shadow-[0_10px_24px_rgba(0,0,0,0.35)]"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-sm font-black uppercase text-brand-500 shadow-[0_10px_24px_rgba(0,0,0,0.35)]">
                    {getSellerInitials(show)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{sellerBrandName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-white/85">
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-current text-amber-300" />
                      {getSellerBadgeText(show)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Truck className="h-3.5 w-3.5 text-white/75" />
                      {getShippingSpeedText(show)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur-xl">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-500/90">
                  <Eye className="h-4 w-4" />
                </span>
                {viewerCount}
              </div>
            </div>

            <div className="absolute right-4 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-3 sm:right-6">
              <button
                type="button"
                onClick={() => void handleShare()}
                className="flex h-16 w-16 flex-col items-center justify-center rounded-3xl border border-white/10 bg-black/28 text-white shadow-lg backdrop-blur-xl transition hover:bg-black/40"
              >
                <Share2 className="h-5 w-5" />
                <span className="mt-1 text-[11px] font-medium">Share</span>
              </button>
              <Link
                to={isAuthenticated ? '/orders' : '/login'}
                className="flex h-16 w-16 flex-col items-center justify-center rounded-3xl border border-white/10 bg-black/28 text-white shadow-lg backdrop-blur-xl transition hover:bg-black/40"
              >
                <Wallet className="h-5 w-5" />
                <span className="mt-1 text-[11px] font-medium">Wallet</span>
              </Link>
              <Link
                to={`/shows/${show.id}`}
                className="flex h-16 w-16 flex-col items-center justify-center rounded-3xl border border-white/10 bg-black/28 text-white shadow-lg backdrop-blur-xl transition hover:bg-black/40"
              >
                <Store className="h-5 w-5" />
                <span className="mt-1 text-[11px] font-medium">Shop</span>
              </Link>
            </div>

            {session && (
              <div className="absolute bottom-[10.5rem] left-4 right-24 sm:left-6 sm:right-32 lg:bottom-[12.5rem] lg:left-6 lg:w-[22rem]">
                <div className="rounded-[28px] border border-white/10 bg-black/26 text-white shadow-xl backdrop-blur-xl">
                  <div ref={chatContainerRef} className="max-h-72 overflow-y-auto px-4 py-4">
                    {messages.length === 0 ? (
                      <p className="py-12 text-center text-sm text-white/70">
                        Nenhuma mensagem ainda. Seja o primeiro a comentar.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {messages.map((msg) => {
                          const isOwn = user?.sub === msg.userId || false;
                          return (
                            <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                              <div className="max-w-[85%]">
                                <p className="mb-1 text-xs font-medium text-white/60">{msg.user?.name ?? 'Usuário'}</p>
                                <div className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                                  isOwn ? 'bg-brand-500 text-white' : 'bg-white/12 text-white'
                                }`}>
                                  {msg.content}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="border-t border-white/10 px-3 py-3">
                    {chatError && (
                      <p className="mb-2 text-xs text-red-200">{chatError}</p>
                    )}
                    {isAuthenticated ? (
                      <form onSubmit={handleSendMessage} className="flex gap-2">
                        <input
                          type="text"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          maxLength={300}
                          placeholder="Say something…"
                          className="flex-1 rounded-full border border-white/10 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-white/30"
                          disabled={isSendingMessage}
                        />
                        <button
                          type="submit"
                          disabled={isSendingMessage || !chatInput.trim()}
                          className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 transition hover:bg-white/90 disabled:opacity-50"
                        >
                          {isSendingMessage ? '…' : 'Enviar'}
                        </button>
                      </form>
                    ) : (
                      <p className="text-sm text-white/75">
                        <Link to="/login" className="font-medium text-white underline underline-offset-2">
                          Faça login
                        </Link>{' '}
                        para participar do chat.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="absolute inset-x-4 bottom-4 sm:inset-x-6 sm:bottom-6">
              <div className="rounded-[30px] border border-white/10 bg-black/52 p-4 text-white shadow-2xl backdrop-blur-2xl sm:p-5">
                {pinnedItem ? (
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/6">
                        <Package className="h-9 w-9 text-white/55" />
                      </div>
                      <div className="min-w-0">
                        <p className="mb-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/80">
                          <Pin className="h-3.5 w-3.5" /> Item ao vivo
                        </p>
                        <h2 className="truncate text-2xl font-bold">{pinnedItem.inventoryItem.title}</h2>
                        <p className="mt-1 text-sm text-white/70">{CONDITION_LABELS[pinnedItem.inventoryItem.condition]}</p>
                        <div className="mt-3 flex flex-wrap gap-3 text-sm text-white/72">
                          <span>{getShippingSpeedText(show)}</span>
                          <span>{pinnedItem.bidCount > 0 ? `${pinnedItem.bidCount} lances` : 'Sem lances'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 lg:min-w-[360px]">
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.22em] text-white/55">Preço atual</p>
                          <p className="text-3xl font-black text-white">{formatCurrency(Number(livePrice ?? 0))}</p>
                        </div>
                        {pinnedItem.soldOut && (
                          <span className="rounded-full bg-red-500/20 px-3 py-1 text-sm font-semibold text-red-200">Sold</span>
                        )}
                      </div>

                      {!isAuthenticated ? (
                        <Link
                          to="/login"
                          className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-bold text-gray-950 transition hover:bg-white/90"
                        >
                          Faça login para comprar
                        </Link>
                      ) : claim === null ? (
                        <>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                              type="number"
                              min={minNextBid ?? 1}
                              step="1"
                              value={bidAmount}
                              onChange={(e) => setBidAmount(e.target.value)}
                              placeholder={minNextBid ? `Lance mínimo: ${minNextBid.toFixed(2)}` : 'Valor do lance'}
                              className="flex-1 rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-white/30"
                            />
                            <button
                              onClick={handlePlaceBid}
                              disabled={isBidding || pinnedItem.soldOut}
                              className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/18 disabled:opacity-60"
                            >
                              {isBidding ? 'Enviando…' : 'Dar lance'}
                            </button>
                          </div>
                          {bidError && <p className="text-xs text-red-200">{bidError}</p>}
                          {claimError && <p className="text-xs text-red-200">{claimError}</p>}
                          <button
                            onClick={handleClaim}
                            disabled={isClaiming || pinnedItem.soldOut}
                            className="inline-flex items-center justify-center rounded-2xl bg-brand-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-600 disabled:opacity-60"
                          >
                            {pinnedItem.soldOut
                              ? 'Esgotado'
                              : isClaiming
                              ? 'Reservando…'
                              : <><ShoppingCart className="mr-1.5 h-4 w-4" />Quero este item!</>}
                          </button>
                        </>
                      ) : isClaimExpired(claim) ? (
                        <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-white/82">
                          Sua reserva expirou.
                        </div>
                      ) : claim.status === 'CONFIRMED' && order?.status === 'PAID' ? (
                        <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/12 px-4 py-3 text-sm text-emerald-100">
                          <span className="inline-flex items-center gap-1.5 font-semibold"><Check className="h-4 w-4" /> Compra confirmada</span>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-amber-300/20 bg-amber-400/12 px-4 py-3 text-sm text-amber-50">
                          <p className="font-semibold">Item reservado até {formatExpiresAt(claim.expiresAt)}</p>
                          {orderError && <p className="mt-2 text-red-200">{orderError}</p>}
                          {!order && (
                            <button
                              onClick={handleCreateOrder}
                              disabled={isCreatingOrder}
                              className="mt-3 w-full rounded-xl bg-white px-4 py-2.5 font-semibold text-gray-950 transition hover:bg-white/90 disabled:opacity-60"
                            >
                              {isCreatingOrder ? 'Criando pedido…' : 'Confirmar pedido'}
                            </button>
                          )}
                          {order && !payment && (
                            <button
                              onClick={handleCreatePixPayment}
                              disabled={isCreatingPayment}
                              className="mt-3 w-full rounded-xl bg-emerald-500 px-4 py-2.5 font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
                            >
                              {isCreatingPayment ? 'Gerando Pix…' : 'Gerar cobrança Pix'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4 rounded-[24px] bg-white/6 px-4 py-4">
                    <div>
                      <p className="text-lg font-semibold text-white">Awaiting Next Item</p>
                      <p className="text-sm text-white/65">O vendedor ainda não fixou o próximo lote do leilão.</p>
                    </div>
                    <Mic className="h-7 w-7 text-white/55" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {shareFeedback && (
            <p className="mt-4 text-center text-sm text-gray-500">{shareFeedback}</p>
          )}

          {payment && payment.pixCode && (
            <div className="mt-6 max-w-xl">
              <PixPaymentPanel payment={payment} />
            </div>
          )}

          <p className="mt-6 text-center text-xs text-gray-400">
            Esta página atualiza automaticamente a cada {POLL_INTERVAL_MS / 1000} segundos.
          </p>
        </>
      )}
    </div>
  );
}

// ─── Pix payment display component ───────────────────────────────────────────

function PixPaymentPanel({ payment }: { payment: Payment }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!payment.pixCode) return;
    navigator.clipboard.writeText(payment.pixCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const isExpired = payment.pixExpiresAt && new Date(payment.pixExpiresAt) < new Date();

  return (
    <div className="mt-4 bg-white rounded-xl p-4 border border-green-200 text-gray-800">
      <p className="text-sm font-semibold text-green-700 mb-3 flex items-center gap-1.5"><QrCode className="w-4 h-4" /> Pague via Pix</p>

      {payment.pixQrCodeBase64 && (
        <div className="flex justify-center mb-3">
          <img
            src={`data:image/png;base64,${payment.pixQrCodeBase64}`}
            alt="QR Code Pix"
            className="w-40 h-40 rounded-lg border border-gray-200"
          />
        </div>
      )}

      <p className="text-xs text-gray-500 mb-1 font-medium">Pix Copia e Cola:</p>
      <div className="flex gap-2 items-start">
        <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs break-all text-gray-700 select-all">
          {payment.pixCode}
        </code>
        <button
          onClick={handleCopy}
          className="shrink-0 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : 'Copiar'}
        </button>
      </div>

      {payment.pixExpiresAt && (
        <p className={`text-xs mt-2 ${isExpired ? 'text-red-500' : 'text-gray-400'}`}>
          {isExpired
            ? <span className="inline-flex items-center gap-1"><TriangleAlert className="w-3.5 h-3.5" /> Esta cobrança expirou.</span>
            : `Expira às ${formatExpiresAt(payment.pixExpiresAt)}`}
        </p>
      )}

      <p className="text-xs text-gray-400 mt-2">
        Após o pagamento, seu pedido será confirmado automaticamente.
      </p>
    </div>
  );
}
