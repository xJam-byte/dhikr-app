import React from "react";
import Svg, { Circle } from "react-native-svg";

export default function ProgressRing({
  size = 52,
  stroke = 6,
  progress = 0,
  track = "#E5E7EB",
  color = "#0EA5A4",
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - Math.min(Math.max(progress, 0), 1) * c;
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
