import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { Order, OrderStatus, FulfillmentStatus, SupportTicket } from '@arremate/types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Aguardando pagamento',
  PAID: 'Pago',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Reembolsado',
};

const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'bg-yellow-100 text-yellow-700',
  PAID: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  REFUNDED: 'bg-red-50 text-red-400',
};

const FULFILLMENT_STATUS_LABELS: Record<FulfillmentStatus, string> = {
  PENDING: 'Pendente',
  PROCESSING: 'Em processamento',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  RETURNED: 'Devolvido',
};

const FULFILLMENT_STATUS_COLORS: Record<FulfillmentStatus, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  PROCESSING: 'bg-blue-100 text-blue-700',
  SHIPPED: 'bg-indigo-100 text-indigo-700',
  DELIVERED: 'bg-green-100 text-green-700',
  RETURNED: 'bg-red-50 text-red-500',
};

const TICKET_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em andamento',
  RESOLVED: 'Resolvido',
  CLOSED: 'Fechado',
};

export default function BuyerOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { getAccessToken, isAuthenticated } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Support ticket form
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketSuccess, setTicketSuccess] = useState(false);
  const [showTicketForm, setShowTicketForm] = useState(false);

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
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
      const data: Order = await res.json();
      setOrder(data);
    } catch {
      setError('Erro ao carregar pedido.');
    } finally {
      setIsLoading(false);
    }
  }, [orderId, getAccessToken]);

  useEffect(() => {
    if (isAuthenticated) fetchOrder();
  }, [isAuthenticated, fetchOrder]);

  async function handleSubmitTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!orderId) return;
    setIsSubmittingTicket(true);
    setTicketError(null);
    setTicketSuccess(false);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/orders/${orderId}/support-tickets`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subject: ticketSubject, message: ticketMessage }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setTicketError((err as { message?: string }).message ?? 'Erro ao criar ticket.');
        return;
      }
      setTicketSuccess(true);
      setTicketSubject('');
      setTicketMessage('');
      setShowTicketForm(false);
      fetchOrder();
    } catch {
      setTicketError('Erro ao criar ticket de suporte.');
    } finally {
      setIsSubmittingTicket(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 mb-4">Você precisa estar logado.</p>
        <Link to="/login" className="text-brand-500 font-medium hover:underline">Fazer login</Link>
      </div>
    );
  }

  if (isLoading) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-400">Carregando…</div>;
  }

  if (error || !order) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-red-600 mb-4">{error ?? 'Pedido não encontrado.'}</p>
        <Link to="/orders" className="text-brand-500 font-medium hover:underline">Voltar para meus pedidos</Link>
      </div>
    );
  }

  const totalBRL = (order.totalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-6">
        <Link to="/orders" className="text-sm text-brand-500 hover:underline">← Voltar para meus pedidos</Link>
      </div>

      {/* Order header */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-400 font-mono mb-1">#{order.id.slice(-8).toUpperCase()}</p>
            <h1 className="text-xl font-bold text-gray-900">Detalhes do pedido</h1>
          </div>
          <span className={`text-sm font-medium px-3 py-1 rounded-full ${ORDER_STATUS_COLORS[order.status as OrderStatus]}`}>
            {ORDER_STATUS_LABELS[order.status as OrderStatus]}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Vendedor</p>
            <p className="font-medium text-gray-900">{order.seller?.name ?? order.seller?.email ?? '—'}</p>
          </div>
          <div>
            <p className="text-gray-500">Total</p>
            <p className="font-semibold text-gray-900">{totalBRL}</p>
          </div>
          <div>
            <p className="text-gray-500">Data do pedido</p>
            <p className="font-medium text-gray-900">{new Date(order.createdAt).toLocaleString('pt-BR')}</p>
          </div>
        </div>
      </div>

      {/* Order items */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Itens</h2>
        {order.lines && order.lines.length > 0 ? (
          <ul className="divide-y divide-gray-50">
            {order.lines.map((line) => (
              <li key={line.id} className="py-2 flex justify-between text-sm">
                <span className="text-gray-800">{line.title} × {line.quantity}</span>
                <span className="font-medium text-gray-900">
                  {(line.priceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">Sem itens.</p>
        )}
      </div>

      {/* Fulfillment status */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Status de envio</h2>
        {order.shipment ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={`text-sm font-medium px-3 py-1 rounded-full ${FULFILLMENT_STATUS_COLORS[order.shipment.status as FulfillmentStatus]}`}>
                {FULFILLMENT_STATUS_LABELS[order.shipment.status as FulfillmentStatus]}
              </span>
            </div>
            {order.shipment.carrier && (
              <p className="text-sm text-gray-600">
                Transportadora: <span className="font-medium text-gray-900">{order.shipment.carrier}</span>
              </p>
            )}
            {order.shipment.trackingNumber && (
              <p className="text-sm text-gray-600">
                Código de rastreio:{' '}
                {order.shipment.trackingUrl ? (
                  <a
                    href={order.shipment.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-brand-500 hover:underline"
                  >
                    {order.shipment.trackingNumber}
                  </a>
                ) : (
                  <span className="font-mono text-gray-900">{order.shipment.trackingNumber}</span>
                )}
              </p>
            )}
            {order.shipment.estimatedDelivery && (
              <p className="text-sm text-gray-600">
                Previsão de entrega:{' '}
                <span className="font-medium text-gray-900">
                  {new Date(order.shipment.estimatedDelivery).toLocaleDateString('pt-BR')}
                </span>
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400">Informações de envio ainda não disponíveis.</p>
        )}
      </div>

      {/* Support tickets */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">Suporte</h2>
          {!showTicketForm && (
            <button
              onClick={() => { setShowTicketForm(true); setTicketSuccess(false); }}
              className="text-sm text-brand-500 hover:underline font-medium"
            >
              + Abrir solicitação
            </button>
          )}
        </div>

        {ticketSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 mb-4">
            Solicitação de suporte enviada com sucesso!
          </div>
        )}

        {showTicketForm && (
          <form onSubmit={handleSubmitTicket} className="space-y-3 mb-6">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Assunto</label>
              <input
                type="text"
                value={ticketSubject}
                onChange={(e) => setTicketSubject(e.target.value)}
                required
                placeholder="Descreva brevemente o problema"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mensagem</label>
              <textarea
                value={ticketMessage}
                onChange={(e) => setTicketMessage(e.target.value)}
                required
                rows={4}
                placeholder="Descreva detalhadamente o que aconteceu…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              />
            </div>
            {ticketError && (
              <p className="text-sm text-red-600">{ticketError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isSubmittingTicket}
                className="bg-brand-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
              >
                {isSubmittingTicket ? 'Enviando…' : 'Enviar solicitação'}
              </button>
              <button
                type="button"
                onClick={() => { setShowTicketForm(false); setTicketError(null); }}
                className="text-sm text-gray-500 hover:text-gray-700 font-medium px-3 py-2"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {order.supportTickets && order.supportTickets.length > 0 ? (
          <ul className="space-y-3">
            {(order.supportTickets as SupportTicket[]).map((ticket) => (
              <li key={ticket.id} className="p-3 bg-gray-50 rounded-lg text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-800">{ticket.subject}</span>
                  <span className="text-xs text-gray-500">{TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}</span>
                </div>
                <p className="text-gray-600">{ticket.message}</p>
                <p className="text-xs text-gray-400 mt-1">{new Date(ticket.createdAt).toLocaleString('pt-BR')}</p>
              </li>
            ))}
          </ul>
        ) : !showTicketForm ? (
          <p className="text-sm text-gray-400">Nenhuma solicitação de suporte para este pedido.</p>
        ) : null}
      </div>
    </div>
  );
}
