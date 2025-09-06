import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing } from "../theme/tokens";
import { Ionicons } from "@expo/vector-icons";

export default function AppHeader({ title, right }) {
  return (
    <View style={styles.wrap}>
      <View style={{ width: 28 }} />
      <Text numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      <View style={styles.right}>{right}</View>
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: {
    paddingTop: 16,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 22, fontWeight: "800", color: colors.text },
  right: { width: 28, alignItems: "flex-end" },
});
