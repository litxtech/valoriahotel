# Push Bildirim Neden Gelmiyor – Analiz

## Akış özeti

1. **Token alımı:** `getExpoPushTokenAsync()` izin ister, Expo push token döner, `AsyncStorage`'a yazılır.
2. **Backend’e kayıt:** `savePushTokenForStaff(staffId)` veya `savePushTokenForGuest(appToken)` token’ı `push_tokens` tablosuna yazar.
3. **Gönderim:** `send-expo-push` edge function’ı `push_tokens`’tan token’ları okuyup Expo API’ye push gönderir.

---

## Tespit edilen nedenler

### 1. Token hiç alınmamış / kaydedilmemiş (en olası)

- **authStore** (`loadSession` sonrası): Sadece `savePushTokenForStaff(staff.id)` çağrılıyor.  
  `savePushTokenForStaff` içinde **sadece** `getStoredExpoPushToken()` kullanılıyor; **izin isteyip token alan** `getExpoPushTokenAsync()` çağrılmıyor.  
  İlk açılışta AsyncStorage’ta token olmadığı için bu kayıt **hiçbir şey yapmıyor**.

- **Root layout** (staff varsa): `getExpoPushTokenAsync()` çağrılıyor, sonra token varsa `savePushTokenForStaff()`.  
  Bu noktada izin verilmemişse token `null` döner, tekrar deneme yapılmıyor.  
  Token ancak **Bildirimler** sekmesi açıldığında tekrar deneniyor (orada tekrar `getExpoPushTokenAsync()` + `savePushTokenForStaff` var).

**Sonuç:** Kullanıcı bildirim iznini ilk seferde vermezse veya root layout’taki çağrı izin penceresinden önce/sonra yanlış zamanda çalışırsa token hiç backend’e yazılmıyor → push gelmez.

### 2. Expo Go kullanımı

- `isExpoGo === true` ise `getExpoPushTokenAsync()` ve `savePushTokenForStaff` çalışmaz (no-op).  
- Push **sadece development build / production build**’de çalışır; Expo Go’da push gelmez.

### 3. İzin reddi

- `getExpoPushTokenAsync()` izin istiyor; kullanıcı “İzin verme” derse token `null`, kayıt yapılmaz.

### 4. Edge function / backend

- `send-expo-push`: `guestIds` veya `staffIds` ile `push_tokens`’tan token çekiyor.  
  İlgili `staff_id` / `guest_id` için satır yoksa token listesi boş, Expo’ya hiç istek gitmez.  
- RLS: Staff kendi `staff_id`’si ile `push_tokens`’a yazabiliyor; guest tarafı `upsert_guest_push_token` RPC ile.  
  Edge function service role ile okuyor; RLS burada engel değil.

### 5. Misafir (guest) tarafı

- Guest token’ı **Bildirimler** ekranı açıldığında `getExpoPushTokenAsync()` + `savePushTokenForGuest(appToken)` ile kaydediliyor.  
- `app_token` yoksa veya RPC hata verirse guest için de token yazılmaz.

---

## Yapılan iyileştirme (kod)

- **savePushTokenForStaff:** Cihazda token yoksa (`getStoredExpoPushToken()` boş) artık **önce** `getExpoPushTokenAsync()` çağrılıyor; böylece izin istenip token alınıyor ve aynı çağrıda backend’e kaydediliyor.  
  Böylece authStore’daki tek `savePushTokenForStaff(staff.id)` çağrısı bile, ilk açılışta token yoksa token alıp kaydetmeyi deniyor.

---

## Android’de bildirim (yapılandırma durumu)

Projede şunlar **tanımlı**:

| Öğe | Durum |
|-----|--------|
| `expo-notifications` plugin (`app.config.js`) | Var (ikon, kanal `valoria`) |
| `googleServicesFile` + `google-services.json` | Var (FCM için Firebase Android uygulaması) |
| `POST_NOTIFICATIONS` izni (Android 13+) | `app.config.js` → `android.permissions` içinde |
| Kod: `notificationsPush.ts` (kanal, token, izin) | Var |

**EAS / Expo tarafında sizin yapmanız gereken (kontrol):**

1. **[expo.dev](https://expo.dev)** → projeniz → **Credentials** → Android → **FCM / Google Services**  
   - Expo Push’un Android’de çalışması için **FCM V1** (Google Service Account JSON) veya ilgili adımların tamamlanmış olması gerekir.  
   - Rehber: [FCM credentials (Expo)](https://docs.expo.dev/push-notifications/fcm-credentials/)
2. `google-services.json` içindeki Firebase projesi (`valoria-8fffc`), FCM’de kullandığınız proje ile **aynı** olmalı.
3. Yeni native ayarlar için: `eas build` ile **yeni Android build** alın (`google-services.json` / izinler native’e böyle girer).

---

## iOS’ta bildirim gelmiyorsa

- **SDK 53+**: iOS’ta `getExpoPushTokenAsync()` bazen hiç dönmeyebilir (bilinen bug). Kodda **workaround** var:
  - İzin `requestPermissionsAsync` ile **iOS için açık seçeneklerle** (allowAlert, allowBadge, allowSound) isteniyor.
  - Token için `addPushTokenListener` kaydediliyor; token bu listener ile de alınabiliyor.
  - `getExpoPushTokenAsync` en fazla ~14 saniye bekleniyor; önce dönen (native çağrı veya listener) kullanılıyor.
- **EAS Build**: iOS push için uygulamanın **EAS ile build** edilmiş olması ve Apple tarafında **Push Notifications** capability’sinin açık olması gerekir. `expo-notifications` eklentisi build sırasında bunu ekler.
- **Test**: Gerçek cihazda test edin; simülatörde push gelmez.

---

## Kontrol listesi (push gelmiyorsa)

1. **Development build** veya **production build** kullan (Expo Go değil).
2. Uygulama bildirim **izin** verildi mi? (Ayarlar → Valoria → Bildirimler)
3. Staff isen: Giriş sonrası en az bir kez **Bildirimler** sekmesine gir (token orada da kaydediliyor).
4. Supabase Dashboard → Table Editor → `push_tokens`: İlgili `staff_id` veya `guest_id` için satır var mı?
5. Edge function log: `send-expo-push` çağrılıyor mu, yanıtta `sent: 0` mı? (sent: 0 ise genelde token bulunamadı.)
6. **iOS**: Uygulama EAS ile mi build edildi? Cihazda Ayarlar → Valoria → Bildirimler açık mı?

---

## Üstten bildirim ve ses gelmiyor – Expo / Apple / Firebase karşılaştırması

Bu bölüm, Android ve iOS’ta **üstten bildirim (banner)** ve **ses** gelmeme sorununu Expo, Apple Developer ve Firebase ayarları açısından karşılaştırır.

### Akış özeti

```
Supabase send-expo-push → Expo Push API (exp.host) → FCM (Android) / APNs (iOS) → Cihaz
```

Sorun bu zincirin herhangi bir yerinde olabilir. Aşağıdaki tablo hangi ayarın eksik veya bozuk olduğunu tespit etmeye yardımcı olur.

### Karşılaştırma tablosu

| Katman | Ayar | Beklenen | Proje durumu | Kritiklik |
|--------|------|----------|--------------|-----------|
| **Expo (app.config)** | `expo-notifications` plugin | Var | ✓ `defaultChannelId: 'valoria'`, `androidMode: 'default'` | OK |
| **Expo (app.config)** | `googleServicesFile` | Proje kökünde yol | ✓ `./google-services.json` | OK |
| **Expo (kod)** | `setNotificationHandler` | `shouldShowAlert`, `shouldPlaySound`, `shouldShowBanner` | ✓ Tümü `true` (`notificationsPush.ts`) | OK |
| **Expo (kod)** | Android kanal | `valoria` kanalı, MAX importance, sound | ✓ `valoria` + `default` kanalları oluşturuluyor | OK |
| **Expo (backend)** | Push payload | `channelId`, `priority: "high"`, `sound: "default"` | ✓ `send-expo-push` bunları gönderiyor | OK |
| **EAS Credentials** | FCM Legacy | Server key veya V1 kullanılacak | ⚠ **None assigned yet** | **KRİTİK** |
| **EAS Credentials** | FCM V1 | Google Service Account JSON | ⚠ **None assigned yet** | **KRİTİK** |
| **Firebase** | `google-services.json` | Proje + paket eşleşmesi | ✓ `valoria-8fffc`, `com.valoria.hotel` | OK |
| **Firebase** | Cloud Messaging | FCM etkin, API açık | Kontrol edilmeli | Orta |
| **Apple Developer** | Push Notifications | App ID’de capability açık | Kontrol edilmeli | iOS için kritik |
| **Apple Developer** | APNs Key | EAS’a yüklenmiş | Kontrol edilmeli | iOS için kritik |

### Bulgu: Android için FCM credentials eksik

**EAS Dashboard**’da (`expo.dev` → proje → Credentials → Android) şu durum görünüyor:

- **Push Notifications (FCM Legacy):** None assigned yet  
- **Push Notifications (FCM V1):** None assigned yet  

Expo Push Service, Android bildirimlerini FCM üzerinden gönderir. FCM V1 credentials atanmamışsa, Expo → FCM adımında `InvalidCredentials` veya benzeri hata oluşur ve bildirim cihaza hiç ulaşmaz. Bu durumda üstten bildirim ve ses sorunu değil, **bildirimin hiç gelmemesi** söz konusudur.

### Yapılacaklar

#### 1. Android: FCM V1 credentials atama (öncelikli)

1. [Firebase Console](https://console.firebase.google.com/) → Proje **valoria-8fffc**
2. **Project settings** → **Service accounts** → **Generate new private key**
3. İndirilen JSON dosyasını güvenli sakla (`.gitignore`’da olduğundan emin ol)
4. **EAS CLI** ile yükle:
   ```bash
   eas credentials
   ```
   - Android → production → **Google Service Account** → **Manage FCM V1**
   - **Upload a new service account key** → JSON dosyasını seç
5. Yeni bir Android build al: `eas build --platform android --profile production`
6. [Expo Push Notifications Tool](https://expo.dev/notifications) ile test et

#### 2. Firebase: Cloud Messaging API

1. [Google Cloud Console](https://console.cloud.google.com/) → Proje **valoria-8fffc**
2. **APIs & Services** → **Enabled APIs** → **Firebase Cloud Messaging API** etkin olmalı
3. Gerekirse **Cloud Messaging API (Legacy)** etkin olmalı (FCM V1 tercih edilse bile bazı setup adımlarında kullanılabilir)

#### 3. iOS: Apple Developer

1. [Apple Developer](https://developer.apple.com/account) → **Certificates, Identifiers & Profiles**
2. **Identifiers** → `com.valoria.hotel` → **Push Notifications** capability’sinin açık olduğundan emin ol
3. **Keys** → APNs key oluştur (yoksa), indir, `.p8` dosyasını sakla
4. EAS’a yükle:
   ```bash
   eas credentials
   ```
   - iOS → production → **Push Notifications** → APNs key’i yükle
5. Yeni iOS build al: `eas build --platform ios --profile production`

#### 4. Push receipt kontrolü (hata tespiti)

Bildirim gönderildikten 15 dakika sonra Expo Push Receipt API ile sonucu kontrol et. Hata varsa `details.error` alanında `InvalidCredentials`, `MismatchSenderId`, `DeviceNotRegistered` gibi değerler görülebilir.

- `InvalidCredentials` → FCM V1 veya APNs key eksik/hatalı  
- `MismatchSenderId` → Firebase proje numarası / `google-services.json` uyumsuz

### Kod tarafında doğru olanlar

- `lib/notificationsPush.ts`: `shouldShowAlert`, `shouldPlaySound`, `shouldShowBanner`, `shouldShowList` hepsi `true`
- Android kanalları (`valoria`, `default`): `importance: MAX`, `sound: 'default'`
- `send-expo-push`: `channelId: "valoria"`, `priority: "high"`, `sound: "default"`
- `app.config.js`: `expo-notifications` plugin ile `defaultChannelId: 'valoria'`

Bu ayarlar doğru. Sorun büyük ihtimalle **EAS / Firebase / Apple credentials** tarafındadır.

---

## iOS: Ses ve üstten bildirim gelmiyorsa

### Payload güncellemeleri (yapıldı)
- `interruptionLevel: "active"` tüm push fonksiyonlarına eklendi (APNs için)
- `sound: "default"` zaten vardı

### Kontrol listesi

1. **APNs key EAS’ta mı?**  
   expo.dev → Credentials → iOS → Push Notifications → APNs key yüklü olmalı

2. **iPhone ayarları**  
   Ayarlar → Bildirimler → **Valoria**:
   - Bildirimlere İzin Ver: **Açık**
   - Banner’lar: **Geçici** veya **Kalıcı**
   - Sesler: **Açık**

3. **Odak Modu (Focus)**  
   Odak Modu açıksa bildirimler susturulabilir. `interruptionLevel: "active"` Odak Modu’nu geçemez; bunun için Apple’dan “Time Sensitive” yetkisi gerekir.

4. **Test ortamı**  
   Simülatörde push gelmez; mutlaka fiziksel cihazda test edin.

5. **Bilinen Expo sınırlaması**  
   `expo-notifications` ile iOS’ta bazı cihazlarda ses sorunu olabiliyor. Payload doğruysa ve kullanıcı ayarları açıksa, Expo SDK güncellemesi gerekebilir.
