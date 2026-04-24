import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Download, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { IncentiveReport } from '@arremate/types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

function brl(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function bps(value: number) {
  return `${(value / 100).toFixed(2)}%`;
}

function StatCard({
  label,
  value,
  sub,
  color = 'text-gray-900',
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

const PERIOD_OPTIONS = [
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
];

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function exportCsv(report: IncentiveReport) {
  const summaryRows = [
    ['Metrica', 'Valor'],
    ['Período Inicio', report.periodStart],
    ['Período Fim', report.periodEnd],
    ['Pedidos com Taxa Personalizada', String(report.overrideOrderCount)],
    ['GMV com Taxa Personalizada (R$)', (report.overrideGmvCents / 100).toFixed(2)],
    ['Comissão Real Taxa Personalizada (R$)', (report.overrideActualCommissionCents / 100).toFixed(2)],
    ['Comissão Padrao Equivalente (R$)', (report.overrideStandardCommissionCents / 100).toFixed(2)],
    ['Comissão Renunciada por Overrides (R$)', (report.commissionWaivedByOverridesCents / 100).toFixed(2)],
    ['Pedidos com Promoção', String(report.promotionOrderCount)],
    ['GMV com Promoção (R$)', (report.promotionGmvCents / 100).toFixed(2)],
    ['Comissão Renunciada por Promoções (R$)', (report.commissionWaivedByPromotionsCents / 100).toFixed(2)],
    ['Total Incentivos Renunciados (R$)', (report.totalIncentiveWaivedCents / 100).toFixed(2)],
    [],
    ['Código Promoção', 'Usos', 'GMV (R$)', 'Comissão Renunciada (R$)'],
    ...report.topPromotions.map((p) => [
      p.code,
      String(p.usageCount),
      (p.gmvCents / 100).toFixed(2),
      (p.commissionWaivedCents / 100).toFixed(2),
    ]),
  ];

  const csv = summaryRows.map((r) => r.join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `incentivos-${toISODate(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function IncentiveReportPage() {
  const { getAccessToken } = useAuth();
  const [report, setReport] = useState<IncentiveReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState(30);

  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const to = new Date();
      const from = new Date(to);
      from.setDate(from.getDate() - periodDays);

      const params = new URLSearchParams({
        from: toISODate(from),
        to: toISODate(to),
      });

      const res = await fetch(`${API_URL}/v1/admin/analytics/incentives?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setReport(await res.json());
    } catch {
      setError('Erro ao carregar relatório de incentivos.');
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken, periodDays]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Impacto de Incentivos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Análise de comissões renunciadas por taxas personalizadas e promoções.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map(({ label, days }) => (
              <button
                key={days}
                onClick={() => setPeriodDays(days)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  periodDays === days
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={fetchReport}
            className="flex items-center gap-1.5 text-sm text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </button>
          {report && (
            <button
              onClick={() => exportCsv(report)}
              className="flex items-center gap-1.5 text-sm text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Exportar CSV
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Carregando...</div>
      ) : error ? (
        <div className="text-center py-16 text-red-600">{error}</div>
      ) : report ? (
        <div className="space-y-6">
          {/* Period label */}
          <p className="text-xs text-gray-400">
            Período:{' '}
            <span className="font-medium text-gray-600">
              {new Date(report.periodStart).toLocaleDateString('pt-BR')} —{' '}
              {new Date(report.periodEnd).toLocaleDateString('pt-BR')}
            </span>
          </p>

          {/* Total waived */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Total de incentivos renunciados</p>
                <p className="text-3xl font-extrabold text-red-600">
                  {brl(report.totalIncentiveWaivedCents)}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  soma de overrides de vendedor e promoções no período
                </p>
              </div>
              <div className="flex items-start gap-2 bg-yellow-50 text-yellow-700 text-xs rounded-lg p-3 max-w-xs">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Overrides refletem a diferença entre a taxa padrão da configuração e a taxa
                  negociada. Promoções usam o desconto em bps registrado no pedido.
                </span>
              </div>
            </div>
          </div>

          {/* Seller overrides */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Taxas personalizadas (overrides)</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Pedidos afetados" value={String(report.overrideOrderCount)} />
              <StatCard label="GMV afetado" value={brl(report.overrideGmvCents)} />
              <StatCard
                label="Comissão real cobrada"
                value={brl(report.overrideActualCommissionCents)}
              />
              <StatCard
                label="Comissão padrão equivalente"
                value={brl(report.overrideStandardCommissionCents)}
                sub="a taxa padrão do config"
              />
            </div>
            {report.overrideOrderCount > 0 && (
              <div className="mt-3 bg-white rounded-lg border border-gray-100 shadow-sm p-4 flex items-center justify-between">
                <span className="text-sm text-gray-600">Comissão renunciada por overrides</span>
                <span className="text-lg font-bold text-red-600">
                  {brl(report.commissionWaivedByOverridesCents)}
                </span>
              </div>
            )}
          </div>

          {/* Promotions */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Promoções</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
              <StatCard label="Pedidos com promoção" value={String(report.promotionOrderCount)} />
              <StatCard label="GMV com promoção" value={brl(report.promotionGmvCents)} />
              <StatCard
                label="Comissão renunciada"
                value={brl(report.commissionWaivedByPromotionsCents)}
                color="text-red-600"
              />
            </div>

            {report.topPromotions.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Códigos de promoção utilizados
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Código</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Usos</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">GMV</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Comissão renunciada</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">% do total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {report.topPromotions.map((promo) => {
                        const pct =
                          report.commissionWaivedByPromotionsCents > 0
                            ? (
                                (promo.commissionWaivedCents /
                                  report.commissionWaivedByPromotionsCents) *
                                100
                              ).toFixed(1)
                            : '0.0';
                        return (
                          <tr key={promo.code} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs font-medium text-brand-600">
                              {promo.code}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-700">{promo.usageCount}</td>
                            <td className="px-4 py-3 text-right text-gray-700">
                              {brl(promo.gmvCents)}
                            </td>
                            <td className="px-4 py-3 text-right text-red-600 font-medium">
                              {brl(promo.commissionWaivedCents)}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-500 text-xs">
                              {pct}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-400 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  Códigos ordenados por comissão renunciada (maior primeiro).
                  O desconto e calculado a partir do campo{' '}
                  <span className="font-mono">promotionDiscountBps</span> registrado no pedido.
                </div>
              </div>
            )}

            {report.promotionOrderCount === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">
                Nenhum pedido com código de promoção no período.
              </div>
            )}
          </div>

          {/* Effective rate breakdown note */}
          {report.overrideOrderCount === 0 && report.promotionOrderCount === 0 && (
            <div className="bg-green-50 border border-green-100 rounded-lg p-4 flex items-center gap-3">
              <Info className="w-4 h-4 text-green-600 shrink-0" />
              <p className="text-sm text-green-700">
                Nenhum incentivo aplicado no período. Todos os pedidos usaram a taxa padrão da configuração vigente.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
