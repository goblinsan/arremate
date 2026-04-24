import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Download, Info } from 'lucide-react';
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

function brl(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function bps(value: number) {
  return `${(value / 100).toFixed(2)}%`;
}

function exportCsv(orders: Order[]) {
  const headers = [
    'ID Pedido',
    'Data',
    'Comprador',
    'Status',
    'Subtotal',
    'Comissao Plataforma (taxa)',
    'Comissao Plataforma (R$)',
    'Taxa Processadora (taxa)',
    'Taxa Processadora (R$)',
    'Frete',
    'Codigo Promocao',
    'Desconto Promocao',
    'Taxa Personalizada',
    'Repasse Estimado',
  ].join(';');

  const rows = orders.map((o) => [
    o.id,
    new Date(o.createdAt).toISOString(),
    o.buyer?.name ?? o.buyer?.email ?? '',
    o.status,
    o.subtotalCents != null ? (o.subtotalCents / 100).toFixed(2) : '',
    o.commissionBps != null ? bps(o.commissionBps) : '',
    o.commissionCents != null ? (o.commissionCents / 100).toFixed(2) : '',
    o.processorFeeBps != null ? bps(o.processorFeeBps) : '',
    o.processorFeeCents != null ? (o.processorFeeCents / 100).toFixed(2) : '',
    o.shippingCents != null ? (o.shippingCents / 100).toFixed(2) : '0.00',
    o.promotionCode ?? '',
    o.promotionDiscountBps != null ? bps(o.promotionDiscountBps) : '',
    o.sellerOverrideApplied ? 'Sim' : 'Nao',
    o.sellerPayoutCents != null ? (o.sellerPayoutCents / 100).toFixed(2) : '',
  ].join(';'));

  const csv = [headers, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `repasses-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SellerPayoutLedgerPage() {
  const { getAccessToken, isAuthenticated } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<OrderStatus | 'ALL'>('PAID');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const params = filter !== 'ALL' ? `?status=${filter}` : '';
      const res = await fetch(`${API_URL}/v1/seller/orders${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data: Order[] = await res.json();
      setOrders(data);
    } catch {
      setError('Erro ao carregar pedidos.');
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken, filter]);

  useEffect(() => {
    if (isAuthenticated) fetchOrders();
  }, [isAuthenticated, fetchOrders]);

  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 mb-4">Voce precisa estar logado para ver seus repasses.</p>
        <Link to="/login" className="text-brand-500 font-medium hover:underline">Fazer login</Link>
      </div>
    );
  }

  const ordersWithFees = orders.filter((o) => o.sellerPayoutCents != null);
  const totalPayout = ordersWithFees.reduce((sum, o) => sum + (o.sellerPayoutCents ?? 0), 0);
  const totalCommission = ordersWithFees.reduce((sum, o) => sum + (o.commissionCents ?? 0), 0);
  const totalProcessorFee = ordersWithFees.reduce((sum, o) => sum + (o.processorFeeCents ?? 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Repasses e extratos</h1>
          <p className="text-sm text-gray-500">Historico detalhado de taxas e valores repassados por pedido.</p>
        </div>

        {ordersWithFees.length > 0 && (
          <button
            onClick={() => exportCsv(ordersWithFees)}
            className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
        )}
      </div>

      {/* Summary cards */}
      {ordersWithFees.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs text-gray-500 mb-1">Repasse estimado total</p>
            <p className="text-2xl font-bold text-green-700">{brl(totalPayout)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs text-gray-500 mb-1">Comissao plataforma total</p>
            <p className="text-2xl font-bold text-gray-800">{brl(totalCommission)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs text-gray-500 mb-1">Taxas processadora total</p>
            <p className="text-2xl font-bold text-gray-800">{brl(totalProcessorFee)}</p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(['ALL', 'PAID', 'PENDING_PAYMENT', 'CANCELLED', 'REFUNDED'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              filter === s
                ? 'bg-brand-500 text-white border-brand-500'
                : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
            }`}
          >
            {s === 'ALL' ? 'Todos' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Carregando...</div>
      ) : error ? (
        <div className="text-center py-16 text-red-600">{error}</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-gray-400">Nenhum pedido encontrado.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pedido</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Subtotal</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Comissao</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Taxa proc.</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Repasse</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map((order) => {
                  const hasSnapshot = order.sellerPayoutCents != null;
                  return (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          to={`/seller/orders/${order.id}`}
                          className="font-mono text-xs text-brand-600 hover:underline"
                        >
                          #{order.id.slice(-8).toUpperCase()}
                        </Link>
                        {order.sellerOverrideApplied && (
                          <span
                            className="ml-2 text-xs text-brand-500 font-medium"
                            title="Taxa personalizada aplicada"
                          >
                            <Info className="w-3 h-3 inline" /> personalizada
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status as OrderStatus]}`}>
                          {STATUS_LABELS[order.status as OrderStatus]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-800">
                        {hasSnapshot ? brl(order.subtotalCents!) : brl(order.totalCents)}
                      </td>
                      <td className="px-4 py-3 text-right text-red-600">
                        {hasSnapshot
                          ? <>
                              <span>{brl(order.commissionCents!)}</span>
                              {order.commissionBps != null && (
                                <span className="ml-1 text-xs text-gray-400">({bps(order.commissionBps)})</span>
                              )}
                            </>
                          : <span className="text-gray-300">N/D</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right text-red-600">
                        {hasSnapshot
                          ? <>
                              <span>{brl(order.processorFeeCents!)}</span>
                              {order.processorFeeBps != null && (
                                <span className="ml-1 text-xs text-gray-400">({bps(order.processorFeeBps)})</span>
                              )}
                            </>
                          : <span className="text-gray-300">N/D</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-green-700">
                        {hasSnapshot
                          ? brl(order.sellerPayoutCents!)
                          : <span className="text-gray-300">N/D</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center gap-2 text-xs text-gray-400">
            <Info className="w-3.5 h-3.5 shrink-0" />
            Os valores de repasse sao estimativas baseadas na configuracao de taxas vigente no momento de cada pedido.
            N/D indica pedidos criados antes da configuracao de taxas estar ativa.
          </div>
        </div>
      )}
    </div>
  );
}
