import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { uriToArrayBuffer, getMimeAndExt } from '@/lib/uploadMedia';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';

type CategoryRow = { id: string; name: string; icon: string | null };

const PAYMENT_TYPES: { value: 'cash' | 'credit_card' | 'company_card'; label: string }[] = [
  { value: 'cash', label: 'Nakit' },
  { value: 'credit_card', label: 'Kredi Kartı' },
  { value: 'company_card', label: 'Şirket Kartı' },
];

export default function NewExpenseScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expenseTime, setExpenseTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState<'cash' | 'credit_card' | 'company_card'>('cash');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');

  useEffect(() => {
    supabase
      .from('expense_categories')
      .select('id, name, icon')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setCategories((data as CategoryRow[]) ?? []));
  }, []);

  const uploadReceipt = async (uri: string): Promise<string> => {
    const arrayBuffer = await uriToArrayBuffer(uri);
    const { ext } = getMimeAndExt(uri, 'image');
    const fileName = `receipts/${staff?.id ?? 'anon'}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('expense-receipts').upload(fileName, arrayBuffer, {
      contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
      upsert: true,
    });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('expense-receipts').getPublicUrl(fileName);
    return publicUrl;
  };

  const takePhoto = async () => {
    const granted = await ensureCameraPermission({
      title: 'Kamera izni',
      message: 'Fiş fotoğrafı çekmek için kamera erişimi gerekiyor.',
      settingsMessage: 'Kamera izni kapalı. Fiş fotoğrafı için ayarlardan izin verin.',
    });
    if (!granted) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setUploading(true);
    try {
      const url = await uploadReceipt(result.assets[0].uri);
      setReceiptUri(url);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Fotoğraf yüklenemedi.');
    } finally {
      setUploading(false);
    }
  };

  const pickFromGallery = async () => {
    const granted = await ensureMediaLibraryPermission({
      title: 'Galeri izni',
      message: 'Fis fotografi secmek icin galeri erisimi istiyoruz.',
      settingsMessage: 'Galeri izni kapali. Fis fotografi icin ayarlardan izin verin.',
    });
    if (!granted) {
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setUploading(true);
    try {
      const url = await uploadReceipt(result.assets[0].uri);
      setReceiptUri(url);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Fotoğraf yüklenemedi.');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!staff?.id) {
      Alert.alert('Hata', 'Oturum gerekli.');
      return;
    }
    if (!receiptUri) {
      Alert.alert('Eksik', 'Fiş fotoğrafı zorunludur.');
      return;
    }
    if (!categoryId) {
      Alert.alert('Eksik', 'Kategori seçiniz.');
      return;
    }
    const num = parseFloat(amount.replace(',', '.'));
    if (isNaN(num) || num <= 0) {
      Alert.alert('Hata', 'Geçerli tutar girin.');
      return;
    }
    const tagArray = tags.trim() ? tags.trim().split(/\s+/).filter(Boolean) : null;
    setSaving(true);
    try {
      const { error } = await supabase.from('staff_expenses').insert({
        staff_id: staff.id,
        category_id: categoryId,
        expense_date: expenseDate,
        expense_time: expenseTime,
        amount: num,
        payment_type: paymentType,
        description: description.trim() || null,
        receipt_image_url: receiptUri,
        tags: tagArray,
        status: 'pending',
      });
      if (error) throw error;
      Alert.alert('Kaydedildi', 'Harcamanız admin onayından sonra kesinleşecektir.', [
        { text: 'Tamam', onPress: () => router.replace('/staff/expenses') },
      ]);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Kayıt yapılamadı.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fiş fotoğrafı (Zorunlu)</Text>
          <View style={styles.receiptBox}>
            {receiptUri ? (
              <View style={styles.receiptPreview}>
                <CachedImage uri={receiptUri} style={styles.receiptImg} contentFit="contain" />
                <TouchableOpacity style={styles.removeReceipt} onPress={() => setReceiptUri(null)}>
                  <Ionicons name="close-circle" size={28} color={theme.colors.error} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.receiptPlaceholder}>
                <TouchableOpacity style={styles.photoBtn} onPress={takePhoto} disabled={uploading}>
                  <Ionicons name="camera" size={32} color={theme.colors.primary} />
                  <Text style={styles.photoBtnText}>Fotoğraf çek</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoBtn} onPress={pickFromGallery} disabled={uploading}>
                  <Ionicons name="images" size={32} color={theme.colors.primary} />
                  <Text style={styles.photoBtnText}>Galeriden yükle</Text>
                </TouchableOpacity>
                {uploading && <ActivityIndicator size="small" color={theme.colors.primary} style={styles.uploadIndicator} />}
              </View>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Harcama bilgileri</Text>
          <Text style={styles.label}>Kategori</Text>
          <View style={styles.categoryRow}>
            {categories.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.categoryChip, categoryId === c.id && styles.categoryChipActive]}
                onPress={() => setCategoryId(c.id)}
              >
                <Text style={[styles.categoryChipText, categoryId === c.id && styles.categoryChipTextActive]} numberOfLines={1}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={styles.label}>Tarih</Text>
              <TextInput
                style={styles.input}
                value={expenseDate}
                onChangeText={setExpenseDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.colors.textMuted}
              />
            </View>
            <View style={styles.half}>
              <Text style={styles.label}>Saat</Text>
              <TextInput
                style={styles.input}
                value={expenseTime}
                onChangeText={setExpenseTime}
                placeholder="14:30"
                placeholderTextColor={theme.colors.textMuted}
              />
            </View>
          </View>

          <Text style={styles.label}>Tutar (₺)</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="0,00"
            keyboardType="decimal-pad"
            placeholderTextColor={theme.colors.textMuted}
          />

          <Text style={styles.label}>Ödeme türü</Text>
          <View style={styles.paymentRow}>
            {PAYMENT_TYPES.map((p) => (
              <TouchableOpacity
                key={p.value}
                style={[styles.radio, paymentType === p.value && styles.radioActive]}
                onPress={() => setPaymentType(p.value)}
              >
                <Text style={[styles.radioText, paymentType === p.value && styles.radioTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Açıklama</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Harcama detayı (örn: Klima tamiri için yedek parça)"
            placeholderTextColor={theme.colors.textMuted}
            multiline
            numberOfLines={3}
          />

          <Text style={styles.label}>Etiketler (opsiyonel)</Text>
          <TextInput
            style={styles.input}
            value={tags}
            onChangeText={setTags}
            placeholder="#klima #teknik"
            placeholderTextColor={theme.colors.textMuted}
          />
        </View>

        <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={save} disabled={saving} activeOpacity={0.8}>
          {saving ? <ActivityIndicator color={theme.colors.white} size="small" /> : <Text style={styles.saveBtnText}>Harcama kaydet</Text>}
        </TouchableOpacity>

        <Text style={styles.note}>Harcamanız admin onayından sonra kesinleşecektir.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginBottom: 10 },
  receiptBox: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 12, minHeight: 140, borderWidth: 1, borderColor: theme.colors.borderLight },
  receiptPlaceholder: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  receiptPreview: { position: 'relative', alignSelf: 'flex-start' },
  receiptImg: { width: 160, height: 160, borderRadius: theme.radius.sm },
  removeReceipt: { position: 'absolute', top: 4, right: 4 },
  photoBtn: { padding: 12, backgroundColor: theme.colors.backgroundSecondary, borderRadius: theme.radius.sm, alignItems: 'center', minWidth: 120 },
  photoBtnText: { fontSize: 12, color: theme.colors.primary, marginTop: 4 },
  uploadIndicator: { marginTop: 8 },
  label: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: theme.colors.text },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.colors.backgroundSecondary, borderRadius: theme.radius.full },
  categoryChipActive: { backgroundColor: theme.colors.primary },
  categoryChipText: { fontSize: 13, color: theme.colors.text },
  categoryChipTextActive: { color: theme.colors.white, fontWeight: '600' },
  paymentRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  radio: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm },
  radioActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryLight + '20' },
  radioText: { fontSize: 13, color: theme.colors.text },
  radioTextActive: { color: theme.colors.primary, fontWeight: '600' },
  saveBtn: { backgroundColor: theme.colors.primary, paddingVertical: 14, borderRadius: theme.radius.md, alignItems: 'center', marginTop: 8 },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: theme.colors.white, fontSize: 16, fontWeight: '700' },
  note: { fontSize: 12, color: theme.colors.textMuted, marginTop: 12, textAlign: 'center' },
});
