// utils/vadConfig.js
export const VAD = {
  meteringThresholdDb: -35,
  minSpeechMs: 500, // было 350 → меньше «пустых»
  silenceMs: 450,
  maxChunkMs: 6000,
  minVoiceStreakMs: 250, // НОВОЕ: суммарная речь в чанке
};
