import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Run tests serially so parallel DB mutations don't collide
    pool: "forks",
    singleFork: true,
    testTimeout: 15_000,
  },
});
