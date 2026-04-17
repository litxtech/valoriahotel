import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import { CachedImage } from '@/components/CachedImage';

type FeedPostRow = {
  id: string;
  title: string | null;
  media_type: 'image' | 'video' | 'text';
  media_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
  staff: { full_name: string | null; department: string | null } | null;
};

export default function AdminFeedScreen() {
  const router = useRouter();
  const [feedPosts, setFeedPosts] = useState<FeedPostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    const { data } = await supabase
      .from('feed_posts')
      .select('id, title, media_type, media_url, thumbnail_url, created_at, staff:staff_id(full_name, department)')
      .order('created_at', { ascending: false })
      .limit(50);
    setFeedPosts((data ?? []) as FeedPostRow[]);
    setRefreshing(false);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleDeletePost = (post: FeedPostRow) => {
    Alert.alert(
      'Paylaşımı sil',
      'Bu paylaşım kalıcı olarak silinecek. Emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('feed_posts').delete().eq('id', post.id);
            if (error) {
              Alert.alert('Hata', error.message);
              return;
            }
            setFeedPosts((prev) => prev.filter((p) => p.id !== post.id));
          },
        },
      ]
    );
  };

  const feedPreviewUri = (p: FeedPostRow) =>
    p.thumbnail_url || (p.media_type === 'image' ? p.media_url : null);

  if (loading && feedPosts.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={adminTheme.colors.accent} />
      }
    >
      <AdminCard>
        <View style={styles.sectionHeadRow}>
          <TouchableOpacity
            onPress={() => router.push('/customer')}
            activeOpacity={0.8}
            style={styles.sectionLinkBtn}
          >
            <Text style={styles.sectionLink}>Misafir uygulamasında aç</Text>
            <Ionicons name="open-outline" size={18} color={adminTheme.colors.accent} />
          </TouchableOpacity>
        </View>
        {feedPosts.length === 0 ? (
          <Text style={styles.feedEmpty}>Henüz paylaşım yok.</Text>
        ) : (
          feedPosts.map((p, idx) => {
            const previewUri = feedPreviewUri(p);
            let previewContent: React.ReactNode;
            if (p.media_type === 'image' && previewUri) {
              previewContent = (
                <CachedImage uri={previewUri} style={styles.feedPreviewImage} contentFit="cover" />
              );
            } else if (p.media_type === 'video') {
              previewContent = previewUri ? (
                <CachedImage uri={previewUri} style={styles.feedPreviewImage} contentFit="cover" />
              ) : (
                <View style={styles.feedPreviewPlaceholder}>
                  <Ionicons name="videocam" size={24} color={adminTheme.colors.accent} />
                </View>
              );
            } else {
              previewContent = (
                <View style={styles.feedPreviewPlaceholder}>
                  <Ionicons name="document-text" size={24} color={adminTheme.colors.textMuted} />
                </View>
              );
            }
            return (
              <View key={p.id} style={[styles.feedItem, idx === feedPosts.length - 1 && styles.feedItemLast]}>
                <View style={styles.feedPreviewWrap}>{previewContent}</View>
                <View style={styles.feedBody}>
                  <Text style={styles.feedItemTitle} numberOfLines={2}>
                    {p.title ||
                      (p.media_type === 'video'
                        ? 'Video'
                        : p.media_type === 'image'
                          ? 'Fotoğraf'
                          : 'Metin paylaşımı')}
                  </Text>
                  <Text style={styles.feedItemMeta}>
                    {(p.staff as { full_name?: string } | null)?.full_name ?? 'Personel'}
                    {(p.staff as { department?: string } | null)?.department
                      ? ` · ${(p.staff as { department: string }).department}`
                      : ''}
                    {' · '}
                    {new Date(p.created_at).toLocaleDateString('tr-TR', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleDeletePost(p)}
                  style={styles.feedDeleteBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="trash-outline" size={22} color={adminTheme.colors.error} />
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </AdminCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 20, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 15, color: adminTheme.colors.textMuted },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 16,
  },
  sectionLinkBtn: { flexDirection: 'row', alignItems: 'center' },
  sectionLink: {
    fontSize: 14,
    color: adminTheme.colors.accent,
    fontWeight: '600',
    marginRight: 6,
  },
  feedEmpty: {
    fontSize: 14,
    color: adminTheme.colors.textMuted,
    textAlign: 'center',
    paddingVertical: 24,
  },
  feedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.borderLight,
  },
  feedItemLast: { borderBottomWidth: 0 },
  feedPreviewWrap: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: adminTheme.colors.surfaceTertiary,
    marginRight: 12,
  },
  feedPreviewImage: { width: 56, height: 56 },
  feedPreviewPlaceholder: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminTheme.colors.surfaceTertiary,
  },
  feedBody: { flex: 1, minWidth: 0 },
  feedDeleteBtn: { padding: 8, marginLeft: 4 },
  feedItemTitle: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
  feedItemMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
});
