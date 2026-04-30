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

interface AccountHealth {
  totalOrders: number;
  paidOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  refundedOrders: number;
  completionRate: number | null;
  healthScore: number | null;
  lastOrderAt: string | null;
}

// ─── Components ───────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function HealthMeter({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <View style={styles.meterContainer}>
        <Text style={styles.meterNoData}>Faça sua primeira compra para ver sua saúde.</Text>
      </View>
    );
  }

  const color =
    score >= 80 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626';
  const label =
    score >= 80 ? 'Excelente' : score >= 50 ? 'Regular' : 'Atenção necessária';

  return (
    <View style={styles.meterContainer}>
      <View style={styles.meterRow}>
        <Text style={[styles.meterScore, { color }]}>{score}%</Text>
        <Text style={[styles.meterLabel, { color }]}>{label}</Text>
      </View>
      <View style={styles.meterBar}>
        <View style={[styles.meterFill, { width: `${score}%` as unknown as number, backgroundColor: color }]} />
      </View>
      <Text style={styles.meterHint}>
        Taxa de conclusão baseada em seus pedidos confirmados.
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AccountHealthScreen() {
  const api = useApiClient();
  const router = useRouter();

  const { data, isLoading, refetch, isRefetching, error } = useQuery<AccountHealth>({
    queryKey: ['buyer-account-health'],
    queryFn: () => api.get<AccountHealth>('/v1/buyer/account-health'),
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={24} color="#111" />
        </Pressable>
        <Text style={styles.headerTitle}>Saúde da Conta</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Erro ao carregar dados.</Text>
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
          {/* Health score */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pontuação de Saúde</Text>
            <HealthMeter score={data.healthScore} />
          </View>

          {/* Stats grid */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Resumo de Pedidos</Text>
            <View style={styles.statsGrid}>
              <StatCard
                icon="bag-outline"
                label="Total"
                value={data.totalOrders}
                color="#6366f1"
              />
              <StatCard
                icon="checkmark-circle-outline"
                label="Pagos"
                value={data.paidOrders}
                color="#16a34a"
              />
              <StatCard
                icon="time-outline"
                label="Pendentes"
                value={data.pendingOrders}
                color="#d97706"
              />
              <StatCard
                icon="close-circle-outline"
                label="Cancelados"
                value={data.cancelledOrders}
                color="#dc2626"
              />
            </View>
          </View>

          {/* Completion rate */}
          {data.completionRate !== null ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Taxa de Conclusão</Text>
              <View style={styles.rateCard}>
                <Text style={styles.rateValue}>{data.completionRate}%</Text>
                <Text style={styles.rateDescription}>
                  dos seus pedidos fechados foram pagos com sucesso.
                </Text>
              </View>
            </View>
          ) : null}

          {/* Last order */}
          {data.lastOrderAt ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Última Compra</Text>
              <View style={styles.lastOrderCard}>
                <Ionicons name="calendar-outline" size={20} color="#6b7280" />
                <Text style={styles.lastOrderDate}>
                  {new Date(data.lastOrderAt).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </Text>
              </View>
            </View>
          ) : null}
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
  section: { gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  // Health meter
  meterContainer: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    gap: 10,
  },
  meterNoData: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  meterScore: { fontSize: 40, fontWeight: '800' },
  meterLabel: { fontSize: 16, fontWeight: '600' },
  meterBar: {
    height: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 5,
    overflow: 'hidden',
  },
  meterFill: { height: '100%', borderRadius: 5 },
  meterHint: { fontSize: 12, color: '#9ca3af' },
  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 24, fontWeight: '800', color: '#111' },
  statLabel: { fontSize: 12, color: '#6b7280', textAlign: 'center' },
  // Rate card
  rateCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  rateValue: { fontSize: 32, fontWeight: '800', color: '#16a34a' },
  rateDescription: { flex: 1, fontSize: 13, color: '#6b7280' },
  // Last order
  lastOrderCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  lastOrderDate: { fontSize: 15, color: '#374151', fontWeight: '500' },
});
