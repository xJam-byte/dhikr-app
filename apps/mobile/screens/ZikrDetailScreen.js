// apps/mobile/screens/ZikrDetailScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { colors, radii, spacing, shadow } from "../theme/tokens";
import ProgressRing from "../components/ProgressRing";
import Waveform from "../components/Waveform";
import ConfettiOverlay from "../components/ConfettiOverlay";
import RecordButton from "../components/RecordButton";
import useZikrProgress from "../hooks/useZikrProgress";
import useAutoRecorder from "../components/AutoRecorder";
import { useKeepAwake } from "expo-keep-awake";
import useReduceMotion from "../hooks/useReduceMotion";
import { Animated } from "react-native";
import API from "../api";
// ✅ добавлено — корректный выбор перевода
import { toTransMap } from "../utils/zikrText";
import { useAppLang } from "../hooks/useAppLang";

export default function ZikrDetailScreen({ route }) {
  const { zikr, target: targetProp = 33 } = route.params;
  useKeepAwake();
  const reduce = useReduceMotion();
  // ✅ язык интерфейса для показа перевода
  const { lang } = useAppLang();

  const processedIdsRef = useRef(new Set());
  const successCooldownRef = useRef(0); // timestamp, пока нельзя принимать следующий success
  const SUCCESS_COOLDOWN_MS = 1200;

  // локальный прогресс за сегодня
  const { getProgress, incProgress } = useZikrProgress();
  const [localCount, setLocalCount] = useState(0);
  useEffect(() => {
    setLocalCount(getProgress(zikr.id));
  }, [zikr.id, getProgress]);

  // серверный per-zikr
  const [serverToday, setServerToday] = useState({
    count: 0,
    target: targetProp,
    completed: false,
  });

  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [celebrate, setCelebrate] = useState(false);

  // ✅ аккуратно вычислим перевод под выбранный язык
  const translationText = useMemo(() => {
    const map = toTransMap(zikr?.translations);
    return map[lang] || map["ru"] || map["kz"] || map["en"] || "";
  }, [zikr?.translations, lang]);

  const recorder = useAutoRecorder(zikr.id, async (uploadRes) => {
    try {
      const recId = uploadRes?.id;
      if (!recId) return;

      // защита от дубликатов
      if (processedIdsRef.current.has(recId)) return;
      processedIdsRef.current.add(recId);

      // кулдаун, чтобы не ловить «хвост»
      const now = Date.now();
      if (now < successCooldownRef.current) return;

      setStatusMsg("Проверяем запись…");
      const final = await pollRecordingStatus(recId);

      if (final === "DONE") {
        successCooldownRef.current = Date.now() + SUCCESS_COOLDOWN_MS;

        await incProgress(zikr.id, 1);
        setLocalCount((c) => c + 1);
        await refreshByZikrToday();
        setStatusMsg("Принято! +1");
      } else if (final === "FAILED") {
        setStatusMsg("Не распознано. Ещё раз.");
      } else {
        setStatusMsg("Не удалось подтвердить.");
      }
    } catch {
      // единичные ошибки игнорируем — следующий чанк продолжит
    }
  });

  const target = useMemo(
    () => serverToday.target ?? targetProp,
    [serverToday.target, targetProp]
  );
  const progress = useMemo(
    () => Math.min(localCount, target),
    [localCount, target]
  );
  const pct = Math.min(progress / Math.max(target, 1), 1);

  const progressAV = useRef(new Animated.Value(pct)).current;
  const [displayPct, setDisplayPct] = useState(pct);
  useEffect(() => {
    Animated.timing(progressAV, {
      toValue: pct,
      duration: reduce ? 0 : 500,
      useNativeDriver: false, // т.к. значение идёт в SVG-путь
    }).start();
  }, [pct, reduce]);
  useEffect(() => {
    const id = progressAV.addListener(({ value }) => setDisplayPct(value));
    return () => progressAV.removeListener(id);
  }, [progressAV]);

  // единоразовое конфетти
  const completedRef = useRef(false);
  useEffect(() => {
    if (serverToday.completed && !completedRef.current) {
      completedRef.current = true;
      setCelebrate(true);
      const t = setTimeout(() => setCelebrate(false), 2600);
      return () => clearTimeout(t);
    }
    if (!serverToday.completed) {
      completedRef.current = false;
    }
  }, [serverToday.completed]);

  useEffect(() => {
    refreshByZikrToday();
  }, []);

  async function refreshByZikrToday() {
    const tries = 2;
    for (let i = 0; i < tries; i++) {
      try {
        const r = await API.get("/counters/by-zikr");
        const list = r?.data || [];
        const row = list.find((x) => x.zikrId === zikr.id);
        if (row) {
          setServerToday({
            count: row.count ?? 0,
            target: row.target ?? targetProp,
            completed: !!row.completed,
          });
          return row;
        }
      } catch {}
      await new Promise((res) => setTimeout(res, 400));
    }
    setServerToday((s) => ({
      count: s.count || 0,
      target: s.target ?? targetProp,
      completed: s.completed || false,
    }));
    return null;
  }

  async function pollRecordingStatus(id) {
    const delays = [600, 900, 1200, 1500, 1800, 2000, 2200, 2500, 2800];
    for (const ms of delays) {
      try {
        const r = await API.get(`/recordings/${id}`);
        const s = r?.data?.status;
        if (s === "DONE" || s === "FAILED") return s;
      } catch {}
      await new Promise((res) => setTimeout(res, ms));
    }
    return null;
  }

  async function onStart() {
    try {
      setStatusMsg("Говори — я слушаю…");
      await recorder.start();
    } catch (e) {
      console.log("[rec.start] error:", e?.message || e);
      Alert.alert(
        "Ошибка записи",
        e && e.message ? String(e.message) : "Не удалось начать запись."
      );
    }
  }

  async function onStop() {
    setStatusMsg("Остановлено");
    await recorder.stop();
  }

  return (
    <View style={styles.container}>
      <ConfettiOverlay trigger={celebrate} />

      {/* Карточка с текстом зикра и целью */}
      <View style={[styles.card, shadow.card]}>
        <View style={styles.headerRow}>
          <ProgressRing
            size={64}
            progress={displayPct}
            color={pct >= 1 ? colors.success : colors.primary}
          />

          <View style={styles.centerText}>
            <Text style={styles.arabic} numberOfLines={2} adjustsFontSizeToFit>
              {zikr.arabicText}
            </Text>
            {!!zikr.translit && (
              <Text style={styles.translit} numberOfLines={1}>
                {zikr.translit}
              </Text>
            )}
          </View>

          <View style={styles.targetBox}>
            <Text style={styles.targetTop}>Цель</Text>
            <Text style={styles.targetVal}>{target}</Text>
          </View>
        </View>

        {!!translationText && (
          <Text style={styles.translation}>{translationText}</Text>
        )}
      </View>

      {/* Счётчики */}
      <View style={styles.counters}>
        <Text style={styles.counter}>Сегодня (локально): {progress}</Text>
        <Text style={styles.counterMuted}>
          Сервер: {serverToday.count}/{serverToday.target}
          {serverToday.completed ? " ✓" : ""}
        </Text>
      </View>

      {/* Волна и статус */}
      <View style={{ marginTop: spacing.lg, alignItems: "center" }}>
        <Waveform active={recorder.active} />
      </View>

      {!!statusMsg && <Text style={styles.status}>{statusMsg}</Text>}

      {/* Кнопка записи / индикатор */}
      {loading ? (
        <ActivityIndicator
          size="large"
          color={colors.text}
          style={{ marginTop: spacing.md }}
        />
      ) : (
        <RecordButton
          isRecording={recorder.active}
          onPress={recorder.active ? onStop : onStart}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: colors.bg,
    alignItems: "center",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    width: "100%",
    marginTop: 50,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  centerText: { flex: 1, alignItems: "center", paddingHorizontal: spacing.sm },
  arabic: {
    fontSize: 32,
    fontWeight: "800",
    textAlign: "center",
    color: colors.text,
  },
  translit: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 4,
  },
  translation: {
    fontSize: 15,
    color: colors.textMuted,
    marginTop: spacing.md,
    textAlign: "center",
  },
  targetBox: { alignItems: "center", paddingHorizontal: 10, minWidth: 62 },
  targetTop: { fontSize: 12, color: colors.textMuted },
  targetVal: { fontSize: 18, fontWeight: "800", color: colors.text },
  counters: { marginTop: spacing.lg, alignItems: "center", gap: 4 },
  counter: { fontSize: 16, color: colors.text },
  counterMuted: { fontSize: 14, color: colors.textMuted },
  status: { marginTop: spacing.sm, fontSize: 15, color: colors.textMuted },
});
