import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Info, CheckCircle, Clock, PackageCheck } from 'lucide-react';
import type { SellerPayoutStatement, PayableStatus } from '@arremate/types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

function brl(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const PAYABLE_STATUS_LABELS: Record<PayableStatus, string> = {
  PENDING: 'Aguardando repasse',
  INCLUDED_IN_BATCH: 'Em processamento',
  PAID: 'Pago',
  OFFSET: 'Compensado',
};

const PAYABLE_STATUS_COLORS: Record<PayableStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  INCLUDED_IN_BATCH: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
  OFFSET: 'bg-gray-100 text-gray-500',
};

export default function SellerPayoutStatementPage() {
  const { getAccessToken, isAuthenticated } = useAuth();
  const [statement, setStatement] = useState<SellerPayoutStatement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatement = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/seller/payout-statement`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data: SellerPayoutStatement = await res.json();
      setStatement(data);
    } catch {
      setError('Erro ao carregar extrato de repasses.');
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (isAuthenticated) fetchStatement();
  }, [isAuthenticated, fetchStatement]);

  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 mb-4">Voce precisa estar logado para ver seus repasses.</p>
        <Link to="/login" className="text-brand-500 font-medium hover:underline">Fazer login</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Extrato de repasses</h1>
        <p className="text-sm text-gray-500">
          Resumo dos seus valores a receber, em processamento e ja recebidos.
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Carregando...</div>
      ) : error ? (
        <div className="text-center py-16 text-red-600">{error}</div>
      ) : statement ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2">
                <Info className="w-4 h-4 text-gray-400" />
                <p className="text-xs text-gray-500">Estimado (sem payable)</p>
              </div>
              <p className="text-xl font-bold text-gray-500">{brl(statement.estimatedCents)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-yellow-500" />
                <p className="text-xs text-gray-500">A receber (pendente)</p>
              </div>
              <p className="text-xl font-bold text-yellow-600">{brl(statement.payableCents)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2">
                <PackageCheck className="w-4 h-4 text-blue-500" />
                <p className="text-xs text-gray-500">Em processamento</p>
              </div>
              <p className="text-xl font-bold text-blue-600">{brl(statement.inBatchCents)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <p className="text-xs text-gray-500">Liquidado</p>
              </div>
              <p className="text-xl font-bold text-green-700">{brl(statement.settledCents)}</p>
            </div>
          </div>

          {/* Payables list */}
          {statement.payables.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Repasses por pedido</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pedido</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {statement.payables.map((payable) => (
                      <tr key={payable.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <Link
                            to={`/seller/orders/${payable.orderId}`}
                            className="font-mono text-xs text-brand-600 hover:underline"
                          >
                            #{payable.orderId.slice(-8).toUpperCase()}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {new Date(payable.createdAt).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PAYABLE_STATUS_COLORS[payable.status]}`}>
                            {PAYABLE_STATUS_LABELS[payable.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-green-700">
                          {brl(payable.amountCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Settled ledger entries */}
          {statement.settledLedgerEntries.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Ajustes liquidados</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Descricao</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {statement.settledLedgerEntries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-700">{entry.description ?? 'Ajuste'}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {new Date(entry.createdAt).toLocaleDateString('pt-BR')}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold ${entry.amountCents >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {brl(entry.amountCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {statement.payables.length === 0 && statement.settledLedgerEntries.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <p>Nenhum repasse registrado ainda.</p>
              <p className="text-xs mt-2">Os repasses aparecem aqui apos o pagamento dos pedidos ser confirmado.</p>
            </div>
          )}

          <div className="flex items-start gap-2 text-xs text-gray-400 mt-4">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Valores estimados correspondem a pedidos pagos ainda nao formalizados como payable.
              Valores a receber e liquidados sao baseados nos registros financeiros oficiais da plataforma.
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}
