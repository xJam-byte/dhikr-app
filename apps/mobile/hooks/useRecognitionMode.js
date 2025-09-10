// apps/mobile/hooks/useRecognitionMode.js
import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "recognition:mode"; // 'latin' | 'arabic' | 'auto'
const DEFAULT = "latin";

export function useRecognitionMode() {
  const [mode, setMode] = useState(DEFAULT);

  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(KEY);
        if (v === "latin" || v === "arabic" || v === "auto") setMode(v);
      } catch {}
    })();
  }, []);

  const save = useCallback(async (m) => {
    setMode(m);
    try {
      await AsyncStorage.setItem(KEY, m);
    } catch {}
  }, []);

  return { mode, setMode: save };
}

export async function getRecognitionModeRaw() {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v === "latin" || v === "arabic" || v === "auto") return v;
  } catch {}
  return DEFAULT;
}
