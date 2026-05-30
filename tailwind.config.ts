import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        pitch: {
          900: "#0a0e14",
          800: "#0f1620",
          700: "#16202e",
          600: "#1e2c3f",
        },
        accent: {
          DEFAULT: "#22d3a6",
          soft: "#0e3a30",
        },
        gold: "#f5b400",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
