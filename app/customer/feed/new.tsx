import { useState, useEffect } from 'react';
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
} from 'react-native';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { uriToArrayBuffer } from '@/lib/uploadMedia';
import { getOrCreateGuestForCaller, getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { POST_TAGS, type PostTagValue } from '@/lib/feedPostTags';

const BUCKET = 'feed-media';

export default function CustomerNewFeedPostScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const locationFromMap =
    params.lat != null && params.lng != null && !Number.isNaN(Number(params.lat)) && !Number.isNaN(Number(params.lng))
      ? { lat: Number(params.lat), lng: Number(params.lng) }
      : null;
  const [guestId, setGuestId] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [title, setTitle] = useState('');
  const [postTag, setPostTag] = useState<PostTagValue>(null);
  const [uploading, setUploading] = useState(false);
  const [loadingGuest, setLoadingGuest] = useState(true);
  const [goingBack, setGoingBack] = useState(false);

  const fetchGuest = async () => {
    setLoadingGuest(true);
    try {
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      const row = await getOrCreateGuestForCaller(session?.user ?? null);
      const fallback = row ? null : await getOrCreateGuestForCurrentSession();
      if (row ?? fallback) setGuestId((row ?? fallback)!.guest_id);
    } finally {
      setLoadingGuest(false);
    }
  };

  const goBack = () => {
    if (goingBack) return;
    setGoingBack(true);
    router.back();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingGuest(true);
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      const u = user ?? initialSession?.user ?? null;
      if (!u || cancelled) {
        setLoadingGuest(false);
        return;
      }
      await supabase.auth.refreshSession();
      if (cancelled) {
        setLoadingGuest(false);
        return;
      }
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const freshUser = freshSession?.user ?? u;
      let row = await getOrCreateGuestForCaller(freshUser);
      if (!row) row = await getOrCreateGuestForCurrentSession();
      if (!cancelled && row) setGuestId(row.guest_id);
      setLoadingGuest(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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
    const hasText = (title ?? '').trim().length > 0;
    if (!hasText && !imageUri) {
      Alert.alert('Eksik', 'Lütfen metin yazın veya fotoğraf/video ekleyin.');
      return;
    }
    if (!guestId) {
      Alert.alert('Hata', 'Misafir kaydınız bulunamadı. Lütfen giriş yapıp tekrar deneyin.');
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
        const fileName = `guest_${guestId}/${Date.now()}.${ext}`;
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

      const insertPayload: Record<string, unknown> = {
        staff_id: null,
        guest_id: guestId,
        media_type: finalMediaType,
        media_url: mediaUrl,
        thumbnail_url: thumbnailUrl,
        title: (title ?? '').trim() || null,
        visibility: 'customers',
        post_tag: postTag || null,
      };
      if (locationFromMap) {
        insertPayload.lat = locationFromMap.lat;
        insertPayload.lng = locationFromMap.lng;
        try {
          const { Location } = await import('expo-location');
          const [rev] = await Location.reverseGeocodeAsync({
            latitude: locationFromMap.lat,
            longitude: locationFromMap.lng,
          }).catch(() => []);
          if (rev) {
            const parts = [rev.street, rev.city, rev.region].filter(Boolean);
            if (parts.length) insertPayload.location_label = parts.join(', ');
          }
        } catch {
          /* reverse geocode optional */
        }
      }
      const { error: insertErr } = await supabase.from('feed_posts').insert(insertPayload);
      if (insertErr) {
        setUploading(false);
        Alert.alert('Hata', insertErr.message);
        return;
      }
      router.back();
    } catch (e) {
      setUploading(false);
      Alert.alert('Hata', (e as Error)?.message ?? 'Paylaşım kaydedilemedi.');
    }
  };

  if (loadingGuest) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!guestId && !loadingGuest) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Yeni paylaşım',
            headerStyle: { backgroundColor: theme.colors.surface },
            headerTintColor: theme.colors.text,
            headerLeft: () => (
              <TouchableOpacity onPress={goBack} disabled={goingBack} style={{ padding: 8 }}>
                <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>Geri</Text>
              </TouchableOpacity>
            ),
          }}
        />
        <View style={[styles.centered, styles.container]}>
          <Text style={styles.noGuestText}>
            Paylaşım yapmak için giriş yapın. Apple veya Google ile giriş yaptıysanız "Tekrar dene"ye basın.
          </Text>
          <TouchableOpacity style={[styles.retryBtn, loadingGuest && styles.retryBtnDisabled]} onPress={fetchGuest} disabled={loadingGuest}>
            <Text style={styles.retryBtnText}>{loadingGuest ? 'Yükleniyor...' : 'Tekrar dene'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backBtn} onPress={goBack} disabled={goingBack}>
            <Text style={styles.backBtnText}>{goingBack ? '...' : 'Geri'}</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Yeni paylaşım', headerStyle: { backgroundColor: theme.colors.surface }, headerTintColor: theme.colors.text }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.shareNoticeBox}>
          <Text style={styles.shareNoticeText}>{t('feedShareNotice')}</Text>
          {locationFromMap && (
            <View style={styles.locationBadge}>
              <Text style={styles.locationBadgeText}>📍 Haritadan paylaşım — konum eklenecek</Text>
            </View>
          )}
        </View>
        <Text style={styles.label}>Etiket (isteğe bağlı)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsRow} contentContainerStyle={styles.tagsRowContent}>
          {POST_TAGS.map((tag) => (
            <TouchableOpacity
              key={tag.value}
              style={[styles.tagChip, postTag === tag.value && styles.tagChipActive]}
              onPress={() => setPostTag(postTag === tag.value ? null : tag.value)}
              activeOpacity={0.7}
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
          editable={!uploading}
        />

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
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 20, paddingBottom: 40 },
  shareNoticeBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#1f2937',
  },
  shareNoticeText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#1f2937',
    fontWeight: '500',
  },
  locationBadge: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(13, 148, 136, 0.12)',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  locationBadgeText: {
    fontSize: 13,
    color: theme.colors.text,
    fontWeight: '600',
  },
  tagsRow: { marginBottom: 16 },
  tagsRowContent: { gap: 8, paddingRight: 20 },
  tagChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  tagChipActive: {
    backgroundColor: theme.colors.primary + '20',
    borderColor: theme.colors.primary,
  },
  tagChipText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  tagChipTextActive: { color: theme.colors.primary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  noGuestText: { fontSize: 16, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 16, paddingHorizontal: 24 },
  retryBtn: { paddingVertical: 12, paddingHorizontal: 24, backgroundColor: theme.colors.primary, borderRadius: 12, marginBottom: 12 },
  retryBtnDisabled: { opacity: 0.7 },
  retryBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  backBtn: { paddingVertical: 12, paddingHorizontal: 24, backgroundColor: theme.colors.primary, borderRadius: 12 },
  backBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  buttonsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  mediaBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  mediaBtnPhoto: { backgroundColor: '#0ea5e9' },
  mediaBtnGallery: { backgroundColor: '#8b5cf6' },
  mediaBtnText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  mediaBtnTextPhoto: { fontSize: 15, fontWeight: '600', color: '#fff' },
  mediaBtnTextGallery: { fontSize: 15, fontWeight: '600', color: '#fff' },
  previewWrap: { marginBottom: 20 },
  preview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: theme.colors.borderLight,
  },
  label: { fontSize: 15, fontWeight: '600', color: theme.colors.text, marginBottom: 8 },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: 20,
  },
  inputMultiline: { minHeight: 100, textAlignVertical: 'top' },
  submitBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
