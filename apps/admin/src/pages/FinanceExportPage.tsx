import { useState } from 'react';
import { Download, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

type Dataset =
  | 'payments'
  | 'refunds'
  | 'payables'
  | 'payouts'
  | 'retained-fees'
  | 'fiscal-documents';

interface DatasetConfig {
  label: string;
  description: string;
  endpoint: string;
}

const DATASETS: Record<Dataset, DatasetConfig> = {
  payments: {
    label: 'Pagamentos',
    description: 'Todos os pagamentos PIX do período com status e dados do pedido.',
    endpoint: '/v1/admin/finance/export/payments',
  },
  refunds: {
    label: 'Reembolsos',
    description: 'Reembolsos emitidos no período com estorno de comissão e taxa de processamento.',
    endpoint: '/v1/admin/finance/export/refunds',
  },
  payables: {
    label: 'Repasses devidos (payables)',
    description: 'Saldos devidos a vendedores, com status do ciclo de vida (PENDING → PAID).',
    endpoint: '/v1/admin/finance/export/payables',
  },
  payouts: {
    label: 'Lotes de repasse',
    description: 'Lotes de desembolso gerados no período com totais e status.',
    endpoint: '/v1/admin/finance/export/payouts',
  },
  'retained-fees': {
    label: 'Taxas retidas (plataforma)',
    description: 'Comissão e taxa de processamento retidas pela plataforma, por pedido.',
    endpoint: '/v1/admin/finance/export/retained-fees',
  },
  'fiscal-documents': {
    label: 'Documentos fiscais',
    description: 'Status de NFS-e e NF-e do período, incluindo erros de emissão.',
    endpoint: '/v1/admin/finance/export/fiscal-documents',
  },
};

function toCsv(rows: Record<string, string>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]).join(';');
  const body = rows.map((r) => Object.values(r).map((v) => `"${v.replace(/"/g, '""')}"`).join(';'));
  return [headers, ...body].join('\n');
}

function downloadCsv(filename: string, rows: Record<string, string>[]) {
  const csv = toCsv(rows);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface ExportState {
  status: 'idle' | 'loading' | 'done' | 'error';
  count?: number;
  error?: string;
}

export default function FinanceExportPage() {
  const { getAccessToken } = useAuth();

  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [exportStates, setExportStates] = useState<Partial<Record<Dataset, ExportState>>>({});

  async function handleExport(dataset: Dataset) {
    setExportStates((prev) => ({ ...prev, [dataset]: { status: 'loading' } }));

    try {
      const token = getAccessToken();
      const { endpoint } = DATASETS[dataset];
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`${API_URL}${endpoint}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data: { count: number; rows: Record<string, string>[]; periodStart: string; periodEnd: string } =
        await res.json();

      const dateTag = `${from}_${to}`;
      downloadCsv(`${dataset}-${dateTag}.csv`, data.rows);

      setExportStates((prev) => ({ ...prev, [dataset]: { status: 'done', count: data.count } }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setExportStates((prev) => ({ ...prev, [dataset]: { status: 'error', error: message } }));
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Exportação financeira</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Gere arquivos CSV com dados de fechamento para o período selecionado.
        </p>
      </div>

      {/* Period picker */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Período</h2>
        <div className="flex flex-wrap gap-4 items-end">
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
      </div>

      {/* Dataset cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(Object.entries(DATASETS) as [Dataset, DatasetConfig][]).map(([key, cfg]) => {
          const state = exportStates[key];

          return (
            <div key={key} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">{cfg.label}</h3>
                <p className="text-xs text-gray-500 mt-1">{cfg.description}</p>
              </div>

              {state?.status === 'done' && (
                <p className="text-xs text-green-600">{state.count} registros exportados.</p>
              )}
              {state?.status === 'error' && (
                <p className="flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {state.error}
                </p>
              )}

              <button
                onClick={() => handleExport(key)}
                disabled={state?.status === 'loading'}
                className="mt-auto flex items-center justify-center gap-2 text-sm font-medium bg-brand-500 text-white px-4 py-2 rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-60"
              >
                <Download className="w-4 h-4" />
                {state?.status === 'loading' ? 'Exportando...' : 'Exportar CSV'}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-gray-400">
        Os arquivos CSV usam ponto-e-vírgula como separador e codificação UTF-8 com BOM para
        compatibilidade com o Microsoft Excel.
      </p>
    </div>
  );
}
