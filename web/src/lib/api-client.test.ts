import { describe, expect, it } from 'vite-plus/test';
import { ApiError } from './api-client';

describe('ApiError', () => {
  it('preserves status and message', () => {
    const err = new ApiError(404, 'not found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('not found');
    expect(err.name).toBe('ApiError');
    expect(err).toBeInstanceOf(Error);
  });
});
