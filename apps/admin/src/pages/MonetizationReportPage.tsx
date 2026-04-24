import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Download, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { MonetizationReport } from '@arremate/types';

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

function exportCsv(report: MonetizationReport) {
  const rows = [
    ['Metrica', 'Valor'],
    ['Periodo Inicio', report.periodStart],
    ['Periodo Fim', report.periodEnd],
    ['Total de Pedidos', String(report.orderCount)],
    ['Pedidos com Snapshot de Taxa', String(report.ordersWithSnapshotCount)],
    ['GMV (R$)', (report.gmvCents / 100).toFixed(2)],
    ['Gasto Total Comprador (R$)', (report.totalBuyerSpendCents / 100).toFixed(2)],
    ['Comissao Bruta (R$)', (report.grossCommissionCents / 100).toFixed(2)],
    ['Taxas Processadora (R$)', (report.processorFeeTotalCents / 100).toFixed(2)],
    ['Subsidio de Frete (R$)', (report.shippingSubsidyCents / 100).toFixed(2)],
    ['Receita Liquida (R$)', (report.netRevenueCents / 100).toFixed(2)],
    ['Total Reembolsado (R$)', (report.refundAmountCents / 100).toFixed(2)],
    ['Comissao Revertida (R$)', (report.commissionReversedCents / 100).toFixed(2)],
    ['Comissao Ajustada (R$)', (report.adjustedCommissionCents / 100).toFixed(2)],
    ['Receita Liquida Ajustada (R$)', (report.adjustedNetRevenueCents / 100).toFixed(2)],
    ['Taxa de Captura Efetiva', bps(report.effectiveTakeRateBps)],
  ];

  const csv = rows.map((r) => r.join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `monetizacao-${toISODate(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function MonetizationReportPage() {
  const { getAccessToken } = useAuth();
  const [report, setReport] = useState<MonetizationReport | null>(null);
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

      const res = await fetch(`${API_URL}/v1/admin/analytics/monetization?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setReport(await res.json());
    } catch {
      setError('Erro ao carregar relatório de monetização.');
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
          <h1 className="text-xl font-bold text-gray-900">Relatório de Monetização</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            GMV, comissoes, receita liquida, taxa de captura e impacto de reembolsos.
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
            Periodo:{' '}
            <span className="font-medium text-gray-600">
              {new Date(report.periodStart).toLocaleDateString('pt-BR')} —{' '}
              {new Date(report.periodEnd).toLocaleDateString('pt-BR')}
            </span>
          </p>

          {/* Volume */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Volume</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Total de pedidos" value={String(report.orderCount)} />
              <StatCard label="Pedidos com taxa" value={String(report.ordersWithSnapshotCount)} />
              <StatCard label="GMV" value={brl(report.gmvCents)} color="text-brand-600" />
              <StatCard label="Gasto total comprador" value={brl(report.totalBuyerSpendCents)} />
            </div>
          </div>

          {/* Gross revenue */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Receita bruta</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard
                label="Comissao bruta"
                value={brl(report.grossCommissionCents)}
                color="text-green-700"
              />
              <StatCard
                label="Taxas processadora"
                value={brl(report.processorFeeTotalCents)}
                color="text-red-600"
              />
              <StatCard
                label="Frete (snapshot)"
                value={brl(report.shippingSubsidyCents)}
              />
              <StatCard
                label="Receita liquida"
                value={brl(report.netRevenueCents)}
                color={report.netRevenueCents >= 0 ? 'text-green-700' : 'text-red-600'}
                sub="comissao - taxa proc."
              />
            </div>
          </div>

          {/* Refund-adjusted */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Ajustado por reembolsos</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard
                label="Total reembolsado"
                value={brl(report.refundAmountCents)}
                color="text-red-600"
              />
              <StatCard
                label="Comissao revertida"
                value={brl(report.commissionReversedCents)}
                color="text-red-600"
              />
              <StatCard
                label="Comissao ajustada"
                value={brl(report.adjustedCommissionCents)}
                color="text-green-700"
              />
              <StatCard
                label="Receita liquida ajustada"
                value={brl(report.adjustedNetRevenueCents)}
                color={report.adjustedNetRevenueCents >= 0 ? 'text-green-700' : 'text-red-600'}
                sub="pos-reembolso"
              />
            </div>
          </div>

          {/* Take rate */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Taxa de captura efetiva</p>
                <p className="text-3xl font-extrabold text-brand-600">
                  {bps(report.effectiveTakeRateBps)}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  comissao ajustada / GMV (pedidos com snapshot de taxa)
                </p>
              </div>
              <div className="flex items-start gap-2 bg-brand-50 text-brand-700 text-xs rounded-lg p-3 max-w-xs">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Pedidos sem snapshot de taxa (legados) sao excluidos do calculo de GMV e taxas,
                  mas aparecem na contagem total.
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
