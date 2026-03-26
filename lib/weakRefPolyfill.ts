/**
 * Hermes (iOS/Android) WeakRef desteklemediği için polyfill.
 * "Property 'WeakRef' doesn't exist" hatasını önler.
 * Gerçek weak ref olmasa da strong reference fallback ile uygulama çalışır.
 */
declare global {
  // eslint-disable-next-line no-var
  var WeakRef: { new <T extends object>(value: T): { deref(): T | undefined } } | undefined;
}

if (typeof globalThis.WeakRef === 'undefined') {
  // Hermes'te WeakRef yok; basit fallback (strong ref - memory leak riski var ama crash önlenir)
  const WeakRefPolyfill = class WeakRefPolyfill<T extends object> {
    private ref: T | undefined;
    constructor(value: T) {
      this.ref = value;
    }
    deref(): T | undefined {
      return this.ref;
    }
  };
  (globalThis as Record<string, unknown>).WeakRef = WeakRefPolyfill;
  if (typeof (global as Record<string, unknown>).WeakRef === 'undefined') {
    (global as Record<string, unknown>).WeakRef = WeakRefPolyfill;
  }
}

export {};
