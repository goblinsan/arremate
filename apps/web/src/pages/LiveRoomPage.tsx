import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Radio, Mic, Pin, Package, ShoppingCart, Check, MessageCircle, TriangleAlert, ArrowLeft, ArrowRight, QrCode } from 'lucide-react';
import type { Show, ShowSession, ItemCondition, ChatMessage, Claim, Order, Payment } from '@arremate/types';
import LivePlayer from '../components/LivePlayer';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';
const POLL_INTERVAL_MS = 5000;
const CHAT_POLL_INTERVAL_MS = 3000;
const CLAIM_EXPIRY_POLL_MS = 10000;
const BASTAO_REDIRECT_COUNTDOWN_SECONDS = 5;

const CONDITION_LABELS: Record<ItemCondition, string> = {
  NEW: 'Novo',
  USED: 'Usado',
  REFURBISHED: 'Recondicionado',
};

interface PublicShow extends Omit<Show, 'seller'> {
  seller: { id: string; name: string | null };
}

function formatExpiresAt(date: Date | string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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
  const chatBottomRef = useRef<HTMLDivElement>(null);
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Link to={`/shows/${show.id}`} className="text-gray-400 hover:text-gray-600 text-sm mb-6 inline-flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5" /> Detalhes do show
      </Link>

      {/* Show header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
        <div className="flex items-center gap-3 mb-2">
          {isLive && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 animate-pulse">
              <Radio className="w-3 h-3" /> Ao vivo agora
            </span>
          )}
          {isEnded && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              Encerrado
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{show.title}</h1>
        {show.description && (
          <p className="text-gray-600 text-sm mb-2">{show.description}</p>
        )}
        <p className="text-sm text-gray-500">
          Vendedor:{' '}
          <span className="font-medium text-gray-700">{show.seller?.name ?? 'Vendedor'}</span>
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

          {/* Playback area */}
          <LivePlayer playbackUrl={session?.playbackUrl} />

          {/* Pinned item */}
          {pinnedItem ? (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-red-100 mb-6">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Pin className="w-3.5 h-3.5" /> Item em destaque
              </p>
              <div className="flex items-start gap-4">
                <div className="h-20 w-20 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
                  <Package className="w-8 h-8 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold text-gray-900 mb-1">
                    {pinnedItem.inventoryItem.title}
                  </h2>
                  {pinnedItem.inventoryItem.description && (
                    <p className="text-sm text-gray-600 mb-2">{pinnedItem.inventoryItem.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mb-2">
                    {CONDITION_LABELS[pinnedItem.inventoryItem.condition]}
                  </p>
                  <p className="text-2xl font-extrabold text-brand-500">
                    R$ {Number(livePrice ?? 0).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400 mb-4">
                    {pinnedItem.bidCount > 0
                      ? `${pinnedItem.bidCount} lance${pinnedItem.bidCount === 1 ? '' : 's'} registrado${pinnedItem.bidCount === 1 ? '' : 's'}`
                      : 'Sem lances ainda'}
                  </p>
                </div>
              </div>

              {/* Claim / payment CTA */}
              <div className="mt-5 border-t border-gray-100 pt-4">
                {!isAuthenticated ? (
                  <p className="text-sm text-gray-500">
                    <Link to="/login" className="text-brand-500 font-medium hover:underline">Faça login</Link>{' '}
                    para comprar este item.
                  </p>
                ) : claim === null ? (
                  <>
                    <div className="mb-3 bg-gray-50 border border-gray-200 rounded-xl p-3">
                      <p className="text-xs text-gray-500 mb-2">Dar lance</p>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={minNextBid ?? 1}
                          step="1"
                          value={bidAmount}
                          onChange={(e) => setBidAmount(e.target.value)}
                          placeholder={minNextBid ? `Mínimo: ${minNextBid.toFixed(2)}` : 'Valor do lance'}
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        <button
                          onClick={handlePlaceBid}
                          disabled={isBidding || pinnedItem.soldOut}
                          className="bg-gray-800 hover:bg-gray-900 disabled:opacity-60 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
                        >
                          {isBidding ? 'Enviando…' : 'Dar lance'}
                        </button>
                      </div>
                      {bidError && <p className="text-xs text-red-600 mt-2">{bidError}</p>}
                    </div>

                    {claimError && (
                      <p className="text-sm text-red-600 mb-2">{claimError}</p>
                    )}
                    <button
                      onClick={handleClaim}
                      disabled={isClaiming || pinnedItem.soldOut}
                      className="w-full bg-brand-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold py-3 rounded-xl text-base transition-colors"
                    >
                      {pinnedItem.soldOut
                        ? 'Esgotado'
                        : isClaiming
                        ? 'Reservando…'
                        : <><ShoppingCart className="w-4 h-4 mr-1.5 inline" />Quero este item!</>}
                    </button>
                  </>
                ) : isClaimExpired(claim) ? (
                  <div className="bg-gray-50 border border-gray-200 text-gray-600 text-sm rounded-lg px-4 py-3">
                    <p className="font-semibold">Sua reserva expirou.</p>
                    <p className="text-xs mt-1">O prazo de pagamento não foi cumprido.</p>
                  </div>
                ) : claim.status === 'CONFIRMED' && order?.status === 'PAID' ? (
                  <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
                    <p className="font-semibold flex items-center gap-1.5"><Check className="w-4 h-4" /> Compra confirmada!</p>
                    <p className="text-xs mt-1">Seu pedido foi registrado com sucesso.</p>
                  </div>
                ) : (
                  <div className="bg-orange-50 border border-orange-200 text-orange-700 text-sm rounded-lg px-4 py-3">
                    <p className="font-semibold flex items-center gap-1.5"><ShoppingCart className="w-4 h-4" /> Item reservado!</p>
                    <p className="text-xs mt-1">
                      Finalize o pagamento até {formatExpiresAt(claim.expiresAt)} para garantir sua compra.
                    </p>

                    {orderError && (
                      <p className="text-sm text-red-600 mt-2">{orderError}</p>
                    )}

                    {/* Step 1: create the order */}
                    {!order && (
                      <button
                        onClick={handleCreateOrder}
                        disabled={isCreatingOrder}
                        className="mt-3 w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold py-2.5 rounded-lg text-sm transition-colors"
                      >
                        {isCreatingOrder ? 'Criando pedido…' : 'Confirmar pedido'}
                      </button>
                    )}

                    {/* Step 2: generate Pix */}
                    {order && !payment && (
                      <button
                        onClick={handleCreatePixPayment}
                        disabled={isCreatingPayment}
                        className="mt-3 w-full bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white font-bold py-2.5 rounded-lg text-sm transition-colors"
                      >
                        {isCreatingPayment ? 'Gerando Pix…' : 'Gerar cobrança Pix'}
                      </button>
                    )}

                    {/* Step 3: show Pix details */}
                    {payment && payment.pixCode && (
                      <PixPaymentPanel payment={payment} />
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-2xl p-6 text-center text-gray-400 mb-6">
              Nenhum item em destaque no momento.
            </div>
          )}

          {/* Chat panel */}
          {session && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 flex flex-col">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-base font-semibold text-gray-800 flex items-center gap-1.5"><MessageCircle className="w-4 h-4" /> Chat ao vivo</h3>
              </div>

              {/* Message list */}
              <div ref={chatContainerRef} className="h-64 overflow-y-auto px-6 py-4 flex flex-col gap-2">
                {messages.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center my-auto">
                    Nenhuma mensagem ainda. Seja o primeiro a comentar!
                  </p>
                ) : (
                  messages.map((msg) => {
                    const isOwn = user?.sub === msg.userId || false;
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                      >
                        <span className="text-xs text-gray-400 mb-0.5">
                          {msg.user?.name ?? 'Usuário'}
                        </span>
                        <div
                          className={`text-sm px-3 py-2 rounded-2xl max-w-xs break-words ${
                            isOwn
                              ? 'bg-brand-500 text-white rounded-tr-sm'
                              : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Compose */}
              <div className="px-6 py-4 border-t border-gray-100">
                {chatError && (
                  <p className="text-xs text-red-600 mb-2">{chatError}</p>
                )}
                {isAuthenticated ? (
                  <form onSubmit={handleSendMessage} className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      maxLength={300}
                      placeholder="Digite uma mensagem…"
                      className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                      disabled={isSendingMessage}
                    />
                    <button
                      type="submit"
                      disabled={isSendingMessage || !chatInput.trim()}
                      className="bg-brand-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
                    >
                      {isSendingMessage ? '…' : 'Enviar'}
                    </button>
                  </form>
                ) : (
                  <p className="text-sm text-gray-500 text-center">
                    <Link to="/login" className="text-brand-500 hover:underline font-medium">
                      Faça login
                    </Link>{' '}
                    para participar do chat.
                  </p>
                )}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400 text-center">
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
