import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, radii, spacing } from "../theme/tokens";

export default function CounterPill({ label, value, tone = "neutral" }) {
  const palette = {
    neutral: { bg: "rgba(15, 23, 42, 0.06)", fg: colors.textMuted },
    success: { bg: "rgba(34, 197, 94, 0.12)", fg: colors.success },
    warning: { bg: "rgba(209, 169, 84, 0.15)", fg: colors.accent },
  }[tone] || { bg: "rgba(15, 23, 42, 0.06)", fg: colors.textMuted };

  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <Text style={[styles.value, { color: palette.fg }]}>{value}</Text>
      <Text style={[styles.label, { color: palette.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 32,
  },
  value: {
    fontSize: 16,
    fontWeight: "700",
    fontVariant: ["tabular-nums"], // ровные цифры
  },
  label: { fontSize: 13, fontWeight: "500" },
});
