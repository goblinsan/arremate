import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft,
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Users,
  Clock,
  Eye,
  Star,
  UserPlus,
  RefreshCw,
} from 'lucide-react';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

interface SalesMetrics {
  estimatedSalesCents: number;
  completedEarningsCents: number;
  totalOrders: number;
  averageOrderValueCents: number;
  giveawaySpendCents: number;
  giveaways: number;
}

interface StreamMetrics {
  totalBuyers: number;
  firstTimeBuyers: number;
  returningBuyers: number;
  shares: number;
  showDurationSeconds: number | null;
  maxConcurrentViewers: number | null;
  totalViews: number;
  averageOrderRating: number | null;
}

interface ShowAnalytics {
  showId: string;
  showTitle: string;
  showStatus: string;
  salesMetrics: SalesMetrics;
  streamMetrics: StreamMetrics;
}

function brl(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  iconBg?: string;
}

function MetricCard({ icon, label, value, iconBg = 'bg-brand-50 text-brand-500' }: MetricCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconBg}`}>{icon}</div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
      </div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

export default function SellerShowAnalyticsPage() {
  const { id: showId } = useParams<{ id: string }>();
  const { getAccessToken, isAuthenticated } = useAuth();
  const [analytics, setAnalytics] = useState<ShowAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    if (!showId) return;
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/seller/shows/${showId}/analytics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? 'Erro ao carregar analytics.');
      }
      const data: ShowAnalytics = await res.json();
      setAnalytics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar analytics.');
    } finally {
      setIsLoading(false);
    }
  }, [showId, getAccessToken]);

  useEffect(() => {
    if (isAuthenticated) fetchAnalytics();
  }, [isAuthenticated, fetchAnalytics]);

  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 mb-4">Você precisa estar logado para ver os analytics.</p>
        <Link to="/login" className="text-brand-500 font-medium hover:underline">
          Fazer login
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/seller/shows"
          className="text-gray-400 hover:text-gray-600 text-sm inline-flex items-center gap-1 mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Meus Shows
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {analytics ? analytics.showTitle : 'Analytics do Show'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Resumo de desempenho de vendas e da transmissão ao vivo.
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3" />
          Carregando analytics…
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={fetchAnalytics}
            className="text-brand-500 font-medium hover:underline text-sm"
          >
            Tentar novamente
          </button>
        </div>
      ) : analytics ? (
        <>
          {/* Sales Metrics */}
          <div className="mb-8">
            <h2 className="text-base font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-brand-500" />
              Métricas de Vendas
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <MetricCard
                icon={<DollarSign className="w-4 h-4" />}
                label="Vendas estimadas"
                value={brl(analytics.salesMetrics.estimatedSalesCents)}
                iconBg="bg-green-50 text-green-600"
              />
              <MetricCard
                icon={<DollarSign className="w-4 h-4" />}
                label="Ganhos concluídos"
                value={brl(analytics.salesMetrics.completedEarningsCents)}
                iconBg="bg-emerald-50 text-emerald-600"
              />
              <MetricCard
                icon={<ShoppingBag className="w-4 h-4" />}
                label="Pedidos"
                value={analytics.salesMetrics.totalOrders.toLocaleString('pt-BR')}
                iconBg="bg-blue-50 text-blue-600"
              />
              <MetricCard
                icon={<TrendingUp className="w-4 h-4" />}
                label="Valor médio do pedido"
                value={brl(analytics.salesMetrics.averageOrderValueCents)}
                iconBg="bg-purple-50 text-purple-600"
              />
              <MetricCard
                icon={<ShoppingBag className="w-4 h-4" />}
                label="Gasto em brindes"
                value={brl(analytics.salesMetrics.giveawaySpendCents)}
                iconBg="bg-orange-50 text-orange-500"
              />
              <MetricCard
                icon={<ShoppingBag className="w-4 h-4" />}
                label="Brindes"
                value={analytics.salesMetrics.giveaways.toLocaleString('pt-BR')}
                iconBg="bg-orange-50 text-orange-500"
              />
            </div>
          </div>

          {/* Stream Metrics */}
          <div>
            <h2 className="text-base font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-500" />
              Métricas da Transmissão
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <MetricCard
                icon={<Users className="w-4 h-4" />}
                label="Compradores"
                value={analytics.streamMetrics.totalBuyers.toLocaleString('pt-BR')}
                iconBg="bg-blue-50 text-blue-600"
              />
              <MetricCard
                icon={<UserPlus className="w-4 h-4" />}
                label="Novos compradores"
                value={analytics.streamMetrics.firstTimeBuyers.toLocaleString('pt-BR')}
                iconBg="bg-teal-50 text-teal-600"
              />
              <MetricCard
                icon={<Users className="w-4 h-4" />}
                label="Compradores recorrentes"
                value={analytics.streamMetrics.returningBuyers.toLocaleString('pt-BR')}
                iconBg="bg-indigo-50 text-indigo-600"
              />
              <MetricCard
                icon={<Clock className="w-4 h-4" />}
                label="Duração do show"
                value={formatDuration(analytics.streamMetrics.showDurationSeconds)}
                iconBg="bg-yellow-50 text-yellow-600"
              />
              <MetricCard
                icon={<Eye className="w-4 h-4" />}
                label="Máx. espectadores simultâneos"
                value={
                  analytics.streamMetrics.maxConcurrentViewers !== null
                    ? analytics.streamMetrics.maxConcurrentViewers.toLocaleString('pt-BR')
                    : '—'
                }
                iconBg="bg-sky-50 text-sky-600"
              />
              <MetricCard
                icon={<Eye className="w-4 h-4" />}
                label="Total de visualizações"
                value={analytics.streamMetrics.totalViews.toLocaleString('pt-BR')}
                iconBg="bg-sky-50 text-sky-600"
              />
              <MetricCard
                icon={<Star className="w-4 h-4" />}
                label="Avaliação média dos pedidos"
                value={
                  analytics.streamMetrics.averageOrderRating !== null
                    ? analytics.streamMetrics.averageOrderRating.toFixed(1)
                    : '—'
                }
                iconBg="bg-yellow-50 text-yellow-500"
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
