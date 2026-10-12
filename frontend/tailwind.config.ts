import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F5F6F8",
        surface: "#FFFFFF",
        ink: { DEFAULT: "#151A22", soft: "#3A4350" },
        muted: "#5F6B7A",
        line: "#E2E6EB",
        accent: { DEFAULT: "#0B5D6B", hover: "#084A56", soft: "#E4F0F2" },
        rail: { DEFAULT: "#121820", hover: "#1B2430", line: "#273140", text: "#C9D1DC", muted: "#8A97A8" },
        danger: { DEFAULT: "#B42318", soft: "#FEF3F2", line: "#FDD3CF" },
        ok: "#1A7F4B",
        warn: "#B54708",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
      },
      keyframes: {
        dot: {
          "0%, 80%, 100%": { opacity: "0.25", transform: "translateY(0)" },
          "40%": { opacity: "1", transform: "translateY(-3px)" },
        },
        rise: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        dot: "dot 1.2s ease-in-out infinite",
        rise: "rise 0.25s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
