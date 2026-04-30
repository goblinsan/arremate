import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../src/hooks/useApi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PayoutStatementTotals {
  pendingPayables: number;
  batchedPayables: number;
  paidPayables: number;
  estimatedOrders: number;
}

interface SellerPayoutStatement {
  estimatedCents: number;
  payableCents: number;
  inBatchCents: number;
  settledCents: number;
  pendingOffsetCents: number;
  totals: PayoutStatementTotals;
}

function formatBrl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── Components ───────────────────────────────────────────────────────────────

function FinanceCard({
  icon,
  label,
  amountCents,
  color,
  note,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  amountCents: number;
  color: string;
  note?: string;
}) {
  return (
    <View style={styles.financeCard}>
      <View style={[styles.cardIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardLabel}>{label}</Text>
        {note ? <Text style={styles.cardNote}>{note}</Text> : null}
      </View>
      <Text style={[styles.cardAmount, { color }]}>{formatBrl(amountCents)}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SellerFinancesScreen() {
  const api = useApiClient();
  const router = useRouter();

  const { data, isLoading, refetch, isRefetching, error } = useQuery<SellerPayoutStatement>({
    queryKey: ['seller-payout-statement'],
    queryFn: () => api.get<SellerPayoutStatement>('/v1/seller/payout-statement'),
  });

  const netCents = data
    ? data.estimatedCents + data.payableCents + data.inBatchCents + data.pendingOffsetCents
    : 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={24} color="#111" />
        </Pressable>
        <Text style={styles.headerTitle}>Financeiro</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Erro ao carregar financeiro.</Text>
          <Pressable onPress={() => void refetch()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : data ? (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#f97316" />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Net summary */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>A receber (líquido)</Text>
            <Text style={styles.summaryAmount}>{formatBrl(netCents)}</Text>
            <Text style={styles.summaryHint}>
              Estimado + a pagar + em lote, descontados ajustes pendentes.
            </Text>
          </View>

          {/* Breakdown */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Detalhamento</Text>
            <View style={styles.sectionCard}>
              <FinanceCard
                icon="time-outline"
                label="Estimado"
                amountCents={data.estimatedCents}
                color="#d97706"
                note="Pedidos pagos sem payable gerado"
              />
              <View style={styles.divider} />
              <FinanceCard
                icon="wallet-outline"
                label="A pagar"
                amountCents={data.payableCents}
                color="#2563eb"
                note="Payables aguardando lote"
              />
              <View style={styles.divider} />
              <FinanceCard
                icon="layers-outline"
                label="Em lote"
                amountCents={data.inBatchCents}
                color="#7c3aed"
                note="Incluído em lote, aguardando pagamento"
              />
              <View style={styles.divider} />
              <FinanceCard
                icon="checkmark-circle-outline"
                label="Liquidado"
                amountCents={data.settledCents}
                color="#16a34a"
                note="Já pago ao vendedor"
              />
              {data.pendingOffsetCents !== 0 ? (
                <>
                  <View style={styles.divider} />
                  <FinanceCard
                    icon="remove-circle-outline"
                    label="Ajustes pendentes"
                    amountCents={data.pendingOffsetCents}
                    color="#dc2626"
                    note="Estornos a descontar"
                  />
                </>
              ) : null}
            </View>
          </View>

          {/* Totals */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contagem de Payables</Text>
            <View style={styles.totalsGrid}>
              <View style={styles.totalItem}>
                <Text style={styles.totalValue}>{data.totals.pendingPayables}</Text>
                <Text style={styles.totalLabel}>Pendentes</Text>
              </View>
              <View style={styles.totalItem}>
                <Text style={styles.totalValue}>{data.totals.batchedPayables}</Text>
                <Text style={styles.totalLabel}>Em lote</Text>
              </View>
              <View style={styles.totalItem}>
                <Text style={styles.totalValue}>{data.totals.paidPayables}</Text>
                <Text style={styles.totalLabel}>Pagos</Text>
              </View>
              <View style={styles.totalItem}>
                <Text style={styles.totalValue}>{data.totals.estimatedOrders}</Text>
                <Text style={styles.totalLabel}>Estimados</Text>
              </View>
            </View>
          </View>

          <View style={styles.footer} />
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 8,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111', flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  errorText: { fontSize: 15, color: '#dc2626', textAlign: 'center' },
  retryBtn: {
    backgroundColor: '#f97316',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  scrollContent: { padding: 20, gap: 24 },
  summaryCard: {
    backgroundColor: '#f97316',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 6,
  },
  summaryLabel: { fontSize: 14, color: '#fff', opacity: 0.85 },
  summaryAmount: { fontSize: 36, fontWeight: '800', color: '#fff' },
  summaryHint: { fontSize: 11, color: '#fff', opacity: 0.7, textAlign: 'center' },
  section: { gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  financeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: { flex: 1, gap: 2 },
  cardLabel: { fontSize: 14, fontWeight: '600', color: '#111' },
  cardNote: { fontSize: 11, color: '#9ca3af' },
  cardAmount: { fontSize: 15, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginLeft: 70 },
  totalsGrid: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  totalItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 20,
    gap: 4,
  },
  totalValue: { fontSize: 22, fontWeight: '800', color: '#111' },
  totalLabel: { fontSize: 11, color: '#9ca3af', textAlign: 'center' },
  footer: { height: 32 },
});
