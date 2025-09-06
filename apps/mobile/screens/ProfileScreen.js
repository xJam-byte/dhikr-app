import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { colors, radii, spacing, shadow } from "../theme/tokens";
import AsyncStorage from "@react-native-async-storage/async-storage";
import API from "../api";
import { useAppLang } from "../hooks/useAppLang";
import { useTranslation } from "react-i18next";

export default function ProfileScreen() {
  const [stats, setStats] = useState({ todayCount: 0, totalCount: 0 });
  const { lang, setLang } = useAppLang();
  const { t } = useTranslation();

  useEffect(() => {
    load();
  }, []);
  async function load() {
    try {
      const r = await API.get("/counters/today");
      setStats(r.data);
    } catch {}
  }

  async function resetTodayLocal() {
    const d = new Date();
    const k = `zikrProgress:${d.getFullYear()}-${String(
      d.getMonth() + 1
    ).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    await AsyncStorage.removeItem(k);
    Alert.alert("Готово", "Локальный прогресс на сегодня очищен.");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("profile")}</Text>

      <View style={[styles.card, shadow.card]}>
        <Text style={styles.statTitle}>{t("today")}</Text>
        <Text style={styles.statValue}>{stats.todayCount}</Text>
        <Text style={styles.statTitle}>{t("total")}</Text>
        <Text style={styles.statValue}>{stats.totalCount}</Text>
      </View>

      <View style={[styles.card, shadow.card]}>
        <Text style={styles.section}>{t("level")}</Text>
        <View style={styles.row}>
          <StaticTag label={t("beginner")} active />
          <StaticTag label={t("advanced")} />
        </View>

        <Text style={[styles.section, { marginTop: spacing.lg }]}>
          {t("language")}
        </Text>
        <View style={styles.row}>
          <LangTag
            label="Рус"
            value="ru"
            active={lang === "ru"}
            onPress={setLang}
          />
          <LangTag
            label="Қаз"
            value="kz"
            active={lang === "kz"}
            onPress={setLang}
          />
          <LangTag
            label="Eng"
            value="en"
            active={lang === "en"}
            onPress={setLang}
          />
        </View>
      </View>

      <TouchableOpacity onPress={resetTodayLocal} style={styles.resetBtn}>
        <Text style={{ color: "#fff", fontWeight: "800" }}>
          {t("resetLocal")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function StaticTag({ label, active }) {
  return (
    <View style={[styles.tag, active && styles.tagActive]}>
      <Text style={[styles.tagTxt, active && styles.tagTxtActive]}>
        {label}
      </Text>
    </View>
  );
}

function LangTag({ label, value, active, onPress }) {
  return (
    <TouchableOpacity onPress={() => onPress(value)}>
      <View style={[styles.tag, active && styles.tagActive]}>
        <Text style={[styles.tagTxt, active && styles.tagTxtActive]}>
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: colors.surfaceMuted,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
    marginTop: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  statTitle: { color: colors.textMuted, marginTop: spacing.sm },
  statValue: { fontSize: 28, fontWeight: "800", color: colors.text },
  section: { fontSize: 16, fontWeight: "800", color: colors.text },
  row: { flexDirection: "row", gap: 8, marginTop: spacing.sm },
  tag: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: "#EEF2F7",
  },
  tagActive: {
    backgroundColor: "#DFF7F6",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  tagTxt: { color: colors.textMuted, fontWeight: "700" },
  tagTxtActive: { color: colors.primaryDark },
  resetBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    alignItems: "center",
    paddingVertical: 14,
    marginTop: spacing.xl,
  },
});
