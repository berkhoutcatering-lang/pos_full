import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "@hopbites/shared": fileURLToPath(
        new URL("../../packages/shared/src/index.ts", import.meta.url),
      ),
      "@hopbites/shared/ulid": fileURLToPath(
        new URL("../../packages/shared/src/ulid.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["tests/**/*.spec.ts"],
    environment: "node",
    testTimeout: 10_000,
  },
})
