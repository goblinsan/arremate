import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

const ACTION_FILTER_OPTIONS = [
  { value: '', label: 'Todas as ações' },
  { value: 'DISPUTE', label: 'Disputas' },
  { value: 'REFUND', label: 'Reembolsos' },
  { value: 'SELLER_STRIKE', label: 'Strikes' },
  { value: 'USER_SUSPEND', label: 'Suspensões' },
  { value: 'SELLER_APPLICATION', label: 'Aplicações' },
];

interface AuditEventItem {
  id: string;
  action: string;
  actorId: string;
  actor: { id: string; name: string | null; email: string };
  applicationId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface PaginatedResponse {
  data: AuditEventItem[];
  meta: { total: number; page: number; perPage: number };
}

function actionBadgeColor(action: string): string {
  if (action.includes('DISPUTE')) return 'bg-purple-100 text-purple-700';
  if (action.includes('REFUND')) return 'bg-orange-100 text-orange-700';
  if (action.includes('STRIKE')) return 'bg-red-100 text-red-700';
  if (action.includes('SUSPEND')) return 'bg-red-100 text-red-700';
  if (action.includes('APPROVED')) return 'bg-green-100 text-green-700';
  if (action.includes('REJECTED')) return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-600';
}

export default function AuditEventsPage() {
  const { getAccessToken } = useAuth();
  const [events, setEvents] = useState<AuditEventItem[]>([]);
  const [meta, setMeta] = useState<{ total: number; page: number; perPage: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchEvents();
  }, [actionFilter, page]);

  async function fetchEvents() {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const params = new URLSearchParams({ page: String(page), perPage: '20' });
      if (actionFilter) params.set('action', actionFilter);

      const res = await fetch(`${API_URL}/v1/admin/audit-events?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao carregar eventos de auditoria.');
      }

      const data: PaginatedResponse = await res.json();
      setEvents(data.data);
      setMeta(data.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar eventos.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Auditoria</h2>
          <p className="text-gray-500 text-sm mt-1">
            Histórico de ações sensíveis realizadas no sistema.
          </p>
        </div>
      </div>

      {/* Action filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {ACTION_FILTER_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => { setActionFilter(value); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              actionFilter === value
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
      ) : events.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          Nenhum evento de auditoria encontrado.
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Ação
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Executor
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Metadados
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Data
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${actionBadgeColor(event.action)}`}
                    >
                      {event.action}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-800">{event.actor.name ?? '—'}</p>
                    <p className="text-xs text-gray-400">{event.actor.email}</p>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500 font-mono max-w-xs truncate">
                    {event.metadata ? JSON.stringify(event.metadata) : '—'}
                  </td>
                  <td className="px-6 py-4 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(event.createdAt).toLocaleString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {meta && meta.total > meta.perPage && (
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
              <span>
                {meta.total} eventos · página {meta.page} de{' '}
                {Math.ceil(meta.total / meta.perPage)}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-xs font-medium"
                >
                  ← Anterior
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= Math.ceil(meta.total / meta.perPage)}
                  className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-xs font-medium"
                >
                  Próxima →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
