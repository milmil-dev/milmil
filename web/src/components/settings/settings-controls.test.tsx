import { expect, test } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { SelectorGroup } from './SelectorGroup';
import { SettingsCard } from './SettingsCard';

test('SelectorGroup wraps options for narrow settings layouts', () => {
  render(
    <SelectorGroup
      options={[
        { label: 'Small', value: 'small' },
        { label: 'Medium', value: 'medium' },
        { label: 'Large', value: 'large' },
      ]}
      value="medium"
      onChange={() => {}}
    />
  );

  const group = screen.getByRole('group');
  expect(group).toHaveClass('flex-wrap');
  expect(screen.getByRole('button', { name: 'Medium' })).toHaveClass('min-w-0');
});

test('SettingsCard uses compact mobile padding and keeps desktop padding', () => {
  render(<SettingsCard label="Mobile">Content</SettingsCard>);

  const card = screen.getByText('Mobile').closest('div')?.parentElement;
  expect(card).toHaveClass('p-3');
  expect(card).toHaveClass('sm:p-4');
  expect(card).toHaveClass('sm:px-5');
});
