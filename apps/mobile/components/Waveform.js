import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet } from "react-native";
import { colors } from "../theme/tokens";
import useReduceMotion from "../hooks/useReduceMotion";
const BAR_COUNT = 16;
const BASE_SCALE = 0.4;

export default function Waveform({ active }) {
  // создаём Animated.Value один раз
  const reduce = useReduceMotion();
  const barsRef = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(BASE_SCALE))
  );
  const timersRef = useRef([]);

  useEffect(() => {
    const bars = barsRef.current;
    const timers = [];

    const startBarLoop = (v, delayMs) => {
      const loop = () => {
        Animated.timing(v, {
          toValue: Math.random() * 1 + 0.5, // 0.5..1.5
          duration: 280 + Math.random() * 220,
          useNativeDriver: true,
        }).start(() => loop());
      };
      const t = setTimeout(loop, delayMs);
      timers.push(t);
    };

    if (active && !reduce) {
      bars.forEach((v, i) => startBarLoop(v, i * 40));
    } else {
      // остановить и вернуть к базовой высоте
      bars.forEach((v) => v.stopAnimation(() => v.setValue(BASE_SCALE)));
    }

    timersRef.current = timers;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      bars.forEach((v) => v.stopAnimation());
    };
  }, [active]);

  return (
    <View style={styles.row}>
      {barsRef.current.map((v, idx) => (
        <Animated.View
          key={idx}
          style={[
            styles.bar,
            (!active || reduce) && styles.barMuted,
            { transform: [{ scaleY: v }] },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", height: 36, alignItems: "center", gap: 3 },
  bar: {
    width: 4,
    height: 20,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  barMuted: {
    backgroundColor: "rgba(15,125,92,0.35)", // primary с альфой
  },
});
