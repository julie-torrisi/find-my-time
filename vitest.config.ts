import { defineConfig } from 'vitest/config';

// Tests assume a New York browser so time-zone results are the same on every machine.
process.env.TZ = 'America/New_York';

export default defineConfig({
  test: { include: ['src/**/*.test.ts', 'test/**/*.test.ts'] },
});
