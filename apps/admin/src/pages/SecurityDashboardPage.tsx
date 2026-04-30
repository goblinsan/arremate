import { useState } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';
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

function AlertCard({
  label,
  count,
  status,
  description,
}: {
  label: string;
  count: number | string;
  status: SignalStatus;
  description: string;
}) {
  const countColor =
    status === 'ok' ? 'text-green-700' : status === 'warn' ? 'text-yellow-700' : 'text-red-600';

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <StatusBadge status={status} />
      </div>
      <p className={`text-3xl font-bold ${countColor}`}>{count}</p>
      <p className="text-xs text-gray-400 mt-1">{description}</p>
    </div>
  );
}

export default function SecurityDashboardPage() {
  const [windowHours, setWindowHours] = useState(24);
  const { summary, error, loading, refetch } = useReviewSummary(windowHours);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard de Segurança</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Falhas de autenticação, requisições suspeitas, falhas de webhook e tendências de alerta.
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

      {/* Overall security alert */}
      {!loading && summary && summary.security.status !== 'ok' && (
        <div
          className={`flex items-start gap-3 rounded-xl p-4 mb-6 border ${
            summary.security.status === 'critical'
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-yellow-50 border-yellow-200 text-yellow-800'
          }`}
        >
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">
              {summary.security.status === 'critical'
                ? 'Alerta crítico de segurança detectado'
                : 'Atenção: indicadores de segurança requerem revisão'}
            </p>
            <p className="text-xs mt-0.5 opacity-80">
              Verifique os detalhes abaixo e tome as medidas necessárias.
            </p>
          </div>
        </div>
      )}

      {/* Alert cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <AlertCard
          label="Falhas de autenticação"
          count={loading ? '—' : (summary?.security.authFailures.count ?? '—')}
          status={loading ? 'unknown' : (summary?.security.authFailures.status ?? 'unknown')}
          description="usuários suspensos na janela (indicador de falhas de autenticação)"
        />
        <AlertCard
          label="Requisições suspeitas"
          count={loading ? '—' : (summary?.security.suspiciousActivity.count ?? '—')}
          status={loading ? 'unknown' : (summary?.security.suspiciousActivity.status ?? 'unknown')}
          description="disputas abertas + casos de moderação"
        />
        <AlertCard
          label="Falhas de webhook"
          count={loading ? '—' : (summary?.security.webhookFailures.count ?? '—')}
          status={loading ? 'unknown' : (summary?.security.webhookFailures.status ?? 'unknown')}
          description="webhooks Pix com status inesperado"
        />
      </div>

      {/* Detail table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800">Resumo de alertas de segurança</h3>
          {summary && <StatusBadge status={summary.security.status} />}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-6 py-3 text-left">Indicador</th>
              <th className="px-6 py-3 text-left">Contagem</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="px-6 py-3 text-left">Limiar crítico</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {[
              {
                name: 'Falhas de autenticação',
                count: summary?.security.authFailures.count,
                status: summary?.security.authFailures.status,
                threshold: '> 3',
              },
              {
                name: 'Atividade suspeita',
                count: summary?.security.suspiciousActivity.count,
                status: summary?.security.suspiciousActivity.status,
                threshold: '> 5',
              },
              {
                name: 'Falhas de webhook',
                count: summary?.security.webhookFailures.count,
                status: summary?.security.webhookFailures.status,
                threshold: '> 3',
              },
            ].map((row) => (
              <tr key={row.name}>
                <td className="px-6 py-4 font-medium text-gray-800">{row.name}</td>
                <td className="px-6 py-4 text-gray-700">
                  {loading ? '—' : (row.count ?? '—')}
                </td>
                <td className="px-6 py-4">
                  {loading || !row.status ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    <StatusBadge status={row.status} />
                  )}
                </td>
                <td className="px-6 py-4 text-gray-500">{row.threshold}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {summary && (
        <p className="text-xs text-gray-400 text-right mt-6">
          Gerado em: {new Date(summary.generatedAt).toLocaleString('pt-BR')} · janela de {summary.windowHours} h
        </p>
      )}
    </div>
  );
}
