import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import eslintPluginSecurity from "eslint-plugin-security";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  eslintPluginSecurity.configs.recommended,
];
