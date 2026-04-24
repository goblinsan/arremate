import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft } from 'lucide-react';
import type { Order, OrderStatus, FulfillmentStatus, Shipment } from '@arremate/types';

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

interface ShipmentFormData {
  status: FulfillmentStatus;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string;
  estimatedDelivery: string;
}

export default function SellerOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { getAccessToken, isAuthenticated } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [shipmentForm, setShipmentForm] = useState<ShipmentFormData>({
    status: 'PENDING',
    carrier: '',
    trackingNumber: '',
    trackingUrl: '',
    estimatedDelivery: '',
  });
  const [isSavingShipment, setIsSavingShipment] = useState(false);
  const [shipmentSuccess, setShipmentSuccess] = useState(false);
  const [shipmentError, setShipmentError] = useState<string | null>(null);

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
      if (!res.ok) throw new Error();
      const data: Order = await res.json();
      setOrder(data);

      // Pre-fill shipment form if shipment exists
      if (data.shipment) {
        const s: Shipment = data.shipment;
        setShipmentForm({
          status: s.status,
          carrier: s.carrier ?? '',
          trackingNumber: s.trackingNumber ?? '',
          trackingUrl: s.trackingUrl ?? '',
          estimatedDelivery: s.estimatedDelivery
            ? new Date(s.estimatedDelivery).toISOString().split('T')[0]
            : '',
        });
      }
    } catch {
      setError('Erro ao carregar pedido.');
    } finally {
      setIsLoading(false);
    }
  }, [orderId, getAccessToken]);

  useEffect(() => {
    if (isAuthenticated) fetchOrder();
  }, [isAuthenticated, fetchOrder]);

  async function handleSaveShipment(e: React.FormEvent) {
    e.preventDefault();
    if (!orderId) return;
    setIsSavingShipment(true);
    setShipmentError(null);
    setShipmentSuccess(false);
    try {
      const token = getAccessToken();
      const body: Record<string, string | undefined> = {
        status: shipmentForm.status,
      };
      if (shipmentForm.carrier) body.carrier = shipmentForm.carrier;
      if (shipmentForm.trackingNumber) body.trackingNumber = shipmentForm.trackingNumber;
      if (shipmentForm.trackingUrl) body.trackingUrl = shipmentForm.trackingUrl;
      if (shipmentForm.estimatedDelivery) body.estimatedDelivery = shipmentForm.estimatedDelivery;

      const res = await fetch(`${API_URL}/v1/orders/${orderId}/shipment`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setShipmentSuccess(true);
      fetchOrder();
    } catch {
      setShipmentError('Erro ao salvar envio.');
    } finally {
      setIsSavingShipment(false);
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
        <Link to="/seller/orders" className="text-brand-500 font-medium hover:underline">Voltar para pedidos</Link>
      </div>
    );
  }

  const totalBRL = (order.totalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-6">
        <Link to="/seller/orders" className="text-sm text-brand-500 hover:underline inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Voltar para pedidos</Link>
      </div>

      {/* Order header */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-400 font-mono mb-1">#{order.id.slice(-8).toUpperCase()}</p>
            <h1 className="text-xl font-bold text-gray-900">Pedido</h1>
          </div>
          <span className={`text-sm font-medium px-3 py-1 rounded-full ${ORDER_STATUS_COLORS[order.status as OrderStatus]}`}>
            {ORDER_STATUS_LABELS[order.status as OrderStatus]}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Comprador</p>
            <p className="font-medium text-gray-900">{order.buyer?.name ?? order.buyer?.email ?? '—'}</p>
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

      {/* Order lines */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Itens do pedido</h2>
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

      {/* Shipment management */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Gerenciar envio</h2>

        {order.shipment && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg flex items-center gap-3">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${FULFILLMENT_STATUS_COLORS[order.shipment.status as FulfillmentStatus]}`}>
              {FULFILLMENT_STATUS_LABELS[order.shipment.status as FulfillmentStatus]}
            </span>
            {order.shipment.trackingNumber && (
              <span className="text-xs text-gray-500">Rastreio: <span className="font-mono text-gray-700">{order.shipment.trackingNumber}</span></span>
            )}
          </div>
        )}

        <form onSubmit={handleSaveShipment} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status de envio</label>
              <select
                value={shipmentForm.status}
                onChange={(e) => setShipmentForm({ ...shipmentForm, status: e.target.value as FulfillmentStatus })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {(Object.entries(FULFILLMENT_STATUS_LABELS) as [FulfillmentStatus, string][]).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Transportadora</label>
              <input
                type="text"
                value={shipmentForm.carrier}
                onChange={(e) => setShipmentForm({ ...shipmentForm, carrier: e.target.value })}
                placeholder="Ex: Correios, Jadlog…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Código de rastreio</label>
              <input
                type="text"
                value={shipmentForm.trackingNumber}
                onChange={(e) => setShipmentForm({ ...shipmentForm, trackingNumber: e.target.value })}
                placeholder="Ex: AA123456789BR"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">URL de rastreio</label>
              <input
                type="url"
                value={shipmentForm.trackingUrl}
                onChange={(e) => setShipmentForm({ ...shipmentForm, trackingUrl: e.target.value })}
                placeholder="https://…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Previsão de entrega</label>
              <input
                type="date"
                value={shipmentForm.estimatedDelivery}
                onChange={(e) => setShipmentForm({ ...shipmentForm, estimatedDelivery: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          {shipmentError && (
            <p className="text-sm text-red-600">{shipmentError}</p>
          )}
          {shipmentSuccess && (
            <p className="text-sm text-green-600">Envio atualizado com sucesso!</p>
          )}

          <button
            type="submit"
            disabled={isSavingShipment}
            className="bg-brand-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            {isSavingShipment ? 'Salvando…' : 'Salvar envio'}
          </button>
        </form>
      </div>

      {/* Support tickets */}
      {order.supportTickets && order.supportTickets.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Tickets de suporte</h2>
          <ul className="space-y-3">
            {order.supportTickets.map((ticket) => (
              <li key={ticket.id} className="p-3 bg-gray-50 rounded-lg text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-800">{ticket.subject}</span>
                  <span className="text-xs text-gray-400 capitalize">{ticket.status.toLowerCase().replace('_', ' ')}</span>
                </div>
                <p className="text-gray-600">{ticket.message}</p>
                <p className="text-xs text-gray-400 mt-1">{new Date(ticket.createdAt).toLocaleString('pt-BR')}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
