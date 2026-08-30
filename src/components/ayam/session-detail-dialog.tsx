"use client";

/**
 * SessionDetailDialog — detail satu sesi riwayat:
 * metadata, durasi, laju rata-rata, catatan, dan tautan unduh file Excel.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Bird,
  CalendarDays,
  ChartLine,
  Clock3,
  FileSpreadsheet,
  Gauge,
  Loader2,
  StickyNote,
  Timer,
  Download,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ayamApi, type HistoryItem, type SessionDetail } from "@/lib/ayam/api";
import type { Dict } from "@/lib/ayam/i18n";

interface SessionDetailDialogProps {
  session: HistoryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: Dict;
  lang: "id" | "en";
}

function fmtDuration(seconds: number, t: Dict): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s} ${t.detik}`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function SessionDetailDialog({
  session,
  open,
  onOpenChange,
  t,
  lang,
}: SessionDetailDialogProps) {
  if (!session) return null;

  // Body diberi key = session.id agar state detail/loading otomatis reset
  // ketika sesi yang dilihat berganti (tanpa setState di effect).
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SessionDetailBody key={session.id} session={session} t={t} lang={lang} />
    </Dialog>
  );
}

function SessionDetailBody({
  session,
  t,
  lang,
}: {
  session: HistoryItem;
  t: Dict;
  lang: "id" | "en";
}) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<SessionDetail | null>(null);

  // Hitungan turunan dari metadata sesi (start_time / end_time server)
  const derived = useMemo(() => {
    const start = session.start_time ? new Date(session.start_time).getTime() : NaN;
    const end = session.end_time ? new Date(session.end_time).getTime() : NaN;
    const duration =
      Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, (end - start) / 1000) : NaN;
    const rate = Number.isFinite(duration) && duration > 0 ? (session.total_count / duration) * 60 : NaN;
    return { duration, rate };
  }, [session]);

  // Ambil detail (termasuk snapshot timeline grafik) saat komponen terpasang
  useEffect(() => {
    let alive = true;
    const id = requestAnimationFrame(() => {
      if (alive) setLoading(true);
    });
    ayamApi
      .getSessionDetail(session.id)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch(() => null)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      cancelAnimationFrame(id);
    };
  }, [session]);

  const rows: Array<{ icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode }> = [
    {
      icon: Bird,
      label: t.totalAyam,
      value: (
        <span className="text-lg font-bold tabular-nums text-amber-500">
          {session.total_count?.toLocaleString() ?? 0}
        </span>
      ),
    },
    {
      icon: Timer,
      label: t.durasi,
      value: (
        <span className="font-semibold tabular-nums">
          {derived && Number.isFinite(derived.duration) ? fmtDuration(derived.duration, t) : "—"}
        </span>
      ),
    },
    {
      icon: Gauge,
      label: t.rataRata,
      value: (
        <span className="font-semibold tabular-nums">
          {derived && Number.isFinite(derived.rate) ? `${derived.rate.toFixed(1)} ${t.perMenit}` : "—"}
        </span>
      ),
    },
    {
      icon: CalendarDays,
      label: t.tanggal,
      value: <span className="font-medium">{session.tanggal || "—"}</span>,
    },
    {
      icon: Clock3,
      label: t.jam,
      value: <span className="font-medium">{session.jam || "—"}</span>,
    },
  ];

  return (
    <DialogContent className="ayam-scroll max-h-[88vh] overflow-y-auto border-border bg-background text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bird className="h-4 w-4 text-amber-400" />
            {t.detailSesi}
            <Badge variant="outline" className="border-border px-1.5 py-0 font-mono text-[10px] text-muted-foreground">
              #{session.id}
            </Badge>
          </DialogTitle>
          <DialogDescription>{t.detailSesiDesc}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="absolute right-5 top-5">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        <div className="space-y-4 py-1">
          {/* Asal ayam (highlight) */}
          <div className="rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-transparent p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t.asalAyam}
            </p>
            <p className="mt-1 truncate text-xl font-bold text-foreground">
              {session.asal_ayam || "—"}
            </p>
          </div>

          {/* Stat grid */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {rows.map((r) => {
              const Icon = r.icon;
              return (
                <div
                  key={r.label}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card/60 p-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {r.label}
                    </p>
                    <div className="truncate text-sm">{r.value}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Grafik kumulatif sesi (snapshot timeline dari DB) */}
          <div className="rounded-lg border border-border bg-card/60 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <ChartLine className="h-3 w-3" /> {t.grafikSesi}
              {loading ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : null}
            </p>
            {(() => {
              const pts = detail?.timeline ?? [];
              if (pts.length >= 2) {
                return (
                  <div className="mt-2 h-36 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={pts} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
                        <defs>
                          <linearGradient id="detailTrendFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="t"
                          tick={{ fill: "var(--chart-tick)", fontSize: 10 }}
                          tickLine={false}
                          axisLine={{ stroke: "var(--chart-grid)" }}
                          minTickGap={28}
                          tickFormatter={(v: number) => `${Math.round(v)}s`}
                        />
                        <YAxis
                          tick={{ fill: "var(--chart-tick)", fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          allowDecimals={false}
                        />
                        <ReTooltip
                          cursor={{ stroke: "#f59e0b", strokeOpacity: 0.3 }}
                          contentStyle={{
                            background: "var(--tooltip-bg)",
                            border: "1px solid var(--tooltip-border)",
                            borderRadius: 8,
                            fontSize: 12,
                            color: "var(--tooltip-text)",
                          }}
                          labelFormatter={(v) => `${v} ${t.detik}`}
                          formatter={(value: number | string) => [value, t.totalAyam]}
                        />
                        <Area
                          type="monotone"
                          dataKey="total"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          fill="url(#detailTrendFill)"
                          dot={false}
                          activeDot={{ r: 3.5, fill: "#f59e0b", stroke: "#09090b" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                );
              }
              return (
                <p className="mt-2 rounded-md border border-dashed border-border px-3 py-4 text-center text-[11px] italic text-muted-foreground">
                  {t.grafikSesiKosong}
                </p>
              );
            })()}
          </div>

          {/* Catatan */}
          <div className="rounded-lg border border-border bg-card/60 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <StickyNote className="h-3 w-3" /> {t.catatan}
            </p>
            <p className="mt-1 text-sm text-foreground">
              {session.keterangan ? session.keterangan : (
                <span className="italic text-muted-foreground">{t.tanpaCatatan}</span>
              )}
            </p>
          </div>

          {/* File terkait */}
          {session.file_name ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-900/50 bg-emerald-950/30 p-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
                  <FileSpreadsheet className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500/80">
                    {t.fileTerkait}
                  </p>
                  <p className="truncate text-xs font-medium text-foreground">
                    {session.file_name.split("/").pop()}
                  </p>
                </div>
              </div>
              <a
                href={ayamApi.downloadUrl(session.file_name.split("/").pop() ?? "")}
                download
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-emerald-900 bg-emerald-950 px-2.5 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-900"
              >
                <Download className="h-3.5 w-3.5" />
                {t.unduh}
              </a>
            </div>
          ) : null}
        </div>
    </DialogContent>
  );
}
