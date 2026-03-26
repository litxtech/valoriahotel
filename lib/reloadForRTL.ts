/**
 * RTL/LTR geçişinde layout'un güncellenmesi için uygulamayı yeniden yükler.
 * I18nManager.forceRTL() değişikliği ancak yeniden başlatmada uygulanır.
 */
import { Platform, I18nManager, Alert } from 'react-native';

export function isRTL(langCode: string): boolean {
  return langCode === 'ar';
}

export async function applyRTLAndReloadIfNeeded(newLangCode: string): Promise<void> {
  if (Platform.OS === 'web') return;
  if (typeof I18nManager?.forceRTL !== 'function') return;

  const shouldBeRTL = isRTL(newLangCode);
  if (I18nManager.isRTL === shouldBeRTL) return;

  I18nManager.forceRTL(shouldBeRTL);

  try {
    const Updates = await import('expo-updates');
    if (typeof Updates.reloadAsync === 'function') {
      await Updates.reloadAsync();
      return;
    }
  } catch {
    // expo-updates yok veya yüklenemedi
  }

  try {
    const RN = require('react-native');
    if (RN.NativeModules?.DevSettings?.reload) {
      RN.NativeModules.DevSettings.reload();
      return;
    }
  } catch {
    // DevSettings yok (production)
  }

  const msg = shouldBeRTL
    ? 'Arapça düzeni için uygulamayı yeniden başlatmanız gerekiyor.'
    : 'Yerleşim normal görünüm için uygulamayı yeniden başlatmanız gerekiyor.';
  try {
    const i18n = require('@/i18n').default;
    const ok = i18n.t?.('ok') ?? 'Tamam';
    Alert.alert('', msg, [{ text: ok }]);
  } catch {
    Alert.alert('', msg, [{ text: 'OK' }]);
  }
}
