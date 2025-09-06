import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, spacing, radii, shadow } from "../theme/tokens";
import { useAppLang } from "../hooks/useAppLang";
import { toTransMap, toRuTranslit } from "../utils/zikrText";

const catColors = {
  morning: "#FDE68A", // жёлтый
  evening: "#BFDBFE", // голубой
  tasbeeh: "#C7D2FE", // сиреневый
};

export default function ZikrCard({ item, progress, target, onPress }) {
  const { lang } = useAppLang();

  // выбор транслита в зависимости от языка приложения
  const translit = lang === "en" ? item.translit : toRuTranslit(item);

  const transMap = toTransMap(item.translations);
  const shownTranslation =
    transMap[lang] || transMap["ru"] || transMap["kz"] || transMap["en"] || "";

  return (
    <TouchableOpacity onPress={onPress} style={[styles.card, shadow.card]}>
      {/* бейдж категории */}
      {item.category && (
        <View
          style={[
            styles.badge,
            { backgroundColor: catColors[item.category] || "#E5E7EB" },
          ]}
        >
          <Text style={styles.badgeTxt}>
            {item.category === "morning"
              ? "Утро"
              : item.category === "evening"
              ? "Вечер"
              : item.category === "tasbeeh"
              ? "Тасбих"
              : item.category}
          </Text>
        </View>
      )}

      <Text style={styles.arabic}>{item.arabicText}</Text>
      <Text style={styles.translit}>{translit}</Text>
      {!!shownTranslation && (
        <Text style={styles.translation}>{shownTranslation}</Text>
      )}

      <View style={styles.progressRow}>
        <Text style={styles.progress}>
          {progress}/{target}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  badgeTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  arabic: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
    marginTop: 16,
    color: colors.text,
  },
  translit: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: 4,
  },
  translation: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  progressRow: {
    alignItems: "center",
  },
  progress: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
  },
});
