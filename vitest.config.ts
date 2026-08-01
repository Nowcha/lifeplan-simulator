import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["engine/**/__tests__/**/*.test.ts", "engine/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["engine/**/*.ts"],
      exclude: ["engine/**/__tests__/**", "engine/types/**"],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80
      }
    }
  }
});
