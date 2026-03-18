import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

type Props = { children: React.ReactNode };

const FALLBACK_BG = '#1a365d';

export class ErrorBoundary extends React.Component<Props, { hasError: boolean; error?: Error }> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (Platform.OS === 'web' && typeof console !== 'undefined') {
      console.error('[Valoria ErrorBoundary]', error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.body.style.backgroundColor = FALLBACK_BG;
      }
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Bir hata oluştu</Text>
          <Text style={styles.message}>
            Sayfa yüklenirken bir sorun oluştu. Lütfen sayfayı yenileyin veya daha sonra tekrar deneyin.
          </Text>
          {__DEV__ && this.state.error && (
            <Text style={styles.errorText} selectable>
              {this.state.error.message}
            </Text>
          )}
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: FALLBACK_BG,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 12 },
  message: { fontSize: 15, color: 'rgba(255,255,255,0.9)', textAlign: 'center', lineHeight: 22 },
  errorText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 16, maxWidth: '100%' },
});
