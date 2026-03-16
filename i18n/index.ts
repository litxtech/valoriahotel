import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const LANGUAGES = [
  { code: 'tr', label: 'Türkçe' },
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'ru', label: 'Русский' },
  { code: 'es', label: 'Español' },
] as const;

export type LangCode = (typeof LANGUAGES)[number]['code'];

const resources = {
  tr: {
    translation: {
      appName: 'Valoria Hotel',
      selectLanguage: 'Dil Seçin',
      scanQR: 'QR Kodu Okutun',
      scanQRDesc: 'Konaklama sözleşmesi için odanızdaki QR kodu okutun.',
      contract: 'Konaklama Sözleşmesi',
      acceptContract: 'Sözleşmeyi kabul ediyorum',
      next: 'İleri',
      back: 'Geri',
      guestInfo: 'Misafir Bilgileri',
      fullName: 'Ad Soyad',
      idNumber: 'TC Kimlik No / Pasaport No',
      idType: 'Kimlik Türü',
      idTypeTC: 'T.C. Kimlik',
      idTypePassport: 'Pasaport',
      phone: 'Telefon',
      email: 'E-posta',
      nationality: 'Uyruk',
      sendCode: 'Doğrulama Kodu Gönder',
      verificationCode: 'Doğrulama Kodu',
      enterCode: 'Kodu girin',
      verify: 'Doğrula',
      signContract: 'Sözleşmeyi İmzalayın',
      signBelow: 'Aşağıdaki alana imzanızı atın',
      clear: 'Temizle',
      submit: 'Gönder',
      success: 'Kayıt Tamamlandı',
      successDesc: 'Sözleşmeniz onaylandı. Resepsiyona bekleyebilirsiniz.',
      error: 'Hata',
      invalidQR: 'Geçersiz veya süresi dolmuş QR kod.',
      invalidCode: 'Geçersiz veya süresi dolmuş kod.',
      required: 'Bu alan zorunludur',
      loading: 'Yükleniyor...',
    },
  },
  en: {
    translation: {
      appName: 'Valoria Hotel',
      selectLanguage: 'Select Language',
      scanQR: 'Scan QR Code',
      scanQRDesc: 'Scan the QR code in your room for the accommodation agreement.',
      contract: 'Accommodation Agreement',
      acceptContract: 'I accept the agreement',
      next: 'Next',
      back: 'Back',
      guestInfo: 'Guest Information',
      fullName: 'Full Name',
      idNumber: 'ID / Passport Number',
      idType: 'ID Type',
      idTypeTC: 'National ID',
      idTypePassport: 'Passport',
      phone: 'Phone',
      email: 'Email',
      nationality: 'Nationality',
      sendCode: 'Send Verification Code',
      verificationCode: 'Verification Code',
      enterCode: 'Enter code',
      verify: 'Verify',
      signContract: 'Sign the Agreement',
      signBelow: 'Sign in the box below',
      clear: 'Clear',
      submit: 'Submit',
      success: 'Registration Complete',
      successDesc: 'Your agreement has been confirmed. You may proceed to reception.',
      error: 'Error',
      invalidQR: 'Invalid or expired QR code.',
      invalidCode: 'Invalid or expired code.',
      required: 'This field is required',
      loading: 'Loading...',
    },
  },
  ar: { translation: {} },
  de: { translation: {} },
  fr: { translation: {} },
  ru: { translation: {} },
  es: { translation: {} },
};

// Fallback missing keys to English
LANGUAGES.forEach(({ code }) => {
  if (code !== 'tr' && code !== 'en' && (resources as Record<string, { translation: Record<string, string> }>)[code].translation && Object.keys((resources as Record<string, { translation: Record<string, string> }>)[code].translation).length === 0) {
    (resources as Record<string, { translation: Record<string, string> }>)[code].translation = { ...resources.en.translation };
  }
});

i18n.use(initReactI18next).init({
  resources,
  lng: 'tr',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
