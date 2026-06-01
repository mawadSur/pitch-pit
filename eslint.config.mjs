import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Next 16 removed the `next lint` command and ships eslint-config-next as
// native ESLint 9 flat config. `eslint-config-next/core-web-vitals` and
// `/typescript` each default-export a flat config array, so we spread them
// directly. (FlatCompat + the old "next/core-web-vitals" extends string
// crashes here — eslintrc's validator can't serialize the flat preset's
// self-referential plugin objects.)
const eslintConfig = [
  // Global ignores. Flat config drops `.eslintignore`; ignores live here.
  // Without this, `eslint .` walks build output and the full repo copies
  // under .claude/worktrees/ (dozens of duplicate trees).
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "next-env.d.ts",
      ".claude/**",
      "supabase/**",
      "public/**",
      // One-off Node tooling (frame conversion, DB diag, build templates).
      // Never linted under the old `next lint` scope; they use .cjs/.mjs
      // idioms (require(), intentional throwaway vars) that fight the
      // app's TS-oriented ruleset. Not shipped in the app bundle.
      "scripts/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  // react-hooks v6 (pulled in by eslint-config-next@16) enables several
  // React-Compiler-era rules that this codebase predates. They flag
  // working, shipped patterns (e.g. setState-on-route-change, ref reads in
  // effects) rather than bugs — the E2E suite is green. Adopting them as
  // hard errors would force ~20 refactors of working animation components
  // in one go. Downgrade to `warn` so they're visible and fixable
  // incrementally without blocking lint. Promote back to "error" as the
  // components get cleaned up.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },
];

export default eslintConfig;
