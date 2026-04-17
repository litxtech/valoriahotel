const { withBuildProperties } = require('expo-build-properties');

const devClientScheme = 'exp+valoria-hotel';

/** EAS Build: preview/production → Apple production APNs; development client → sandbox */
const easProfile = process.env.EAS_BUILD_PROFILE;
const expoPushIosMode =
  easProfile === 'production' || easProfile === 'preview' ? 'production' : 'development';

const baseConfig = {
  name: 'Valoria',
  slug: 'valoria-hotel',
  version: '2.2.5',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'valoria',
  userInterfaceStyle: 'automatic',
  newArchEnabled: false,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.valoria.hotel',
    buildNumber: '12',
    newArchEnabled: false,
    infoPlist: {
      NSCameraUsageDescription: 'Sözleşme onayı için QR kod okutmanız gerekiyor.',
      NSPhotoLibraryUsageDescription: 'Profil ve belge yükleme için galeri erişimi.',
      NSLocationWhenInUseUsageDescription: 'Uygulama açıkken oteli haritada göstermek ve size yaklaştığınızda check-in için kolaylık sunmak üzere konum kullanılır.',
      NSMicrophoneUsageDescription: 'Sesli mesaj kaydi icin mikrofon erisimi gerekir.',
      NSLocalNetworkUsageDescription: 'Güvenlik kameralarını canlı izlemek ve geliştirme sunucusuna bağlanmak için yerel ağ erişimi gerekir.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    versionCode: 14,
    softwareKeyboardLayoutMode: 'resize',
    googleServicesFile: './google-services.json',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0c1222',
    },
    package: 'com.valoria.hotel',
    permissions: [
      'android.permission.CAMERA',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.RECORD_AUDIO',
      'android.permission.NFC',
      // Android 13+ (API 33): bildirim izni manifest’te tanımlı olmalı
      'android.permission.POST_NOTIFICATIONS',
    ],
  },
  plugins: [
    [
      'expo-dev-client',
      {
        launchMode: 'launcher',
        addGeneratedScheme: true,
      },
    ],
    'expo-router',
    [
      'expo-camera',
      {
        cameraPermission: 'Stok barkodu okutmak için kamera gerekir.',
        barcodeScannerEnabled: true,
      },
    ],
    'expo-location',
    'expo-apple-authentication',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
        imageWidth: 240,
        android: { imageWidth: 240, backgroundColor: '#ffffff' },
        ios: { backgroundColor: '#ffffff' },
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/icon.png',
        color: '#1a365d',
        androidMode: 'default',
        androidCollapsedTitle: 'Valoria',
        defaultChannelId: 'valoria_urgent',
        defaultChannel: 'valoria_urgent',
        mode: expoPushIosMode,
        enableBackgroundRemoteNotifications: true,
      },
    ],
    'expo-font',
    'expo-localization',
    [
      '@react-native-google-signin/google-signin',
      {
        iosUrlScheme: 'com.googleusercontent.apps.47373050426-8men09t0m35sufet2n6nl21r4oq07gfo',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  /** Expo Push: sistem tepsi / ön plan davranışı (ek olarak expo-notifications plugin ile uyumlu) */
  notification: {
    icon: './assets/icon.png',
    color: '#1a365d',
    androidMode: 'default',
    androidCollapsedTitle: 'Valoria',
    iosDisplayInForeground: true,
  },
  extra: {
    router: { origin: 'https://valoriahotel-el4r.vercel.app' },
    eas: { projectId: 'b6913ae8-bafd-4899-96bc-ae995a4bcec1' },
    devClientScheme,
  },
  owner: 'valoriahotel',
};

const expoWithBuild = withBuildProperties(
  baseConfig,
  {
    android: {
      kotlinVersion: '2.0.21',
      /** react-native-vlc-media-player requires minSdk 26+ */
      minSdkVersion: 26,
    },
  }
);

module.exports = { expo: expoWithBuild };
