import React from "react";
import { View, TextInput, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, spacing, radii } from "../theme/tokens";

export default function SearchBar({ value, onChange, placeholder = "Search" }) {
  return (
    <>
      <View style={styles.container}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          accessibilityLabel="Поиск по зикрам"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
      </View>
    </>
  );
}
const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.sm,
  },
  input: { flex: 1, color: colors.text, fontSize: 16 },
  container: {
    height: 48,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
  },
  input: { fontSize: 16, color: colors.text },
});
