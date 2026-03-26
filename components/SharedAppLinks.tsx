/**
 * Admin tarafından paylaşılan uygulama ve web sitesi linkleri.
 * Personel, misafir ve admin dahil herkes görebilir.
 */
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { listAdminAppLinks, type AdminAppLink } from '@/lib/adminAppLinks';
import { CachedImage } from '@/components/CachedImage';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  app_store: 'logo-apple-appstore',
  google_play: 'logo-google-playstore',
  globe: 'globe-outline',
  custom: 'image-outline',
};

function AppLinkRow({
  link,
  onManage,
  isAdmin,
  compact,
}: {
  link: AdminAppLink;
  onManage?: () => void;
  isAdmin?: boolean;
  compact?: boolean;
}) {
  const iconName = ICON_MAP[link.icon_type] ?? 'link';
  const iconSize = compact ? 22 : 28;

  const content = (
    <TouchableOpacity
      style={[styles.row, compact && styles.rowCompact]}
      onPress={() => {
        const url = link.url?.trim();
        if (url) {
          const href = url.startsWith('http') ? url : `https://${url}`;
          Linking.openURL(href).catch(() => {});
        }
      }}
      activeOpacity={0.7}
    >
      <View style={[styles.iconWrap, compact && styles.iconWrapCompact]}>
        {link.icon_type === 'custom' && link.icon_url ? (
          <CachedImage
            uri={link.icon_url}
            style={[styles.iconImg, { width: iconSize, height: iconSize }]}
            contentFit="cover"
          />
        ) : (
          <Ionicons name={iconName} size={iconSize} color={theme.colors.primary} />
        )}
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowName, compact && styles.rowNameCompact]} numberOfLines={1}>
          {link.name}
        </Text>
        {!compact && (
          <Text style={styles.rowType} numberOfLines={1}>
            {link.type === 'app' ? 'Uygulama' : 'Web sitesi'}
          </Text>
        )}
      </View>
      <Ionicons name="open-outline" size={18} color={theme.colors.textMuted} />
    </TouchableOpacity>
  );

  if (isAdmin && onManage) {
    return (
      <TouchableOpacity
        onLongPress={onManage}
        delayLongPress={400}
        style={styles.rowWrapper}
        activeOpacity={1}
      >
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

type SharedAppLinksProps = {
  /** Admin profilinde "Yönet" butonu göster */
  showManageButton?: boolean;
  /** Daha kompakt satırlar */
  compact?: boolean;
  /** Başlık (varsayılan: "Uygulamalar & Web Siteleri") */
  title?: string;
};

export function SharedAppLinks({ showManageButton, compact, title = 'Uygulamalar & Web Siteleri' }: SharedAppLinksProps) {
  const router = useRouter();
  const { staff } = useAuthStore();
  const isAdmin = staff?.role === 'admin';
  const [links, setLinks] = useState<AdminAppLink[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await listAdminAppLinks();
      setLinks(data);
    } catch {
      setLinks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return null;
  if (links.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {showManageButton && isAdmin && (
          <TouchableOpacity onPress={() => router.push('/admin/app-links')} style={styles.manageBtn}>
            <Ionicons name="create-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.manageBtnText}>Yönet</Text>
          </TouchableOpacity>
        )}
      </View>
      {compact ? (
        <View style={styles.listVertical}>
          {links.map((link) => (
            <AppLinkRow
              key={link.id}
              link={link}
              isAdmin={isAdmin}
              compact
              onManage={showManageButton ? () => router.push('/admin/app-links') : undefined}
            />
          ))}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listHorizontal}
        >
          {links.map((link) => (
            <AppLinkRow
              key={link.id}
              link={link}
              isAdmin={isAdmin}
              compact={false}
              onManage={showManageButton ? () => router.push('/admin/app-links') : undefined}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 20,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  manageBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  listHorizontal: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 16,
  },
  listVertical: {
    gap: 8,
  },
  rowWrapper: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    minWidth: 200,
  },
  rowCompact: {
    padding: 10,
    minWidth: 0,
    flex: 1,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(26,54,93,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconWrapCompact: {
    width: 36,
    height: 36,
    marginRight: 10,
  },
  iconImg: {
    borderRadius: 8,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  rowNameCompact: {
    fontSize: 14,
  },
  rowType: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
});
