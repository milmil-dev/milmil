import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { flushSync } from 'react-dom';

// React 19 batches state updates asynchronously by default.
// Patch dispatchEvent so that React flushes synchronously after any DOM event
// dispatch during tests — this lets tests assert state changes without awaiting.
const nativeDispatch = EventTarget.prototype.dispatchEvent;
EventTarget.prototype.dispatchEvent = function patchedDispatch(event) {
  let result: boolean;
  try {
    flushSync(() => {
      result = nativeDispatch.call(this, event);
    });
  } catch {
    result = nativeDispatch.call(this, event);
  }
  return result!;
};

// Mock matchMedia for tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
