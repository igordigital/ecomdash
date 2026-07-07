"use client";

import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MerPoint, TrafficDay } from "../lib/dashboard-data";

const AXIS = { stroke: "#334155", fontSize: 11 } as const;
const GRID = { stroke: "#1e293b", strokeDasharray: "3 3" } as const;
const TOOLTIP_STYLE = {
  backgroundColor: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 6,
  fontSize: 12,
} as const;

const shortDate = (d: string) => d.slice(5);
const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

type ValueFmt = "usd" | "pct" | "num" | "ratio";

const FMT: Record<ValueFmt, (v: number) => string> = {
  usd: (v) => usd(v),
  pct: (v) => `${(v * 100).toFixed(2)}%`,
  num: (v) => v.toLocaleString("en-US"),
  ratio: (v) => v.toFixed(2),
};

const AXIS_FMT: Record<ValueFmt, (v: number) => string> = {
  usd: (v) => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`),
  pct: (v) => `${(v * 100).toFixed(1)}%`,
  num: (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`),
  ratio: (v) => v.toFixed(1),
};

export function SpendRevenueChart({ data }: { data: MerPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="date" tickFormatter={shortDate} {...AXIS} tickLine={false} minTickGap={40} />
        <YAxis {...AXIS} tickLine={false} tickFormatter={AXIS_FMT.usd} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: "#94a3b8" }}
          formatter={(value, name) => [usd(Number(value)), String(name)]}
        />
        <Bar dataKey="metaSpend" name="Meta spend" stackId="spend" fill="#38bdf8" fillOpacity={0.7} />
        <Bar dataKey="googleSpend" name="Google spend" stackId="spend" fill="#34d399" fillOpacity={0.7} />
        <Line
          dataKey="revenue"
          name="Store net revenue"
          type="monotone"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export interface TrendSeries {
  key: string;
  name: string;
  color: string;
}

/** Generic multi-line trend for network and MER metrics, with an optional target reference line. */
export function MetricTrend({
  data,
  series,
  fmt = "num",
  height = 220,
  target,
  targetLabel,
}: {
  data: object[];
  series: TrendSeries[];
  fmt?: ValueFmt;
  height?: number;
  target?: number;
  targetLabel?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="date" tickFormatter={shortDate} {...AXIS} tickLine={false} minTickGap={40} />
        <YAxis {...AXIS} tickLine={false} domain={["auto", "auto"]} tickFormatter={AXIS_FMT[fmt]} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: "#94a3b8" }}
          formatter={(value, name) => [FMT[fmt](Number(value)), String(name)]}
        />
        {target !== undefined ? (
          <ReferenceLine
            y={target}
            stroke="#f59e0b"
            strokeDasharray="6 4"
            label={{ value: targetLabel ?? target.toFixed(1), fill: "#f59e0b", fontSize: 11, position: "insideTopRight" }}
          />
        ) : null}
        {series.map((s) => (
          <Line
            key={s.key}
            dataKey={s.key}
            name={s.name}
            type="monotone"
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

const CHANNEL_COLORS: Record<string, string> = {
  "Organic Search": "#34d399",
  "Paid Social": "#38bdf8",
  "Paid Search": "#a78bfa",
  "Direct": "#f59e0b",
  "Email": "#f472b6",
  "Referral": "#64748b",
};

export function TrafficChart({ data, channels }: { data: TrafficDay[]; channels: readonly string[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="date" tickFormatter={shortDate} {...AXIS} tickLine={false} minTickGap={40} />
        <YAxis {...AXIS} tickLine={false} tickFormatter={AXIS_FMT.num} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: "#94a3b8" }}
          formatter={(value, name) => [Number(value).toLocaleString("en-US"), String(name)]}
        />
        {channels.map((ch) => (
          <Area
            key={ch}
            dataKey={ch}
            name={ch}
            stackId="sessions"
            type="monotone"
            stroke={CHANNEL_COLORS[ch] ?? "#64748b"}
            fill={CHANNEL_COLORS[ch] ?? "#64748b"}
            fillOpacity={0.35}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
