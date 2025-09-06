import React from "react";
import { Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, radii, spacing } from "../theme/tokens";

export default function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, active && styles.active]}
    >
      <Text style={[styles.txt, active && styles.txtActive]}>{label}</Text>
    </TouchableOpacity>
  );
}
const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: "#EEF2F7",
    borderRadius: radii.pill,
    marginRight: spacing.sm,
  },
  active: {
    backgroundColor: "#DFF7F6",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  txt: { color: colors.textMuted, fontWeight: "600" },
  txtActive: { color: colors.primaryDark },
});
