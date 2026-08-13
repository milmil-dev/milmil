import { describe, expect, it } from 'vite-plus/test';
import { formatAuthErrorMessage } from './use-auth';

describe('formatAuthErrorMessage', () => {
  it('converts invalid credentials JSON into friendly copy', () => {
    expect(
      formatAuthErrorMessage(
        new Error('{"message":"invalid credentials"}'),
        'Login failed',
        'Invalid username or password'
      )
    ).toBe('Invalid username or password');
  });

  it('uses parsed API message instead of raw JSON', () => {
    expect(
      formatAuthErrorMessage(
        new Error('{"message":"Server is starting"}'),
        'Login failed',
        'Invalid username or password'
      )
    ).toBe('Server is starting');
  });

  it('falls back when the message is not displayable', () => {
    expect(formatAuthErrorMessage(new Error('{"detail":true}'), 'Login failed', 'Invalid')).toBe(
      'Login failed'
    );
  });
});
