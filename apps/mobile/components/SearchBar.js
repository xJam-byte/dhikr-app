import React from "react";
import { View, TextInput, StyleSheet } from "react-native";
import { colors, radii, spacing } from "../theme/tokens";
import { Feather } from "@expo/vector-icons";

export default function SearchBar({ value, onChange }) {
  return (
    <View style={styles.wrap}>
      <Feather name="search" size={18} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Поиск зикра"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        returnKeyType="search"
      />
    </View>
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
});
