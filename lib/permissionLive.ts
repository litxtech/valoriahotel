type PermissionLiveListener = () => void;

const listeners = new Set<PermissionLiveListener>();

export function onPermissionLiveChange(listener: PermissionLiveListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitPermissionLiveChange(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Listener hatasi diger dinleyicileri durdurmasin.
    }
  });
}

