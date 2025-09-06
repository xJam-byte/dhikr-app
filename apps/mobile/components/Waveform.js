import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet } from "react-native";
import { colors } from "../theme/tokens";

export default function Waveform({ active }) {
  const bars = Array.from({ length: 16 }, () => new Animated.Value(0.4));
  useEffect(() => {
    let timers = [];
    if (active) {
      bars.forEach((v, i) => {
        const loop = () => {
          Animated.timing(v, {
            toValue: Math.random() * 1 + 0.5,
            duration: 280 + Math.random() * 200,
            useNativeDriver: true,
          }).start(() => loop());
        };
        timers[i] = setTimeout(loop, i * 40);
      });
    }
    return () => {
      timers.forEach((t) => clearTimeout(t));
      bars.forEach((v) => v.stopAnimation(() => v.setValue(0.4)));
    };
  }, [active]);

  return (
    <View style={styles.row}>
      {bars.map((v, idx) => (
        <Animated.View
          key={idx}
          style={[styles.bar, { transform: [{ scaleY: v }] }]}
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
});
