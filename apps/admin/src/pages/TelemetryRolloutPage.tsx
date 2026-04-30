import { useState } from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  useReviewSummary,
  statusBgText,
  statusLabel,
  WINDOW_OPTIONS,
  type SignalStatus,
} from '../lib/useReviewSummary';

function SignalIcon({ status }: { status: SignalStatus | 'loading' }) {
  if (status === 'loading') return <span className="w-5 h-5 rounded-full bg-gray-200 inline-block" />;
  if (status === 'ok')       return <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />;
  if (status === 'warn')     return <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0" />;
  if (status === 'critical') return <XCircle className="w-5 h-5 text-red-600 shrink-0" />;
  return <HelpCircle className="w-5 h-5 text-gray-400 shrink-0" />;
}

function StatusBadge({ status }: { status: SignalStatus }) {
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${statusBgText(status)}`}>
      {statusLabel(status)}
    </span>
  );
}

interface CheckItem {
  label: string;
  description: string;
  status: SignalStatus | 'loading';
  link?: string;
}

export default function TelemetryRolloutPage() {
  const [windowHours, setWindowHours] = useState(24);
  const { summary, error, loading, refetch } = useReviewSummary(windowHours);

  const checks: CheckItem[] = [
    // Engineering / Quality
    {
      label: 'Saúde de requisições',
      description: 'Pedidos pagos vs. total de pedidos na janela.',
      status: loading ? 'loading' : (summary?.quality.requestHealth.status ?? 'unknown'),
      link: '/telemetry/engineering',
    },
    {
      label: 'Latência de resolução',
      description: 'Tempo médio entre criação do pagamento e confirmação.',
      status: loading ? 'loading' : (summary?.quality.latencyStatus.status ?? 'unknown'),
      link: '/telemetry/engineering',
    },
    {
      label: 'Taxa de falha de pagamento',
      description: 'Proporção de pagamentos com falha no período.',
      status: loading ? 'loading' : (summary?.quality.paymentFailureRate.status ?? 'unknown'),
      link: '/telemetry/engineering',
    },
    // Business
    {
      label: 'Taxa de sucesso de lances',
      description: 'Claims confirmados / total de lances.',
      status: loading ? 'loading' : (summary?.quality.bidSuccessRate.status ?? 'unknown'),
      link: '/telemetry/business',
    },
    // Security
    {
      label: 'Falhas de autenticação',
      description: 'Usuários suspensos na janela (indicador de falhas de autenticação).',
      status: loading ? 'loading' : (summary?.security.authFailures.status ?? 'unknown'),
      link: '/telemetry/security',
    },
    {
      label: 'Atividade suspeita',
      description: 'Disputas abertas + casos de moderação na janela.',
      status: loading ? 'loading' : (summary?.security.suspiciousActivity.status ?? 'unknown'),
      link: '/telemetry/security',
    },
    {
      label: 'Falhas de webhook',
      description: 'Webhooks Pix com status inesperado na janela.',
      status: loading ? 'loading' : (summary?.security.webhookFailures.status ?? 'unknown'),
      link: '/telemetry/security',
    },
    // Budget
    {
      label: 'Pico de requisições',
      description: 'Multiplicador: volume na última hora / baseline por hora.',
      status: loading ? 'loading' : (summary?.budget.requestSurge.status ?? 'unknown'),
      link: '/telemetry/budget',
    },
    {
      label: 'Uso do banco de dados',
      description: 'Novos registros (pedidos + lances + pagamentos) na janela.',
      status: loading ? 'loading' : (summary?.budget.dbUsage.status ?? 'unknown'),
      link: '/telemetry/budget',
    },
  ];

  const okCount    = checks.filter((c) => c.status === 'ok').length;
  const warnCount  = checks.filter((c) => c.status === 'warn').length;
  const critCount  = checks.filter((c) => c.status === 'critical').length;
  const unknCount  = checks.filter((c) => c.status === 'unknown' || c.status === 'loading').length;
  const totalKnown = checks.filter((c) => c.status !== 'unknown' && c.status !== 'loading').length;
  const rolloutReady = !loading && critCount === 0 && warnCount === 0 && totalKnown === checks.length;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Checklist de Implantação de Telemetria</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Valide logs, métricas, alertas e dashboards antes de considerar o rollout completo.
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

      {/* Overall readiness banner */}
      {!loading && summary && (
        <div
          className={`flex items-center gap-3 rounded-xl p-4 mb-6 border ${
            rolloutReady
              ? 'bg-green-50 border-green-200 text-green-800'
              : summary.status === 'critical'
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-yellow-50 border-yellow-200 text-yellow-800'
          }`}
        >
          <SignalIcon status={rolloutReady ? 'ok' : summary.status} />
          <div>
            <p className="font-semibold text-sm">
              {rolloutReady
                ? 'Rollout pronto — todos os sinais estão OK'
                : summary.status === 'critical'
                ? 'Rollout bloqueado — sinais críticos detectados'
                : 'Rollout com ressalvas — sinais de atenção detectados'}
            </p>
            <p className="text-xs mt-0.5 opacity-80">
              {okCount} OK · {warnCount} atenção · {critCount} crítico · {unknCount} desconhecido
            </p>
          </div>
          <div className="ml-auto">
            <StatusBadge status={summary.status} />
          </div>
        </div>
      )}

      {/* Summary counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'OK', count: okCount, color: 'text-green-700', bg: 'bg-green-50' },
          { label: 'Atenção', count: warnCount, color: 'text-yellow-700', bg: 'bg-yellow-50' },
          { label: 'Crítico', count: critCount, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Desconhecido', count: unknCount, color: 'text-gray-500', bg: 'bg-gray-50' },
        ].map(({ label, count, color, bg }) => (
          <div key={label} className={`rounded-2xl p-5 shadow-sm border border-gray-100 ${bg}`}>
            <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
            <p className={`text-3xl font-bold ${color}`}>{loading ? '—' : count}</p>
            <p className="text-xs text-gray-400 mt-1">de {checks.length} verificações</p>
          </div>
        ))}
      </div>

      {/* Checklist */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">Verificações do rollout</h3>
        </div>
        <ul className="divide-y divide-gray-50">
          {checks.map((check) => (
            <li key={check.label} className="px-6 py-4 flex items-start gap-4">
              <SignalIcon status={check.status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-gray-800">{check.label}</p>
                  {check.status !== 'loading' && <StatusBadge status={check.status} />}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{check.description}</p>
              </div>
              {check.link && (
                <Link
                  to={check.link}
                  className="text-xs text-brand-600 hover:text-brand-700 whitespace-nowrap font-medium transition-colors shrink-0"
                >
                  Ver dashboard →
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Dashboard links */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-base font-semibold text-gray-800 mb-4">Dashboards disponíveis</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { to: '/telemetry/engineering', label: 'Engenharia',  sub: 'Latência, erros, volume' },
            { to: '/telemetry/business',    label: 'Negócios',    sub: 'Lances, pagamentos' },
            { to: '/telemetry/security',    label: 'Segurança',   sub: 'Auth, webhooks' },
            { to: '/telemetry/budget',      label: 'Orçamento',   sub: 'Picos, uso de DB' },
          ].map(({ to, label, sub }) => (
            <Link
              key={to}
              to={to}
              className="block rounded-xl border border-gray-100 p-4 hover:border-brand-300 hover:bg-brand-50 transition-colors"
            >
              <p className="text-sm font-semibold text-gray-800">{label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
            </Link>
          ))}
        </div>
      </div>

      {summary && (
        <p className="text-xs text-gray-400 text-right mt-6">
          Gerado em: {new Date(summary.generatedAt).toLocaleString('pt-BR')} · janela de {summary.windowHours} h ·{' '}
          Endpoint: GET /v1/admin/telemetry/review-summary
        </p>
      )}
    </div>
  );
}
