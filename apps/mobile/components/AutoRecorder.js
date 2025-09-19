// apps/mobile/components/AutoRecorder.js
import { useEffect, useRef, useState, useCallback } from "react";
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from "expo-av";

import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";
import API from "../api";

// Мягкий VAD + антидубль
const VAD = {
  meteringThresholdDb: -50,
  minSpeechMs: 320, // было 400
  silenceMs: 300, // было 800 → быстрее финализируем чанк
  maxChunkMs: 3500, // чуть короче
  minVoiceStreakMs: 120,
  progressUpdateMs: 120,
  postSuccessMuteMs: 1200,
  idleStopMs: 4500,
};

let postSuccessMuteUntil = 0;

// ---- helpers: пермишены и аудио-сессия (основная/запасная)
async function ensureMicPermission() {
  const cur = await Audio.getPermissionsAsync();
  if (cur.status === "granted" || cur.granted) return;
  if (cur.canAskAgain) {
    const req = await Audio.requestPermissionsAsync();
    if (req.status === "granted" || req.granted) return;
  }
  throw new Error("no-mic-permission");
}

async function setAudioModePrimary() {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

async function setAudioModeFallback() {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    // иногда MIX_WITH_OTHERS помогает, когда iOS говорит "not allowed"
    interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

function makeOptions() {
  const base = Audio.RecordingOptionsPresets.HIGH_QUALITY;
  return {
    ...base,
    ios: {
      ...base.ios,
      extension: ".m4a",
      outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
      audioQuality: Audio.IOSAudioQuality.HIGH,
      bitRate: 128000,
      sampleRate: 44100,
      numberOfChannels: 1,
      isMeteringEnabled: true, // критично для VAD на iOS
    },
    android: {
      ...base.android,
      extension: ".3gp",
      outputFormat: Audio.AndroidOutputFormat.THREE_GPP,
      audioEncoder: Audio.AndroidAudioEncoder.AMR_NB,
      sampleRate: 44100,
      numberOfChannels: 1,
      bitRate: 128000,
    },
  };
}

export default function useAutoRecorder(zikrId, onChunkDone) {
  const [active, setActive] = useState(false);

  const loopRef = useRef(false);
  const recRef = useRef(null);
  const startingRef = useRef(false);

  const startedAtRef = useRef(0);
  const lastVoiceAtRef = useRef(0);
  const lastAnyVoiceAtRef = useRef(0);
  const voiceMsRef = useRef(0);

  const statusAttachedRef = useRef(false);

  const detachStatus = useCallback(() => {
    const rec = recRef.current;
    if (rec && statusAttachedRef.current) {
      rec.setOnRecordingStatusUpdate(null);
      statusAttachedRef.current = false;
    }
  }, []);

  const finalizeChunk = useCallback(async () => {
    const rec = recRef.current;
    if (!rec) return;

    // остановить колбэки статуса перед выгрузкой
    detachStatus();

    let uri = null;
    let durationMs = 0;
    try {
      const stopStatus = await rec.stopAndUnloadAsync();
      uri = rec.getURI();
      durationMs =
        stopStatus?.durationMillis && stopStatus.durationMillis > 0
          ? stopStatus.durationMillis
          : Date.now() - startedAtRef.current;
    } catch (e) {
      console.log("[rec] finalize error", e?.message);
    }

    recRef.current = null;
    const hadVoiceMs = voiceMsRef.current;
    voiceMsRef.current = 0;

    if (!loopRef.current) setActive(false);

    // отбрасываем пустые/короткие чанки
    if (
      !uri ||
      durationMs < VAD.minSpeechMs ||
      hadVoiceMs < VAD.minVoiceStreakMs
    ) {
      console.log("[rec] drop chunk: too short/no voice", {
        durationMs,
        hadVoiceMs,
      });
      if (loopRef.current) await startNewRecording();
      return;
    }

    try {
      const form = new FormData();
      form.append("file", {
        uri,
        type: Platform.OS === "ios" ? "audio/m4a" : "audio/3gp",
        name: Platform.OS === "ios" ? "chunk.m4a" : "chunk.3gp",
      });
      form.append("zikrId", zikrId);
      form.append("durationMs", String(Math.round(durationMs)));

      console.log("[rec] upload chunk…", { durationMs, hadVoiceMs });
      const res = await API.post("/recordings/upload", form, {
        timeout: 20000,
      });

      // успешная загрузка → mute-окно
      postSuccessMuteUntil = Date.now() + VAD.postSuccessMuteMs;

      onChunkDone?.(res.data);
    } catch (e) {
      console.log(
        "[rec] upload error",
        e?.message,
        e?.response?.status,
        e?.response?.data
      );
    } finally {
      try {
        if (uri) await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch {}
      if (loopRef.current) {
        await startNewRecording();
      } else {
        setActive(false);
      }
    }
  }, [detachStatus, zikrId, onChunkDone]);

  const attachStatus = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    rec.setProgressUpdateInterval(VAD.progressUpdateMs);
    rec.setOnRecordingStatusUpdate((st) => {
      const now = Date.now();
      const inMuteWindow = now < postSuccessMuteUntil;

      const level = typeof st.metering === "number" ? st.metering : -60;
      const speaking = level > VAD.meteringThresholdDb;

      if (speaking) {
        voiceMsRef.current += VAD.progressUpdateMs;
        lastVoiceAtRef.current = now;
        lastAnyVoiceAtRef.current = now;
      }

      const dur =
        typeof st.durationMillis === "number"
          ? st.durationMillis
          : now - startedAtRef.current;

      // автостоп по долгой тишине
      if (!speaking && now - lastAnyVoiceAtRef.current > VAD.idleStopMs) {
        setTimeout(() => stop(), 0);
        return;
      }

      const silence = now - lastVoiceAtRef.current;

      // финализируем фрагмент, если вышли из mute-окна
      if (
        !inMuteWindow &&
        dur >= VAD.minSpeechMs &&
        (silence >= VAD.silenceMs || dur >= VAD.maxChunkMs)
      ) {
        setTimeout(() => finalizeChunk(), 0);
      }
    });
    statusAttachedRef.current = true;
  }, [finalizeChunk]);

  // ВАЖНО: возвращает true/false — удалось ли реально стартануть
  async function startNewRecording() {
    if (startingRef.current) return false;
    startingRef.current = true;
    try {
      await ensureMicPermission();
      try {
        await setAudioModePrimary();
      } catch {}

      const opts = makeOptions();

      let recording;
      try {
        ({ recording } = await Audio.Recording.createAsync(opts));
      } catch (e1) {
        // fallback-сессия + ретрай, если устройство «не пускает»
        try {
          await setAudioModeFallback();
          ({ recording } = await Audio.Recording.createAsync(opts));
        } catch (e2) {
          console.log("[rec] start error", e2?.message || e1?.message);
          return false;
        }
      }

      recRef.current = recording;

      const now = Date.now();
      startedAtRef.current = now;
      lastVoiceAtRef.current = now;
      lastAnyVoiceAtRef.current = now;
      voiceMsRef.current = 0;

      attachStatus();
      setActive(true); // включаем только после успешного createAsync
      return true;
    } catch (e) {
      console.log("[rec] start error outer", e?.message);
      return false;
    } finally {
      startingRef.current = false;
    }
  }

  // НЕ включаем active/loopRef заранее — ждём реального успеха
  const start = useCallback(async () => {
    if (startingRef.current || loopRef.current) return;
    postSuccessMuteUntil = 0;

    const ok = await startNewRecording();
    if (ok) {
      // только теперь включаем цикловой режим (для авто-чанков)
      loopRef.current = true;
    }
  }, []);

  const stop = useCallback(async () => {
    loopRef.current = false;
    detachStatus();
    if (recRef.current) {
      await finalizeChunk();
    }
    setActive(false);
  }, [detachStatus, finalizeChunk]);

  useEffect(() => {
    return () => {
      loopRef.current = false;
      try {
        detachStatus();
        const rec = recRef.current;
        if (rec) rec.stopAndUnloadAsync().catch(() => {});
      } catch {}
      recRef.current = null;
      setActive(false);
    };
  }, [detachStatus]);

  return { active, start, stop };
}
