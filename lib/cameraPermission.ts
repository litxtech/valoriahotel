import { Alert, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'expo-camera';
import { emitPermissionLiveChange } from '@/lib/permissionLive';

type EnsureCameraPermissionOptions = {
  title?: string;
  message?: string;
  settingsMessage?: string;
};

function askDisclosure(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Vazgeç', style: 'cancel', onPress: () => resolve(false) },
      { text: 'İzin ver', onPress: () => resolve(true) },
    ]);
  });
}

function askOpenSettings(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert('İzin gerekli', message, [
      { text: 'İptal', style: 'cancel', onPress: () => resolve(false) },
      {
        text: 'Ayarları aç',
        onPress: async () => {
          await Linking.openSettings().catch(() => {});
          resolve(false);
        },
      },
    ]);
  });
}

/** iOS: Alert sonrası izin diyaloğu; Android: bazı cihazlarda izin sonrası kamera açılışı için kısa gecikme */
function deferBeforePermissionRequest<T>(fn: () => Promise<T>): Promise<T> {
  const ms = Platform.OS === 'ios' ? 200 : Platform.OS === 'android' ? 120 : 0;
  if (ms <= 0) return fn();
  return new Promise((resolve, reject) => {
    setTimeout(() => fn().then(resolve).catch(reject), ms);
  });
}

export async function ensureCameraPermission(
  options?: EnsureCameraPermissionOptions
): Promise<boolean> {
  const settingsMessage =
    options?.settingsMessage ??
    'Kamera izni kapalı. Devam etmek için ayarlardan kamera iznini açın.';

  /**
   * Barkod (expo-camera) ve foto (expo-image-picker) aynı ANDROID.permission.CAMERA kullanır;
   * yine de bazı cihazlarda yalnızca bir modülün isteği güncellenir. Önce expo-camera ile kontrol edilir.
   */
  const fromCamera = await Camera.getCameraPermissionsAsync();
  const fromPicker = await ImagePicker.getCameraPermissionsAsync();
  if (fromCamera.status === 'granted' || fromPicker.status === 'granted') {
    emitPermissionLiveChange();
    return true;
  }

  if (fromCamera.canAskAgain === false && fromPicker.canAskAgain === false) {
    await askOpenSettings(settingsMessage);
    return false;
  }

  const requestedCam = await deferBeforePermissionRequest(() => Camera.requestCameraPermissionsAsync());
  if (requestedCam.status === 'granted') {
    emitPermissionLiveChange();
    return true;
  }

  const requestedPicker = await deferBeforePermissionRequest(() =>
    ImagePicker.requestCameraPermissionsAsync()
  );
  emitPermissionLiveChange();
  if (requestedPicker.status === 'granted') return true;

  if (requestedPicker.canAskAgain === false || requestedCam.canAskAgain === false) {
    await askOpenSettings(settingsMessage);
  }
  return false;
}
