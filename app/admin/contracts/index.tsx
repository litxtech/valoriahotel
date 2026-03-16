import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { supabase } from '@/lib/supabase';

type Template = {
  id: string;
  lang: string;
  version: number;
  title: string;
  is_active: boolean;
};

const LANG_LABELS: Record<string, string> = {
  tr: 'Türkçe',
  en: 'English',
  ar: 'Arapça',
  de: 'Almanca',
  fr: 'Fransızca',
  ru: 'Rusça',
  es: 'İspanyolca',
};

export default function ContractsList() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('contract_templates').select('id, lang, version, title, is_active').order('lang');
      setTemplates(data ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <Text style={styles.loading}>Yükleniyor...</Text>;

  return (
    <View style={styles.container}>
      <FlatList
        data={templates}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.meta}>{LANG_LABELS[item.lang] ?? item.lang} • v{item.version}</Text>
            {item.is_active && <View style={styles.activeBadge}><Text style={styles.activeText}>Aktif</Text></View>}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  loading: { padding: 24 },
  list: { padding: 16 },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  title: { fontSize: 18, fontWeight: '600', color: '#1a202c' },
  meta: { fontSize: 14, color: '#718096', marginTop: 4 },
  activeBadge: { position: 'absolute', top: 16, right: 16, backgroundColor: '#c6f6d5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  activeText: { fontSize: 12, fontWeight: '600', color: '#276749' },
});
