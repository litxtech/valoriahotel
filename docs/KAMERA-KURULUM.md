# Tapo Kamera Entegrasyonu

Valoria uygulamasına Tapo (ve RTSP destekleyen diğer IP) kamera entegrasyonu eklenmiştir.

**Not:** Kamera akışı tamamen **client-side** çalışır. Supabase Edge Function kullanılmaz. Telefon doğrudan kamera ile RTSP üzerinden bağlanır. Supabase sadece kamera listesi ve kimlik bilgilerini veritabanından sağlar.

## ⚠️ Kimlik bilgileri – önemli

**Tapo Kamera Hesabı** (ana Tapo hesabı değil):
- Tapo uygulaması → Kamera → Ayarlar → Gelişmiş Ayarlar → **Kamera Hesabı**
- Burada oluşturduğunuz kullanıcı adı ve şifreyi uygulamaya girin
- Kullanıcı adı e-posta değil, kısa bir isim olabilir (örn. admin)
- Şifre 6–32 karakter, **özel karakter yok** (sadece harf/rakam)

## ⚠️ "Please enter a valid login name and a password" hatası

### Sırayla deneyin:

1. **Kamera Hesabı kullanın** – Ana Tapo e-postası değil, Kamera Hesabı kullanıcı adı ve şifresi.

2. **24 saatlik kilitleme** – Tapo çok fazla yanlış girişte 24 saat kilitleniyor. Kamera fişini çekip bekleyin veya Kamera Hesabı'nı silip yeniden oluşturun.

3. **Kamerayı yeniden başlatın** – Fişini çekip 30 saniye bekleyin. IP değişiminden sonra işe yarar.

4. **SD kart + Tapo Care** – Bunlardan sadece biri açık olsun. İkisi birden RTSP'yi devre dışı bırakabiliyor.

5. **Şifrede özel karakter yok** – `@`, `:`, `%`, `#`, `&`, `*`, `?` kullanmayın. Sadece harf/rakam.

6. **Masaüstü VLC testi** – PC'de VLC → Media → Aç → Ağ → `rtsp://KULLANICI:SIFRE@KAMERA_IP:554/stream1`. VLC çalışıyorsa sorun uygulama tarafında; çalışmıyorsa kamera/ağ tarafındadır.

7. **Aynı Wi‑Fi** – Telefon ve kamera aynı yerel ağda olmalı (mobil veri kapalı).

## Veritabanı

Migration `107_cameras_tables.sql` ile oluşturulan tablolar:
- **cameras**: Kamera bilgileri (IP, kullanıcı, şifre, kayıt modu, vb.)
- **camera_permissions**: Hangi personel hangi kamerayı izleyebilir
- **camera_logs**: İzleme ve işlem logları

Migration'ı uygulamak için:
```bash
supabase db push
# veya
supabase migration up
```

## RTSP Akışı

Tapo kameralar RTSP protokolü kullanır. URL formatı:
```
rtsp://kullanici:sifre@IP:554/stream1
```

**Not:** expo-av RTSP desteklemez. Şu anda canlı önizlemede placeholder görünür.
Gerçek RTSP canlı izleme için:

1. **react-native-vlc-media-player** paketini kurun:
   ```bash
   npm install react-native-vlc-media-player
   ```

2. iOS için `app.json` / `app.config.js`:
   - `NSLocalNetworkUsageDescription` ekleyin (yerel ağ kameraları için)
   - `npx expo prebuild` ile native projeyi yeniden oluşturun

3. `components/CameraStreamVlc.tsx` hem `react-native-vlc-media-player` hem de `@baronha/...` (varsa) paketlerini destekler. `CameraStreamView` yerine bu bileşeni kullanabilirsiniz.

## Ağ Gereksinimleri

- Telefon ve kameralar **aynı Wi-Fi ağında** olmalı
- Tapo uygulamasında RTSP'yi etkinleştirin (Ayarlar → Gelişmiş → RTSP)
- Port 554 açık olmalı

## Özellikler

- **Admin:** Kamera ekleme, düzenleme, personel yetkilendirme, log görüntüleme
- **Personel:** Yetkili kameraları 2'şerli gridde görme, tam ekran izleme
- **Kontroller:** Kayıt başlat/durdur (log), ekran görüntüsü, kayıt indirme bilgisi
- **Loglar:** Kim, ne zaman, hangi kamera, kaç dakika izledi, IP adresi
