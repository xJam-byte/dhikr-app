import React from "react";
import Svg, { Circle } from "react-native-svg";
import { colors } from "../theme/tokens";

export default function ProgressRing({
  size = 52,
  stroke = 8,
  progress = 0,
  track = colors.border,
  color = colors.primary,
}) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - clamped * c;

  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={track}
        strokeWidth={stroke}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={offset}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
