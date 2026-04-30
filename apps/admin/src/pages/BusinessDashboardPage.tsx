import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  useReviewSummary,
  statusBgText,
  statusLabel,
  WINDOW_OPTIONS,
  type SignalStatus,
} from '../lib/useReviewSummary';

function StatusBadge({ status }: { status: SignalStatus }) {
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
  color = 'text-gray-900',
}: {
  label: string;
  value: string;
  sub?: string;
  status?: SignalStatus;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        {status && <StatusBadge status={status} />}
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function pct(rate: number | null): string {
  if (rate === null) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

export default function BusinessDashboardPage() {
  const [windowHours, setWindowHours] = useState(24);
  const { summary, error, loading, refetch } = useReviewSummary(windowHours);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard de Negócios</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Lances, falhas de lance, resultados de pagamento, claims e telemetria de conversão.
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
          label="Total de lances"
          value={loading ? '—' : String(summary?.quality.bidSuccessRate.totalBids ?? '—')}
          sub={`na janela de ${windowHours} h`}
        />
        <MetricCard
          label="Claims confirmados"
          value={loading ? '—' : String(summary?.quality.bidSuccessRate.confirmedClaims ?? '—')}
          sub="lotes arrematados"
          color="text-green-700"
        />
        <MetricCard
          label="Taxa de sucesso de lances"
          value={loading ? '—' : pct(summary?.quality.bidSuccessRate.rate ?? null)}
          sub="claims confirmados / lances totais"
          status={loading ? undefined : (summary?.quality.bidSuccessRate.status ?? 'unknown')}
        />
        <MetricCard
          label="Conversão de pedidos"
          value={loading ? '—' : pct(summary?.quality.requestHealth.rate ?? null)}
          sub="pedidos pagos / pedidos totais"
          status={loading ? undefined : (summary?.quality.requestHealth.status ?? 'unknown')}
        />
      </div>

      {/* Bid volume & success */}
      <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-800">Volume e taxa de sucesso de lances</h3>
            {summary && <StatusBadge status={summary.quality.bidSuccessRate.status} />}
          </div>
          <div className="px-6 py-5 grid grid-cols-2 sm:grid-cols-3 gap-6 text-sm">
            <div>
              <p className="text-gray-500 mb-1">Total de lances</p>
              <p className="text-2xl font-bold text-gray-900">
                {summary?.quality.bidSuccessRate.totalBids ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Claims confirmados</p>
              <p className="text-2xl font-bold text-green-700">
                {summary?.quality.bidSuccessRate.confirmedClaims ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Taxa de conversão</p>
              <p className="text-2xl font-bold text-gray-900">
                {pct(summary?.quality.bidSuccessRate.rate ?? null)}
              </p>
              <p className="text-xs text-gray-400 mt-1">ok ≥ 50 %, atenção 20–50 %</p>
            </div>
          </div>
        </div>

        {/* Payment outcomes */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-800">Resultados de pagamento</h3>
            {summary && <StatusBadge status={summary.quality.paymentFailureRate.status} />}
          </div>
          <div className="px-6 py-5 grid grid-cols-2 sm:grid-cols-4 gap-6 text-sm">
            <div>
              <p className="text-gray-500 mb-1">Total de pagamentos</p>
              <p className="text-2xl font-bold text-gray-900">
                {summary?.quality.paymentFailureRate.totalPayments ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Pagamentos com falha</p>
              <p className="text-2xl font-bold text-red-600">
                {summary?.quality.paymentFailureRate.failedPayments ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Taxa de falha</p>
              <p className="text-2xl font-bold text-gray-900">
                {pct(summary?.quality.paymentFailureRate.rate ?? null)}
              </p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Pagamentos bem-sucedidos</p>
              <p className="text-2xl font-bold text-green-700">
                {summary
                  ? summary.quality.paymentFailureRate.totalPayments -
                    summary.quality.paymentFailureRate.failedPayments
                  : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Order conversion */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-800">Conversão de pedidos</h3>
            {summary && <StatusBadge status={summary.quality.requestHealth.status} />}
          </div>
          <div className="px-6 py-5 grid grid-cols-2 sm:grid-cols-3 gap-6 text-sm">
            <div>
              <p className="text-gray-500 mb-1">Pedidos totais</p>
              <p className="text-2xl font-bold text-gray-900">
                {summary?.quality.requestHealth.totalOrders ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Pedidos pagos</p>
              <p className="text-2xl font-bold text-green-700">
                {summary?.quality.requestHealth.paidOrders ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Taxa de conversão</p>
              <p className="text-2xl font-bold text-gray-900">
                {pct(summary?.quality.requestHealth.rate ?? null)}
              </p>
              <p className="text-xs text-gray-400 mt-1">ok ≥ 80 %, atenção 50–80 %</p>
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
