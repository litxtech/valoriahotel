# Apple ve Google Tarafında Yapılacaklar

Valoria Hotel uygulamasını **App Store (Apple)** ve **Google Play (Google)** yayına almak için adımlar.

---

## Genel hazırlık (her iki mağaza için)

1. **Hesap açın**
   - **Apple:** [App Store Connect](https://appstoreconnect.apple.com) – Apple Developer Program üyeliği (yıllık ücret).
   - **Google:** [Google Play Console](https://play.google.com/console) – tek seferlik kayıt ücreti.

2. **Uygulama ikonu ve ekran görüntüleri**
   - İkon: 1024x1024 (Apple), 512x512 (Google).
   - Ekran görüntüleri: Her cihaz boyutu için (iPhone 6.7", 6.5", 5.5"; Android telefon/tablet).
   - Gerekirse: tanıtım metni, gizlilik politikası URL’i.

3. **EAS Build (Expo) ile store’a gönderim**
   - `eas build --platform ios --profile production`
   - `eas build --platform android --profile production`
   - `eas submit` ile build’i App Store Connect / Play Console’a yükleyin.

---

## APPLE (App Store) tarafında yapılacaklar

### 1. Apple Developer Program
- [developer.apple.com](https://developer.apple.com) → **Account** → **Membership**.
- Yıllık üyelik (ör. 99 USD) ile App Store dağıtımı açılır.

### 2. App Store Connect’te uygulama
- **App Store Connect** → **My Apps** → **+** → **New App**.
- **Platform:** iOS.  
- **Name:** Valoria Hotel.  
- **Primary Language:** Türkçe (veya tercih ettiğiniz dil).  
- **Bundle ID:** `com.valoria.hotel` (app.json’daki ile aynı olmalı).  
- **SKU:** Benzersiz bir kod (örn. `valoria-hotel-1`).

### 3. Sözleşmeler ve ödemeler
- **Agreements, Tax, and Banking** bölümünden:
  - Gerekli sözleşmeleri kabul edin.
  - Vergi formu doldurun.
  - Banka bilgisi ekleyin (ücretli uygulama veya iç satın alma yapacaksanız).

### 4. Uygulama bilgileri
- **App Information:** Kategori (örn. Travel), alt kategori.
- **Pricing:** Ücretsiz veya fiyat.
- **Privacy Policy URL:** Gizlilik politikası sayfanız.
- **App Privacy:** Veri toplama özeti (konum, kimlik vb. için form doldurulur).

### 5. Sürüm bilgisi (her yeni sürüm için)
- **Screenshots:** iPhone 6.7", 6.5", 5.5" (zorunlu boyutlar).
- **Description:** Uygulama açıklaması (Türkçe/İngilizce).
- **Keywords:** Arama anahtar kelimeleri.
- **Support URL:** Destek sayfası veya e‑posta.
- **What’s New:** Bu sürümdeki değişiklikler.

### 6. Sertifika ve provisioning (EAS ile)
- EAS Build kullanıyorsanız **EAS** Apple hesabınıza bağlanıp sertifika ve provisioning profile’ları yönetebilir.
- İlk kez: `eas credentials` veya build sırasında “Generate new” seçin.
- **Capabilities:** Push, Sign in with Apple, NFC vb. ihtiyaca göre App ID’de açın (Xcode veya Apple Developer portal).

### 7. İnceleme gönderimi
- Build’i **TestFlight** veya doğrudan **Submit for Review** ile gönderin.
- **Export Compliance, Encryption:** Uygulama şifreleme kullanıyorsa formda belirtin (çoğu uygulama “Standard encryption” ile geçer).
- **App Review Notları:** Gerekirse test hesabı, demo video veya özel açıklama ekleyin.

### 8. Özel izinler (NFC, Konum, Face ID)
- **Info.plist** (Expo `app.json` → `ios.infoPlist`):
  - Konum: `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription` (zaten eklendi).
  - Biyometrik (Face/Touch): `NSFaceIDUsageDescription` kaldırıldı.
- NFC (okuma/yazma) kullanacaksanız: Apple Developer’da App ID’de **NFC Tag Reading** capability’sini açın; gerekirse **NFC Background Tag Reading** (uygulama kapalıyken etiket okuma).

---

## GOOGLE (Google Play) tarafında yapılacaklar

### 1. Google Play Console hesabı
- [play.google.com/console](https://play.google.com/console) → Kayıt (tek seferlik ödeme).
- Geliştirici hesabı onaylandıktan sonra uygulama ekleyebilirsiniz.

### 2. Uygulama oluşturma
- **Create app** → **Valoria Hotel**.
- Varsayılan dil, uygulama türü (uygulama / oyun), ücretsiz/ücretli seçin.

### 3. Dashboard ayarları
- **App content** (zorunlu):
  - **Privacy policy:** URL girin.
  - **App access:** Tüm özellikler herkese açıksa “All functionality available” deyin; test hesabı gerekiyorsa açıklayın.
  - **Ads:** Reklam varsa “Yes” ve reklam ID kullanımı.
  - **Content questionnaire:** Yaş grubu, veri toplama özeti.
  - **Data safety:** Toplanan verileri (konum, e‑posta, kimlik vb.) formda belirtin.

### 4. Store listing
- **Main store listing:**
  - Kısa ve uzun açıklama.
  - Grafik: 512x512 ikon, feature graphic (1024x500), ekran görüntüleri (telefon/tablet).
- **Categorization:** Uygulama kategorisi (örn. Travel).

### 5. Üretim / test sürümü
- **Release** → **Production** (veya **Internal testing** / **Closed testing**).
- **Create new release** → EAS ile ürettiğiniz **AAB** (Android App Bundle) dosyasını yükleyin.
- **Release name** (örn. 1.0.0) ve **Release notes** girin.

### 6. İzinler (Android)
- `app.json` / `android.permissions` içinde konum, biyometrik vb. zaten tanımlı.
- Play Console’da **App content** → **Data safety** kısmında bu izinlerin hangi veriler için kullanıldığını açıklayın.

### 7. İnceleme
- **Send for review** / **Submit for review**.
- İlk inceleme birkaç gün sürebilir; red gelirse e‑posta ile düzeltme istenir.

---

## EAS (Expo Application Services) ile build ve submit

### 1. EAS yapılandırması
- `eas.json` (proje kökünde):
  - `production` profili: `ios` ve `android` build’leri.
  - Gerekirse `development` ve `preview` profilleri.

### 2. iOS build ve gönderim
```bash
eas build --platform ios --profile production
eas submit --platform ios --latest
```
- Apple hesabı / App-Specific Password veya API key ile giriş gerekebilir.

### 3. Android build ve gönderim
```bash
eas build --platform android --profile production
eas submit --platform android --latest
```
- Play Console’da **Service account** veya manuel AAB yükleme kullanılabilir.

---

## Kısa kontrol listesi

**Apple**
- [ ] Apple Developer Program üyeliği
- [ ] App Store Connect’te uygulama + Bundle ID `com.valoria.hotel`
- [ ] Sözleşme, vergi, banka bilgisi
- [ ] Gizlilik politikası URL
- [ ] Ekran görüntüleri (zorunlu iPhone boyutları)
- [ ] EAS ile build + submit veya manuel yükleme
- [ ] NFC/Konum/Face ID açıklamaları (Info.plist) ve gerekirse capability

**Google**
- [ ] Google Play Console hesabı
- [ ] Uygulama oluşturma + store listing
- [ ] Privacy policy + Data safety + App content formları
- [ ] Ekran görüntüleri + ikon + feature graphic
- [ ] AAB yükleme (EAS build çıktısı)
- [ ] İnceleme gönderimi

Bu adımları tamamladıktan sonra uygulama mağaza incelemelerine girer; onay sonrası yayına alınır.
