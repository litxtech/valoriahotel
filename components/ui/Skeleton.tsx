import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, ViewStyle } from 'react-native';

type SkeletonProps = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

export function Skeleton({ width = '100%', height = 20, borderRadius = 8, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.6, useNativeDriver: true, duration: 600 }),
        Animated.timing(opacity, { toValue: 0.3, useNativeDriver: true, duration: 600 }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        typeof width === 'number' ? { width } : { width: width as string },
        { height, borderRadius, opacity },
        style,
      ]}
    />
  );
}

/** Birkaç satırlık metin iskeleti */
export function SkeletonLines({ lines = 3, lineHeight = 16, gap = 8 }: { lines?: number; lineHeight?: number; gap?: number }) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={lineHeight} width={i === lines - 1 && lines > 1 ? '70%' : '100%'} borderRadius={6} />
      ))}
    </View>
  );
}

/** Kart iskeleti (görsel + başlık + 2 satır) */
export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <Skeleton height={120} borderRadius={12} style={{ marginBottom: 12 }} />
      <Skeleton height={18} width="80%" style={{ marginBottom: 8 }} />
      <Skeleton height={14} style={{ marginBottom: 4 }} />
      <Skeleton height={14} width="60%" />
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: '#e9ecef',
  },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f1f3f5',
  },
});
