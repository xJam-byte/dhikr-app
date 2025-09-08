import React, { useRef } from "react";
import {
  Text,
  TouchableWithoutFeedback,
  Animated,
  StyleSheet,
} from "react-native";
import { colors, radii, spacing, shadow } from "../theme/tokens";

export default function PrimaryButton({
  children,
  onPress,
  disabled = false,
  style,
}) {
  const s = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    if (disabled) return;
    Animated.spring(s, { toValue: 0.96, useNativeDriver: true }).start();
  };
  const pressOut = () => {
    if (disabled) return;
    Animated.spring(s, {
      toValue: 1,
      friction: 4,
      useNativeDriver: true,
    }).start();
  };

  return (
    <TouchableWithoutFeedback
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={disabled ? null : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Animated.View
        style={[
          styles.btn,
          disabled && styles.btnDisabled,
          { transform: [{ scale: s }] },
          shadow.card,
          style,
        ]}
      >
        <Text style={[styles.txt, disabled && styles.txtDisabled]}>
          {children}
        </Text>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 48,
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: {
    backgroundColor: colors.primaryDark,
    opacity: 0.6,
  },
  txt: { color: "#fff", fontSize: 16, fontWeight: "700" },
  txtDisabled: { opacity: 0.9 },
});
