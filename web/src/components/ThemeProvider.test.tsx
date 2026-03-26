import { expect, test } from 'vitest';
import { render } from '@/test/test-utils';
import { ThemeProvider } from '@/components/ThemeProvider';

test('preserves the document root dark baseline', () => {
  document.documentElement.className = 'dark';
  render(
    <ThemeProvider>
      <div>theme</div>
    </ThemeProvider>
  );
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  expect(document.documentElement.classList.contains('light')).toBe(false);
});
