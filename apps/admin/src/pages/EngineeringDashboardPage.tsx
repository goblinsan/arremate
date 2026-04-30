import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  useReviewSummary,
  statusBgText,
  statusLabel,
  WINDOW_OPTIONS,
  type SignalStatus,
} from '../lib/useReviewSummary';

function StatusBadge({ status }: { status: SignalStatus | 'loading' }) {
  if (status === 'loading') {
    return (
      <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
        Verificando…
      </span>
    );
  }
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${statusBgText(status)}`}>
      {statusLabel(status)}
    </span>
  );
}

function MetricCard({
  label,
  value,
  sub,
  status,
}: {
  label: string;
  value: string;
  sub?: string;
  status?: SignalStatus;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        {status && <StatusBadge status={status} />}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function pct(rate: number | null): string {
  if (rate === null) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

function ms(value: number | null): string {
  if (value === null) return '—';
  if (value < 1_000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1_000).toFixed(1)} s`;
  return `${(value / 60_000).toFixed(1)} min`;
}

export default function EngineeringDashboardPage() {
  const [windowHours, setWindowHours] = useState(24);
  const { summary, error, loading, refetch } = useReviewSummary(windowHours);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard de Engenharia</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Latência, volume de requisições, erros e saúde das rotas.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            {WINDOW_OPTIONS.map(({ label, hours }) => (
              <button
                key={hours}
                onClick={() => setWindowHours(hours)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  windowHours === hours
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => void refetch()}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {loading ? 'Carregando…' : 'Atualizar'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4 mb-6">
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Status geral (qualidade)"
          value={loading ? '—' : statusLabel(summary?.quality.status ?? 'unknown')}
          sub="visão agregada das métricas de qualidade"
          status={loading ? undefined : (summary?.quality.status ?? 'unknown')}
        />
        <MetricCard
          label="Latência média de resolução"
          value={loading ? '—' : ms(summary?.quality.latencyStatus.avgResolutionMs ?? null)}
          sub="da criação do pagamento à confirmação"
          status={loading ? undefined : (summary?.quality.latencyStatus.status ?? 'unknown')}
        />
        <MetricCard
          label="Taxa de erro de pagamento"
          value={loading ? '—' : pct(summary?.quality.paymentFailureRate.rate ?? null)}
          sub={
            loading
              ? undefined
              : `${summary?.quality.paymentFailureRate.failedPayments ?? 0} falhas / ${summary?.quality.paymentFailureRate.totalPayments ?? 0} total`
          }
          status={loading ? undefined : (summary?.quality.paymentFailureRate.status ?? 'unknown')}
        />
        <MetricCard
          label="Total de pedidos na janela"
          value={loading ? '—' : String(summary?.quality.requestHealth.totalOrders ?? '—')}
          sub={`janela de ${windowHours} h`}
          status={loading ? undefined : (summary?.quality.requestHealth.status ?? 'unknown')}
        />
      </div>

      {/* Detail tables */}
      <div className="space-y-6">
        {/* Request health */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-800">Saúde das requisições (pedidos pagos)</h3>
            {summary && <StatusBadge status={summary.quality.requestHealth.status} />}
          </div>
          <div className="px-6 py-5 grid grid-cols-2 sm:grid-cols-3 gap-6 text-sm">
            <div>
              <p className="text-gray-500 mb-1">Pedidos pagos</p>
              <p className="text-2xl font-bold text-green-700">
                {summary?.quality.requestHealth.paidOrders ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Total de pedidos</p>
              <p className="text-2xl font-bold text-gray-900">
                {summary?.quality.requestHealth.totalOrders ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Taxa de pagamento</p>
              <p className="text-2xl font-bold text-gray-900">
                {pct(summary?.quality.requestHealth.rate ?? null)}
              </p>
              <p className="text-xs text-gray-400 mt-1">ok ≥ 80 %, atenção 50–80 %</p>
            </div>
          </div>
        </div>

        {/* Latency */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-800">Latência de resolução de pagamento</h3>
            {summary && <StatusBadge status={summary.quality.latencyStatus.status} />}
          </div>
          <div className="px-6 py-5 grid grid-cols-2 sm:grid-cols-3 gap-6 text-sm">
            <div>
              <p className="text-gray-500 mb-1">Média</p>
              <p className="text-2xl font-bold text-gray-900">
                {ms(summary?.quality.latencyStatus.avgResolutionMs ?? null)}
              </p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Limiar OK</p>
              <p className="text-lg font-semibold text-green-700">&lt; 30 s</p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Limiar Crítico</p>
              <p className="text-lg font-semibold text-red-600">&gt; 5 min</p>
            </div>
          </div>
        </div>

        {/* Payment failures */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-800">Taxa de falhas de pagamento</h3>
            {summary && <StatusBadge status={summary.quality.paymentFailureRate.status} />}
          </div>
          <div className="px-6 py-5 grid grid-cols-2 sm:grid-cols-4 gap-6 text-sm">
            <div>
              <p className="text-gray-500 mb-1">Pagamentos com falha</p>
              <p className="text-2xl font-bold text-red-600">
                {summary?.quality.paymentFailureRate.failedPayments ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Total de pagamentos</p>
              <p className="text-2xl font-bold text-gray-900">
                {summary?.quality.paymentFailureRate.totalPayments ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Taxa de falha</p>
              <p className="text-2xl font-bold text-gray-900">
                {pct(summary?.quality.paymentFailureRate.rate ?? null)}
              </p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Limiar crítico</p>
              <p className="text-lg font-semibold text-red-600">≥ 20 %</p>
            </div>
          </div>
        </div>
      </div>

      {summary && (
        <p className="text-xs text-gray-400 text-right mt-6">
          Gerado em: {new Date(summary.generatedAt).toLocaleString('pt-BR')} · janela de {summary.windowHours} h
        </p>
      )}
    </div>
  );
}
