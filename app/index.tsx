import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { log } from '@/lib/logger';
import { startGeofenceWatch, stopGeofenceWatch, type HotelGeofenceConfig } from '@/lib/geofencing';
import { hasPolicyConsent } from '@/lib/policyConsent';
import { theme } from '@/constants/theme';

const HOTEL_COORDS: HotelGeofenceConfig | null =
  typeof process.env.EXPO_PUBLIC_HOTEL_LAT !== 'undefined' &&
  typeof process.env.EXPO_PUBLIC_HOTEL_LON !== 'undefined'
    ? {
        latitude: Number(process.env.EXPO_PUBLIC_HOTEL_LAT),
        longitude: Number(process.env.EXPO_PUBLIC_HOTEL_LON),
        radius: 500,
      }
    : null;

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { user, staff, loading, loadSession } = useAuthStore();
  const notifiedNearby = useRef(false);

  useEffect(() => {
    log.info('HomeScreen', 'loadSession tetikleniyor');
    loadSession();
  }, []);

  useEffect(() => {
    if (!HOTEL_COORDS || staff) return;
    startGeofenceWatch(
      HOTEL_COORDS,
      (distance) => {
        if (notifiedNearby.current) return;
        notifiedNearby.current = true;
        Alert.alert(
          'Valoria Hotel',
          'Otele yakınsınız. Check-in yapmak ister misiniz?',
          [
            { text: 'Hayır', style: 'cancel', onPress: () => { notifiedNearby.current = false; } },
            { text: 'Evet', onPress: () => router.push('/guest') },
          ]
        );
      },
      (e) => log.warn('HomeScreen', 'Geofence', e?.message)
    );
    return () => stopGeofenceWatch();
  }, [staff]);

  useEffect(() => {
    if (loading) return;
    if (staff) {
      log.info('HomeScreen', 'staff var, /admin yönlendiriliyor');
      router.replace('/admin');
      return;
    }
    if (user) {
      log.info('HomeScreen', 'müşteri oturumu var, /customer yönlendiriliyor');
      router.replace('/customer');
      return;
    }
    log.info('HomeScreen', 'ana ekran gösteriliyor (giriş yok)');
  }, [loading, staff, user]);

  useEffect(() => {
    if (!loading) log.info('HomeScreen', 'durum', { hasStaff: !!staff, hasUser: !!user });
  }, [loading, staff, user]);

  const goToCustomer = async () => {
    const accepted = await hasPolicyConsent();
    if (accepted) router.replace('/customer');
    else router.push({ pathname: '/policies', params: { next: 'customer' } });
  };

  const goToGuest = async () => {
    const accepted = await hasPolicyConsent();
    if (accepted) router.replace('/guest');
    else router.push({ pathname: '/policies', params: { next: 'guest' } });
  };

  const cardWidth = Math.min(width - 48, 400);
  const paddingHorizontal = Math.max(24, (width - cardWidth) / 2);

  if (loading) {
    return (
      <View style={[styles.wrapper, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.hero}>
          <View style={styles.logoPlaceholder} />
          <Text style={styles.loadingTitle}>Valoria Hotel</Text>
          <Text style={styles.loadingSub}>Yükleniyor...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Üst: marka alanı */}
      <View style={styles.hero}>
        <View style={styles.logoMark}>
          <Text style={styles.logoText}>V</Text>
        </View>
        <Text style={styles.title}>Valoria Hotel</Text>
        <View style={styles.divider} />
        <Text style={styles.tagline}>Konaklama sözleşmesi ve giriş</Text>
      </View>

      {/* Alt: aksiyon kartı */}
      <View style={[styles.card, { width: cardWidth, marginHorizontal: paddingHorizontal }]}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={goToCustomer}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryLabel}>Müşteri uygulaması</Text>
          <Text style={styles.primaryHint}>Giriş yap veya hesap oluştur</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={goToGuest}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryLabel}>QR ile sözleşme onayı</Text>
          <Text style={styles.secondaryHint}>Oda QR kodu ile hızlı giriş</Text>
        </TouchableOpacity>

        <View style={styles.dividerLine} />

        <TouchableOpacity
          style={styles.tertiaryButton}
          onPress={() => router.push('/admin/login')}
          activeOpacity={0.8}
        >
          <Text style={styles.tertiaryLabel}>Personel girişi</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tertiaryButton, styles.tertiaryButtonLast]}
          onPress={() => router.push('/auth')}
          activeOpacity={0.8}
        >
          <Text style={styles.tertiaryLabel}>E-posta ile giriş / kayıt</Text>
        </TouchableOpacity>
      </View>

      {Platform.OS === 'web' && (
        <Text style={styles.footer}>Valoria Hotel — Konuk deneyimi</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#0f1419',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 220,
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0f1419',
    letterSpacing: -1,
  },
  logoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(184, 134, 11, 0.3)',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.65)',
    letterSpacing: 0.2,
  },
  divider: {
    width: 40,
    height: 3,
    backgroundColor: theme.colors.primary,
    borderRadius: 2,
    marginBottom: 12,
  },
  loadingTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  loadingSub: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginBottom: 24,
    ...(Platform.OS !== 'web' && {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 24,
      elevation: 12,
    }),
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  primaryLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f1419',
  },
  primaryHint: {
    fontSize: 13,
    color: 'rgba(15, 20, 25, 0.75)',
    marginTop: 2,
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  secondaryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  secondaryHint: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 2,
  },
  dividerLine: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 12,
  },
  tertiaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderRadius: 12,
  },
  tertiaryButtonLast: {
    marginBottom: 0,
  },
  tertiaryLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  footer: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.35)',
    marginBottom: 8,
  },
});
