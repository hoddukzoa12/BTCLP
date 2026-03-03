import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        btc: {
          orange: "#F7931A",
          gold: "#FFB347",
          deep: "#E8821E",
        },
        vault: {
          green: "#00E676",
          blue: "#448AFF",
          red: "#FF1744",
          dark: "#0A0E17",
          card: "#111827",
          border: "#1F2937",
          surface: "#161E2E",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
        body: ["var(--font-body)", "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.5s ease-out",
        "pulse-dot": "pulseDot 2s ease-in-out infinite",
        glow: "glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.5", transform: "scale(1.5)" },
        },
        glow: {
          "0%": { boxShadow: "0 0 5px rgba(247, 147, 26, 0.2)" },
          "100%": { boxShadow: "0 0 20px rgba(247, 147, 26, 0.4)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
