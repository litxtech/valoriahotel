import React from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';

type ImagePreviewModalProps = {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
};

/** Tıklanınca büyük resim önizlemesi açan modal. Boşluğa tıklayınca veya çarpı ile kapanır. */
export function ImagePreviewModal({ visible, uri, onClose }: ImagePreviewModalProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (!uri) return null;
  const imageHeight = height - insets.top - insets.bottom;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.content, { width, height: imageHeight }]} onPress={(e) => e.stopPropagation()}>
          <CachedImage uri={uri} style={[styles.image, { width, height: imageHeight }]} contentFit="contain" />
          <View style={[styles.closeBtnWrap, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.8}
              accessibilityLabel="Kapat"
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    borderRadius: 0,
  },
  closeBtnWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    alignItems: 'flex-end',
    paddingRight: 16,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
