import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintPluginSecurity from "eslint-plugin-security";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  eslintPluginSecurity.configs.recommended,
  {
    rules: {
      // react-hooks v7 (via eslint-config-next@16) adds compiler rules that did not
      // exist under eslint-config-next@15; keep CI parity until addressed separately.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "storybook-static/**",
    "next-env.d.ts",
  ]),
]);
