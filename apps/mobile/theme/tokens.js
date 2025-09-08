// apps/mobile/theme/tokens.js
import { Platform } from "react-native";

export const colors = {
  // бренд
  primary: "#0F7D5C", // глубокий зелёный
  primaryDark: "#0B5D45",
  accent: "#D1A954", // тёплый золотистый акцент

  // поверхности и фон
  surface: "#FFFFFF",
  surfaceMuted: "#F6F7F9",
  bg: "#FAFAFB",

  // текст и обводки
  text: "#0F172A",
  textMuted: "#5B6B7B",
  border: "#E5E7EB",

  // статусы
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",

  // прочее
  overlay: "rgba(0,0,0,0.30)",
  glow1: "#7EE8FA",
  glow2: "#EEC0C6",
};

// Тёмная палитра — подключим на этапе «Доступность/темы»
export const darkColors = {
  primary: "#22A77A",
  primaryDark: "#198763",
  accent: "#E4BF6A",

  surface: "#151A22",
  surfaceMuted: "#0F141B",
  bg: "#0B1016",

  text: "#E5E7EB",
  textMuted: "#9AA5B1",
  border: "#223041",

  success: "#34D399",
  warning: "#FBBF24",
  danger: "#F87171",

  overlay: "rgba(255,255,255,0.14)",
};

export const radii = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const shadow = {
  card: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
    android: {
      elevation: 6,
    },
    default: {},
  }),
};
