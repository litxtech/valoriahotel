import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { uriToArrayBuffer } from '@/lib/uploadMedia';
import { CachedImage } from '@/components/CachedImage';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { POST_TAGS, type PostTagValue } from '@/lib/feedPostTags';
import { notifyGuestsOfNewFeedPost, notifyStaffOfNewFeedPost } from '@/lib/notifyNewFeedPost';

const VISIBILITY_OPTIONS = [
  { value: 'all_staff', label: 'Tüm personel' },
  { value: 'customers', label: 'Müşteri ana sayfasında da görünsün (personel + müşteriler)' },
] as const;

const BUCKET = 'feed-media';

export default function NewFeedPostScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<string>('all_staff');
  const [postTag, setPostTag] = useState<PostTagValue>(null);
  const [uploading, setUploading] = useState(false);

  const pickImage = async () => {
    const granted = await ensureMediaLibraryPermission({
      title: 'Galeri izni',
      message: 'Paylasim icin galeriden foto/video secmek amaciyla izin istiyoruz.',
      settingsMessage: 'Galeri izni kapali. Paylasim icin ayarlardan galeri iznini acin.',
    });
    if (!granted) {
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 0.8,
      base64: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const uri = asset.uri ?? null;
    if (!uri) {
      Alert.alert('Hata', 'Görsel yüklenemedi. Tekrar deneyin.');
      return;
    }
    setImageUri(uri);
    setMediaType(asset.type === 'video' ? 'video' : 'image');
  };

  const takePhoto = async () => {
    const granted = await ensureCameraPermission({
      title: 'Kamera izni',
      message: 'Paylaşım için fotoğraf çekmek amacıyla kamera erişimi istiyoruz.',
      settingsMessage: 'Kamera izni kapalı. Paylaşım için ayarlardan kamera iznini açın.',
    });
    if (!granted) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 0.8,
      base64: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const uri = asset.uri ?? null;
    if (!uri) {
      Alert.alert('Hata', 'Fotoğraf yüklenemedi. Tekrar deneyin.');
      return;
    }
    setImageUri(uri);
    setMediaType(asset.type === 'video' ? 'video' : 'image');
  };

  const uploadAndPublish = async () => {
    if (!staff) return;
    const hasText = (title ?? '').trim().length > 0;
    if (!hasText && !imageUri) {
      Alert.alert('Eksik', 'Lütfen metin yazın veya fotoğraf/video ekleyin.');
      return;
    }
    setUploading(true);
    try {
      let finalMediaType: 'image' | 'video' | 'text' = 'text';
      let mediaUrl: string | null = null;
      let thumbnailUrl: string | null = null;

      if (imageUri) {
        finalMediaType = mediaType;
        const ext = mediaType === 'video' ? 'mp4' : 'jpg';
        const contentType = mediaType === 'video' ? 'video/mp4' : 'image/jpeg';
        const fileName = `${staff.id}/${Date.now()}.${ext}`;
        let arrayBuffer: ArrayBuffer;
        try {
          arrayBuffer = await uriToArrayBuffer(imageUri);
        } catch (e) {
          const msg = (e as Error)?.message ?? '';
          setUploading(false);
          Alert.alert('Medya okunamadı', msg.includes('base64') || msg.includes('okunamadı') ? 'Görsel/video işlenemedi. Lütfen tekrar seçin.' : msg);
          return;
        }
        const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(fileName, arrayBuffer, {
          contentType,
          upsert: true,
        });
        if (uploadErr) {
          setUploading(false);
          Alert.alert('Yükleme hatası', uploadErr.message);
          return;
        }
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
        mediaUrl = urlData.publicUrl;
        thumbnailUrl = mediaType === 'image' ? mediaUrl : null;
      }

      const { data: insertedPost, error: insertErr } = await supabase
        .from('feed_posts')
        .insert({
          staff_id: staff.id,
          media_type: finalMediaType,
          media_url: mediaUrl,
          thumbnail_url: thumbnailUrl,
          title: (title ?? '').trim() || null,
          visibility,
          post_tag: postTag || null,
        })
        .select('id')
        .single();
      if (insertErr || !insertedPost?.id) {
        setUploading(false);
        Alert.alert('Hata', insertErr?.message ?? 'Paylaşım kaydedilemedi.');
        return;
      }
      const newPostId = insertedPost.id;
      const authorLabel = staff.full_name ?? 'Bir çalışan';
      const titleTrim = (title ?? '').trim();
      const titlePreview =
        titleTrim.slice(0, 120) + (titleTrim.length > 120 ? '…' : '') || null;
      try {
        await notifyStaffOfNewFeedPost({
          postId: newPostId,
          authorDisplayName: authorLabel,
          titlePreview,
          excludeStaffId: staff.id,
          createdByStaffId: staff.id,
        });
        await notifyGuestsOfNewFeedPost(newPostId);
      } catch (e) {
        log.warn('staff/feed/new', 'bildirim veya push', e);
      }
      router.back();
    } catch (e) {
      setUploading(false);
      Alert.alert('Hata', (e as Error)?.message ?? 'Paylaşım kaydedilemedi.');
    }
  };

  if (!staff) return null;

  return (
    <>
      <Stack.Screen options={{ title: 'Yeni paylaşım', headerStyle: { backgroundColor: '#fff' }, headerTintColor: '#1a1d21' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.label}>Etiket (isteğe bağlı)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsRow} contentContainerStyle={styles.tagsRowContent}>
          {POST_TAGS.map((tag) => (
            <TouchableOpacity
              key={tag.value}
              style={[styles.tagChip, postTag === tag.value && styles.tagChipActive]}
              onPress={() => setPostTag(postTag === tag.value ? null : tag.value)}
              activeOpacity={0.7}
              disabled={uploading}
            >
              <Text style={[styles.tagChipText, postTag === tag.value && styles.tagChipTextActive]}>{tag.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={styles.label}>Metin (sadece metinle de paylaşabilirsiniz)</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholder="Ne paylaşmak istiyorsunuz?"
          placeholderTextColor="#9ca3af"
          value={title}
          onChangeText={setTitle}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.label}>📍 Kimler görebilir?</Text>
        {VISIBILITY_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.radioRow, visibility === opt.value && styles.radioRowActive]}
            onPress={() => setVisibility(opt.value)}
            disabled={uploading}
          >
            <Text style={styles.radioLabel}>{opt.label}</Text>
            {visibility === opt.value && <Text style={styles.radioCheck}>✓</Text>}
          </TouchableOpacity>
        ))}

        <Text style={[styles.label, { marginTop: 24 }]}>Fotoğraf veya video (isteğe bağlı)</Text>
        <View style={styles.buttonsRow}>
          <TouchableOpacity style={[styles.mediaBtn, styles.mediaBtnPhoto]} onPress={takePhoto} disabled={uploading}>
            <Text style={styles.mediaBtnTextPhoto}>📷 Fotoğraf çek</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.mediaBtn, styles.mediaBtnGallery]} onPress={pickImage} disabled={uploading}>
            <Text style={styles.mediaBtnTextGallery}>📁 Galeriden seç</Text>
          </TouchableOpacity>
        </View>

        {imageUri ? (
          <View style={styles.previewWrap}>
            {mediaType === 'image' ? (
              <CachedImage uri={imageUri} style={styles.preview} contentFit="cover" />
            ) : (
              <Video
                source={{ uri: imageUri }}
                style={styles.preview}
                resizeMode={ResizeMode.CONTAIN}
                useNativeControls
                isLooping
                shouldPlay={false}
              />
            )}
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.submitBtn, uploading && styles.submitBtnDisabled]}
          onPress={uploadAndPublish}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>Paylaş</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 20, paddingBottom: 40 },
  buttonsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  mediaBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  mediaBtnPhoto: {
    backgroundColor: '#0ea5e9',
  },
  mediaBtnGallery: {
    backgroundColor: '#8b5cf6',
  },
  mediaBtnText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  mediaBtnTextPhoto: { fontSize: 15, fontWeight: '600', color: '#fff' },
  mediaBtnTextGallery: { fontSize: 15, fontWeight: '600', color: '#fff' },
  previewWrap: { marginBottom: 20 },
  preview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
  },
  tagsRow: { marginBottom: 16 },
  tagsRowContent: { gap: 8, paddingRight: 20 },
  tagChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  tagChipActive: { backgroundColor: 'rgba(184,134,11,0.15)', borderColor: '#b8860b' },
  tagChipText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  tagChipTextActive: { color: '#b8860b' },
  label: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 8 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1a1d21',
    marginBottom: 20,
  },
  inputMultiline: { minHeight: 100, textAlignVertical: 'top' },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  radioRowActive: { borderColor: '#b8860b' },
  radioLabel: { fontSize: 15, color: '#374151' },
  radioCheck: { color: '#b8860b', fontWeight: '700', fontSize: 18 },
  submitBtn: {
    backgroundColor: '#b8860b',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
