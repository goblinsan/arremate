import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';

export default function OrdersScreen() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Minhas Compras</Text>
        {!isAuthenticated ? (
          <>
            <Text style={styles.subtitle}>Faça login para ver suas compras.</Text>
            <Pressable style={styles.button} onPress={() => router.push('/login')}>
              <Text style={styles.buttonText}>Entrar</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.subtitle}>Em breve: seus pedidos aparecerão aqui.</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#666', textAlign: 'center' },
  button: { backgroundColor: '#f97316', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 28 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
