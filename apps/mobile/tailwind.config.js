/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // взято из web/src/index.css переменных (перенеси свои значения)
        primary: "#3B82F6",
        primaryForeground: "#FFFFFF",
        muted: "#F3F4F6",
        mutedForeground: "#6B7280",
        card: "#FFFFFF",
        border: "#E5E7EB",
        success: "#10B981",
        danger: "#EF4444",
        ring: "#2563EB",
        bg: "#0B0F17", // если у дизайна тёмный фон
      },
      borderRadius: {
        xl: "16px",
        "2xl": "24px",
      },
      boxShadow: {
        soft: "0 8px 24px rgba(0,0,0,0.08)",
      },
    },
  },
  plugins: [],
};
