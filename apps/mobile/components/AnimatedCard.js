// apps/mobile/components/AnimatedCard.js
import React, { useEffect, useRef } from "react";
import { Animated } from "react-native";
import useReduceMotion from "../hooks/useReduceMotion";

export default function AnimatedCard({ index = 0, children, style }) {
  const reduce = useReduceMotion();
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) {
      t.setValue(1);
      return;
    }
    Animated.timing(t, {
      toValue: 1,
      duration: 380,
      delay: Math.min(index * 40, 400),
      useNativeDriver: true,
    }).start();
  }, [index, reduce]);

  const translateY = t.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });
  const opacity = t;

  return (
    <Animated.View style={[{ transform: [{ translateY }], opacity }, style]}>
      {children}
    </Animated.View>
  );
}
