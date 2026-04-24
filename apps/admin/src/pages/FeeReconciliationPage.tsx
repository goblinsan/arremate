import { useState, useEffect, useCallback } from 'react';
import { Download, Info, RefreshCw } from 'lucide-react';
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
    'Vendedor',
    'Comprador',
    'Status',
    'Subtotal',
    'Comissão (taxa)',
    'Comissão (R$)',
    'Taxa Proc. (taxa)',
    'Taxa Proc. (R$)',
    'Frete',
    'Código Promoção',
    'Desconto Promoção',
    'Taxa Personalizada',
    'Repasse Vendedor',
    'Total Comprador',
  ].join(';');

  const rows = orders.map((o) => [
    o.id,
    new Date(o.createdAt).toISOString(),
    (o.seller as { name?: string; email?: string } | undefined)?.name ?? (o.seller as { email?: string } | undefined)?.email ?? '',
    (o.buyer as { name?: string; email?: string } | undefined)?.name ?? (o.buyer as { email?: string } | undefined)?.email ?? '',
    o.status,
    o.subtotalCents != null ? (o.subtotalCents / 100).toFixed(2) : '',
    o.commissionBps != null ? bps(o.commissionBps) : '',
    o.commissionCents != null ? (o.commissionCents / 100).toFixed(2) : '',
    o.processorFeeBps != null ? bps(o.processorFeeBps) : '',
    o.processorFeeCents != null ? (o.processorFeeCents / 100).toFixed(2) : '',
    o.shippingCents != null ? (o.shippingCents / 100).toFixed(2) : '0.00',
    o.promotionCode ?? '',
    o.promotionDiscountBps != null ? bps(o.promotionDiscountBps) : '',
    o.sellerOverrideApplied ? 'Sim' : 'Não',
    o.sellerPayoutCents != null ? (o.sellerPayoutCents / 100).toFixed(2) : '',
    o.buyerTotalCents != null ? (o.buyerTotalCents / 100).toFixed(2) : (o.totalCents / 100).toFixed(2),
  ].join(';'));

  const csv = [headers, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reconciliacao-taxas-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface AdminOrdersResponse {
  data: Order[];
  total: number;
  page: number;
  perPage: number;
}

export default function FeeReconciliationPage() {
  const { getAccessToken } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [overrideOnly, setOverrideOnly] = useState(false);

  const perPage = 30;

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const params = new URLSearchParams({ page: String(page), perPage: String(perPage) });
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (overrideOnly) params.set('sellerOverrideOnly', 'true');

      const res = await fetch(`${API_URL}/v1/admin/orders?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data: AdminOrdersResponse = await res.json();
      setOrders(data.data);
      setTotal(data.total);
    } catch {
      setError('Erro ao carregar pedidos.');
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken, page, statusFilter, overrideOnly]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const totalPages = Math.ceil(total / perPage);

  const ordersWithFees = orders.filter((o) => o.sellerPayoutCents != null);
  const pageCommission = ordersWithFees.reduce((sum, o) => sum + (o.commissionCents ?? 0), 0);
  const pageProcessorFee = ordersWithFees.reduce((sum, o) => sum + (o.processorFeeCents ?? 0), 0);
  const pagePayout = ordersWithFees.reduce((sum, o) => sum + (o.sellerPayoutCents ?? 0), 0);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reconciliação de taxas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Visão consolidada das taxas aplicadas em todos os pedidos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchOrders}
            className="flex items-center gap-1.5 text-sm text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </button>
          {orders.length > 0 && (
            <button
              onClick={() => exportCsv(orders)}
              className="flex items-center gap-1.5 text-sm text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Exportar CSV
            </button>
          )}
        </div>
      </div>

      {/* Page-level summary */}
      {ordersWithFees.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-500">Pedidos (página)</p>
            <p className="text-xl font-bold text-gray-900">{orders.length}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-500">Comissão (página)</p>
            <p className="text-xl font-bold text-gray-900">{brl(pageCommission)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-500">Taxa proc. (página)</p>
            <p className="text-xl font-bold text-gray-900">{brl(pageProcessorFee)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-500">Repasse vendedores</p>
            <p className="text-xl font-bold text-green-700">{brl(pagePayout)}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <div className="flex gap-2 flex-wrap">
          {(['ALL', 'PAID', 'PENDING_PAYMENT', 'CANCELLED', 'REFUNDED'] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                statusFilter === s
                  ? 'bg-brand-500 text-white border-brand-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
              }`}
            >
              {s === 'ALL' ? 'Todos' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none ml-auto">
          <input
            type="checkbox"
            checked={overrideOnly}
            onChange={(e) => { setOverrideOnly(e.target.checked); setPage(1); }}
            className="rounded border-gray-300 text-brand-500 focus:ring-brand-500"
          />
          Apenas com taxa personalizada
        </label>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Carregando...</div>
      ) : error ? (
        <div className="text-center py-16 text-red-600">{error}</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-gray-400">Nenhum pedido encontrado.</div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Pedido</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Data</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Vendedor</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Subtotal</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Comissão</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Taxa proc.</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Repasse</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Override</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orders.map((order) => {
                    const hasSnapshot = order.sellerPayoutCents != null;
                    const sellerName = (order.seller as { name?: string | null; email?: string } | undefined)?.name
                      ?? (order.seller as { email?: string } | undefined)?.email
                      ?? '—';
                    return (
                      <tr key={order.id} className={`hover:bg-gray-50 transition-colors ${order.sellerOverrideApplied ? 'bg-brand-50/30' : ''}`}>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">
                          #{order.id.slice(-8).toUpperCase()}
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-4 py-3 text-gray-800 max-w-[160px] truncate" title={sellerName}>
                          {sellerName}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status as OrderStatus]}`}>
                            {STATUS_LABELS[order.status as OrderStatus]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-800 whitespace-nowrap">
                          {hasSnapshot ? brl(order.subtotalCents!) : brl(order.totalCents)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {hasSnapshot ? (
                            <span className="text-red-600">
                              {brl(order.commissionCents!)}
                              {order.commissionBps != null && (
                                <span className="ml-1 text-xs text-gray-400">({bps(order.commissionBps)})</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">N/D</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {hasSnapshot ? (
                            <span className="text-red-600">
                              {brl(order.processorFeeCents!)}
                              {order.processorFeeBps != null && (
                                <span className="ml-1 text-xs text-gray-400">({bps(order.processorFeeBps)})</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">N/D</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                          {hasSnapshot ? (
                            <span className="text-green-700">{brl(order.sellerPayoutCents!)}</span>
                          ) : (
                            <span className="text-gray-300 text-xs">N/D</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {order.sellerOverrideApplied ? (
                            <span
                              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full"
                              title="Taxa personalizada aplicada para este vendedor"
                            >
                              <Info className="w-3 h-3" /> Sim
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-4 flex-wrap text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0" />
                N/D indica pedidos sem instantâneo de taxa. Override indica configuração de taxa personalizada por vendedor.
              </span>
              <span>{total} pedidos no total</span>
            </div>
          </div>

          {/* Págination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Anterior
              </button>
              <span className="text-sm text-gray-500">
                Página {page} de {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
