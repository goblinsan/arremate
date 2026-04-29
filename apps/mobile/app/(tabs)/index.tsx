import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../src/hooks/useApi';
import type { Show } from '@arremate/types';

export default function ShowsScreen() {
  const api = useApiClient();
  const { data: shows, isLoading } = useQuery<Show[]>({
    queryKey: ['shows'],
    queryFn: () => api.get<Show[]>('/v1/shows'),
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Shows ao Vivo</Text>
        {isLoading ? (
          <Text style={styles.subtitle}>Carregando...</Text>
        ) : shows && shows.length > 0 ? (
          shows.map((show) => (
            <Text key={show.id} style={styles.item}>
              {show.title}
            </Text>
          ))
        ) : (
          <Text style={styles.subtitle}>Nenhum show disponível no momento.</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#666', textAlign: 'center' },
  item: { fontSize: 15, color: '#333', paddingVertical: 4 },
});
