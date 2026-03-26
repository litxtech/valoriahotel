# Build Alındığında Özellikler ve Paketler

Build aldığınızda (**development build** veya **EAS Build**) aşağıdaki özelliklerin çalışması gerekir. Expo Go’da **NFC** ve bazı native modüller çalışmaz; tam test için mutlaka **gerçek build** alın.

---

## ✅ Build’de Çalışacaklar

| Özellik / Paket | Açıklama | Not |
|------------------|----------|-----|
| **expo-router** | Sayfa yönlendirme | Plugin var. |
| **expo-camera** | QR / kamera | Plugin + izinler var. |
| **expo-location** | Konum, geofence | Plugin + izinler var. |
| **expo-apple-authentication** | Apple ile giriş | Plugin var (sadece iOS). |
| **expo-splash-screen** | Açılış ekranı | Plugin var. |
| **expo-local-authentication** | Biyometrik (parmak izi / Touch ID) | İzinler var (Touch/biometrik prompt). |
| **expo-image-picker** | Galeri / kamera | NSCameraUsageDescription, NSPhotoLibraryUsageDescription var. |
| **expo-file-system** | Dosya okuma/yazma | Ekstra plugin gerekmez. |
| **expo-print** | Yazdırma | Ekstra plugin gerekmez. |
| **expo-sharing** | Paylaşım | Ekstra plugin gerekmez. |
| **expo-linking** | Deep link (valoria-hotel://) | scheme: "valoria-hotel" tanımlı. |
| **react-native-nfc-manager** | NFC (Dijital Anahtar) | Plugin + iOS/Android izinleri var. **Expo Go’da çalışmaz**, sadece build’de. |
| **react-native-maps** | Harita (HotelMap) | iOS: Apple Maps kullanılıyor (API key yok). Android: Mapbox WebView kullanılıyor (EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN). |
| **react-native-qrcode-svg** | QR kod üretimi | Saf JS, build’de çalışır. |
| **react-native-webview** | WebView (harita, içerik) | Expo SDK ile gelir. |
| **react-native-signature-canvas** | İmza (sözleşme) | Build’de çalışır. |
| **Supabase** | Backend / auth | .env’deki EXPO_PUBLIC_* değişkenleri build’e gömülür. |

---

## ⚠️ Build Öncesi Kontrol Listesi

1. **.env**  
   Build’de kullanılacak değerlerin doğru olduğundan emin olun:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` (harita için)
   - `EXPO_PUBLIC_HOTEL_LAT` / `EXPO_PUBLIC_HOTEL_LON` (geofence için)

2. **iOS – Apple Developer**  
   - App ID’de **NFC Tag Reading** capability’si açık olsun (NFC için).
   - Sign in with Apple, Push vb. kullanıyorsanız ilgili capability’ler açık olsun.

3. **Android**  
   - NFC izni `app.json`’da var.
   - Harita: Şu an Android’de Mapbox WebView kullanıldığı için Google Maps API key **zorunlu değil**. İleride Android’de de `MapView` (Google Maps) kullanırsanız, `app.json` plugins içine `react-native-maps` ile `androidGoogleMapsApiKey` eklemeniz gerekir.

4. **Build komutları**  
   - Yerel: `npx expo prebuild` → `npx expo run:ios` / `npx expo run:android`
   - EAS: `eas build --platform ios` / `eas build --platform android`

---

## ❌ Expo Go’da Çalışmayanlar

- **NFC** (react-native-nfc-manager) – Sadece development build veya EAS build’de çalışır.
- Bazı native capability’ler (ör. tam NFC, arka planda konum) Expo Go’da sınırlı veya kapalı olabilir.

---

## Özet

Build aldığınızda **tüm paketler ve özellikler** (NFC dahil) çalışacak şekilde yapılandırıldı. Eksik olabilecek tek nokta: **iOS’ta Apple Developer’da NFC Tag Reading**’in açılması. .env değişkenleri build sırasında mevcut olduğu sürece Supabase, harita ve konum da build’de çalışır.
