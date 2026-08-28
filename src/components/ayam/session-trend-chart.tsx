"use client";

/**
 * SessionTrendChart — grafik kumulatif penghitungan sesi berjalan.
 * Data dari /api/timeline (in-memory count_history backend).
 */

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TimelinePoint } from "@/lib/ayam/api";
import type { Dict } from "@/lib/ayam/i18n";

interface SessionTrendChartProps {
  points: TimelinePoint[];
  total: number;
  active: boolean;
  t: Dict;
}

export function SessionTrendChart({ points, total, active, t }: SessionTrendChartProps) {
  const chartData =
    points.length > 0
      ? points
      : total > 0
        ? [{ t: 0, total: 0 }, { t: 1, total }]
        : [];

  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-sky-400" />
              {t.trenSesi}
            </CardTitle>
            <CardDescription className="mt-1">{t.trenSesiDesc}</CardDescription>
          </div>
          {active ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-900 bg-emerald-950 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 ayam-live-dot" />
              {t.live}
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex h-44 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-800 text-center">
            <Activity className="h-6 w-6 text-zinc-700" />
            <p className="text-sm font-medium text-zinc-400">{t.belumAdaTren}</p>
            <p className="text-xs text-zinc-600">{t.belumAdaTrenDesc}</p>
          </div>
        ) : (
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="t"
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "#3f3f46" }}
                  tickFormatter={(v: number) => `${Math.round(v)}s`}
                />
                <YAxis
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ stroke: "#f59e0b", strokeOpacity: 0.3 }}
                  contentStyle={{
                    background: "#09090b",
                    border: "1px solid #3f3f46",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "#f4f4f5",
                  }}
                  labelFormatter={(v) => `${v} ${t.detik}`}
                  formatter={(value: number | string) => [value, t.totalAyam]}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  fill="url(#trendFill)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#f59e0b", stroke: "#09090b" }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
