import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Rect, Circle, Path, Line, G, Text as SvgText } from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

/* ────────────────────────────────────────────────────────────────────────────
 * Chart primitives built on react-native-svg. Cross-platform (iOS / Android /
 * web) and zero additional dependencies. All charts:
 *   - Resize to container width via onLayout
 *   - Honour the responsive scale curve from useResponsive
 *   - Use design-token colours from useColors
 * ────────────────────────────────────────────────────────────────────────── */

export interface ChartDatum {
  label: string;
  value: number;
  color?: string;
}

interface BaseProps {
  data: ChartDatum[];
  height?: number;
  /** Optional max value (otherwise derived from data). */
  maxValue?: number;
}

function useChartWidth() {
  const [w, setW] = React.useState(0);
  const onLayout = React.useCallback(
    (e: { nativeEvent: { layout: { width: number } } }) => setW(e.nativeEvent.layout.width),
    [],
  );
  return { width: w, onLayout };
}

// ── Bar chart ───────────────────────────────────────────────────────────────
export function BarChart({ data, height = 160, maxValue }: BaseProps) {
  const colors = useColors();
  const r = useResponsive();
  const { width, onLayout } = useChartWidth();

  const h = r.iconSize(height);
  const padX = 8;
  const padTop = 14;
  const padBottom = 26;
  const innerW = Math.max(0, width - padX * 2);
  const innerH = h - padTop - padBottom;
  const max = Math.max(maxValue ?? 0, ...data.map((d) => d.value), 1);
  const slot = data.length > 0 ? innerW / data.length : 0;
  const barW = Math.max(8, slot * 0.55);

  return (
    <View onLayout={onLayout} style={{ width: "100%", height: h }}>
      {width > 0 ? (
        <Svg width={width} height={h}>
          {/* baseline */}
          <Line
            x1={padX}
            x2={width - padX}
            y1={padTop + innerH}
            y2={padTop + innerH}
            stroke={colors.border}
            strokeWidth={1}
          />
          {data.map((d, i) => {
            const barH = max > 0 ? (d.value / max) * innerH : 0;
            const cx = padX + slot * i + slot / 2;
            const x = cx - barW / 2;
            const y = padTop + innerH - barH;
            const fill = d.color || colors.primary;
            return (
              <G key={`${d.label}-${i}`}>
                <Rect x={x} y={y} width={barW} height={barH} rx={4} fill={fill} />
                {d.value > 0 ? (
                  <SvgText
                    x={cx}
                    y={Math.max(padTop + 9, y - 4)}
                    fill={colors.foreground}
                    fontSize={r.font(10)}
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    {d.value}
                  </SvgText>
                ) : null}
                <SvgText
                  x={cx}
                  y={padTop + innerH + 16}
                  fill={colors.mutedForeground}
                  fontSize={r.font(10)}
                  textAnchor="middle"
                >
                  {d.label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

// ── Donut chart ─────────────────────────────────────────────────────────────
interface DonutProps {
  data: ChartDatum[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
}

export function DonutChart({
  data,
  size = 140,
  thickness = 18,
  centerLabel,
  centerValue,
}: DonutProps) {
  const colors = useColors();
  const r = useResponsive();
  const total = data.reduce((s, d) => s + d.value, 0);
  const sz = r.iconSize(size);
  const th = r.iconSize(thickness);
  const radius = (sz - th) / 2;
  const cx = sz / 2;
  const cy = sz / 2;

  let acc = 0;

  return (
    <View style={{ alignItems: "center", justifyContent: "center", width: sz, height: sz }}>
      <Svg width={sz} height={sz}>
        {/* track */}
        <Circle cx={cx} cy={cy} r={radius} stroke={colors.border} strokeWidth={th} fill="none" />
        {total > 0 &&
          data.map((d, i) => {
            if (d.value <= 0) return null;
            const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
            acc += d.value;
            const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
            const large = end - start > Math.PI ? 1 : 0;
            const x1 = cx + radius * Math.cos(start);
            const y1 = cy + radius * Math.sin(start);
            const x2 = cx + radius * Math.cos(end);
            const y2 = cy + radius * Math.sin(end);
            const path = `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
            return (
              <Path
                key={`${d.label}-${i}`}
                d={path}
                stroke={d.color || colors.primary}
                strokeWidth={th}
                fill="none"
                strokeLinecap="butt"
              />
            );
          })}
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ fontSize: r.font(20), fontWeight: "700", color: colors.foreground }}>
          {centerValue ?? total}
        </Text>
        {centerLabel ? (
          <Text style={{ fontSize: r.font(10), color: colors.mutedForeground, marginTop: 2 }}>
            {centerLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ── Sparkline ───────────────────────────────────────────────────────────────
interface SparkProps {
  data: number[];
  height?: number;
  color?: string;
  fill?: boolean;
}

export function Sparkline({ data, height = 70, color, fill = true }: SparkProps) {
  const colors = useColors();
  const r = useResponsive();
  const { width, onLayout } = useChartWidth();
  const h = r.iconSize(height);
  const stroke = color || colors.primary;

  if (data.length < 2) {
    return (
      <View onLayout={onLayout} style={{ width: "100%", height: h, justifyContent: "center" }}>
        <Text style={{ color: colors.mutedForeground, fontSize: r.font(12) }}>
          Not enough data yet
        </Text>
      </View>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padX = 6;
  const padY = 8;
  const innerW = Math.max(0, width - padX * 2);
  const innerH = h - padY * 2;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

  const points = data.map((v, i) => {
    const x = padX + i * stepX;
    const y = padY + innerH - ((v - min) / range) * innerH;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");

  const areaPath =
    `${linePath} L ${points[points.length - 1][0].toFixed(2)} ${(padY + innerH).toFixed(2)}` +
    ` L ${points[0][0].toFixed(2)} ${(padY + innerH).toFixed(2)} Z`;

  return (
    <View onLayout={onLayout} style={{ width: "100%", height: h }}>
      {width > 0 ? (
        <Svg width={width} height={h}>
          {fill ? <Path d={areaPath} fill={stroke + "22"} /> : null}
          <Path d={linePath} stroke={stroke} strokeWidth={2} fill="none" />
          {points.map(([x, y], i) => (
            <Circle key={i} cx={x} cy={y} r={2.5} fill={stroke} />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

// ── Legend ──────────────────────────────────────────────────────────────────
export function Legend({ data }: { data: ChartDatum[] }) {
  const colors = useColors();
  const r = useResponsive();
  return (
    <View style={legendStyles.row}>
      {data.map((d) => (
        <View key={d.label} style={legendStyles.item}>
          <View
            style={[
              legendStyles.dot,
              {
                backgroundColor: d.color || colors.primary,
                width: r.iconSize(8),
                height: r.iconSize(8),
                borderRadius: r.iconSize(4),
              },
            ]}
          />
          <Text style={{ fontSize: r.font(11), color: colors.mutedForeground }}>
            {d.label} <Text style={{ color: colors.foreground, fontWeight: "600" }}>{d.value}</Text>
          </Text>
        </View>
      ))}
    </View>
  );
}

const legendStyles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 },
  item: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: {},
});
