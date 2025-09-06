// apps/mobile/components/CounterPill.js
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, radii, spacing } from "../theme/tokens";

export default function CounterPill({ label, value, tone = "neutral" }) {
  const bg =
    tone === "success" ? "#E8FFF3" : tone === "warning" ? "#FFF6E6" : "#EEF2F7";
  const fg =
    tone === "success"
      ? colors.success
      : tone === "warning"
      ? colors.accent
      : colors.textMuted;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.value, { color: fg }]}>{value}</Text>
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  value: { fontSize: 16, fontWeight: "700" },
  label: { fontSize: 13, fontWeight: "500" },
});
