import type { Config } from "tailwindcss";

/**
 * THE FLOOR // After-Hours Ops design tokens.
 *
 * Concept: an institutional trading-desk operating system. Cool charcoal canvas,
 * a single brass / ticker-tape gold brand accent, and strict finance semantics
 * (emerald = long/live/positive, red = short/negative, amber = hold/warning).
 *
 * Legacy token names are preserved so existing markup keeps working, but values
 * are remapped to the new world:
 *   ink   -> cool charcoal surfaces
 *   wire  -> cool neutral text / hairline ramp (de-greened)
 *   phos  -> refined emerald (live + positive signal)
 *   brass -> NEW brand / structure / primary accent
 *   siren -> bear / error red
 *   amber -> hold / warning orange
 */
const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Space Grotesk"', "system-ui", "sans-serif"],
        display: ['"Space Grotesk"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "Menlo", "monospace"],
        // legacy alias – render terminal text in mono
        crt: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        // All ramps resolve through CSS variables so the app can swap between
        // the dark "after-hours" theme and the light "paper dossier" theme
        // (see index.css :root / .dark definitions).
        ink: {
          950: "rgb(var(--ink-950) / <alpha-value>)",
          900: "rgb(var(--ink-900) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)",
          700: "rgb(var(--ink-700) / <alpha-value>)",
          600: "rgb(var(--ink-600) / <alpha-value>)",
        },
        wire: {
          900: "rgb(var(--wire-900) / <alpha-value>)",
          800: "rgb(var(--wire-800) / <alpha-value>)",
          700: "rgb(var(--wire-700) / <alpha-value>)",
          600: "rgb(var(--wire-600) / <alpha-value>)",
          500: "rgb(var(--wire-500) / <alpha-value>)",
          400: "rgb(var(--wire-400) / <alpha-value>)",
          300: "rgb(var(--wire-300) / <alpha-value>)",
          200: "rgb(var(--wire-200) / <alpha-value>)",
          100: "rgb(var(--wire-100) / <alpha-value>)",
        },
        // emerald: live + positive signal (legacy "phos")
        phos: {
          DEFAULT: "rgb(var(--phos) / <alpha-value>)",
          glow: "rgb(var(--phos-glow) / <alpha-value>)",
          dim: "rgb(var(--phos-dim) / <alpha-value>)",
          dark: "rgb(var(--phos-dark) / <alpha-value>)",
        },
        bull: {
          DEFAULT: "rgb(var(--phos) / <alpha-value>)",
          soft: "rgb(var(--phos-glow) / <alpha-value>)",
          dim: "rgb(var(--phos-dim) / <alpha-value>)",
        },
        // brass: brand / structure / primary accent
        brass: {
          DEFAULT: "rgb(var(--brass) / <alpha-value>)",
          glow: "rgb(var(--brass-glow) / <alpha-value>)",
          dim: "rgb(var(--brass-dim) / <alpha-value>)",
          dark: "rgb(var(--brass-dark) / <alpha-value>)",
        },
        amber: {
          DEFAULT: "rgb(var(--amber) / <alpha-value>)",
          dim: "rgb(var(--amber-dim) / <alpha-value>)",
        },
        siren: {
          DEFAULT: "rgb(var(--siren) / <alpha-value>)",
          glow: "rgb(var(--siren-glow) / <alpha-value>)",
          dim: "rgb(var(--siren-dim) / <alpha-value>)",
        },
        bear: {
          DEFAULT: "rgb(var(--siren) / <alpha-value>)",
          dim: "rgb(var(--siren-dim) / <alpha-value>)",
        },
      },
      boxShadow: {
        // legacy "phos" shadow now emerald-tinted
        phos: "0 0 0 1px rgb(var(--phos) / 0.32), 0 0 26px -10px rgb(var(--phos) / 0.5)",
        "phos-soft": "0 0 0 1px rgb(var(--phos) / 0.16)",
        brass:
          "0 0 0 1px rgb(var(--brass) / 0.34), 0 0 30px -10px rgb(var(--brass) / 0.55)",
        "brass-soft": "0 0 0 1px rgb(var(--brass) / 0.18)",
        siren:
          "0 0 0 1px rgb(var(--siren) / 0.55), 0 0 20px -4px rgb(var(--siren) / 0.5)",
        panel:
          "0 1px 0 0 rgb(var(--panel-hi) / 0.035) inset, 0 30px 70px -40px rgb(var(--panel-shadow) / 0.85)",
        float:
          "0 1px 0 0 rgb(var(--panel-hi) / 0.05) inset, 0 40px 90px -45px rgb(var(--panel-shadow) / 0.9)",
      },
      backgroundImage: {
        "brass-sheen":
          "linear-gradient(180deg, rgb(var(--brass) / 0.16), rgb(var(--brass) / 0) 60%)",
      },
      keyframes: {
        blink: {
          "0%,49%": { opacity: "1" },
          "50%,100%": { opacity: "0" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        flicker: {
          "0%,98%,100%": { opacity: "1" },
          "99%": { opacity: "0.85" },
        },
        glow: {
          "0%,100%": {
            boxShadow:
              "0 0 0 1px rgba(47,208,138,0.32), 0 0 18px -10px rgba(47,208,138,0.6)",
          },
          "50%": {
            boxShadow:
              "0 0 0 1px rgba(47,208,138,0.7), 0 0 32px -6px rgba(47,208,138,0.85)",
          },
        },
        bar: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(300%)" },
        },
        pulseDot: {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.45", transform: "scale(0.82)" },
        },
        riseIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        wireIn: {
          "0%": { opacity: "0", transform: "translateX(-10px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.94)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        deskDown: {
          "0%": { opacity: "0", transform: "translateY(-10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        softFloat: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
        popIn: {
          "0%": { opacity: "0", transform: "scale(0.82)" },
          "65%": { transform: "scale(1.05)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        sheen: {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(220%)" },
        },
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        blink: "blink 1s steps(2) infinite",
        scan: "scan 8s linear infinite",
        flicker: "flicker 3s linear infinite",
        glow: "glow 1.8s ease-in-out infinite",
        bar: "bar 1.4s ease-in-out infinite",
        "pulse-dot": "pulseDot 1.8s ease-in-out infinite",
        "rise-in": "riseIn 0.4s cubic-bezier(0.16,1,0.3,1) both",
        "slide-in-right": "slideInRight 0.45s cubic-bezier(0.16,1,0.3,1) both",
        "fade-in": "fadeIn 0.32s ease-out both",
        "wire-in": "wireIn 0.3s cubic-bezier(0.16,1,0.3,1) both",
        "scale-in": "scaleIn 0.38s cubic-bezier(0.16,1,0.3,1) both",
        "desk-down": "deskDown 0.42s cubic-bezier(0.16,1,0.3,1) both",
        "soft-float": "softFloat 5.5s ease-in-out infinite",
        "pop-in": "popIn 0.42s cubic-bezier(0.34,1.2,0.64,1) both",
        shimmer: "shimmer 2.8s linear infinite",
        sheen: "sheen 2.6s ease-in-out infinite",
        ticker: "ticker 32s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
