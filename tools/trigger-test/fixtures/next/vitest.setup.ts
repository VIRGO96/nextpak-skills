import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// `server-only` throws outside the React Server environment; in unit tests it's a no-op.
vi.mock('server-only', () => ({}));

afterEach(() => {
  cleanup();
});
