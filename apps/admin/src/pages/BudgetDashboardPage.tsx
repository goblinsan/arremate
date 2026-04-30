import { useState } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
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

export default function BudgetDashboardPage() {
  const [windowHours, setWindowHours] = useState(24);
  const { summary, error, loading, refetch } = useReviewSummary(windowHours);

  const surgeMultiplier = summary?.budget.requestSurge.surgeMultiplier;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard de Orçamento</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Contagem de requisições, tendências de uso, utilização do banco de dados e indicadores de alerta de orçamento.
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

      {/* Surge alert */}
      {!loading && summary && summary.budget.status !== 'ok' && (
        <div
          className={`flex items-start gap-3 rounded-xl p-4 mb-6 border ${
            summary.budget.status === 'critical'
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-yellow-50 border-yellow-200 text-yellow-800'
          }`}
        >
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">
              {summary.budget.status === 'critical'
                ? 'Alerta crítico: pico de uso anômalo detectado'
                : 'Atenção: uso acima do baseline'}
            </p>
            <p className="text-xs mt-0.5 opacity-80">
              Verifique o multiplicador de pico e o volume de DB abaixo.
            </p>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Pedidos na última 1 h"
          value={loading ? '—' : String(summary?.budget.requestSurge.recentCount ?? '—')}
          sub="volume recente de requisições"
        />
        <MetricCard
          label="Baseline por hora"
          value={
            loading
              ? '—'
              : summary?.budget.requestSurge.baselinePerHour != null
              ? summary.budget.requestSurge.baselinePerHour.toFixed(1)
              : '—'
          }
          sub={`média na janela de ${windowHours} h`}
        />
        <MetricCard
          label="Multiplicador de pico"
          value={
            loading
              ? '—'
              : surgeMultiplier != null
              ? `${surgeMultiplier.toFixed(2)}×`
              : '—'
          }
          sub="recente ÷ baseline por hora"
          status={loading ? undefined : (summary?.budget.requestSurge.status ?? 'unknown')}
          color={
            !loading && surgeMultiplier != null
              ? surgeMultiplier >= 5 ? 'text-red-600' : surgeMultiplier >= 2 ? 'text-yellow-700' : 'text-green-700'
              : 'text-gray-900'
          }
        />
        <MetricCard
          label="Registros de DB na janela"
          value={loading ? '—' : String(summary?.budget.dbUsage.recentCount ?? '—')}
          sub="pedidos + lances + pagamentos"
          status={loading ? undefined : (summary?.budget.dbUsage.status ?? 'unknown')}
        />
      </div>

      {/* Detail sections */}
      <div className="space-y-6">
        {/* Request surge */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-800">Análise de pico de requisições</h3>
            {summary && <StatusBadge status={summary.budget.requestSurge.status} />}
          </div>
          <div className="px-6 py-5 grid grid-cols-2 sm:grid-cols-4 gap-6 text-sm">
            <div>
              <p className="text-gray-500 mb-1">Volume recente (1 h)</p>
              <p className="text-2xl font-bold text-gray-900">
                {summary?.budget.requestSurge.recentCount ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Baseline / hora</p>
              <p className="text-2xl font-bold text-gray-900">
                {summary?.budget.requestSurge.baselinePerHour != null
                  ? summary.budget.requestSurge.baselinePerHour.toFixed(1)
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Multiplicador</p>
              <p className="text-2xl font-bold text-gray-900">
                {surgeMultiplier != null ? `${surgeMultiplier.toFixed(2)}×` : '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Limiares</p>
              <p className="text-sm text-green-700 font-medium">OK &lt; 2×</p>
              <p className="text-sm text-yellow-700 font-medium">Atenção 2–5×</p>
              <p className="text-sm text-red-600 font-medium">Crítico &gt; 5×</p>
            </div>
          </div>
        </div>

        {/* DB usage */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-800">Utilização do banco de dados</h3>
            {summary && <StatusBadge status={summary.budget.dbUsage.status} />}
          </div>
          <div className="px-6 py-5 grid grid-cols-2 sm:grid-cols-3 gap-6 text-sm">
            <div>
              <p className="text-gray-500 mb-1">Novos registros na janela</p>
              <p className="text-2xl font-bold text-gray-900">
                {summary?.budget.dbUsage.recentCount ?? '—'}
              </p>
              <p className="text-xs text-gray-400 mt-1">pedidos + lances + pagamentos</p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Limiar de atenção</p>
              <p className="text-lg font-semibold text-yellow-700">≥ 1.000</p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Limiar crítico</p>
              <p className="text-lg font-semibold text-red-600">≥ 10.000</p>
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
