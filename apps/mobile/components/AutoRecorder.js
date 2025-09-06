// apps/mobile/components/AutoRecorder.js
import { useEffect, useRef, useState, useCallback } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";
import API from "../api";

// Мягкий VAD + антидубль
const VAD = {
  meteringThresholdDb: -50,
  minSpeechMs: 400,
  silenceMs: 800,
  maxChunkMs: 6000,
  minVoiceStreakMs: 120,
  progressUpdateMs: 120, // <<< важно для Recording.setProgressUpdateInterval
  postSuccessMuteMs: 1200, // «тишинное» окно после успешной фразы
  idleStopMs: 4500, // автоостановка по тишине
};

let postSuccessMuteUntil = 0;

async function configureAudio() {
  const perm = await Audio.requestPermissionsAsync();
  if (!perm.granted) throw new Error("no-mic-permission");
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    interruptionModeIOS: 2,
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

    // защитимся от двойного вызова
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

    // если цикл остановлен — выключим индикаторы
    if (!loopRef.current) setActive(false);

    // фильтрация пустых чанков
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

      // успешная загрузка → тишинное окно
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
        // не await внутри callback
        setTimeout(() => stop(), 0);
        return;
      }

      const silence = now - lastVoiceAtRef.current;

      // финализация, если вышли из mute-окна
      if (
        !inMuteWindow &&
        dur >= VAD.minSpeechMs &&
        (silence >= VAD.silenceMs || dur >= VAD.maxChunkMs)
      ) {
        // не await внутри callback
        setTimeout(() => finalizeChunk(), 0);
      }
    });
    statusAttachedRef.current = true;
  }, [finalizeChunk]);

  async function startNewRecording() {
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      if (!loopRef.current) return;

      await configureAudio();
      const opts = makeOptions();
      const { recording } = await Audio.Recording.createAsync(opts);

      recRef.current = recording;

      const now = Date.now();
      startedAtRef.current = now;
      lastVoiceAtRef.current = now;
      lastAnyVoiceAtRef.current = now;
      voiceMsRef.current = 0;

      setActive(true);
      attachStatus();
    } catch (e) {
      loopRef.current = false;
      setActive(false);
      console.log("[rec] start error", e?.message);
    } finally {
      startingRef.current = false;
    }
  }

  const start = useCallback(async () => {
    if (loopRef.current) return;
    loopRef.current = true;
    setActive(true);
    // сбросим «тишинное окно» при старте
    postSuccessMuteUntil = 0;
    await startNewRecording();
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
