import { useState, useEffect, useCallback } from 'react';
import { ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { PayoutBatch, PayoutBatchStatus, PayoutEntry } from '@arremate/types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

function brl(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const BATCH_STATUS_LABELS: Record<PayoutBatchStatus, string> = {
  PENDING: 'Pendente',
  PROCESSING: 'Em processamento',
  PAID: 'Pago',
  FAILED: 'Falhou',
};

const BATCH_STATUS_COLORS: Record<PayoutBatchStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-600',
};

interface BatchDetail extends PayoutBatch {
  entries: PayoutEntry[];
}

interface GenerateBatchForm {
  periodStart: string;
  periodEnd: string;
  sellerId: string;
  notes: string;
}

export default function PayoutBatchesPage() {
  const { getAccessToken } = useAuth();
  const [batches, setBatches] = useState<PayoutBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<BatchDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PayoutBatchStatus | 'ALL'>('ALL');

  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [form, setForm] = useState<GenerateBatchForm>({
    periodStart: thirtyDaysAgo,
    periodEnd: today,
    sellerId: '',
    notes: '',
  });

  const fetchBatches = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const params = statusFilter !== 'ALL' ? `?status=${statusFilter}` : '';
      const res = await fetch(`${API_URL}/v1/admin/payout-batches${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data: { data: PayoutBatch[] } = await res.json();
      setBatches(data.data);
    } catch {
      setError('Erro ao carregar lotes de repasse.');
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken, statusFilter]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  async function openBatchDetail(batchId: string) {
    setIsDetailLoading(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/admin/payout-batches/${batchId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data: BatchDetail = await res.json();
      setSelectedBatch(data);
    } catch {
      // silently fail — user can try again
    } finally {
      setIsDetailLoading(false);
    }
  }

  async function advanceBatchStatus(batchId: string, newStatus: 'PROCESSING' | 'PAID' | 'FAILED') {
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/admin/payout-batches/${batchId}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      await fetchBatches();
      if (selectedBatch?.id === batchId) {
        await openBatchDetail(batchId);
      }
    } catch {
      // silently fail — caller can retry
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setIsCreating(true);
    setCreateError(null);
    try {
      const token = getAccessToken();
      const body: Record<string, string> = {
        periodStart: new Date(form.periodStart).toISOString(),
        periodEnd: new Date(form.periodEnd + 'T23:59:59').toISOString(),
      };
      if (form.sellerId.trim()) body.sellerId = form.sellerId.trim();
      if (form.notes.trim()) body.notes = form.notes.trim();

      const res = await fetch(`${API_URL}/v1/admin/payout-batches`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.status === 422) {
        const err = await res.json() as { message: string };
        setCreateError(err.message);
        return;
      }
      if (!res.ok) throw new Error();

      setShowCreateForm(false);
      await fetchBatches();
    } catch {
      setCreateError('Erro ao gerar lote. Tente novamente.');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">Lotes de repasse</h1>
          <p className="text-sm text-gray-500">Gerencie os lotes de pagamento aos vendedores.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchBatches}
            className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
          <button
            onClick={() => setShowCreateForm((v) => !v)}
            className="flex items-center gap-2 bg-brand-500 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-brand-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Gerar lote
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Gerar novo lote de repasse</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Periodo inicio</label>
                <input
                  type="date"
                  value={form.periodStart}
                  onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Periodo fim</label>
                <input
                  type="date"
                  value={form.periodEnd}
                  onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Vendedor (ID, opcional)</label>
              <input
                type="text"
                value={form.sellerId}
                onChange={(e) => setForm((f) => ({ ...f, sellerId: e.target.value }))}
                placeholder="Deixe em branco para incluir todos"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notas (opcional)</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {createError && (
              <p className="text-xs text-red-600">{createError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isCreating}
                className="bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-60"
              >
                {isCreating ? 'Gerando...' : 'Gerar lote'}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreateForm(false); setCreateError(null); }}
                className="bg-white border border-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['ALL', 'PENDING', 'PROCESSING', 'PAID', 'FAILED'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              statusFilter === s
                ? 'bg-brand-500 text-white border-brand-500'
                : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
            }`}
          >
            {s === 'ALL' ? 'Todos' : BATCH_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Batch list */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="text-center py-16 text-gray-400">Carregando...</div>
          ) : error ? (
            <div className="text-center py-16 text-red-600">{error}</div>
          ) : batches.length === 0 ? (
            <div className="text-center py-16 text-gray-400">Nenhum lote encontrado.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {batches.map((batch) => (
                <button
                  key={batch.id}
                  onClick={() => openBatchDetail(batch.id)}
                  className={`w-full text-left px-4 py-4 hover:bg-gray-50 transition-colors flex items-center justify-between gap-4 ${
                    selectedBatch?.id === batch.id ? 'bg-brand-50' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${BATCH_STATUS_COLORS[batch.status as PayoutBatchStatus]}`}>
                        {BATCH_STATUS_LABELS[batch.status as PayoutBatchStatus]}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(batch.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-gray-800">{brl(batch.totalCents)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(batch.periodStart).toLocaleDateString('pt-BR')} -{' '}
                      {new Date(batch.periodEnd).toLocaleDateString('pt-BR')}
                      {batch._count && (
                        <span className="ml-2">{batch._count.entries} entradas</span>
                      )}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Batch detail */}
        {selectedBatch ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">
                  Lote #{selectedBatch.id.slice(-8).toUpperCase()}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(selectedBatch.periodStart).toLocaleDateString('pt-BR')} -{' '}
                  {new Date(selectedBatch.periodEnd).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${BATCH_STATUS_COLORS[selectedBatch.status as PayoutBatchStatus]}`}>
                {BATCH_STATUS_LABELS[selectedBatch.status as PayoutBatchStatus]}
              </span>
            </div>

            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-800">Total: {brl(selectedBatch.totalCents)}</span>
              <div className="flex gap-2">
                {selectedBatch.status === 'PENDING' && (
                  <button
                    onClick={() => advanceBatchStatus(selectedBatch.id, 'PROCESSING')}
                    className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    Processar
                  </button>
                )}
                {selectedBatch.status === 'PROCESSING' && (
                  <>
                    <button
                      onClick={() => advanceBatchStatus(selectedBatch.id, 'PAID')}
                      className="text-xs bg-green-500 text-white px-3 py-1.5 rounded-lg hover:bg-green-600 transition-colors"
                    >
                      Marcar pago
                    </button>
                    <button
                      onClick={() => advanceBatchStatus(selectedBatch.id, 'FAILED')}
                      className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 transition-colors"
                    >
                      Marcar falhou
                    </button>
                  </>
                )}
              </div>
            </div>

            {isDetailLoading ? (
              <div className="text-center py-8 text-gray-400">Carregando entradas...</div>
            ) : (
              <div className="overflow-y-auto max-h-96">
                {selectedBatch.entries.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">Nenhuma entrada.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Vendedor</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Descricao</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {selectedBatch.entries.map((entry) => (
                        <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-2.5">
                            <p className="text-xs font-medium text-gray-800">
                              {entry.seller?.name ?? entry.seller?.email ?? entry.sellerId}
                            </p>
                            {entry.payable?.orderId && (
                              <p className="text-xs text-gray-400 font-mono">
                                #{entry.payable.orderId.slice(-8).toUpperCase()}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-500">
                            {entry.description ?? (entry.ledgerEntry?.feeType ?? 'Repasse')}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-green-700 text-xs">
                            {brl(entry.amountCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex items-center justify-center text-gray-400 text-sm min-h-[200px]">
            Selecione um lote para ver os detalhes.
          </div>
        )}
      </div>
    </div>
  );
}
