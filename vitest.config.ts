import { defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";

// Config própria do Vitest: o vite.config.ts do projeto carrega o preset do
// Lovable (TanStack Start + nitro), que não é necessário — e atrapalha — para
// testes de unidade em Node.
export default defineConfig({
  plugins: [tsConfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
