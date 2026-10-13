import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  // Tailwind's default spacing already matches the 4/8/12/16/24/32/48 scale
  // (1, 2, 3, 4, 6, 8, 12) and touch sizes (11 = 44px, 14 = 56px, 16 = 64px).
  theme: {
    screens: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px" },
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        text: "var(--text)",
        muted: "var(--text-muted)",
        primary: { DEFAULT: "var(--primary)", hover: "var(--primary-hover)" },
        accent: { DEFAULT: "var(--accent)", strong: "var(--accent-strong)" },
        emergency: { DEFAULT: "var(--emergency)", hover: "var(--emergency-hover)" },
        confirmed: "var(--confirmed)",
        reported: { DEFAULT: "var(--reported)", text: "var(--reported-text)" },
        unknown: "var(--unknown)",
        border: { DEFAULT: "var(--border)", strong: "var(--border-strong)" },
        focus: "var(--focus)",
        tint: {
          confirmed: "var(--confirmed-bg)",
          reported: "var(--reported-bg)",
          unknown: "var(--unknown-bg)",
          emergency: "var(--emergency-bg)",
          primary: "var(--primary-bg)",
        },
      },
      borderRadius: {
        card: "var(--radius-card)",
        control: "var(--radius-control)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "var(--font-devanagari)", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xl": ["24px", { lineHeight: "1.3" }],
        xl: ["20px", { lineHeight: "1.35" }],
        lg: ["18px", { lineHeight: "1.4" }],
        base: ["16px", { lineHeight: "1.5" }],
        sm: ["14px", { lineHeight: "1.45" }],
      },
      minHeight: { touch: "44px", emergency: "56px", glove: "64px" },
      minWidth: { touch: "44px" },
      transitionDuration: { DEFAULT: "180ms" },
      transitionTimingFunction: { DEFAULT: "cubic-bezier(0, 0, 0.2, 1)" },
    },
  },
  plugins: [],
};

export default config;
