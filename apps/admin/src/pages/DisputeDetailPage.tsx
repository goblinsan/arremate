import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { DisputeStatus, DisputeReason, OrderStatus } from '@arremate/types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

const STATUS_LABELS: Record<DisputeStatus, string> = {
  OPEN: 'Aberta',
  UNDER_REVIEW: 'Em análise',
  RESOLVED: 'Resolvida',
  CLOSED: 'Encerrada',
};

const STATUS_COLORS: Record<DisputeStatus, string> = {
  OPEN: 'bg-red-100 text-red-700',
  UNDER_REVIEW: 'bg-yellow-100 text-yellow-700',
  RESOLVED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-100 text-gray-600',
};

const REASON_LABELS: Record<DisputeReason, string> = {
  ITEM_NOT_RECEIVED: 'Item não recebido',
  ITEM_NOT_AS_DESCRIBED: 'Item diferente do anunciado',
  PAYMENT_ISSUE: 'Problema no pagamento',
  OTHER: 'Outro',
};

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Aguardando pagamento',
  PAID: 'Pago',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Reembolsado',
};

interface DisputeDetail {
  id: string;
  status: DisputeStatus;
  reason: DisputeReason;
  description: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  raisedBy: { id: string; name: string | null; email: string };
  resolvedBy: { id: string; name: string | null; email: string } | null;
  order: {
    id: string;
    totalCents: number;
    status: OrderStatus;
    buyer: { id: string; name: string | null; email: string };
    seller: { id: string; name: string | null; email: string };
    lines: { id: string; title: string; priceCents: number; quantity: number }[];
    payments: { id: string; status: string; amountCents: number; providerId: string | null }[];
  };
}

function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">{value ?? '—'}</p>
    </div>
  );
}

export default function DisputeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getAccessToken } = useAuth();

  const [dispute, setDispute] = useState<DisputeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');

  useEffect(() => {
    fetchDispute();
  }, [id]);

  async function fetchDispute() {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/admin/disputes/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 404) throw new Error('Disputa não encontrada.');
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao carregar disputa.');
      }
      const data: DisputeDetail = await res.json();
      setDispute(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar disputa.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResolve() {
    if (!dispute) return;
    setActionError(null);
    setIsActing(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/admin/disputes/${id}/resolve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ resolution: resolutionNote }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao resolver disputa.');
      }
      setShowResolveModal(false);
      setResolutionNote('');
      await fetchDispute();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao resolver disputa.');
    } finally {
      setIsActing(false);
    }
  }

  async function handleRefund() {
    if (!dispute) return;
    if (!confirm('Confirmar reembolso do pedido?')) return;
    setActionError(null);
    setIsActing(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/admin/orders/${dispute.order.id}/refund`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao processar reembolso.');
      }
      await fetchDispute();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao processar reembolso.');
    } finally {
      setIsActing(false);
    }
  }

  if (isLoading) {
    return <div className="text-center py-16 text-gray-400 text-sm">Carregando…</div>;
  }

  if (error || !dispute) {
    return (
      <div className="text-center py-16">
        <p className="text-red-500 text-sm mb-4">{error ?? 'Disputa não encontrada.'}</p>
        <button
          onClick={() => navigate('/disputes')}
          className="text-brand-500 font-medium text-sm hover:underline"
        >
          ← Voltar para a lista
        </button>
      </div>
    );
  }

  const canAct = !['RESOLVED', 'CLOSED'].includes(dispute.status);
  const canRefund = dispute.order.status === 'PAID';

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <Link
            to="/disputes"
            className="text-xs text-gray-400 hover:text-gray-600 mb-2 inline-block"
          >
            ← Voltar para a lista
          </Link>
          <h2 className="text-2xl font-bold text-gray-900">
            Disputa · {REASON_LABELS[dispute.reason]}
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Aberta por {dispute.raisedBy.name ?? dispute.raisedBy.email}
          </p>
        </div>
        <span
          className={`inline-block text-xs font-semibold px-3 py-1 rounded-full mt-1 ${STATUS_COLORS[dispute.status]}`}
        >
          {STATUS_LABELS[dispute.status]}
        </span>
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">
          {actionError}
        </div>
      )}

      {/* Resolution banner */}
      {dispute.status === 'RESOLVED' && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-6">
          <p className="text-green-800 text-sm font-medium">
            ✓ Resolvida em{' '}
            {dispute.resolvedAt ? new Date(dispute.resolvedAt).toLocaleDateString('pt-BR') : '—'}
            {dispute.resolvedBy && ` por ${dispute.resolvedBy.name ?? dispute.resolvedBy.email}`}
          </p>
          {dispute.resolution && (
            <p className="text-green-700 text-sm mt-1">
              <span className="font-medium">Resolução:</span> {dispute.resolution}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Dispute info */}
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Detalhes da disputa</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Motivo" value={REASON_LABELS[dispute.reason]} />
              <Field label="Status" value={STATUS_LABELS[dispute.status]} />
              <div className="col-span-2">
                <Field label="Descrição" value={dispute.description} />
              </div>
            </div>
          </section>

          {/* Order info */}
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Pedido</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <Field label="ID do pedido" value={dispute.order.id} />
              <Field label="Valor total" value={formatBRL(dispute.order.totalCents)} />
              <Field
                label="Status do pedido"
                value={ORDER_STATUS_LABELS[dispute.order.status]}
              />
            </div>
            {dispute.order.lines.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Itens</p>
                <div className="space-y-1">
                  {dispute.order.lines.map((line) => (
                    <div key={line.id} className="flex justify-between text-sm text-gray-700 py-1 border-b border-gray-50 last:border-0">
                      <span>{line.title} × {line.quantity}</span>
                      <span>{formatBRL(line.priceCents)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Buyer & Seller */}
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Partes envolvidas</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Comprador</p>
                <p className="text-sm text-gray-800">{dispute.order.buyer.name ?? '—'}</p>
                <p className="text-xs text-gray-400">{dispute.order.buyer.email}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Vendedor</p>
                <p className="text-sm text-gray-800">{dispute.order.seller.name ?? '—'}</p>
                <p className="text-xs text-gray-400">{dispute.order.seller.email}</p>
              </div>
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Timeline</h3>
            <div className="space-y-2 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>Aberta</span>
                <span>{new Date(dispute.createdAt).toLocaleDateString('pt-BR')}</span>
              </div>
              {dispute.resolvedAt && (
                <div className="flex justify-between">
                  <span>Resolvida</span>
                  <span>{new Date(dispute.resolvedAt).toLocaleDateString('pt-BR')}</span>
                </div>
              )}
            </div>
          </section>

          {/* Actions */}
          {canAct && (
            <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Ações</h3>
              <div className="space-y-2">
                <button
                  onClick={() => setShowResolveModal(true)}
                  disabled={isActing}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold py-2 rounded-lg text-sm transition-colors"
                >
                  ✓ Resolver disputa
                </button>
                {canRefund && (
                  <button
                    onClick={handleRefund}
                    disabled={isActing}
                    className="w-full bg-orange-50 hover:bg-orange-100 disabled:opacity-60 text-orange-700 font-semibold py-2 rounded-lg text-sm transition-colors"
                  >
                    💸 Emitir reembolso
                  </button>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Resolve Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Resolver disputa</h3>
            <p className="text-sm text-gray-500 mb-4">
              Descreva como a disputa foi resolvida (opcional).
            </p>
            <textarea
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              placeholder="Descrição da resolução (opcional)…"
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowResolveModal(false); setResolutionNote(''); }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleResolve}
                disabled={isActing}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold py-2 rounded-lg text-sm"
              >
                {isActing ? 'Resolvendo…' : 'Confirmar resolução'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
