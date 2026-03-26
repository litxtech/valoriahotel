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

  const actions = [
    { id: 'rules', emoji: '📋', label: 'Kurallar', href: '/admin/contracts/rules', color: '#1a365d' },
    { id: 'settings', emoji: '🔗', label: 'QR / Mağaza', href: '/admin/contracts/settings', color: '#0f766e' },
    { id: 'acceptances', emoji: '✅', label: 'Onaylar', href: '/admin/contracts/acceptances', color: '#0369a1' },
    { id: 'design', emoji: '🎨', label: 'Tasarım', href: '/admin/contracts/design', color: '#7c3aed' },
    { id: 'formFields', emoji: '📝', label: 'Form alanları', href: '/admin/contracts/form-fields', color: '#0d9488' },
  ] as const;

  if (loading) return <Text style={styles.loading}>Yükleniyor...</Text>;

  return (
    <View style={styles.container}>
      <View style={styles.avatarRow}>
        {actions.map(({ id, emoji, label, href, color }) => (
          <TouchableOpacity
            key={id}
            style={[styles.avatarBtn, { backgroundColor: color }]}
            onPress={() => router.push(href)}
            activeOpacity={0.85}
          >
            <Text style={styles.avatarEmoji}>{emoji}</Text>
            <Text style={styles.avatarLabel} numberOfLines={2}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
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
  avatarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  avatarBtn: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 16,
    minHeight: 72,
  },
  avatarEmoji: { fontSize: 28, marginBottom: 4 },
  avatarLabel: { color: '#fff', fontSize: 11, fontWeight: '600', textAlign: 'center' },
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
