import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const keyForDay = (date = new Date()) => {
  const y = date.getFullYear(),
    m = String(date.getMonth() + 1).padStart(2, "0"),
    d = String(date.getDate()).padStart(2, "0");
  return `zikrProgress:${y}-${m}-${d}`; // по дню
};

export default function useZikrProgress() {
  const [map, setMap] = useState({}); // { [zikrId]: number }

  const load = useCallback(async () => {
    const key = keyForDay();
    const raw = await AsyncStorage.getItem(key);
    setMap(raw ? JSON.parse(raw) : {});
  }, []);

  const inc = useCallback(async (zikrId, by = 1) => {
    const key = keyForDay();
    const raw = (await AsyncStorage.getItem(key)) || "{}";
    const obj = JSON.parse(raw);
    obj[zikrId] = (obj[zikrId] || 0) + by;
    await AsyncStorage.setItem(key, JSON.stringify(obj));
    setMap(obj);
    return obj[zikrId];
  }, []);

  const get = useCallback((zikrId) => map[zikrId] || 0, [map]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    progressMap: map,
    getProgress: get,
    incProgress: inc,
    reloadProgress: load,
  };
}
