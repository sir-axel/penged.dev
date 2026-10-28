import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    fileParallelism: false,
    globalSetup: ['./test/global-setup.js'],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
