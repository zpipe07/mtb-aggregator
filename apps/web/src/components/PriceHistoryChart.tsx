"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Text,
  Tooltip,
  XAxis,
  YAxis,
  type XAxisTickContentProps,
} from "recharts";
import { cn } from "@/lib/utils";
import { PRICE_HISTORY_CHART_FRAME_CLASS } from "./priceHistoryChartFrame";
import {
  PRICE_HISTORY_CHART_MARGIN,
  PRICE_HISTORY_Y_AXIS_WIDTH,
  priceHistoryPlotWidth,
  priceHistoryTickAnchor,
  selectPriceHistoryTickIndexes,
} from "./priceHistoryTicks";

export type PriceHistoryChartPoint = {
  price: number;
  recorded_at: string;
  dateLabel: string;
};

type PriceHistoryChartProps = {
  data: PriceHistoryChartPoint[];
  className?: string;
};

const AXIS_TICK = {
  fontSize: 11,
  fontFamily: "var(--font-mono)",
} as const;

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function PriceHistoryDateTick({
  x,
  y,
  payload,
  index,
  visibleIndexes,
  pointCount,
}: XAxisTickContentProps & {
  visibleIndexes: ReadonlySet<number>;
  pointCount: number;
}) {
  if (!visibleIndexes.has(index)) return <g />;
  const label = payload?.value;
  if (label == null || label === "") return <g />;
  return (
    <Text
      x={x}
      y={y}
      textAnchor={priceHistoryTickAnchor(index, pointCount)}
      verticalAnchor="start"
      fill="var(--color-muted-foreground)"
      fontSize={AXIS_TICK.fontSize}
      fontFamily={AXIS_TICK.fontFamily}
    >
      {label}
    </Text>
  );
}

export function PriceHistoryChart({ data, className }: PriceHistoryChartProps) {
  const fillGradientId = useId().replace(/:/g, "");
  const frameRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const apply = (width: number) => {
      const next = Math.round(width);
      setChartWidth((prev) => (prev === next ? prev : next));
    };
    apply(el.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width != null) apply(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const visibleIndexes = useMemo(() => {
    return new Set(
      selectPriceHistoryTickIndexes(data.length, priceHistoryPlotWidth(chartWidth)),
    );
  }, [chartWidth, data.length]);

  return (
    <div
      className={cn(PRICE_HISTORY_CHART_FRAME_CLASS, "text-primary", className)}
    >
      <div ref={frameRef} className="h-full w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={PRICE_HISTORY_CHART_MARGIN}>
            <defs>
              <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
                <stop offset="100%" stopColor="currentColor" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border)"
            />
            <XAxis
              dataKey="dateLabel"
              allowDuplicatedCategory
              interval={0}
              padding={{ left: 0, right: 0 }}
              tickMargin={8}
              height={32}
              tickLine={false}
              tick={(props: XAxisTickContentProps) => (
                <PriceHistoryDateTick
                  {...props}
                  visibleIndexes={visibleIndexes}
                  pointCount={data.length}
                />
              )}
              stroke="var(--color-muted-foreground)"
            />
            <YAxis
              width={PRICE_HISTORY_Y_AXIS_WIDTH}
              tick={AXIS_TICK}
              stroke="var(--color-muted-foreground)"
              tickFormatter={(v) => `$${Math.round(v)}`}
              domain={["dataMin - 5", "dataMax + 5"]}
            />
            <Tooltip
              formatter={(value) => [
                `$${Number(value ?? 0).toFixed(2)}`,
                "Price",
              ]}
              labelFormatter={(_, payload) =>
                payload?.[0]?.payload?.recorded_at
                  ? formatDate(payload[0].payload.recorded_at)
                  : ""
              }
              contentStyle={{
                borderRadius: "2px",
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-card)",
                color: "var(--color-foreground)",
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                boxShadow:
                  "var(--shadow-sm, 0 1px 2px rgb(0 0 0 / 0.06))",
              }}
              labelStyle={{
                color: "var(--color-muted-foreground)",
                marginBottom: "4px",
              }}
              itemStyle={{
                color: "var(--color-foreground)",
              }}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="none"
              fill={`url(#${fillGradientId})`}
              fillOpacity={1}
              isAnimationActive={false}
              tooltipType="none"
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="currentColor"
              strokeWidth={2}
              dot={false}
              activeDot={{
                r: 5,
                fill: "var(--color-foreground)",
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
