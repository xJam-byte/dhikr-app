// apps/mobile/screens/ProfileScreen.js
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import { colors, radii, spacing, shadow } from "../theme/tokens";
import AsyncStorage from "@react-native-async-storage/async-storage";
import API from "../api";
import { useAppLang } from "../hooks/useAppLang";
import { useTranslation } from "react-i18next";

// UI
import AppHeader from "../components/AppHeader";
import CounterPill from "../components/CounterPill";
import Chip from "../components/Chip";
import PrimaryButton from "../components/PrimaryButton";

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
      setStats(r.data || { todayCount: 0, totalCount: 0 });
    } catch {
      // молча — визуально покажем 0/0
    }
  }

  async function resetTodayLocal() {
    const d = new Date();
    const k = `zikrProgress:${d.getFullYear()}-${String(
      d.getMonth() + 1
    ).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    await AsyncStorage.removeItem(k);
    Alert.alert(
      t("done") || "Готово",
      t("resetLocalDone") || "Локальный прогресс на сегодня очищен."
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader title={t("profile")} />

      {/* Статистика */}
      <View style={[styles.card, shadow.card]}>
        <Text style={styles.section}>{t("today")}</Text>
        <View style={styles.rowGap}>
          <CounterPill
            label={t("today")}
            value={stats.todayCount}
            tone="success"
          />
          <CounterPill label={t("total")} value={stats.totalCount} />
        </View>
      </View>

      {/* Уровень и язык */}
      <View style={[styles.card, shadow.card]}>
        <Text style={styles.section}>{t("level")}</Text>
        <View style={styles.rowChips}>
          <StaticTag label={t("beginner")} active />
          <StaticTag label={t("advanced")} />
        </View>

        <Text style={[styles.section, { marginTop: spacing.lg }]}>
          {t("language")}
        </Text>
        <View style={styles.rowChips}>
          <Chip
            label="Рус"
            active={lang === "ru"}
            onPress={() => setLang("ru")}
          />
          <Chip
            label="Қаз"
            active={lang === "kz"}
            onPress={() => setLang("kz")}
          />
          <Chip
            label="Eng"
            active={lang === "en"}
            onPress={() => setLang("en")}
          />
        </View>
      </View>

      <PrimaryButton onPress={resetTodayLocal} style={styles.resetBtn}>
        {t("resetLocal")}
      </PrimaryButton>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: 30,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  section: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    marginBottom: spacing.sm,
  },
  rowGap: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  rowChips: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    flexWrap: "wrap",
  },

  // статичные теги уровня
  tag: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: "#EEF2F7",
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagActive: {
    backgroundColor: "#DFF7F6",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  tagTxt: { color: colors.textMuted, fontWeight: "700" },
  tagTxtActive: { color: colors.primaryDark },

  resetBtn: {
    marginTop: spacing.xl,
  },
});
