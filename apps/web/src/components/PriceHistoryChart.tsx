"use client";

import { useId } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

export type PriceHistoryChartPoint = {
  price: number;
  recorded_at: string;
  dateLabel: string;
};

type PriceHistoryChartProps = {
  data: PriceHistoryChartPoint[];
  className?: string;
};

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

export function PriceHistoryChart({ data, className }: PriceHistoryChartProps) {
  const fillGradientId = useId().replace(/:/g, "");

  return (
    <div
      className={cn(
        "h-64 w-full rounded-sm border border-foreground/40 bg-card/50 p-2 text-primary",
        className,
      )}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
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
            tick={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
            }}
            stroke="var(--color-muted-foreground)"
          />
          <YAxis
            tick={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
            }}
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
  );
}
