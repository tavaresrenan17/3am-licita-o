import { configDefaults, defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";

// Config própria do Vitest: o vite.config.ts do projeto carrega o preset do
// Lovable (TanStack Start + nitro), que não é necessário — e atrapalha — para
// testes de unidade em Node.
export default defineConfig({
  plugins: [tsConfigPaths()],
  test: {
    environment: "node",
    // scripts/**/*.test.mjs cobre o modulo de estatistica do harness de
    // latencia (scripts/lib/estatistica.mjs). Excluimos explicitamente
    // benchmark-pipeline.test.mjs: ele usa node:test diretamente (npm run
    // test:benchmark) e nao os globais do vitest, entao rodar sob o vitest
    // duplicaria a execucao sem agregar cobertura. Partimos de
    // configDefaults.exclude para nao perder as exclusoes padrao (node_modules,
    // dist, .git etc.) so por causa desta adicao pontual.
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
    exclude: [...configDefaults.exclude, "scripts/benchmark-pipeline.test.mjs"],
  },
});
