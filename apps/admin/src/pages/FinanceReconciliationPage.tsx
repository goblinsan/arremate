import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle, Info, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

function brl(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface ReconciliationException {
  type: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  count: number;
  description: string;
}

interface ReconciliationSummary {
  periodStart: string;
  periodEnd: string;
  pspCash: {
    paymentCount: number;
    collectedCents: number;
    pendingCents: number;
    failedCents: number;
    refundedCents: number;
  };
  platformRevenue: {
    grossCommissionCents: number;
    processorFeeTotalCents: number;
    netRevenueCents: number;
    refundReversalCents: number;
    adjustedNetRevenueCents: number;
  };
  sellerLiabilities: {
    pendingPayableCount: number;
    pendingPayableCents: number;
    includedInBatchCents: number;
    paidPayableCents: number;
    offsetPayableCents: number;
  };
  payouts: {
    batchCount: number;
    disbursedCents: number;
    pendingBatchCents: number;
    failedBatchCents: number;
  };
  fiscalDocuments: {
    pendingCount: number;
    issuedCount: number;
    errorCount: number;
    cancelledCount: number;
  };
  exceptions: ReconciliationException[];
}

const SEVERITY_ICONS: Record<ReconciliationException['severity'], React.ReactNode> = {
  HIGH: <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />,
  MEDIUM: <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0" />,
  LOW: <Info className="w-4 h-4 text-blue-400 shrink-0" />,
};

const SEVERITY_ROW_COLORS: Record<ReconciliationException['severity'], string> = {
  HIGH: 'bg-red-50 border-l-4 border-red-400',
  MEDIUM: 'bg-yellow-50 border-l-4 border-yellow-400',
  LOW: 'bg-blue-50 border-l-4 border-blue-300',
};

function SummaryCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold mt-1 ${highlight ? 'text-green-700' : 'text-gray-900'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function FinanceReconciliationPage() {
  const { getAccessToken } = useAuth();

  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const params = new URLSearchParams({ from, to });
      const res = await fetch(
        `${API_URL}/v1/admin/finance/reconciliation?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ReconciliationSummary = await res.json();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar reconciliação.');
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken, from, to]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const highExceptions = summary?.exceptions.filter((e) => e.severity === 'HIGH') ?? [];

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reconciliação financeira</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Visão consolidada: PSP · Plataforma · Vendedores · Documentos fiscais.
          </p>
        </div>
        <button
          onClick={fetchSummary}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-sm text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Period picker */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">De</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Até</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-gray-400">Carregando...</div>
      )}

      {error && (
        <div className="text-center py-16 text-red-600">{error}</div>
      )}

      {summary && !isLoading && (
        <>
          {/* Exception banner */}
          {highExceptions.length > 0 && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700">
                  {highExceptions.length} exceção(ões) crítica(s) detectada(s)
                </p>
                <ul className="mt-1 space-y-0.5">
                  {highExceptions.map((e) => (
                    <li key={e.type} className="text-xs text-red-600">
                      {e.description}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {summary.exceptions.length === 0 && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
              <p className="text-sm text-green-700 font-medium">
                Nenhuma exceção encontrada para o período selecionado.
              </p>
            </div>
          )}

          {/* PSP Cash */}
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
              Caixa PSP (pagamentos recebidos)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <SummaryCard
                label="Total coletado"
                value={brl(summary.pspCash.collectedCents)}
                sub={`${summary.pspCash.paymentCount} pagamentos`}
                highlight
              />
              <SummaryCard
                label="Pendentes"
                value={brl(summary.pspCash.pendingCents)}
              />
              <SummaryCard
                label="Falhos"
                value={brl(summary.pspCash.failedCents)}
              />
              <SummaryCard
                label="Reembolsados"
                value={brl(summary.pspCash.refundedCents)}
              />
            </div>
          </section>

          {/* Platform Revenue */}
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
              Receita retida pela plataforma
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <SummaryCard
                label="Comissão bruta"
                value={brl(summary.platformRevenue.grossCommissionCents)}
              />
              <SummaryCard
                label="Taxa processador"
                value={brl(summary.platformRevenue.processorFeeTotalCents)}
              />
              <SummaryCard
                label="Receita líquida"
                value={brl(summary.platformRevenue.netRevenueCents)}
              />
              <SummaryCard
                label="Estornos (reembolsos)"
                value={brl(summary.platformRevenue.refundReversalCents)}
              />
              <SummaryCard
                label="Receita líquida ajustada"
                value={brl(summary.platformRevenue.adjustedNetRevenueCents)}
                highlight
              />
            </div>
          </section>

          {/* Seller Liabilities */}
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
              Passivo com vendedores (repasses)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <SummaryCard
                label="Pendente de repasse"
                value={brl(summary.sellerLiabilities.pendingPayableCents)}
                sub={`${summary.sellerLiabilities.pendingPayableCount} payables`}
              />
              <SummaryCard
                label="Em lote (aguardando)"
                value={brl(summary.sellerLiabilities.includedInBatchCents)}
              />
              <SummaryCard
                label="Pago"
                value={brl(summary.sellerLiabilities.paidPayableCents)}
                highlight
              />
              <SummaryCard
                label="Compensado (offset)"
                value={brl(summary.sellerLiabilities.offsetPayableCents)}
              />
            </div>
          </section>

          {/* Payouts */}
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
              Lotes de repasse
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <SummaryCard
                label="Total desembolsado"
                value={brl(summary.payouts.disbursedCents)}
                sub={`${summary.payouts.batchCount} lote(s)`}
                highlight
              />
              <SummaryCard
                label="Em andamento"
                value={brl(summary.payouts.pendingBatchCents)}
              />
              <SummaryCard
                label="Falhos"
                value={brl(summary.payouts.failedBatchCents)}
              />
            </div>
          </section>

          {/* Fiscal Documents */}
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
              Documentos fiscais
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <SummaryCard label="Emitidos" value={String(summary.fiscalDocuments.issuedCount)} highlight />
              <SummaryCard label="Pendentes" value={String(summary.fiscalDocuments.pendingCount)} />
              <SummaryCard label="Erros" value={String(summary.fiscalDocuments.errorCount)} />
              <SummaryCard label="Cancelados" value={String(summary.fiscalDocuments.cancelledCount)} />
            </div>
          </section>

          {/* All exceptions */}
          {summary.exceptions.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
                Exceções ({summary.exceptions.length})
              </h2>
              <div className="space-y-2">
                {summary.exceptions.map((exc) => (
                  <div
                    key={exc.type}
                    className={`rounded-lg px-4 py-3 flex items-start gap-3 ${SEVERITY_ROW_COLORS[exc.severity]}`}
                  >
                    {SEVERITY_ICONS[exc.severity]}
                    <div>
                      <p className="text-xs font-semibold text-gray-700">
                        {exc.type.replace(/_/g, ' ')} · {exc.count} ocorrência(s)
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">{exc.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
