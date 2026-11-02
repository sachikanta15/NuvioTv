import type { Config } from "tailwindcss";

/**
 * Design tokens mirror the Android app's Compose theme
 * (`ui/theme/*.kt`): surfaces, spacing, radii and typography scale.
 * Colours are exposed as CSS variables so themes can switch at runtime.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--nuvio-bg) / <alpha-value>)",
        "bg-elevated": "rgb(var(--nuvio-bg-elevated) / <alpha-value>)",
        card: "rgb(var(--nuvio-card) / <alpha-value>)",
        surface: "rgb(var(--nuvio-surface) / <alpha-value>)",
        "surface-variant": "rgb(var(--nuvio-surface-variant) / <alpha-value>)",
        panel: "rgb(var(--nuvio-panel) / <alpha-value>)",
        field: "rgb(var(--nuvio-field) / <alpha-value>)",
        menu: "rgb(var(--nuvio-menu) / <alpha-value>)",
        modal: "rgb(var(--nuvio-modal) / <alpha-value>)",
        divider: "rgb(var(--nuvio-divider) / <alpha-value>)",
        accent: "rgb(var(--nuvio-accent) / <alpha-value>)",
        "accent-variant": "rgb(var(--nuvio-accent-variant) / <alpha-value>)",
        "accent-soft": "rgb(var(--nuvio-accent-soft) / <alpha-value>)",
        "on-accent": "rgb(var(--nuvio-on-accent) / <alpha-value>)",
        focus: "rgb(var(--nuvio-focus-ring) / <alpha-value>)",
        "text-primary": "rgb(var(--nuvio-text-primary) / <alpha-value>)",
        "text-secondary": "rgb(var(--nuvio-text-secondary) / <alpha-value>)",
        "text-tertiary": "rgb(var(--nuvio-text-tertiary) / <alpha-value>)",
        rating: "rgb(var(--nuvio-rating) / <alpha-value>)",
        error: "rgb(var(--nuvio-error) / <alpha-value>)",
        warning: "rgb(var(--nuvio-warning) / <alpha-value>)",
        success: "rgb(var(--nuvio-success) / <alpha-value>)",
        info: "rgb(var(--nuvio-info) / <alpha-value>)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "DM Sans",
          "Open Sans",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
      },
      borderRadius: {
        xs: "6px",
        card: "14px",
        panel: "20px",
        "panel-lg": "28px",
        pill: "999px",
      },
      boxShadow: {
        focus: "0 0 0 2px rgb(var(--nuvio-focus-ring) / 0.9), 0 12px 40px rgba(0,0,0,0.55)",
        lift: "0 18px 50px rgba(0,0,0,0.6)",
        glass: "0 8px 32px rgba(0,0,0,0.45)",
        /* Soft ambient shadow used on cards and tiles. */
        soft: "0 4px 16px rgba(0,0,0,0.32)",
        card: "0 10px 30px -12px rgba(0,0,0,0.7)",
        /* Accent-tinted glow for primary actions. */
        glow: "0 10px 30px -8px rgb(var(--nuvio-accent) / 0.55)",
        "glow-lg": "0 18px 44px -12px rgb(var(--nuvio-accent) / 0.6)",
      },
      transitionTimingFunction: {
        nuvio: "cubic-bezier(0.2, 0, 0, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      transitionDuration: {
        250: "250ms",
        400: "400ms",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-500px 0" },
          "100%": { backgroundPosition: "500px 0" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          from: { opacity: "0", transform: "translateY(-12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideInLeft: {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        scaleIn: {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        zoomIn: {
          from: { opacity: "0", transform: "scale(1.06)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        kenburns: {
          "0%": { transform: "scale(1.02) translate3d(0, 0, 0)" },
          "100%": { transform: "scale(1.14) translate3d(-1.5%, -1%, 0)" },
        },
        pulseRing: {
          "0%": { boxShadow: "0 0 0 0 rgb(var(--nuvio-accent) / 0.45)" },
          "70%": { boxShadow: "0 0 0 12px rgb(var(--nuvio-accent) / 0)" },
          "100%": { boxShadow: "0 0 0 0 rgb(var(--nuvio-accent) / 0)" },
        },
        floatY: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s infinite linear",
        "fade-in": "fadeIn 240ms var(--nuvio-ease, ease-out) both",
        "fade-up": "fadeUp 420ms var(--nuvio-ease, ease-out) both",
        "slide-up": "slideUp 320ms var(--nuvio-ease, ease-out) both",
        "slide-down": "slideDown 280ms var(--nuvio-ease, ease-out) both",
        "slide-in-left": "slideInLeft 280ms var(--nuvio-ease, ease-out) both",
        "scale-in": "scaleIn 200ms var(--nuvio-ease, ease-out) both",
        "zoom-in": "zoomIn 500ms var(--nuvio-ease, ease-out) both",
        kenburns: "kenburns 18s ease-out both",
        "pulse-ring": "pulseRing 2s ease-out infinite",
        "float-y": "floatY 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
