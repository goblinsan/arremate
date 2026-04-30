import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MenuSection {
  title: string;
  items: MenuItem[];
}

interface MenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  href: string;
  color: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const MENU_SECTIONS: MenuSection[] = [
  {
    title: 'Compras',
    items: [
      {
        icon: 'bag-outline',
        label: 'Compras',
        description: 'Histórico de todos os seus pedidos',
        href: '/(tabs)/orders',
        color: '#6366f1',
      },
      {
        icon: 'card-outline',
        label: 'Pagamentos & Envio',
        description: 'Acompanhe pagamentos e rastreamento',
        href: '/profile/payments-shipping',
        color: '#0ea5e9',
      },
    ],
  },
  {
    title: 'Atividade',
    items: [
      {
        icon: 'podium-outline',
        label: 'Lances & Ofertas',
        description: 'Seus lances em shows ao vivo',
        href: '/profile/bids-offers',
        color: '#f97316',
      },
      {
        icon: 'bookmark-outline',
        label: 'Shows Salvos',
        description: 'Shows que você marcou para acompanhar',
        href: '/profile/saved-shows',
        color: '#ec4899',
      },
    ],
  },
  {
    title: 'Conta',
    items: [
      {
        icon: 'shield-checkmark-outline',
        label: 'Saúde da Conta',
        description: 'Sua pontuação e métricas de comprador',
        href: '/profile/account-health',
        color: '#16a34a',
      },
    ],
  },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { isAuthenticated, user, signOut } = useAuth();
  const router = useRouter();

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Ionicons name="person-circle-outline" size={72} color="#d1d5db" />
          <Text style={styles.title}>Bem-vindo</Text>
          <Text style={styles.subtitle}>Faça login para acessar seu perfil de comprador.</Text>
          <Pressable style={styles.button} onPress={() => router.push('/login')}>
            <Text style={styles.buttonText}>Entrar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <Ionicons name="person-circle" size={72} color="#f97316" />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>
              {user?.email?.split('@')[0] ?? 'Comprador'}
            </Text>
            <Text style={styles.profileEmail} numberOfLines={1}>
              {user?.email}
            </Text>
          </View>
        </View>

        {/* Menu sections */}
        {MENU_SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.items.map((item, idx) => (
                <View key={item.href}>
                  <Pressable
                    style={styles.menuItem}
                    onPress={() => router.push(item.href as never)}
                    accessibilityLabel={item.label}
                  >
                    <View style={[styles.menuIcon, { backgroundColor: `${item.color}18` }]}>
                      <Ionicons name={item.icon} size={22} color={item.color} />
                    </View>
                    <View style={styles.menuText}>
                      <Text style={styles.menuLabel}>{item.label}</Text>
                      <Text style={styles.menuDescription}>{item.description}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
                  </Pressable>
                  {idx < section.items.length - 1 ? (
                    <View style={styles.divider} />
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* Sign out */}
        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <Pressable
              style={styles.menuItem}
              onPress={signOut}
              accessibilityLabel="Sair da conta"
            >
              <View style={[styles.menuIcon, { backgroundColor: '#fef2f2' }]}>
                <Ionicons name="log-out-outline" size={22} color="#ef4444" />
              </View>
              <View style={styles.menuText}>
                <Text style={[styles.menuLabel, { color: '#ef4444' }]}>Sair</Text>
                <Text style={styles.menuDescription}>Encerrar sessão</Text>
              </View>
            </Pressable>
          </View>
        </View>

        <View style={styles.footer} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  // Unauthenticated
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#111' },
  subtitle: { fontSize: 15, color: '#666', textAlign: 'center' },
  button: {
    backgroundColor: '#f97316',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  // Profile header
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  avatarContainer: {},
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '700', color: '#111' },
  profileEmail: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  // Sections
  section: { marginTop: 24, paddingHorizontal: 20 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
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
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  menuIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: { flex: 1, gap: 2 },
  menuLabel: { fontSize: 15, fontWeight: '600', color: '#111' },
  menuDescription: { fontSize: 12, color: '#9ca3af' },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginLeft: 70,
  },
  footer: { height: 32 },
});
