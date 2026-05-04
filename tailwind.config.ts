import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          deep: "var(--ink-deep)",
          charcoal: "var(--ink-charcoal)",
          rust: "var(--ink-rust)",
        },
        gold: {
          DEFAULT: "var(--gold)",
          bright: "var(--gold-bright)",
          shadow: "var(--gold-shadow)",
        },
        blood: {
          DEFAULT: "var(--blood)",
          deep: "var(--blood-deep)",
        },
        parchment: {
          DEFAULT: "var(--parchment)",
          dim: "var(--parchment-dim)",
        },
        silver: "var(--silver)",
        ash: "var(--ash)",
      },
      fontFamily: {
        display: ["var(--font-display)", "Cinzel", "serif"],
        body: ["var(--font-body)", "Cormorant Garamond", "serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      letterSpacing: {
        decree: "0.4em",
        proclaim: "0.5em",
      },
      boxShadow: {
        forge:
          "0 0 0 1px rgba(201,169,97,0.2), 0 8px 32px -4px rgba(0,0,0,0.8), inset 0 1px 0 rgba(201,169,97,0.1)",
        torch:
          "0 0 12px rgba(201,169,97,0.5), 0 0 32px rgba(201,169,97,0.18), inset 0 0 8px rgba(201,169,97,0.1)",
        carved:
          "inset 0 1px 0 rgba(201,169,97,0.15), inset 0 -1px 0 rgba(0,0,0,0.6)",
      },
      animation: {
        torchlight: "torchlight 1.6s ease-in-out infinite",
        "ember-pulse": "ember-pulse 3.4s ease-in-out infinite",
        "torch-arrive": "torch-arrive 0.8s ease-out forwards",
        "ember-drift": "ember-drift 14s ease-out infinite",
        "pedestal-shimmer": "pedestal-shimmer 3.6s ease-in-out infinite",
      },
      keyframes: {
        "ember-drift": {
          "0%": {
            opacity: "0",
            transform: "translateY(0) translateX(0) scale(0.6)",
          },
          "8%": { opacity: "0.85", transform: "translateY(-6vh) scale(1)" },
          "70%": { opacity: "0.55" },
          "100%": {
            opacity: "0",
            transform:
              "translateY(-110vh) translateX(var(--ember-drift, 0px)) scale(0.4)",
          },
        },
        "pedestal-shimmer": {
          "0%, 100%": { opacity: "0.35", transform: "translateY(0)" },
          "50%": { opacity: "0.85", transform: "translateY(-6px)" },
        },
        "ember-pulse": {
          "0%, 100%": {
            boxShadow:
              "0 0 14px rgba(227,197,118,0.32), 0 0 0 1px rgba(227,197,118,0.45) inset",
          },
          "50%": {
            boxShadow:
              "0 0 36px rgba(227,197,118,0.7), 0 0 64px rgba(227,197,118,0.22), 0 0 0 1px rgba(227,197,118,0.7) inset",
          },
        },
        "torch-arrive": {
          "0%": { opacity: "0", transform: "translateY(-18px)" },
          "10%": { opacity: "0.35", transform: "translateY(-14px)" },
          "20%": { opacity: "0.1", transform: "translateY(-10px)" },
          "40%": { opacity: "0.85", transform: "translateY(-4px)" },
          "60%": { opacity: "0.5", transform: "translateY(-2px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        torchlight: {
          "0%, 100%": {
            boxShadow:
              "0 0 12px rgba(201,169,97,0.45), inset 0 0 8px rgba(201,169,97,0.08)",
          },
          "10%": {
            boxShadow:
              "0 0 18px rgba(227,197,118,0.7), inset 0 0 12px rgba(227,197,118,0.16)",
          },
          "27%": {
            boxShadow:
              "0 0 10px rgba(201,169,97,0.4), inset 0 0 6px rgba(201,169,97,0.06)",
          },
          "53%": {
            boxShadow:
              "0 0 16px rgba(227,197,118,0.6), inset 0 0 10px rgba(227,197,118,0.12)",
          },
          "78%": {
            boxShadow:
              "0 0 11px rgba(201,169,97,0.45), inset 0 0 7px rgba(201,169,97,0.08)",
          },
        },
      },
    },
  },
  plugins: [],
};
export default config;
