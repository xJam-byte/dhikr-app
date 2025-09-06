// apps/mobile/components/PrimaryButton.js
import React, { useRef } from "react";
import {
  Text,
  TouchableWithoutFeedback,
  Animated,
  StyleSheet,
} from "react-native";
import { colors, radii, spacing, shadow } from "../theme/tokens";

export default function PrimaryButton({ children, onPress }) {
  const s = useRef(new Animated.Value(1)).current;
  const pressIn = () =>
    Animated.spring(s, { toValue: 0.96, useNativeDriver: true }).start();
  const pressOut = () =>
    Animated.spring(s, {
      toValue: 1,
      friction: 4,
      useNativeDriver: true,
    }).start();

  return (
    <TouchableWithoutFeedback
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={onPress}
    >
      <Animated.View
        style={[styles.btn, { transform: [{ scale: s }] }, shadow.card]}
      >
        <Text style={styles.txt}>{children}</Text>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
  },
  txt: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
