import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
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
  const router = useRouter();
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
      <TouchableOpacity style={styles.rulesCta} onPress={() => router.push('/admin/contracts/rules')}>
        <Text style={styles.rulesCtaText}>📋 Kurallar sözleşmesi (Türkçe) – Düzenle</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.rulesCta, styles.settingsCta]} onPress={() => router.push('/admin/contracts/settings')}>
        <Text style={styles.rulesCtaText}>🔗 QR URL + Mağaza linkleri (Play Store / App Store)</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.rulesCta, styles.acceptancesCta]} onPress={() => router.push('/admin/contracts/acceptances')}>
        <Text style={styles.rulesCtaText}>✅ Sözleşme onayları – Oda ataması</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.rulesCta, styles.designCta]} onPress={() => router.push('/admin/contracts/design')}>
        <Text style={styles.rulesCtaText}>🎨 Sözleşme tasarımı – Görünüm ayarları</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.rulesCta, styles.formFieldsCta]} onPress={() => router.push('/admin/contracts/form-fields')}>
        <Text style={styles.rulesCtaText}>📋 Hangi bilgiyi almak istiyorsunuz?</Text>
      </TouchableOpacity>
      <Text style={styles.sectionTitle}>Dil bazlı sözleşmeler (tıklayarak düzenleyin)</Text>
      <FlatList
        data={templates}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/admin/contracts/contract/${item.lang}`)}
            activeOpacity={0.7}
          >
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.meta}>{LANG_LABELS[item.lang] ?? item.lang} • v{item.version}</Text>
            {item.is_active && <View style={styles.activeBadge}><Text style={styles.activeText}>Aktif</Text></View>}
            <Text style={styles.cardHint}>Düzenlemek için tıklayın</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  rulesCta: { margin: 16, marginBottom: 8, marginHorizontal: 16, padding: 16, backgroundColor: '#1a365d', borderRadius: 12, alignItems: 'center' },
  settingsCta: { backgroundColor: '#0f766e' },
  acceptancesCta: { backgroundColor: '#0369a1' },
  designCta: { backgroundColor: '#7c3aed' },
  formFieldsCta: { backgroundColor: '#0d9488' },
  rulesCtaText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  loading: { padding: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#64748b', marginHorizontal: 16, marginBottom: 8 },
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
  cardHint: { fontSize: 12, color: '#94a3b8', marginTop: 6 },
  activeBadge: { position: 'absolute', top: 16, right: 16, backgroundColor: '#c6f6d5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  activeText: { fontSize: 12, fontWeight: '600', color: '#276749' },
});
