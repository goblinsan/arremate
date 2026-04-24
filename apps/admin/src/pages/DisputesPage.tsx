import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';import type { DisputeStatus, DisputeReason } from '@arremate/types';

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

interface DisputeListItem {
  id: string;
  status: DisputeStatus;
  reason: DisputeReason;
  description: string | null;
  createdAt: string;
  order: { id: string; totalCents: number; status: string };
  raisedBy: { id: string; name: string | null; email: string };
  resolvedBy: { id: string; name: string | null; email: string } | null;
}

interface PaginatedResponse {
  data: DisputeListItem[];
  meta: { total: number; page: number; perPage: number };
}

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todos os status' },
  { value: 'OPEN', label: 'Abertas' },
  { value: 'UNDER_REVIEW', label: 'Em análise' },
  { value: 'RESOLVED', label: 'Resolvidas' },
  { value: 'CLOSED', label: 'Encerradas' },
];

function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export default function DisputesPage() {
  const { getAccessToken } = useAuth();
  const [disputes, setDisputes] = useState<DisputeListItem[]>([]);
  const [meta, setMeta] = useState<{ total: number; page: number; perPage: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchDisputes();
  }, [statusFilter, page]);

  async function fetchDisputes() {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const params = new URLSearchParams({ page: String(page), perPage: '20' });
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`${API_URL}/v1/admin/disputes?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao carregar disputas.');
      }

      const data: PaginatedResponse = await res.json();
      setDisputes(data.data);
      setMeta(data.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar disputas.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Disputas</h2>
          <p className="text-gray-500 text-sm mt-1">
            Revise e gerencie as disputas abertas pelos compradores.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        {STATUS_FILTER_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => { setStatusFilter(value); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              statusFilter === value
                ? 'bg-brand-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Carregando…</div>
      ) : disputes.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">Nenhuma disputa encontrada.</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Comprador
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Motivo
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Pedido
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Aberta em
                </th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {disputes.map((dispute) => (
                <tr key={dispute.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-800">{dispute.raisedBy.name ?? '—'}</p>
                    <p className="text-xs text-gray-400">{dispute.raisedBy.email}</p>
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    {REASON_LABELS[dispute.reason]}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-gray-700 font-mono text-xs">{dispute.order.id.slice(-8)}</p>
                    <p className="text-xs text-gray-400">{formatBRL(dispute.order.totalCents)}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_COLORS[dispute.status]}`}
                    >
                      {STATUS_LABELS[dispute.status]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500 text-xs">
                    {new Date(dispute.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      to={`/disputes/${dispute.id}`}
                      className="text-brand-500 font-medium text-xs hover:underline inline-flex items-center gap-1"
                    >
                      Ver detalhes <ArrowRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {meta && meta.total > meta.perPage && (
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
              <span>
                {meta.total} disputas · página {meta.page} de{' '}
                {Math.ceil(meta.total / meta.perPage)}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-xs font-medium inline-flex items-center gap-1"
                >
                  <ChevronLeft className="w-3 h-3" /> Anterior
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= Math.ceil(meta.total / meta.perPage)}
                  className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-xs font-medium inline-flex items-center gap-1"
                >
                  Próxima <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
