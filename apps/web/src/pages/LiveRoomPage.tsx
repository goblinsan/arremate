import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { Show, ShowSession, ItemCondition, Claim, Order, Payment } from '@arremate/types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';
const POLL_INTERVAL_MS = 5000;

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
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function LiveRoomPage() {
  const { id: showId } = useParams<{ id: string }>();
  const { getAccessToken, isAuthenticated } = useAuth();

  const [show, setShow] = useState<PublicShow | null>(null);
  const [session, setSession] = useState<ShowSession | null>(null);
  const [isLoadingShow, setIsLoadingShow] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Claim state
  const [claim, setClaim] = useState<Claim | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

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

  // Poll claim status when there's a pending claim
  useEffect(() => {
    if (!claim || claim.status !== 'PENDING') return;
    const token = getAccessToken();
    if (!token) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/v1/claims/${claim.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const updated: Claim = await res.json();
          setClaim(updated);
        }
      } catch {
        // ignore
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [claim, getAccessToken]);

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
                  <p className="text-xs text-gray-400">lance inicial</p>
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
                        : '🛒 Quero este item!'}
                    </button>
                  </>
                ) : claim.status === 'EXPIRED' ? (
                  <div className="bg-gray-50 border border-gray-200 text-gray-600 text-sm rounded-lg px-4 py-3">
                    <p className="font-semibold">⏰ Sua reserva expirou.</p>
                    <p className="text-xs mt-1">O prazo de pagamento não foi cumprido.</p>
                  </div>
                ) : claim.status === 'CONFIRMED' && order?.status === 'PAID' ? (
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
                        {isCreatingPayment ? 'Gerando Pix…' : '💚 Gerar cobrança Pix'}
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
      <p className="text-sm font-semibold text-green-700 mb-3">💚 Pague via Pix</p>

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
          {copied ? '✓' : 'Copiar'}
        </button>
      </div>

      {payment.pixExpiresAt && (
        <p className={`text-xs mt-2 ${isExpired ? 'text-red-500' : 'text-gray-400'}`}>
          {isExpired
            ? '⚠️ Esta cobrança expirou.'
            : `Expira às ${formatExpiresAt(payment.pixExpiresAt)}`}
        </p>
      )}

      <p className="text-xs text-gray-400 mt-2">
        Após o pagamento, seu pedido será confirmado automaticamente.
      </p>
    </div>
  );
}

