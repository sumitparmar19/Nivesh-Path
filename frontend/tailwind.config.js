// Tailwind theme for Nivesh-Path. Colours are CSS variables (see src/index.css) so light/dark mode swap
// one set of tokens; brand green is #16A34A, matching the legacy design system.
import forms from "@tailwindcss/forms";

const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: { 50: v("brand-50"), 100: v("brand-100"), 500: "#22c55e", 600: "#16a34a", 700: "#15803d", 900: "#14532d" },
        bg: v("bg"),
        surface: { DEFAULT: v("surface"), 2: v("surface-2") },
        line: v("line"),
        ink: { DEFAULT: v("ink"), 2: v("ink-2") },
        muted: v("muted"),
        up: v("up"),
        down: v("down"),
        warn: "#d97706",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ['"Plus Jakarta Sans"', "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,.06), 0 1px 3px rgba(15,23,42,.04)",
        lift: "0 18px 40px rgba(15,23,42,.12)",
      },
    },
  },
  plugins: [forms],
};
