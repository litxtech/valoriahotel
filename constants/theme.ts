/**
 * Sosyal uygulama tarzı ortak tema: soft tonlar, göz yormayan, 8–12px köşe, 16px boşluk.
 */
export const theme = {
  colors: {
    background: '#ffffff',
    backgroundSecondary: '#f8f9fa',
    surface: '#ffffff',
    border: '#e9ecef',
    borderLight: '#f1f3f5',
    text: '#1a1d21',
    textSecondary: '#6c757d',
    textMuted: '#adb5bd',
    primary: '#b8860b',
    primaryLight: '#d4a84b',
    primaryDark: '#8b6914',
    accent: '#0d6efd',
    /** Misafir avatar placeholder (personel primary altından ayrışır) */
    guestAvatarBg: '#4a6f8a',
    guestAvatarLetter: '#ffffff',
    success: '#198754',
    error: '#dc3545',
    white: '#ffffff',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    full: 9999,
  },
  typography: {
    title: { fontSize: 22, fontWeight: '700' as const },
    titleSmall: { fontSize: 20, fontWeight: '700' as const },
    body: { fontSize: 15, lineHeight: 22 },
    bodySmall: { fontSize: 14, lineHeight: 20 },
    caption: { fontSize: 12, lineHeight: 16 },
  },
  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
  },
} as const;
