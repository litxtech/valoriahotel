/**
 * Cihaz dilini algılar ve uygulamanın desteklediği dil koduna (LangCode) eşler.
 * Desteklenmeyen diller için varsayılan: 'en'.
 * expo-localization native modülü yoksa (web / link edilmemiş build) varsayılan döner.
 */
import type { LangCode } from '@/i18n';

const SUPPORTED: Record<string, LangCode> = {
  tr: 'tr',
  en: 'en',
  ar: 'ar',
  de: 'de',
  fr: 'fr',
  ru: 'ru',
  es: 'es',
};

const DEFAULT_LANG: LangCode = 'en';

function normalizeToSupported(rawLocale: string | undefined | null): LangCode {
  if (!rawLocale) return DEFAULT_LANG;
  const primary = rawLocale.split('-')[0]?.toLowerCase?.() ?? '';
  return SUPPORTED[primary] ?? DEFAULT_LANG;
}

/**
 * Telefonun/cihazın tercih edilen dil kodunu döndürür.
 * Uygulamanın desteklediği dillerden biri değilse DEFAULT_LANG ('en') döner.
 *
 * Not: Burada expo-localization kullanılmıyor; native modül eksikse bile crash olmamalı.
 */
export function getDeviceLanguageCode(): LangCode {
  try {
    const localeFromIntl = Intl?.DateTimeFormat?.().resolvedOptions?.().locale;
    return normalizeToSupported(localeFromIntl);
  } catch {
    return DEFAULT_LANG;
  }
}
