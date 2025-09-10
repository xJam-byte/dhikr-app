// apps/mobile/api.js
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

// ⚠️ Убедись, что этот URL — к твоему API (локальный IP компа в одной сети с телефоном)
const BASE_URL = "http://192.168.0.120:3000/v1";

const DEVICE_KEY = "device:id";

async function loadDeviceIdFromStores() {
  try {
    const v = await SecureStore.getItemAsync(DEVICE_KEY);
    if (v) return v;
  } catch {}
  try {
    const v2 = await AsyncStorage.getItem(DEVICE_KEY);
    if (v2) return v2;
  } catch {}
  return null;
}

async function saveDeviceIdToStores(id) {
  try {
    await SecureStore.setItemAsync(DEVICE_KEY, id);
  } catch {}
  try {
    await AsyncStorage.setItem(DEVICE_KEY, id);
  } catch {}
}

function quickUUID() {
  // один раз сгенерили и сохранили
  const rand = Math.floor(Math.random() * 1e9).toString(36);
  return `dev-${Date.now().toString(36)}-${rand}`;
}

let cachedDeviceIdPromise = null;

/** Получить (и кэшировать) стабильный deviceId */
export async function getDeviceId() {
  if (!cachedDeviceIdPromise) {
    cachedDeviceIdPromise = (async () => {
      const existing = await loadDeviceIdFromStores();
      if (existing) return existing;
      // генерим
      const tmp = quickUUID();
      await saveDeviceIdToStores(tmp);
      return tmp;
    })();
  }
  return cachedDeviceIdPromise;
}

// Создаём axios-инстанс
const API = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
});

// Интерцептор: подставляем X-Device-Id на каждый запрос
API.interceptors.request.use(async (config) => {
  try {
    const id = await getDeviceId();
    config.headers = config.headers || {};
    if (!config.headers["X-Device-Id"]) {
      config.headers["X-Device-Id"] = id;
    }
    const mode = await getRecognitionModeRaw();
    if (!config.headers["X-Recog-Mode"]) {
      config.headers["X-Recog-Mode"] = mode; // 'latin' | 'arabic' | 'auto'
    }
  } catch {}
  return config;
});

export default API;
