import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    // Serialize database runtimes; concurrency is still exercised inside the tests.
    maxWorkers: 1,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: [
        "src/domain/**/*.ts",
        "src/application/**/*.ts",
        "src/infrastructure/http.ts",
        "src/infrastructure/repository.ts",
        "src/infrastructure/review-draft-store.ts",
        "src/infrastructure/workspace-library.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
