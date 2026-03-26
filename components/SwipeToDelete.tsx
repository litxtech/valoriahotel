import { ReactNode, useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

type SwipeToDeleteProps = {
  children: ReactNode;
  enabled?: boolean;
  onSwipeDelete: () => void;
};

const SWIPE_TRIGGER = 84;
const SWIPE_MAX = 108;

export function SwipeToDelete({
  children,
  enabled = true,
  onSwipeDelete,
}: SwipeToDeleteProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const lockedRef = useRef(false);

  const resetPosition = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 6,
    }).start();
  };

  const triggerDelete = () => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    Animated.sequence([
      Animated.timing(translateX, {
        toValue: SWIPE_MAX,
        duration: 110,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start(() => {
      lockedRef.current = false;
      onSwipeDelete();
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          if (!enabled || lockedRef.current) return false;
          return gesture.dx > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy);
        },
        onPanResponderMove: (_, gesture) => {
          const next = Math.max(0, Math.min(SWIPE_MAX, gesture.dx));
          translateX.setValue(next);
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx >= SWIPE_TRIGGER) {
            triggerDelete();
            return;
          }
          resetPosition();
        },
        onPanResponderTerminate: resetPosition,
      }),
    [enabled, onSwipeDelete]
  );

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.swipeLayer, { transform: [{ translateX }] }]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  swipeLayer: {
    zIndex: 1,
  },
});
