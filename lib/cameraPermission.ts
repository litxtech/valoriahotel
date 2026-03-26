import { Alert, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
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

/** iOS'ta Alert kapandıktan sonra sistem izin penceresinin düzgün görünmesi için kısa gecikme */
function deferOnIos<T>(fn: () => Promise<T>): Promise<T> {
  if (Platform.OS === 'ios') {
    return new Promise((resolve, reject) => {
      setTimeout(() => fn().then(resolve).catch(reject), 200);
    });
  }
  return fn();
}

export async function ensureCameraPermission(
  options?: EnsureCameraPermissionOptions
): Promise<boolean> {
  const title = options?.title ?? 'Kamera izni';
  const message =
    options?.message ??
    'Fotoğraf çekmek için kamera erişimi gerekir. İzin verir misiniz?';
  const settingsMessage =
    options?.settingsMessage ??
    'Kamera izni kapalı. Devam etmek için ayarlardan kamera iznini açın.';

  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.status === 'granted') {
    emitPermissionLiveChange();
    return true;
  }

  // canAskAgain false ise OS izin penceresi bir daha gösterilmez – ayarlara yönlendir
  if (current.canAskAgain === false) {
    await askOpenSettings(settingsMessage);
    return false;
  }

  // Uygulama içinde doğrudan sistem izin penceresini göster (Ara Alert atlanır)
  const requested = await deferOnIos(() =>
    ImagePicker.requestCameraPermissionsAsync()
  );
  emitPermissionLiveChange();
  if (requested.status === 'granted') return true;

  if (!requested.canAskAgain) {
    await askOpenSettings(settingsMessage);
  }
  return false;
}
