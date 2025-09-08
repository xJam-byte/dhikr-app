import React, { useEffect, useRef } from "react";
import { Pressable, View, Text, StyleSheet, Animated } from "react-native";
import { colors, radii, spacing, shadow } from "../theme/tokens";

export default function RecordButton({ isRecording, onPress, disabled }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let loop;
    if (isRecording) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1.08,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1.0,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
    } else {
      pulse.stopAnimation();
      pulse.setValue(1);
    }
    return () => loop?.stop();
  }, [isRecording]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isRecording ? "Остановить запись" : "Начать запись"}
      accessibilityHint={
        isRecording ? "Остановит текущую запись" : "Начнёт запись зикра"
      }
      accessibilityState={{ disabled }}
      onPress={disabled ? null : onPress}
      disabled={disabled}
      hitSlop={20}
      android_ripple={{ color: "#E5E7EB", borderless: false }}
      style={({ pressed }) => [
        styles.pressable,
        shadow.card,
        pressed && styles.pressed,
        disabled && { opacity: 0.6 },
      ]}
    >
      <Animated.View style={[styles.inner, { transform: [{ scale: pulse }] }]}>
        <View
          style={[
            styles.dot,
            { backgroundColor: isRecording ? colors.danger : colors.primary },
          ]}
        />
        <Text style={styles.label}>{isRecording ? "Стоп" : "Запись"}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    backgroundColor: "#fff",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    borderRadius: radii.xl,
  },
  pressed: { transform: [{ scale: 0.98 }] },
  inner: {
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  label: { fontSize: 18, fontWeight: "700", color: colors.text },
  dot: { width: 14, height: 14, borderRadius: 7 },
});
