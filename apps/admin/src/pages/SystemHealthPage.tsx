import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

interface CheckResult {
  status: 'ok' | 'error';
  latencyMs?: number;
  detail?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  timestamp: string;
  checks: Record<string, CheckResult>;
  uptime: number;
  nodeVersion: string;
  env: string;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function StatusBadge({ status }: { status: 'ok' | 'error' | 'degraded' | 'loading' }) {
  const configs = {
    ok:      { bg: 'bg-green-100 text-green-700',  label: 'OK' },
    degraded:{ bg: 'bg-yellow-100 text-yellow-700', label: 'Degradado' },
    error:   { bg: 'bg-red-100 text-red-700',     label: 'Erro' },
    loading: { bg: 'bg-gray-100 text-gray-500',   label: 'Verificando…' },
  };
  const { bg, label } = configs[status];
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${bg}`}>
      {label}
    </span>
  );
}

export default function SystemHealthPage() {
  const { getAccessToken } = useAuth();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/admin/health`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = (await res.json()) as HealthResponse;
      setHealth(data);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao buscar status de saúde');
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    void fetchHealth();
    const interval = setInterval(() => void fetchHealth(), 30_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Saúde do Sistema</h2>
          <p className="text-gray-500 text-sm mt-1">
            Status dos sub-sistemas críticos. Atualiza automaticamente a cada 30 s.
          </p>
        </div>
        <button
          onClick={() => void fetchHealth()}
          disabled={loading}
          className="text-sm bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
        >
          {loading ? 'Verificando…' : 'Atualizar'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4 mb-6">
          {error}
        </div>
      )}

      {/* Overall status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <p className="text-sm font-medium text-gray-500 mb-2">Status geral</p>
          <StatusBadge status={loading ? 'loading' : (health?.status ?? 'error')} />
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <p className="text-sm font-medium text-gray-500 mb-1">Uptime</p>
          <p className="text-xl font-bold text-gray-800">
            {health ? formatUptime(health.uptime) : '—'}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <p className="text-sm font-medium text-gray-500 mb-1">Ambiente</p>
          <p className="text-xl font-bold text-gray-800 capitalize">
            {health?.env ?? '—'}
          </p>
        </div>
      </div>

      {/* Sub-system checks */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">Verificações de sub-sistemas</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-6 py-3 text-left">Sub-sistema</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="px-6 py-3 text-left">Latência</th>
              <th className="px-6 py-3 text-left">Detalhe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {health
              ? Object.entries(health.checks).map(([name, check]) => (
                  <tr key={name}>
                    <td className="px-6 py-4 font-medium text-gray-800 capitalize">{name}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={check.status} />
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {check.latencyMs !== undefined ? `${check.latencyMs} ms` : '—'}
                    </td>
                    <td className="px-6 py-4 text-gray-500 truncate max-w-xs">
                      {check.detail ?? '—'}
                    </td>
                  </tr>
                ))
              : (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                    {loading ? 'Carregando…' : 'Sem dados'}
                  </td>
                </tr>
              )}
          </tbody>
        </table>
      </div>

      {lastRefreshed && (
        <p className="text-xs text-gray-400 text-right">
          Última atualização: {lastRefreshed.toLocaleTimeString('pt-BR')}
        </p>
      )}
    </div>
  );
}
