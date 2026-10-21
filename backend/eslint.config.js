import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // The build scripts run under node, not under the app's rules: `process` and
  // `console` are globals there, and the flat config does not know that.
  { ignores: ["dist/**", "deploy-migrate.mjs", "scripts/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
    },
  }
);

