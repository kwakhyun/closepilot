import { defineConfig } from "vitest/config";
import path from "node:path";

const databaseTests = [
  "tests/database-fixture.test.ts",
  "tests/repository.test.ts",
  "tests/workspace-library.test.ts",
  "tests/library-routes.test.ts",
  "tests/review-draft-store.test.ts",
];

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    testTimeout: 30000,
    // Serialize database runtimes; concurrency is still exercised inside the tests.
    maxWorkers: 1,
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/**/*.test.ts"], exclude: databaseTests },
      },
      {
        extends: true,
        test: {
          name: "database",
          include: databaseTests,
          isolate: true,
          globalSetup: ["./tests/helpers/pglite-setup.ts"],
          setupFiles: ["./tests/helpers/database-setup.ts"],
        },
      },
    ],
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
