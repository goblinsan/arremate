import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

export type SignalStatus = 'ok' | 'warn' | 'critical' | 'unknown';

export interface BidSuccessRateSignal {
  totalBids: number;
  confirmedClaims: number;
  rate: number | null;
  status: SignalStatus;
}

export interface RequestHealthSignal {
  paidOrders: number;
  totalOrders: number;
  rate: number | null;
  status: SignalStatus;
}

export interface LatencyStatusSignal {
  avgResolutionMs: number | null;
  status: SignalStatus;
}

export interface PaymentFailureRateSignal {
  failedPayments: number;
  totalPayments: number;
  rate: number | null;
  status: SignalStatus;
}

export interface SuspiciousActivitySignal {
  count: number;
  status: SignalStatus;
}

export interface AuthFailuresSignal {
  count: number;
  status: SignalStatus;
}

export interface WebhookFailuresSignal {
  count: number;
  status: SignalStatus;
}

export interface RequestSurgeSignal {
  recentCount: number;
  baselinePerHour: number;
  surgeMultiplier: number | null;
  status: SignalStatus;
}

export interface DbUsageSignal {
  recentCount: number;
  status: SignalStatus;
}

export interface ReviewSummary {
  generatedAt: string;
  windowHours: number;
  status: SignalStatus;
  quality: {
    status: SignalStatus;
    bidSuccessRate: BidSuccessRateSignal;
    requestHealth: RequestHealthSignal;
    latencyStatus: LatencyStatusSignal;
    paymentFailureRate: PaymentFailureRateSignal;
  };
  security: {
    status: SignalStatus;
    suspiciousActivity: SuspiciousActivitySignal;
    authFailures: AuthFailuresSignal;
    webhookFailures: WebhookFailuresSignal;
  };
  budget: {
    status: SignalStatus;
    requestSurge: RequestSurgeSignal;
    dbUsage: DbUsageSignal;
  };
}

export function useReviewSummary(windowHours: number) {
  const { getAccessToken } = useAuth();
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const res = await fetch(
        `${API_URL}/v1/admin/telemetry/review-summary?windowHours=${windowHours}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSummary((await res.json()) as ReviewSummary);
    } catch (err) {
      console.error('Failed to fetch telemetry review summary:', err);
      setError('Erro ao carregar resumo de telemetria.');
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, windowHours]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  return { summary, error, loading, refetch: fetchSummary };
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

export function statusBgText(status: SignalStatus): string {
  return {
    ok:       'bg-green-100 text-green-700',
    warn:     'bg-yellow-100 text-yellow-700',
    critical: 'bg-red-100 text-red-700',
    unknown:  'bg-gray-100 text-gray-500',
  }[status];
}

export function statusLabel(status: SignalStatus): string {
  return {
    ok:       'OK',
    warn:     'Atenção',
    critical: 'Crítico',
    unknown:  'Desconhecido',
  }[status];
}

export const WINDOW_OPTIONS = [
  { label: '1 h',  hours: 1 },
  { label: '6 h',  hours: 6 },
  { label: '24 h', hours: 24 },
  { label: '48 h', hours: 48 },
  { label: '7 d',  hours: 168 },
] as const;
