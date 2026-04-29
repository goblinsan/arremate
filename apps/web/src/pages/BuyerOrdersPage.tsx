import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { Order, OrderStatus } from '@arremate/types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Aguardando pagamento',
  PAID: 'Pago',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Reembolsado',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'bg-yellow-100 text-yellow-700',
  PAID: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  REFUNDED: 'bg-red-50 text-red-400',
};

export default function BuyerOrdersPage() {
  const { getAccessToken, isAuthenticated, isLoading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    fetchOrders();
  }, [isAuthenticated, authLoading]);

  async function fetchOrders() {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/v1/buyer/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data: Order[] = await res.json();
      setOrders(data);
    } catch {
      setError('Erro ao carregar seus pedidos.');
    } finally {
      setIsLoading(false);
    }
  }

  if (authLoading) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-400">Carregando…</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 mb-4">Você precisa estar logado para ver seus pedidos.</p>
        <Link to="/login" className="text-brand-500 font-medium hover:underline">Fazer login</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Meus pedidos</h1>
        <p className="text-sm text-gray-500">Acompanhe seus pedidos e solicitações de suporte.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6 flex items-center justify-between gap-4">
          <span>{error}</span>
          <button
            onClick={fetchOrders}
            aria-label="Tentar carregar pedidos novamente"
            className="shrink-0 text-xs font-medium underline hover:no-underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="text-center text-gray-400 py-12">Carregando…</div>
      ) : orders.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          <p className="mb-2">Você ainda não fez nenhum pedido.</p>
          <Link to="/shows" className="text-brand-500 font-medium hover:underline text-sm">Ver shows ao vivo</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              to={`/orders/${order.id}`}
              className="block bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:border-brand-200 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 mb-0.5 font-mono">
                    #{order.id.slice(-8).toUpperCase()}
                  </p>
                  {order.lines?.[0] && (
                    <p className="font-semibold text-gray-900 truncate">{order.lines[0].title}</p>
                  )}
                  {order.shipment && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Envio:{' '}
                      <span className="font-medium">
                        {order.shipment.status === 'SHIPPED' && order.shipment.trackingNumber
                          ? `Enviado · ${order.shipment.trackingNumber}`
                          : order.shipment.status === 'DELIVERED'
                          ? 'Entregue'
                          : order.shipment.status === 'PROCESSING'
                          ? 'Em processamento'
                          : 'Pendente'}
                      </span>
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold text-gray-900">
                    {((order.buyerTotalCents ?? order.totalCents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status as OrderStatus]}`}>
                    {STATUS_LABELS[order.status as OrderStatus]}
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {new Date(order.createdAt).toLocaleString('pt-BR')}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
