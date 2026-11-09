import { defineConfig, lazyPlugins } from "vite-plus";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const config = defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: ["src/routeTree.gen.ts", "worker-configuration.d.ts", "drizzle/**"],
  },
  lint: {
    ignorePatterns: [
      "src/routeTree.gen.ts",
      "worker-configuration.d.ts",
      "drizzle/**",
      "public/sw.js",
    ],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  resolve: { tsconfigPaths: true },
  // unit tests are pure logic (src/**/*.test.ts); don't boot workerd / Start for them
  plugins: lazyPlugins(() =>
    process.env.VITEST
      ? []
      : [
          devtools(),
          cloudflare({ viteEnvironment: { name: "ssr" } }),
          tailwindcss(),
          tanstackStart(),
          viteReact(),
        ],
  ),
});

export default config;
