/**
 * Valoria Harita - Restoran, eczane, hastane, jandarma vb. tek haritada.
 * Yol tarifi ve detay uygulama içi (Google Maps'e yönlendirme yok).
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  TextInput,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Keyboard,
  TouchableWithoutFeedback,
  Modal,
  Pressable,
  Linking,
  AppState,
} from 'react-native';
import { usePathname, useRouter, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import CustomerMapPicker from '@/components/CustomerMapPicker';
import {
  fetchPoisHybrid,
  getPoiIcon,
  getPoiTypeLabel,
  setPoisCache,
  type Poi,
  type PoiType,
} from '@/lib/map/pois';
import { searchPoisByText } from '@/lib/map/poiSearch';
import { getRoute, formatDuration, formatDistance, estimateWalkingDuration } from '@/lib/map/osrm';
import type { OSRMRoute } from '@/lib/map/osrm';
import { fetchNearbyMapUsers, upsertMyLocation } from '@/lib/map/userLocations';
import { getOrCreateGuestForCaller } from '@/lib/getOrCreateGuestForCaller';
import { guestDisplayName } from '@/lib/guestDisplayName';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MapUserMarker } from '@/lib/map/types';
import MapShareSheet from '@/components/MapShareSheet';
import MapPostDetailSheet from '@/components/MapPostDetailSheet';
import { supabase } from '@/lib/supabase';
import { CachedImage } from '@/components/CachedImage';

const HOTEL_LAT = typeof process.env.EXPO_PUBLIC_HOTEL_LAT !== 'undefined' ? Number(process.env.EXPO_PUBLIC_HOTEL_LAT) : 40.6144;
const HOTEL_LON = typeof process.env.EXPO_PUBLIC_HOTEL_LON !== 'undefined' ? Number(process.env.EXPO_PUBLIC_HOTEL_LON) : 40.31188;

const POI_TYPES: PoiType[] = ['restaurant', 'cafe', 'hotel', 'pharmacy', 'hospital', 'police'];

const TAB_BAR_ESTIMATE = 90;

export default function CustomerMapScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const { user, staff } = useAuthStore();
  const [pois, setPois] = useState<Poi[]>([]);
  const [nearbyMapUsers, setNearbyMapUsers] = useState<MapUserMarker[]>([]);
  const [filterTypes, setFilterTypes] = useState<PoiType[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationPermStatus, setLocationPermStatus] = useState<'granted' | 'denied' | 'undetermined' | 'unavailable' | null>(null);
  const [layoutHeight, setLayoutHeight] = useState(Math.max(300, winHeight - TAB_BAR_ESTIMATE));
  const [poiCenter, setPoiCenter] = useState({ lat: HOTEL_LAT, lng: HOTEL_LON });
  const [routeData, setRouteData] = useState<{ route: OSRMRoute; toName: string } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [locationCardVisible, setLocationCardVisible] = useState(false);
  const [locationRequesting, setLocationRequesting] = useState(false);
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [mapPosts, setMapPosts] = useState<{ id: string; lat: number; lng: number; authorName: string; authorAvatarUrl: string | null; postPreviewUrl: string | null; staffId: string | null; guestId: string | null }[]>([]);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFeedPostsWithLocation = useCallback(async () => {
    const { data } = await supabase
      .from('feed_posts')
      .select('id, lat, lng, staff_id, guest_id, media_type, thumbnail_url, media_url, staff:staff_id(full_name, profile_image), guest:guest_id(full_name, photo_url)')
      .eq('visibility', 'customers')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);
    const rows = (data ?? []) as { id: string; lat: number; lng: number; staff_id?: string | null; guest_id?: string | null; media_type?: string; thumbnail_url?: string | null; media_url?: string | null; staff: { full_name: string | null; profile_image?: string | null } | null; guest: { full_name: string | null; photo_url?: string | null } | null }[];
    const posts = rows.map((r) => {
      const staffInfo = Array.isArray(r.staff) ? r.staff[0] : r.staff;
      const guestInfo = Array.isArray(r.guest) ? r.guest[0] : r.guest;
      const authorName = r.staff_id
        ? (staffInfo?.full_name?.trim() || 'Personel')
        : guestDisplayName(guestInfo?.full_name, 'Misafir');
      const authorAvatarUrl = staffInfo?.profile_image ?? guestInfo?.photo_url ?? null;
      const postPreviewUrl = r.thumbnail_url ?? (r.media_type === 'image' ? r.media_url : null) ?? null;
      return { id: r.id, lat: r.lat, lng: r.lng, authorName, authorAvatarUrl, postPreviewUrl, staffId: r.staff_id ?? null, guestId: r.guest_id ?? null };
    });
    setMapPosts(posts);
  }, []);

  const clearMapPostPin = useCallback((id: string) => {
    setMapPosts((prev) => prev.filter((p) => p.id !== id));
    setSelectedPostId((cur) => (cur === id ? null : cur));
  }, []);

  const loadPois = useCallback(async () => {
    setLoading(true);
    const center = userLocation ?? poiCenter;
    const lat = center.lat;
    const lng = center.lng;
    const list = await fetchPoisHybrid(lat, lng, 3500, { types: filterTypes.length ? filterTypes : undefined }, {
      writeOverpassToDb: !!user,
    });
    setPois(list);
    setLoading(false);
  }, [poiCenter.lat, poiCenter.lng, filterTypes, user, userLocation]);

  const handleRegionChange = useCallback((center: { lat: number; lng: number }) => {
    setPoiCenter(center);
  }, []);

  const avatarUrl = staff?.profile_image ?? (user?.user_metadata?.avatar_url as string | undefined) ?? null;
  const displayName = staff?.full_name ?? (user?.user_metadata?.full_name as string) ?? (user?.user_metadata?.name as string) ?? user?.email?.split('@')[0] ?? null;

  const loadNearbyMapUsers = useCallback(async () => {
    const center = userLocation ?? poiCenter;
    const users = await fetchNearbyMapUsers(center.lat, center.lng);
    const myGuestId = staff ? undefined : user ? (await getOrCreateGuestForCaller(user))?.guest_id : undefined;
    const myStaffId = staff?.id;
    const markers: MapUserMarker[] = users
      .filter((u) => (u.userType === 'guest' && u.userId !== myGuestId) || (u.userType === 'staff' && u.userId !== myStaffId))
      .map((u) => ({
        id: u.id,
        lat: u.lat,
        lng: u.lng,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        isMe: false,
      }));
    setNearbyMapUsers(markers);
  }, [poiCenter.lat, poiCenter.lng, userLocation, user, staff]);

  const upsertMyMapLocation = useCallback(async () => {
    if (!userLocation) return;
    if (staff) {
      await upsertMyLocation({
        lat: userLocation.lat,
        lng: userLocation.lng,
        userType: 'staff',
        userId: staff.id,
        displayName: staff.full_name ?? null,
        avatarUrl: staff.profile_image ?? null,
      });
    } else if (user) {
      const guest = await getOrCreateGuestForCaller(user);
      if (guest) {
        await upsertMyLocation({
          lat: userLocation.lat,
          lng: userLocation.lng,
          userType: 'guest',
          userId: guest.guest_id,
          displayName: displayName ?? null,
          avatarUrl: avatarUrl ?? null,
        });
      }
    }
  }, [userLocation, user, staff, displayName, avatarUrl]);

  useEffect(() => {
    if (!user && !staff) return;
    const t = setTimeout(loadNearbyMapUsers, 400);
    return () => clearTimeout(t);
  }, [loadNearbyMapUsers, user, staff, poiCenter.lat, poiCenter.lng]);

  useFocusEffect(
    useCallback(() => {
      void loadFeedPostsWithLocation();
    }, [loadFeedPostsWithLocation])
  );

  useEffect(() => {
    const channel = supabase
      .channel('map_feed_posts_pins')
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'feed_posts' },
        (payload) => {
          const id = (payload.old as { id?: string })?.id;
          if (id) setMapPosts((prev) => prev.filter((p) => p.id !== id));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'feed_posts' },
        (payload) => {
          const row = payload.new as { id?: string; lat?: number | null; lng?: number | null; visibility?: string | null };
          if (!row?.id) return;
          const lostPin =
            row.lat == null ||
            row.lng == null ||
            (row.visibility != null && row.visibility !== 'customers');
          if (lostPin) setMapPosts((prev) => prev.filter((p) => p.id !== row.id));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!userLocation || (!user && !staff)) return;
    upsertMyMapLocation();
    const t = setInterval(upsertMyMapLocation, 2 * 60 * 1000);
    return () => clearInterval(t);
  }, [userLocation, user, staff, upsertMyMapLocation]);

  const userMarkers: MapUserMarker[] =
    userLocation && (user || staff)
      ? [
          {
            id: 'me',
            lat: userLocation.lat,
            lng: userLocation.lng,
            displayName: displayName ?? undefined,
            avatarUrl: avatarUrl ?? undefined,
            isMe: true,
          },
          ...nearbyMapUsers,
        ]
      : nearbyMapUsers;

  // Metin araması: Nominatim (OSM) ile tam entegre; filtre: Overpass/DB.
  useEffect(() => {
    const q = searchQuery.trim();
    const hasFilter = filterTypes.length > 0;
    if (!q && !hasFilter) {
      setPois([]);
      return;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (hasFilter && !q) {
      loadPois();
      return;
    }
    if (q.length >= 2) {
      searchDebounceRef.current = setTimeout(async () => {
        searchDebounceRef.current = null;
        setLoading(true);
        try {
          const center = userLocation ?? poiCenter;
          const results = await searchPoisByText(q, {
            centerLat: center.lat,
            centerLng: center.lng,
            limit: 20,
          });
          setPois(results);
          setPoisCache(results);
        } catch (_) {
          setPois([]);
        } finally {
          setLoading(false);
        }
      }, 350);
    } else {
      setPois([]);
    }
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery, filterTypes, loadPois, userLocation, poiCenter]);

  useEffect(() => {
    setPoisCache(pois);
  }, [pois]);

  const refreshLocationStatus = useCallback(async () => {
    const { status } = await Location.getForegroundPermissionsAsync();
    const st = status as 'granted' | 'denied' | 'undetermined' | 'unavailable';
    setLocationPermStatus(st);
    if (st === 'granted') {
      const loc = await Location.getCurrentPositionAsync({}).catch(() => null);
      if (loc) setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    }
  }, []);

  useEffect(() => {
    refreshLocationStatus().catch(() => {});
  }, [refreshLocationStatus]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshLocationStatus();
    });
    return () => sub.remove();
  }, [refreshLocationStatus]);

  const requestUserLocation = useCallback(async () => {
    setLocationRequesting(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const st = status as 'granted' | 'denied' | 'undetermined' | 'unavailable';
      setLocationPermStatus(st);
      if (st !== 'granted') {
        setUserLocation(null);
        if (st === 'denied') {
          Alert.alert(
            'Konum izni kapalı',
            'Konum iznini açmak için ayarlara gidebilirsiniz.',
            [
              { text: 'Ayarları aç', onPress: () => Linking.openSettings() },
            ]
          );
        } else {
          Alert.alert('Konum izni verilmedi', 'Yol tarifi için varsayılan olarak otel konumu kullanılır.');
        }
        return;
      }
      const loc = await Location.getCurrentPositionAsync({}).catch(() => null);
      if (loc) setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      setLocationCardVisible(false);
    } finally {
      setLocationRequesting(false);
    }
  }, []);

  const q = searchQuery.trim();
  const filteredPois =
    q.length >= 2
      ? filterTypes.length > 0
        ? pois.filter((p) => filterTypes.includes(p.type))
        : pois
      : filterTypes.length > 0
        ? pois.filter((p) => filterTypes.includes(p.type))
        : pois;

  const toggleFilter = (type: PoiType) => {
    setFilterTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  };

  const goBack = () => {
    if (pathname.startsWith('/admin')) {
      router.replace('/admin');
      return;
    }
    if (pathname.startsWith('/staff')) {
      router.replace('/staff');
      return;
    }
    router.replace('/customer');
  };

  const showSuggestions = searchQuery.trim().length > 0 || filterTypes.length > 0;
  const fromForDirections = userLocation ?? { lat: HOTEL_LAT, lng: HOTEL_LON };

  const routeCoordinates =
    routeData?.route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })) ?? [];

  const showRouteToPoi = (poi: Poi) => {
    Keyboard.dismiss();
    setRouteLoading(true);
    setRouteData(null);
    getRoute(fromForDirections, { lat: poi.lat, lng: poi.lng }).then((r) => {
      setRouteLoading(false);
      setRouteData(r ? { route: r, toName: poi.name } : null);
    });
  };

  const showRouteToHotel = () => {
    Keyboard.dismiss();
    setRouteLoading(true);
    setRouteData(null);
    getRoute(fromForDirections, { lat: HOTEL_LAT, lng: HOTEL_LON }).then((r) => {
      setRouteLoading(false);
      setRouteData(r ? { route: r, toName: 'Valoria Hotel' } : null);
    });
  };

  const dismissSearchAndSuggestions = () => {
    Keyboard.dismiss();
    setSearchQuery('');
    setFilterTypes([]);
  };

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        const { height } = e.nativeEvent.layout;
        if (height > 100) setLayoutHeight(Math.round(height));
      }}
      pointerEvents="box-none"
    >
      {/* Boşluğa (haritaya) tıklanınca klavye kapansın ve öneriler kaybolsun */}
      <TouchableWithoutFeedback onPress={dismissSearchAndSuggestions} accessible={false}>
        <View style={[styles.mapContainer, { width: winWidth, height: layoutHeight }]} pointerEvents="box-none">
          <CustomerMapPicker
            initialLat={HOTEL_LAT}
            initialLng={HOTEL_LON}
            initialZoom={15}
            pois={filteredPois}
            routeCoordinates={routeCoordinates}
            hotelMarker={{ lat: HOTEL_LAT, lng: HOTEL_LON, title: 'Valoria Hotel' }}
            userMarkers={userMarkers}
            postMarkers={mapPosts.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, displayName: p.authorName, avatarUrl: p.postPreviewUrl ?? p.authorAvatarUrl }))}
            onPoiPress={showRouteToPoi}
            onHotelPress={showRouteToHotel}
            onPostPress={(postId) => setSelectedPostId(postId)}
            onRegionChangeComplete={handleRegionChange}
            style={{ width: winWidth, height: Math.max(300, layoutHeight) }}
          />
        </View>
      </TouchableWithoutFeedback>

      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      )}

      {routeLoading && (
        <View style={[styles.loadingOverlay, { bottom: 200 }]} pointerEvents="none">
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.routeLoadingText}>Rota hesaplanıyor...</Text>
        </View>
      )}

      {routeData && (
        <View style={[styles.routeSheet, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.routeSheetTitle}>📍 {routeData.toName}</Text>
          <View style={styles.routeMetaRow}>
            <Text style={styles.routeMeta}>⏱️ {formatDuration(routeData.route.duration)}</Text>
            <Text style={styles.routeMeta}>🚶 ~{formatDuration(estimateWalkingDuration(routeData.route.distance))}</Text>
            <Text style={styles.routeMeta}>📏 {formatDistance(routeData.route.distance)}</Text>
          </View>
          <Text style={styles.routeStepsTitle}>Adım adım</Text>
          <ScrollView style={styles.routeStepsScroll} showsVerticalScrollIndicator={false}>
            {routeData.route.steps.map((step, i) => (
              <View key={i} style={styles.routeStepRow}>
                <Text style={styles.routeStepNum}>{i + 1}.</Text>
                <Text style={styles.routeStepText}>
                  {step.maneuver?.instruction ?? step.name ?? 'Devam et'} — {formatDistance(step.distance)}
                </Text>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.routeCloseBtn} onPress={() => setRouteData(null)} activeOpacity={0.8}>
            <Text style={styles.routeCloseBtnText}>Kapat</Text>
          </TouchableOpacity>
        </View>
      )}

      {locationPermStatus && locationPermStatus !== 'granted' && locationPermStatus !== 'unavailable' && (
        <TouchableOpacity
          style={[styles.locationUseBtn, { bottom: insets.bottom + 24 }]}
          onPress={() => setLocationCardVisible(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="location-outline" size={20} color="#fff" />
          <Text style={styles.locationUseBtnText}>Konumumu kullan</Text>
        </TouchableOpacity>
      )}

      {/* Haritadan paylaşım — artı butonu: haritada kart açılır, sayfa değişmez */}
      {(user || staff) && (
        <TouchableOpacity
          style={[styles.shareFab, { bottom: insets.bottom + (locationPermStatus && locationPermStatus !== 'granted' && locationPermStatus !== 'unavailable' ? 90 : 24) }]}
          onPress={() => setShareSheetVisible(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      <MapShareSheet
        visible={shareSheetVisible}
        onClose={() => setShareSheetVisible(false)}
        location={userLocation ?? poiCenter}
        onSuccess={loadFeedPostsWithLocation}
      />

      <MapPostDetailSheet
        visible={!!selectedPostId}
        postId={selectedPostId}
        onClose={() => setSelectedPostId(null)}
        onPostDeleted={() => {
          setSelectedPostId(null);
          loadFeedPostsWithLocation();
        }}
        onPostUnavailable={clearMapPostPin}
      />

      <Modal visible={locationCardVisible} transparent animationType="fade" onRequestClose={() => {}}>
        <Pressable style={styles.permCardOverlay}>
          <Pressable style={styles.permCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.permCardHeader}>
              <View style={styles.permCardIconWrap}>
                <Ionicons name="location-outline" size={24} color={theme.colors.primary} />
              </View>
              <View style={styles.permCardTitleWrap}>
                <Text style={styles.permCardTitle}>Konum izni</Text>
                <Text style={styles.permCardSubtitle}>
                  Haritada bulunduğunuz yeri göstermek ve yol tarifi için başlangıç noktası kullanmak üzere konum erişimi gerekir.
                </Text>
              </View>
              <View
                style={[
                  styles.permCardBadge,
                  {
                    backgroundColor:
                      locationPermStatus === 'granted'
                        ? theme.colors.success + '22'
                        : locationPermStatus === 'denied'
                          ? theme.colors.error + '22'
                          : theme.colors.borderLight,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.permCardBadgeText,
                    {
                      color:
                        locationPermStatus === 'granted'
                          ? theme.colors.success
                          : locationPermStatus === 'denied'
                            ? theme.colors.error
                            : theme.colors.textSecondary,
                    },
                  ]}
                >
                  {locationPermStatus === 'granted'
                    ? 'Verildi'
                    : locationPermStatus === 'denied'
                      ? 'Kapalı'
                      : 'İstenmedi'}
                </Text>
              </View>
            </View>
            <View style={styles.permCardNotes}>
              <Text style={styles.permCardNote}>• "Devam" derseniz sistem izin penceresi açılır.</Text>
              <Text style={styles.permCardNote}>• Daha önce reddedildiyse ayarlardan konum iznini açmanız gerekir.</Text>
            </View>
            <TouchableOpacity
              style={[styles.permCardPrimaryBtn, locationRequesting && { opacity: 0.75 }]}
              onPress={() => {
                if (locationPermStatus === 'denied') {
                  Linking.openSettings();
                  setLocationCardVisible(false);
                } else {
                  requestUserLocation();
                }
              }}
              disabled={locationRequesting}
              activeOpacity={0.85}
            >
              {locationRequesting ? (
                <ActivityIndicator size="small" color={theme.colors.white} />
              ) : (
                <>
                  <Ionicons
                    name={locationPermStatus === 'denied' ? 'settings-outline' : 'checkmark-circle-outline'}
                    size={20}
                    color={theme.colors.white}
                  />
                  <Text style={styles.permCardPrimaryText}>
                    {locationPermStatus === 'denied' ? 'Ayarları aç' : 'Devam'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={[styles.topBar, { paddingTop: insets.top + 12, paddingBottom: theme.spacing.sm }]} pointerEvents="box-none">
        <View style={styles.topBarContent}>
          <View style={styles.topRow}>
            <TouchableOpacity style={styles.backButton} onPress={goBack} activeOpacity={0.8}>
              <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
            </TouchableOpacity>
            <TextInput
              style={styles.searchInput}
              placeholder="🔍 İşletme veya tür ara..."
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <TouchableOpacity
              style={[styles.filterDrawerBtn, filterTypes.length > 0 && styles.filterDrawerBtnActive]}
              onPress={() => setFilterDrawerOpen((o) => !o)}
              activeOpacity={0.8}
            >
              <Ionicons name="options-outline" size={22} color={filterTypes.length > 0 ? theme.colors.primary : 'rgba(255,255,255,0.8)'} />
              {filterTypes.length > 0 ? (
                <View style={styles.filterDrawerBadge}>
                  <Text style={styles.filterDrawerBadgeText}>{filterTypes.length}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>
          {mapPosts.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.postAvatarsScroll}
              style={styles.postAvatarsBar}
            >
              {mapPosts.map((p) => {
                const profileHref = p.staffId ? `/customer/staff/${p.staffId}` : p.guestId ? `/customer/guest/${p.guestId}` : null;
                const isGuestPost = !!p.guestId && !p.staffId;
                return (
                <TouchableOpacity
                  key={p.id}
                  style={styles.postAvatarItem}
                  onPress={() => setSelectedPostId(p.id)}
                  onLongPress={profileHref ? () => router.push(profileHref) : undefined}
                  activeOpacity={0.8}
                  delayLongPress={400}
                >
                  <View style={[styles.postAvatarRing, isGuestPost && styles.postAvatarRingGuest]}>
                    {p.postPreviewUrl ? (
                      <CachedImage uri={p.postPreviewUrl} style={styles.postAvatarImg} contentFit="cover" />
                    ) : p.authorAvatarUrl ? (
                      <CachedImage uri={p.authorAvatarUrl} style={styles.postAvatarImg} contentFit="cover" />
                    ) : (
                      <View style={[styles.postAvatarImg, isGuestPost ? styles.postAvatarPlaceholderGuest : styles.postAvatarPlaceholder]}>
                        <Text style={isGuestPost ? styles.postAvatarInitialGuest : styles.postAvatarInitial}>{p.authorName.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.postAvatarName} numberOfLines={1}>{p.authorName}</Text>
                </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
          {filterDrawerOpen && (
            <View style={styles.filterDrawer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {POI_TYPES.map((type) => {
                  const active = filterTypes.includes(type);
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => toggleFilter(type)}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                        {getPoiIcon(type)} {getPoiTypeLabel(type)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
          {showSuggestions && (
            <ScrollView style={styles.suggestionsList} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {loading && filteredPois.length === 0 ? (
                <Text style={styles.suggestionPlaceholder}>Aranıyor...</Text>
              ) : filteredPois.length === 0 ? (
                <View style={styles.emptySuggestions}>
                  <Text style={styles.suggestionPlaceholder}>Bu bölgede mekan bulunamadı.</Text>
                  <Text style={styles.suggestionHint}>Haritayı kaydırıp başka bölgeye tıklayın veya konum iznini açın.</Text>
                </View>
              ) : (
                filteredPois.map((poi) => (
                  <View key={poi.id} style={styles.suggestionRow}>
                    <TouchableOpacity
                      style={styles.suggestionRowMain}
                      onPress={() => showRouteToPoi(poi)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.suggestionIcon}>{getPoiIcon(poi.type)}</Text>
                      <View style={styles.suggestionInfo}>
                        <Text style={styles.suggestionName} numberOfLines={1}>{poi.name}</Text>
                        <Text style={styles.suggestionMeta}>{getPoiTypeLabel(poi.type)}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.directionsBtn}
                      onPress={() => showRouteToPoi(poi)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="navigate" size={18} color={theme.colors.primary} />
                      <Text style={styles.directionsBtnText}>Yol tarifi al</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1d21',
  },
  mapContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  mapFill: {
    width: '100%',
    height: '100%',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    gap: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    ...theme.shadows.sm,
  },
  postAvatarsBar: {
    marginBottom: theme.spacing.sm,
  },
  postAvatarsScroll: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 8,
  },
  postAvatarItem: {
    alignItems: 'center',
    marginRight: 16,
  },
  postAvatarRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(0,0,0,0.4)',
    ...theme.shadows.sm,
  },
  postAvatarRingGuest: {
    borderColor: theme.colors.guestAvatarBg,
  },
  postAvatarImg: {
    width: '100%',
    height: '100%',
  },
  postAvatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  postAvatarPlaceholderGuest: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.guestAvatarBg,
  },
  postAvatarInitial: {
    fontSize: 22,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  postAvatarInitialGuest: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.guestAvatarLetter,
  },
  postAvatarName: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    maxWidth: 70,
    textAlign: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: theme.spacing.lg,
  },
  filterDrawerBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterDrawerBtnActive: {
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  filterDrawerBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterDrawerBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  filterDrawer: {
    marginBottom: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    height:40,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: theme.spacing.lg,
    fontSize: 15,
    color: '#fff',
  },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  filterChipActive: { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.35)' },
  filterChipText: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },
  topBarContent: { maxHeight: 280 },
  suggestionsList: { maxHeight: 200, marginTop: theme.spacing.sm },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: theme.radius.md,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  suggestionRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  suggestionIcon: { fontSize: 20, marginRight: 10 },
  suggestionInfo: { flex: 1, minWidth: 0 },
  suggestionName: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.95)' },
  suggestionMeta: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginLeft: 4,
    borderRadius: theme.radius.sm,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  directionsBtnText: { fontSize: 12, fontWeight: '600', color: theme.colors.primary },
  suggestionPlaceholder: { fontSize: 14, color: 'rgba(255,255,255,0.7)', paddingVertical: 12, paddingHorizontal: 4 },
  emptySuggestions: { paddingVertical: 12, paddingHorizontal: 4 },
  suggestionHint: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6, paddingHorizontal: 4 },
  loadingOverlay: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    padding: 8,
    borderRadius: theme.radius.full,
    zIndex: 0,
  },
  routeLoadingText: { fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 4 },
  routeSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '48%',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    zIndex: 15,
    ...theme.shadows.lg,
  },
  routeSheetTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  routeMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
  routeMeta: { fontSize: 13, color: theme.colors.textSecondary },
  routeStepsTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.text, marginTop: 4, marginBottom: 6 },
  routeStepsScroll: { maxHeight: 160 },
  routeStepRow: { flexDirection: 'row', marginBottom: 6 },
  routeStepNum: { fontWeight: '700', width: 22, color: theme.colors.primary, fontSize: 13 },
  routeStepText: { flex: 1, fontSize: 13, color: theme.colors.text },
  routeCloseBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
  },
  routeCloseBtnText: { fontSize: 15, fontWeight: '600', color: theme.colors.white },

  shareFab: {
    position: 'absolute',
    right: theme.spacing.lg,
    width: 55,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    ...theme.shadows.lg,
    shadowColor: '#000',
    shadowOpacity: 0.35,
  },
  locationUseBtn: {
    position: 'absolute',
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    height: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    backgroundColor: '#0c0c0c',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    zIndex: 20,
    ...theme.shadows.lg,
    shadowColor: '#000',
    shadowOpacity: 0.4,
  },
  locationUseBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  permCardOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 18,
  },
  permCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    ...theme.shadows.md,
  },
  permCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  permCardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primary + '30',
  },
  permCardTitleWrap: { flex: 1, minWidth: 0 },
  permCardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 4,
  },
  permCardSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  permCardBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  permCardBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  permCardNotes: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 14,
  },
  permCardNote: {
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 18,
  },
  permCardPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    ...theme.shadows.sm,
  },
  permCardPrimaryText: {
    color: theme.colors.white,
    fontWeight: '800',
    fontSize: 15,
  },
  permCardSecondaryBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: 'center',
  },
  permCardSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
});
