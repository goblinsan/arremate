import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle, Clock } from 'lucide-react';
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

export default function SellerOrdersPage() {
  const { getAccessToken, isAuthenticated } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchOrders();
  }, [isAuthenticated, filter]);

  async function fetchOrders() {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const params = filter !== 'ALL' ? `?status=${filter}` : '';
      const res = await fetch(`${API_URL}/v1/seller/orders${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Erro ao carregar pedidos.');
      const data: Order[] = await res.json();
      setOrders(data);
    } catch {
      setError('Erro ao carregar pedidos.');
    } finally {
      setIsLoading(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 mb-4">Você precisa estar logado para ver seus pedidos.</p>
        <Link to="/login" className="text-brand-500 font-medium hover:underline">Fazer login</Link>
      </div>
    );
  }

  const paidOrders = orders.filter((o) => o.status === 'PAID');
  const pendingOrders = orders.filter((o) => o.status === 'PENDING_PAYMENT');

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Pedidos recebidos</h1>
        <p className="text-sm text-gray-500">Acompanhe os pedidos dos seus compradores.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {(Object.entries(STATUS_LABELS) as [OrderStatus, string][]).map(([status, label]) => {
          const count = orders.filter((o) => o.status === status).length;
          return (
            <button
              key={status}
              onClick={() => setFilter(filter === status ? 'ALL' : status)}
              className={`rounded-xl p-4 border text-left transition-colors ${
                filter === status
                  ? 'border-brand-500 bg-orange-50'
                  : 'border-gray-100 bg-white hover:border-gray-200'
              }`}
            >
              <p className="text-2xl font-bold text-gray-900">{count}</p>
              <p className={`text-xs font-medium mt-1 px-2 py-0.5 rounded-full inline-block ${STATUS_COLORS[status]}`}>
                {label}
              </p>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-center text-gray-400 py-12">Carregando…</div>
      ) : orders.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          {filter === 'ALL' ? 'Nenhum pedido ainda.' : `Nenhum pedido com status "${STATUS_LABELS[filter as OrderStatus]}".`}
        </div>
      ) : (
        <>
          {/* Paid orders highlighted */}
          {filter === 'ALL' && paidOrders.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-semibold text-green-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" /> Pedidos confirmados
              </h2>
              <div className="space-y-3">
                {paidOrders.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </div>
            </section>
          )}

          {/* Pending payment orders */}
          {filter === 'ALL' && pendingOrders.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-semibold text-yellow-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> Aguardando pagamento
              </h2>
              <div className="space-y-3">
                {pendingOrders.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </div>
            </section>
          )}

          {/* Filtered view */}
          {filter !== 'ALL' && (
            <div className="space-y-3">
              {orders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
  const firstLine = order.lines?.[0];
  const totalBRL = (order.totalCents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  return (
    <Link
      to={`/seller/orders/${order.id}`}
      className="block bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:border-brand-200 transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 mb-0.5 font-mono">
            #{order.id.slice(-8).toUpperCase()}
          </p>
          {firstLine && (
            <p className="font-semibold text-gray-900 truncate">{firstLine.title}</p>
          )}
          {order.buyer && (
            <p className="text-sm text-gray-500 mt-0.5">
              Comprador: <span className="text-gray-700">{order.buyer.name ?? order.buyer.email}</span>
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold text-gray-900">{totalBRL}</p>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              STATUS_COLORS[order.status as OrderStatus]
            }`}
          >
            {STATUS_LABELS[order.status as OrderStatus]}
          </span>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        {new Date(order.createdAt).toLocaleString('pt-BR')}
      </p>
    </Link>
  );
}
