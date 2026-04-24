import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import type { ApplicationStatus } from '@arremate/types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  DRAFT: 'Rascunho',
  SUBMITTED: 'Enviada',
  UNDER_REVIEW: 'Em análise',
  APPROVED: 'Aprovada',
  REJECTED: 'Reprovada',
};

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  UNDER_REVIEW: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

interface ApplicationListItem {
  id: string;
  status: ApplicationStatus;
  businessName: string | null;
  taxId: string | null;
  submittedAt: string | null;
  createdAt: string;
  user: { id: string; email: string; name: string | null };
  documents: { id: string; documentType: string }[];
}

interface PaginatedResponse {
  data: ApplicationListItem[];
  meta: { total: number; page: number; perPage: number };
}

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todos os status' },
  { value: 'SUBMITTED', label: 'Enviadas' },
  { value: 'UNDER_REVIEW', label: 'Em análise' },
  { value: 'APPROVED', label: 'Aprovadas' },
  { value: 'REJECTED', label: 'Reprovadas' },
  { value: 'DRAFT', label: 'Rascunhos' },
];

export default function SellerApplicationsPage() {
  const { getAccessToken } = useAuth();
  const [applications, setApplications] = useState<ApplicationListItem[]>([]);
  const [meta, setMeta] = useState<{ total: number; page: number; perPage: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('SUBMITTED');
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchApplications();
  }, [statusFilter, page]);

  async function fetchApplications() {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const params = new URLSearchParams({ page: String(page), perPage: '20' });
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`${API_URL}/v1/admin/seller-applications?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message ?? 'Erro ao carregar solicitações.');
      }

      const data: PaginatedResponse = await res.json();
      setApplications(data.data);
      setMeta(data.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar solicitações.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Solicitações de Vendedor</h2>
          <p className="text-gray-500 text-sm mt-1">
            Revise e gerencie as solicitações de conta de vendedor.
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
      ) : applications.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          Nenhuma solicitação encontrada.
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Solicitante
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Empresa
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Docs
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Enviada em
                </th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {applications.map((app) => (
                <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-800">{app.user.name ?? '—'}</p>
                    <p className="text-xs text-gray-400">{app.user.email}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-gray-700">{app.businessName ?? '—'}</p>
                    {app.taxId && <p className="text-xs text-gray-400">{app.taxId}</p>}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_COLORS[app.status]}`}
                    >
                      {STATUS_LABELS[app.status]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {app.documents.length}
                  </td>
                  <td className="px-6 py-4 text-gray-500 text-xs">
                    {app.submittedAt
                      ? new Date(app.submittedAt).toLocaleDateString('pt-BR')
                      : '—'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      to={`/seller-applications/${app.id}`}
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
                {meta.total} solicitações · página {meta.page} de{' '}
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
