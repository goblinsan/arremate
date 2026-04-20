import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { Show, ShowSession, ItemCondition, ChatMessage, Claim } from '@arremate/types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';
const POLL_INTERVAL_MS = 5000;
const CHAT_POLL_INTERVAL_MS = 3000;
const CLAIM_EXPIRY_POLL_MS = 10000;

const CONDITION_LABELS: Record<ItemCondition, string> = {
  NEW: 'Novo',
  USED: 'Usado',
  REFURBISHED: 'Recondicionado',
};

interface PublicShow extends Omit<Show, 'seller'> {
  seller: { id: string; name: string | null };
}

export default function LiveRoomPage() {
  const { id: showId } = useParams<{ id: string }>();
  const { isAuthenticated, getAccessToken, user } = useAuth();

  const [show, setShow] = useState<PublicShow | null>(null);
  const [session, setSession] = useState<ShowSession | null>(null);
  const [isLoadingShow, setIsLoadingShow] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Claim state
  const [claim, setClaim] = useState<Claim | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const fetchSession = useCallback(async () => {
    if (!showId) return;
    try {
      const res = await fetch(`${API_URL}/v1/shows/${showId}/session`);
      if (res.ok) {
        const data: ShowSession = await res.json();
        setSession(data);
        setSessionError(null);
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

    // Load show metadata
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

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  // ─── Render helpers ───────────────────────────────────────────────────────────

  function formatExpiresAt(expiresAt: Date | string): string {
    const date = new Date(expiresAt);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function isClaimExpired(c: Claim): boolean {
    return c.status === 'EXPIRED' || (c.status === 'PENDING' && new Date(c.expiresAt) <= new Date());
  }

  if (isLoadingShow) {
    return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-400">Carregando…</div>;
  }

  if (!show) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 mb-4">Show não encontrado.</p>
        <Link to="/shows" className="text-brand-500 hover:underline text-sm">← Ver todos os shows</Link>
      </div>
    );
  }

  const isLive = show.status === 'LIVE';
  const isEnded = show.status === 'ENDED';

  const pinnedItem = session?.pinnedItem;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Link to={`/shows/${show.id}`} className="text-gray-400 hover:text-gray-600 text-sm mb-6 inline-block">
        ← Detalhes do show
      </Link>

      {/* Show header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
        <div className="flex items-center gap-3 mb-2">
          {isLive && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 animate-pulse">
              🔴 Ao vivo agora
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
          A transmissão foi encerrada.
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
          {session?.playbackUrl ? (
            <div className="bg-black rounded-2xl overflow-hidden mb-6 aspect-video flex items-center justify-center">
              <video
                src={session.playbackUrl}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="bg-gray-900 rounded-2xl mb-6 aspect-video flex items-center justify-center text-gray-400 text-sm">
              Transmissão ao vivo em breve…
            </div>
          )}

          {/* Pinned item */}
          {pinnedItem ? (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-red-100 mb-6">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-3">
                📌 Item em destaque
              </p>
              <div className="flex items-start gap-4">
                <div className="h-20 w-20 bg-gray-100 rounded-xl flex items-center justify-center text-3xl shrink-0">
                  📦
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
                    R$ {Number(pinnedItem.inventoryItem.startingPrice).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400 mb-4">preço fixo</p>

                  {/* Claim section */}
                  {pinnedItem.soldOut ? (
                    <div className="inline-flex items-center gap-2 text-sm text-gray-500 bg-gray-100 px-4 py-2 rounded-lg">
                      <span>🏷️</span> Esgotado
                    </div>
                  ) : claim && (claim.queueItemId === pinnedItem.id) ? (
                    <div>
                      {isClaimExpired(claim) ? (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                          <p className="font-semibold">⏰ Sua reserva expirou.</p>
                          <p className="text-xs mt-1">O prazo de pagamento não foi cumprido.</p>
                        </div>
                      ) : claim.status === 'PAID' ? (
                        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
                          <p className="font-semibold">✅ Compra confirmada!</p>
                          <p className="text-xs mt-1">Seu pedido foi registrado com sucesso.</p>
                        </div>
                      ) : (
                        <div className="bg-orange-50 border border-orange-200 text-orange-700 text-sm rounded-lg px-4 py-3">
                          <p className="font-semibold">🛒 Item reservado!</p>
                          <p className="text-xs mt-1">
                            Finalize o pagamento até {formatExpiresAt(claim.expiresAt)} para garantir sua compra.
                          </p>
                          <p className="text-xs mt-1 text-orange-500">
                            ID da reserva: <span className="font-mono">{claim.id.slice(0, 8)}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      {claimError && (
                        <p className="text-sm text-red-600 mb-2">{claimError}</p>
                      )}
                      {isAuthenticated ? (
                        <button
                          onClick={handleClaim}
                          disabled={isClaiming}
                          className="bg-brand-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors"
                        >
                          {isClaiming ? 'Reservando…' : '🛒 Comprar agora'}
                        </button>
                      ) : (
                        <div className="text-sm text-gray-500">
                          <Link to="/login" className="text-brand-500 hover:underline font-medium">
                            Faça login
                          </Link>{' '}
                          para comprar este item.
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
                <h3 className="text-base font-semibold text-gray-800">💬 Chat ao vivo</h3>
              </div>

              {/* Message list */}
              <div className="h-64 overflow-y-auto px-6 py-4 flex flex-col gap-2">
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

