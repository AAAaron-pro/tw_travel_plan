import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'schema/**/*.test.ts',
      'engine/**/*.test.ts',
      'services/**/*.test.ts',
      'src/**/*.test.{ts,tsx}',
    ],
  },
});
