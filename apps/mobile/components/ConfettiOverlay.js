import React, { useRef } from "react";
import { View, StyleSheet } from "react-native";
import ConfettiCannon from "react-native-confetti-cannon";

export default function ConfettiOverlay({ trigger }) {
  const ref = useRef(null);
  return (
    <View
      pointerEvents="none"
      style={{ ...StyleSheet.absoluteFill, zIndex: 999 }}
    >
      {trigger ? (
        <ConfettiCannon
          ref={ref}
          fadeOut
          autoStart
          count={160}
          origin={{ x: 0, y: 0 }}
          fallSpeed={3000}
        />
      ) : null}
    </View>
  );
}
