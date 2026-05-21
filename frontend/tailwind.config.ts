import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#DCFCE7",
          500: "#16A34A",
          600: "#15803D"
        },
        danger: {
          50: "#FEE2E2",
          600: "#DC2626"
        },
        info: {
          50: "#DBEAFE",
          600: "#2563EB"
        },
        warning: {
          500: "#F59E0B"
        }
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "Arial", "sans-serif"]
      }
    }
  },
  plugins: []
} satisfies Config;

