import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

// next/navigation is mocked for every ui test; drive it through
// test/mocks/next-navigation.ts (router spies, pathname, search params).
vi.mock('next/navigation', async () => (await import('./mocks/next-navigation')).navigationModule());

// next/link and next/image render plain anchors and images so assertions can
// use href/src/alt without the framework runtime.
vi.mock('next/link', async () => (await import('./mocks/next-link')).linkModule());
vi.mock('next/image', async () => (await import('./mocks/next-link')).imageModule());

// jsdom does not implement these; Motion, IntersectionObserver-driven reveals
// and theme detection all call them at mount.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
if (!('IntersectionObserver' in window)) {
  Object.assign(window, { IntersectionObserver: NoopObserver });
}
if (!('ResizeObserver' in window)) {
  Object.assign(window, { ResizeObserver: NoopObserver });
}
if (!window.scrollTo) {
  window.scrollTo = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
