import { defineConfig } from "eslint/config";
import tseslint from 'typescript-eslint';

export default defineConfig([
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "prefer-const": "error",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn"
    },
  },
  {
    ignores: ["dist/", "out/", "node_modules/", "**/*.d.ts"]
  }
]);