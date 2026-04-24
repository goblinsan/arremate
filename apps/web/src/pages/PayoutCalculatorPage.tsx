import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { SellerFeeInfo } from '@arremate/types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

function brl(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function bps(value: number) {
  return `${(value / 100).toFixed(2)}%`;
}

function bpsToAmount(cents: number, rate: number): number {
  return Math.round((cents * rate) / 10_000);
}

interface FeeBreakdown {
  subtotalCents: number;
  commissionBps: number;
  commissionCents: number;
  processorFeeBps: number;
  processorFeeCents: number;
  shippingCents: number;
  totalBuyerCents: number;
  sellerPayoutCents: number;
}

function computeBreakdown(feeInfo: SellerFeeInfo, subtotalCents: number): FeeBreakdown {
  const commissionCents = bpsToAmount(subtotalCents, feeInfo.commissionBps);
  const processorFeeCents = bpsToAmount(subtotalCents, feeInfo.processorFeeBps);
  const shippingCents = feeInfo.shippingModel === 'FIXED' ? feeInfo.shippingFixedCents : 0;
  const totalBuyerCents = subtotalCents + shippingCents;
  const sellerPayoutCents = subtotalCents - commissionCents - processorFeeCents;

  return {
    subtotalCents,
    commissionBps: feeInfo.commissionBps,
    commissionCents,
    processorFeeBps: feeInfo.processorFeeBps,
    processorFeeCents,
    shippingCents,
    totalBuyerCents,
    sellerPayoutCents,
  };
}

function BreakdownRow({
  label,
  value,
  sub,
  bold,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  bold?: boolean;
  color?: string;
}) {
  return (
    <div className={`flex items-start justify-between py-3 border-b border-gray-100 last:border-0 ${bold ? 'font-semibold' : ''}`}>
      <div>
        <p className={`text-sm ${bold ? 'text-gray-900' : 'text-gray-600'}`}>{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <span className={`text-sm font-medium ${color ?? 'text-gray-800'}`}>{value}</span>
    </div>
  );
}

export default function PayoutCalculatorPage() {
  const { getAccessToken, isAuthenticated } = useAuth();
  const [feeInfo, setFeeInfo] = useState<SellerFeeInfo | null>(null);
  const [feeError, setFeeError] = useState<string | null>(null);
  const [rawInput, setRawInput] = useState('');
  const [breakdown, setBreakdown] = useState<FeeBreakdown | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    const token = getAccessToken();
    fetch(`${API_URL}/v1/seller/fee-info`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: SellerFeeInfo) => setFeeInfo(data))
      .catch(() => setFeeError('Não foi possível carregar as taxas vigentes.'));
  }, [isAuthenticated, getAccessToken]);

  function handleCalculate() {
    if (!feeInfo) return;
    const parsed = parseFloat(rawInput.replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) return;
    const subtotalCents = Math.round(parsed * 100);
    setBreakdown(computeBreakdown(feeInfo, subtotalCents));
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 mb-4">Você precisa estar logado para usar a calculadora.</p>
        <Link to="/login" className="text-brand-500 font-medium hover:underline">
          Fazer login
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Calculadora de Repasse</h1>
        <p className="text-sm text-gray-500">
          Simule o valor que você receberá para qualquer preço de venda com base nas taxas vigentes.
        </p>
      </div>

      {/* Current fee info */}
      {feeInfo && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Taxas vigentes</h2>
            {feeInfo.label && (
              <span className="text-xs bg-brand-50 text-brand-600 font-medium px-2 py-0.5 rounded-full">
                {feeInfo.label}
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">Comissão</p>
              <p className="text-xl font-bold text-gray-900">{bps(feeInfo.commissionBps)}</p>
            </div>
            <div className="text-center border-x border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Taxa processadora</p>
              <p className="text-xl font-bold text-gray-900">{bps(feeInfo.processorFeeBps)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">Frete</p>
              <p className="text-xl font-bold text-gray-900">
                {feeInfo.shippingModel === 'FIXED'
                  ? brl(feeInfo.shippingFixedCents)
                  : feeInfo.shippingModel === 'INCLUDED'
                  ? 'Incluso'
                  : 'Repassado'}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
            <Info className="w-3.5 h-3.5 shrink-0" />
            Vigente desde {new Date(feeInfo.effectiveFrom).toLocaleDateString('pt-BR')}
            {feeInfo.effectiveTo && ` até ${new Date(feeInfo.effectiveTo).toLocaleDateString('pt-BR')}`}.
            Taxas personalizadas negociadas com a plataforma podem ser diferentes.
          </p>
        </div>
      )}

      {feeError && (
        <div className="bg-red-50 text-red-600 rounded-lg p-4 mb-6 text-sm">{feeError}</div>
      )}

      {/* Calculator input */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Preço de venda</h2>
        <div className="flex gap-3 items-start">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">
              R$
            </span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCalculate()}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={handleCalculate}
            disabled={!feeInfo || !rawInput}
            className="bg-brand-500 hover:bg-orange-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Calcular
          </button>
        </div>
      </div>

      {/* Breakdown */}
      {breakdown && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
            <p className="text-sm font-semibold text-gray-700">Detalhamento para {brl(breakdown.subtotalCents)}</p>
          </div>
          <div className="px-5">
            <BreakdownRow
              label="Valor do produto"
              value={brl(breakdown.subtotalCents)}
            />
            <BreakdownRow
              label="Comissão da plataforma"
              sub={`${bps(breakdown.commissionBps)} sobre o valor do produto`}
              value={`- ${brl(breakdown.commissionCents)}`}
              color="text-red-600"
            />
            <BreakdownRow
              label="Taxa da processadora"
              sub={`${bps(breakdown.processorFeeBps)} sobre o valor do produto`}
              value={`- ${brl(breakdown.processorFeeCents)}`}
              color="text-red-600"
            />
            {breakdown.shippingCents > 0 && (
              <BreakdownRow
                label="Frete (pago pelo comprador)"
                sub="não afeta seu repasse"
                value={`+ ${brl(breakdown.shippingCents)}`}
                color="text-gray-500"
              />
            )}
            <div className="flex items-start justify-between py-4 bg-green-50 -mx-5 px-5 mt-1 rounded-b-xl">
              <div>
                <p className="text-sm font-bold text-gray-900">Seu repasse estimado</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {bps(breakdown.commissionBps + breakdown.processorFeeBps)} retidos pela plataforma
                </p>
              </div>
              <p className="text-2xl font-extrabold text-green-700">{brl(breakdown.sellerPayoutCents)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Educational content */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Como funcionam as taxas</h2>
        <div className="space-y-4 text-sm text-gray-600">
          <div className="flex gap-3">
            <div className="w-5 h-5 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
              1
            </div>
            <div>
              <p className="font-medium text-gray-800 mb-1">Comissão da plataforma</p>
              <p>
                A comissão e aplicada sobre o valor do produto. Ela cobre os custos operacionais,
                tecnologia e suporte da plataforma Arremate.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-5 h-5 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
              2
            </div>
            <div>
              <p className="font-medium text-gray-800 mb-1">Taxa da processadora de pagamento</p>
              <p>
                Cobrada pelo provedor de pagamento (PIX) para processar cada transação. Não é
                retida pela Arremate.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-5 h-5 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
              3
            </div>
            <div>
              <p className="font-medium text-gray-800 mb-1">Frete</p>
              <p>
                O modelo de frete varia conforme a configuração vigente. No modelo incluso,
                o frete e absorvido no preço do produto. No modelo fixo, e cobrado separadamente
                do comprador.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-5 h-5 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
              4
            </div>
            <div>
              <p className="font-medium text-gray-800 mb-1">Taxas personalizadas</p>
              <p>
                Vendedores com volume elevado ou parcerias estrategicas podem ter taxas
                negociadas diferentes das exibidas aqui. Consulte seu gerente de conta para
                mais detalhes.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-gray-100 flex items-start gap-2 text-xs text-gray-400">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p>
            Os valores calculados sao estimativas com base nas taxas vigentes no momento da
            consulta. O repasse real será calculado com as taxas em vigor no momento da venda e
            pode diferir caso uma promocao ou taxa personalizada esteja ativa.
            Consulte seu extrato de repasses para valores definitivos.
          </p>
        </div>
      </div>

      <div className="mt-6 text-center">
        <Link
          to="/seller/payouts"
          className="text-sm text-brand-500 font-medium hover:underline"
        >
          Ver meu extrato de repasses
        </Link>
      </div>
    </div>
  );
}
