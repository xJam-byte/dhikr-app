import React, { useRef } from "react";
import { View, StyleSheet } from "react-native";
import ConfettiCannon from "react-native-confetti-cannon";

export default function ConfettiOverlay({ trigger }) {
  const ref = useRef(null);
  return (
    <View
      pointerEvents="none"
      style={{ ...StyleSheet.absoluteFillObject, zIndex: 999 }}
    >
      {trigger ? (
        <ConfettiCannon
          ref={ref}
          autoStart
          fadeOut
          count={60}
          delay={120}
          origin={{ x: -10, y: 0 }}
        />
      ) : null}
    </View>
  );
}
