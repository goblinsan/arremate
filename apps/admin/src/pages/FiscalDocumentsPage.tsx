import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { FiscalDocumentStatus, InvoiceResponsibility } from '@arremate/types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

const STATUS_LABELS: Record<FiscalDocumentStatus, string> = {
  PENDING: 'Pendente',
  ISSUED: 'Emitido',
  CANCELLED: 'Cancelado',
  ERROR: 'Erro',
};

const STATUS_COLORS: Record<FiscalDocumentStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  ISSUED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  ERROR: 'bg-red-100 text-red-600',
};

const RESPONSIBILITY_LABELS: Record<InvoiceResponsibility, string> = {
  PLATFORM: 'Plataforma',
  SELLER: 'Vendedor',
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  NFS_E_SERVICE_FEE: 'NFS-e Taxa de Servico',
  NF_E_GOODS: 'NF-e Mercadoria',
};

function brl(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface FiscalDocumentRecord {
  id: string;
  orderId: string | null;
  order?: {
    id: string;
    totalCents: number;
    status: string;
    seller?: { id: string; name: string | null; email: string } | null;
  } | null;
  invoiceResponsibility: InvoiceResponsibility;
  documentType: string;
  status: FiscalDocumentStatus;
  externalId: string | null;
  issuedAt: Date | string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface ApiResponse {
  data: FiscalDocumentRecord[];
  meta: { total: number; page: number; perPage: number };
}

export default function FiscalDocumentsPage() {
  const { getAccessToken } = useAuth();
  const [docs, setDocs] = useState<FiscalDocumentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FiscalDocumentStatus | 'ALL'>('ALL');
  const [responsibilityFilter, setResponsibilityFilter] = useState<InvoiceResponsibility | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 30;

  const fetchDocs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams({ page: String(page), perPage: String(perPage) });
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (responsibilityFilter !== 'ALL') params.set('invoiceResponsibility', responsibilityFilter);

      const res = await fetch(`${API_URL}/v1/admin/fiscal-documents?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const json = (await res.json()) as ApiResponse;
      setDocs(json.data);
      setTotal(json.meta.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar documentos fiscais');
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken, statusFilter, responsibilityFilter, page]);

  useEffect(() => {
    void fetchDocs();
  }, [fetchDocs]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Documentos Fiscais</h2>
          <p className="mt-1 text-sm text-gray-500">
            Acompanhe o status de emissao de NFS-e e NF-e por pedido.
          </p>
        </div>
        <button
          onClick={() => void fetchDocs()}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as FiscalDocumentStatus | 'ALL'); setPage(1); }}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="ALL">Todos</option>
            {(Object.keys(STATUS_LABELS) as FiscalDocumentStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Responsabilidade:</label>
          <select
            value={responsibilityFilter}
            onChange={(e) => { setResponsibilityFilter(e.target.value as InvoiceResponsibility | 'ALL'); setPage(1); }}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="ALL">Todas</option>
            {(Object.keys(RESPONSIBILITY_LABELS) as InvoiceResponsibility[]).map((r) => (
              <option key={r} value={r}>{RESPONSIBILITY_LABELS[r]}</option>
            ))}
          </select>
        </div>

        <div className="ml-auto text-sm text-gray-500 self-center">
          {total} documento{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Carregando...
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <FileText className="w-8 h-8 mb-2" />
            <p className="text-sm">Nenhum documento fiscal encontrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Responsabilidade</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Pedido</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Vendedor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Pedido</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">ID Externo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Emitido em</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Criado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {docs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{doc.id.slice(-8)}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        doc.invoiceResponsibility === 'PLATFORM'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}>
                        {RESPONSIBILITY_LABELS[doc.invoiceResponsibility]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[doc.status]}`}>
                        {STATUS_LABELS[doc.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {doc.order ? doc.order.id.slice(-8) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {doc.order?.seller
                        ? (doc.order.seller.name ?? doc.order.seller.email)
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {doc.order ? brl(doc.order.totalCents) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">
                      {doc.externalId ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {doc.issuedAt
                        ? new Date(doc.issuedAt).toLocaleDateString('pt-BR')
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {new Date(doc.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
            <span>
              Pagina {page} de {totalPages} ({total} total)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 rounded border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40"
              >
                Proxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
