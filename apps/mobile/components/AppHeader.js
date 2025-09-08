import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radii, shadow } from "../theme/tokens";

export default function AppHeader({ title, right }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {!!right && <View style={styles.right}>{right}</View>}
    </View>
  );
}
const styles = StyleSheet.create({
  right: { width: 28, alignItems: "flex-end" },
  container: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomColor: colors.border,
    marginTop: 30,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    ...shadow.card,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  right: { marginLeft: spacing.lg },
});
