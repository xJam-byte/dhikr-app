// apps/mobile/components/ZikrCard.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  LayoutChangeEvent,
} from "react-native";
import { colors, spacing, radii, shadow } from "../theme/tokens";
import { useAppLang } from "../hooks/useAppLang";
import { toTransMap, toRuTranslit } from "../utils/zikrText";
import useReduceMotion from "../hooks/useReduceMotion";

// поддержим синонимы и опечатки
const normalizeCat = (raw) => {
  const n = String(raw || "")
    .toLowerCase()
    .trim();
  if (["tasbeeh", "tasbeh", "tasbeeḥ"].includes(n)) return "tasbih";
  return n;
};

const catColors = {
  morning: "#FDE68A", // жёлтый
  evening: "#BFDBFE", // голубой
  tasbih: "#C7D2FE", // сиреневый (канонический ключ)
};

const catLabels = {
  morning: "Утро",
  evening: "Вечер",
  tasbih: "Тасбих",
};

export default function ZikrCard({ item, progress = 0, target = 33, onPress }) {
  const { lang } = useAppLang();
  const reduce = useReduceMotion();

  // транслит под язык UI
  const translit = lang === "en" ? item.translit : toRuTranslit(item);

  // перевод
  const transMap = toTransMap(item.translations);
  const shownTranslation =
    transMap[lang] || transMap["ru"] || transMap["kz"] || transMap["en"] || "";

  // категория
  const catKey = useMemo(() => normalizeCat(item.category), [item.category]);
  const badgeBg = catColors[catKey] || "#E5E7EB";
  const badgeLabel = catLabels[catKey] || item.category;

  // анимация нажатия
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () =>
    Animated.spring(scale, {
      toValue: 0.98,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  const onPressOut = () =>
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();

  // анимированный прогресс-бар
  const [trackW, setTrackW] = useState(0);
  const pct = Math.max(0, Math.min(1, target ? progress / target : 0));
  const barW = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!trackW) return;
    Animated.timing(barW, {
      toValue: trackW * pct,
      duration: reduce ? 0 : 420,
      useNativeDriver: false,
    }).start();
  }, [pct, trackW, reduce, barW]);

  const onTrackLayout = (e /** @type {LayoutChangeEvent} */) => {
    const w = e.nativeEvent.layout.width;
    setTrackW(w);
    // синхронизировать начальную ширину
    barW.setValue(w * pct);
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => [pressed && { opacity: 0.98 }]}
      accessibilityRole="button"
      accessibilityLabel={`Зикр: ${item.translit || item.arabicText}`}
      accessibilityHint="Открыть детали и запись"
      accessibilityValue={{
        text: `Прогресс ${progress} из ${target}`,
      }}
    >
      <Animated.View
        style={[styles.card, shadow.card, { transform: [{ scale }] }]}
      >
        {/* бейдж категории */}
        {!!catKey && (
          <View style={[styles.badge, { backgroundColor: badgeBg }]}>
            <Text style={styles.badgeTxt} allowFontScaling>
              {badgeLabel}
            </Text>
          </View>
        )}

        <Text
          style={styles.arabic}
          numberOfLines={2}
          adjustsFontSizeToFit
          allowFontScaling
        >
          {item.arabicText}
        </Text>

        {!!translit && (
          <Text style={styles.translit} numberOfLines={1} allowFontScaling>
            {translit}
          </Text>
        )}

        {!!shownTranslation && (
          <Text style={styles.translation} numberOfLines={2} allowFontScaling>
            {shownTranslation}
          </Text>
        )}

        {/* прогресс */}
        <View style={styles.progressWrap}>
          <View style={styles.track} onLayout={onTrackLayout}>
            <Animated.View style={[styles.fill, { width: barW }]} />
          </View>
          <Text style={styles.progressText} allowFontScaling>
            {progress}/{target}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
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

  // прогресс
  progressWrap: {
    alignItems: "center",
    gap: 8,
  },
  track: {
    width: "100%",
    height: 8,
    backgroundColor: "#EEF2F7",
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: colors.primary,
  },
  progressText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
  },
});
