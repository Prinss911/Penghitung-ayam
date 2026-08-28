"use client";

/**
 * SessionDetailDialog — detail satu sesi riwayat:
 * metadata, durasi, laju rata-rata, catatan, dan tautan unduh file Excel.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Bird,
  CalendarDays,
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
import { ayamApi, type HistoryItem } from "@/lib/ayam/api";
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
  const [loading, setLoading] = useState(false);

  // Hitungan turunan dari metadata sesi (start_time / end_time server)
  const derived = useMemo(() => {
    if (!session) return null;
    const start = session.start_time ? new Date(session.start_time).getTime() : NaN;
    const end = session.end_time ? new Date(session.end_time).getTime() : NaN;
    const duration =
      Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, (end - start) / 1000) : NaN;
    const rate = Number.isFinite(duration) && duration > 0 ? (session.total_count / duration) * 60 : NaN;
    return { duration, rate };
  }, [session]);

  // Prefetch detail (opsional — memastikan field terbaru dari server)
  useEffect(() => {
    if (!open || !session) return;
    let alive = true;
    const id = requestAnimationFrame(() => {
      if (alive) setLoading(true);
    });
    ayamApi
      .getSessionDetail(session.id)
      .catch(() => null)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      cancelAnimationFrame(id);
    };
  }, [open, session]);

  if (!session) return null;

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bird className="h-4 w-4 text-amber-400" />
            {t.detailSesi}
            <Badge variant="outline" className="border-zinc-800 px-1.5 py-0 font-mono text-[10px] text-zinc-500">
              #{session.id}
            </Badge>
          </DialogTitle>
          <DialogDescription>{t.detailSesiDesc}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="absolute right-5 top-5">
            <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
          </div>
        ) : null}

        <div className="space-y-4 py-1">
          {/* Asal ayam (highlight) */}
          <div className="rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-transparent p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {t.asalAyam}
            </p>
            <p className="mt-1 truncate text-xl font-bold text-zinc-50">
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
                  className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-zinc-400">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      {r.label}
                    </p>
                    <div className="truncate text-sm">{r.value}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Catatan */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              <StickyNote className="h-3 w-3" /> {t.catatan}
            </p>
            <p className="mt-1 text-sm text-zinc-300">
              {session.keterangan ? session.keterangan : (
                <span className="italic text-zinc-600">{t.tanpaCatatan}</span>
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
                  <p className="truncate text-xs font-medium text-zinc-200">
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
    </Dialog>
  );
}
