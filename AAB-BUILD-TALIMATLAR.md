# 2.2.2 AAB Oluşturma Talimatları (Expo kotası doldu)

Proje yolu `C:\valorıahotel` (Türkçe ı) prebuild'i bozuyor. Bu yüzden `C:\valoriahotel` kopyası kullanılacak.

## 1. Java 17 kur

PowerShell'i **Yönetici olarak** aç, çalıştır:

```powershell
choco install microsoft-openjdk17 -y
```

Yoksa: https://adoptium.net/temurin/releases/?version=17&os=windows  
İndir, kur. Sonra `JAVA_HOME` ortam değişkenini Java 17 kurulum yoluna ayarla.

## 2. credentials indir

PowerShell:

```powershell
cd C:\valoriahotel
npx eas-cli credentials -p android
```

- Platform: **Android**
- **Credentials.json** → **Download credentials from EAS to credentials.json**
- `credentials.json` proje köküne iner; keystore genelde base64 veya ayrı dosya olarak gelir

İndirilen `credentials.json` içeriğine bak. Örneğin:

```json
{
  "android": {
    "keystore": {
      "keystorePath": "path/to/keystore.jks",
      "keystorePassword": "...",
      "keyAlias": "...",
      "keyPassword": "..."
    }
  }
}
```

Base64 keystore varsa, bunu decode edip `android/app/upload-keystore.jks` olarak kaydet.

## 3. gradle.properties imzalama ayarları

`C:\valoriahotel\android\gradle.properties` dosyasının **sonuna** ekle (değerleri credentials.json'dan al):

```properties
MYAPP_UPLOAD_STORE_FILE=upload-keystore.jks
MYAPP_UPLOAD_KEY_ALIAS=keyAlias_degeri
MYAPP_UPLOAD_STORE_PASSWORD=sifre
MYAPP_UPLOAD_KEY_PASSWORD=keySifresi
```

Keystore dosyasını `C:\valoriahotel\android\app\` altına koy.

## 4. build.gradle imzalama config

`C:\valoriahotel\android\app\build.gradle` içinde `signingConfigs` bloğuna `release` ekle:

```groovy
signingConfigs {
    debug { ... }
    release {
        storeFile file(MYAPP_UPLOAD_STORE_FILE)
        storePassword MYAPP_UPLOAD_STORE_PASSWORD
        keyAlias MYAPP_UPLOAD_KEY_ALIAS
        keyPassword MYAPP_UPLOAD_KEY_PASSWORD
    }
}
```

`buildTypes.release` içinde:

```groovy
release {
    signingConfig signingConfigs.release
    ...
}
```

## 5. AAB oluştur

```powershell
cd C:\valoriahotel
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.x"  # Kendi Java 17 yolunu yaz
cd android
.\gradlew.bat app:bundleRelease
```

AAB dosyası: `android\app\build\outputs\bundle\release\app-release.aab`

---

## Alternatif: WSL Ubuntu ile EAS local build

Expo kotası kullanılmaz, build WSL içinde çalışır:

```bash
# WSL Ubuntu
sudo apt update && sudo apt install -y openjdk-17-jdk
# Android SDK kurulumu: https://developer.android.com/studio#command-tools
# ANDROID_HOME ve JAVA_HOME ayarla

cd /mnt/c/valoriahotel
npx eas-cli credentials -p android   # Download credentials
npx eas-cli build --profile production -p android --local --wait
```

---

## Özet

| Sorun | Çözüm |
|-------|-------|
| `C:\valorıahotel` prebuild hatası | Projeyi `C:\valoriahotel` altında kullan (ı → i) |
| Java 25 / Gradle uyumsuz | Java 17 kur |
| Keystore | `eas credentials -p android` ile indir |
| Windows'ta `eas build --local` | Desteklenmiyor → WSL veya Gradle ile build |
