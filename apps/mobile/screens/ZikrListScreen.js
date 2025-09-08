// apps/mobile/screens/ZikrListScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  ScrollView,
  Text,
  useWindowDimensions,
} from "react-native";
import API from "../api";
import AppHeader from "../components/AppHeader";
import ZikrCard from "../components/ZikrCard";
import CounterPill from "../components/CounterPill";
import SearchBar from "../components/SearchBar";
import Chip from "../components/Chip";
import { colors, spacing } from "../theme/tokens";
import useZikrProgress from "../hooks/useZikrProgress";
import { useAppLang } from "../hooks/useAppLang";
import { useTranslation } from "react-i18next";
import { toTransMap } from "../utils/zikrText";
import AnimatedCard from "../components/AnimatedCard";

const CATEGORIES = [
  { key: "all", labelI18n: "all", fallback: "Все" },
  { key: "morning", labelI18n: "morning", fallback: "Утро" },
  { key: "evening", labelI18n: "evening", fallback: "Вечер" },
  { key: "tasbih", labelI18n: "tasbih", fallback: "Тасбих" },
];

const CAT_SYNONYM = {
  tasbeeh: "tasbih",
  tasbeeḥ: "tasbih",
  tasbeh: "tasbih",
  tasbih: "tasbih",
  утро: "morning",
  вечер: "evening",
};

const normalizeCatRaw = (v) => (v || "").toLowerCase().trim();
const toCanonicalCat = (v) => {
  const n = normalizeCatRaw(v);
  return CAT_SYNONYM[n] || n;
};

export default function ZikrListScreen({ navigation }) {
  const [list, setList] = useState([]);
  const [counts, setCounts] = useState({ todayCount: 0, totalCount: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const pagerRef = useRef(null);
  const { width } = useWindowDimensions();

  const { getProgress, reloadProgress } = useZikrProgress();
  const { lang } = useAppLang();
  const { t } = useTranslation();

  const load = async () => {
    const [z, c] = await Promise.all([
      API.get("/zikr?limit=200"),
      API.get("/counters/today"),
    ]);
    const items = (z.data.items || []).map((it) => ({
      ...it,
      category: toCanonicalCat(it.category),
    }));
    setList(items);
    setCounts(c.data || { todayCount: 0, totalCount: 0 });
    await reloadProgress();
  };

  useEffect(() => {
    load();
  }, []);

  const filterBy = (catKey) => {
    const term = q.trim().toLowerCase();
    return (list || []).filter((item) => {
      const okC = catKey === "all" || item.category === catKey;

      const map = toTransMap(item.translations);
      const textInLang = (
        map[lang] ||
        map["ru"] ||
        map["kz"] ||
        map["en"] ||
        ""
      ).toLowerCase();

      const okQ =
        !term ||
        item.translit?.toLowerCase().includes(term) ||
        item.arabicText?.toLowerCase().includes(term) ||
        textInLang.includes(term);

      return okC && okQ;
    });
  };

  const dataByCat = {
    all: useMemo(() => filterBy("all"), [list, q, lang]),
    morning: useMemo(() => filterBy("morning"), [list, q, lang]),
    evening: useMemo(() => filterBy("evening"), [list, q, lang]),
    tasbih: useMemo(() => filterBy("tasbih"), [list, q, lang]),
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const onMomentumEnd = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / width);
    const nextCat = CATEGORIES[idx]?.key || "all";
    if (nextCat !== cat) setCat(nextCat);
  };

  const scrollToCat = (key) => {
    const idx = CATEGORIES.findIndex((c) => c.key === key);
    if (idx < 0) return;
    setCat(key);
    pagerRef.current?.scrollTo({ x: idx * width, animated: true });
  };

  const renderPage = (catKey) => (
    <View key={catKey} style={{ width }}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={dataByCat[catKey]}
        keyExtractor={(item, i) => item?.id || `${catKey}-${i}`}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item, index }) => {
          const target = item.target ?? 33;
          const prog = getProgress(item.id);
          return (
            <AnimatedCard index={index}>
              <ZikrCard
                item={item}
                progress={prog}
                target={target}
                onPress={() =>
                  navigation.navigate("ZikrDetail", { zikr: item, target })
                }
              />
            </AnimatedCard>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t("noCategoryList")}</Text>
            <Text style={styles.emptyCaption}>{t("tryAnotherFilter")}</Text>
          </View>
        }
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <AppHeader title={t("appTitle")} />

      <View style={styles.caps}>
        <CounterPill
          label={t("today")}
          value={counts.todayCount}
          tone="success"
        />
        <CounterPill label={t("total")} value={counts.totalCount} />
      </View>

      <View style={styles.filtersBlock}>
        <SearchBar
          value={q}
          onChange={setQ} // ← ключевая правка
          placeholder={t("searchPlaceholder")}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsRow}
          contentContainerStyle={{ gap: spacing.sm }}
        >
          {CATEGORIES.map((c) => (
            <Chip
              key={c.key}
              label={t(c.labelI18n) || c.fallback}
              active={cat === c.key}
              onPress={() => scrollToCat(c.key)}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        keyboardShouldPersistTaps="handled"
      >
        {CATEGORIES.map((c) => renderPage(c.key))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 10 },
  caps: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    marginBottom: spacing.md,
  },
  filtersBlock: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  chipsRow: {
    marginTop: spacing.md,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  empty: { alignItems: "center", paddingTop: 48, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  emptyCaption: { color: colors.textMuted },
});
