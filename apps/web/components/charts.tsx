"use client";

import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MerPoint, TrafficDay } from "../lib/mock";

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

export function SpendRevenueChart({ data }: { data: MerPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="date" tickFormatter={shortDate} {...AXIS} tickLine={false} minTickGap={40} />
        <YAxis {...AXIS} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
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

export function MerChart({ data }: { data: MerPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="date" tickFormatter={shortDate} {...AXIS} tickLine={false} minTickGap={40} />
        <YAxis {...AXIS} tickLine={false} domain={["auto", "auto"]} tickFormatter={(v: number) => v.toFixed(1)} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: "#94a3b8" }}
          formatter={(value, name) => [Number(value).toFixed(2), String(name)]}
        />
        <Line dataKey="mer7" name="MER 7d" type="monotone" stroke="#a78bfa" strokeWidth={2} dot={false} connectNulls />
        <Line dataKey="mer28" name="MER 28d" type="monotone" stroke="#38bdf8" strokeWidth={2} dot={false} connectNulls />
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
        <YAxis {...AXIS} tickLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`} />
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
