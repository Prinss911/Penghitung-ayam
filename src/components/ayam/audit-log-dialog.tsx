"use client";

/**
 * AuditLogDialog — Log Aktivitas operator (ronde 7, ditingkatkan ronde 8).
 * Menampilkan jejak semua aksi terproteksi yang tercatat backend
 * (start/stop sesi, hapus riwayat, ubah pengaturan, PIN, preset, dst)
 * dalam tampilan timeline vertikal dengan ikon per jenis aksi.
 *
 * Baru ronde 8:
 * - Filter per jenis aksi (dropdown, dari daftar aksi unik backend)
 * - Paginasi "Muat lebih banyak" (50 entri per halaman)
 * - Unduh CSV (PIN required di backend, mengikuti filter aktif)
 */

import { useCallback, useEffect, useState } from "react";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  EyeOff,
  FileDown,
  FileSpreadsheet,
  KeyRound,
  Loader2,
  Play,
  RotateCcw,
  Save,
  ScrollText,
  Settings,
  Square,
  Trash2,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ayamApi,
  PinRequiredError,
  type AuditActionCount,
  type AuditEntry,
} from "@/lib/ayam/api";
import type { Dict } from "@/lib/ayam/i18n";

/** Ukuran halaman "Muat lebih banyak" */
const PAGE_SIZE = 50;

/** Ikon + warna per jenis aksi audit */
const ACTION_META: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; cls: string }
> = {
  session_start: { icon: Play, cls: "bg-emerald-500/15 text-emerald-400" },
  session_stop: { icon: Square, cls: "bg-red-500/15 text-red-400" },
  reset: { icon: RotateCcw, cls: "bg-sky-500/15 text-sky-400" },
  count_adjust: { icon: Eye, cls: "bg-amber-500/15 text-amber-400" },
  history_delete: { icon: Trash2, cls: "bg-red-500/15 text-red-400" },
  settings: { icon: Settings, cls: "bg-violet-500/15 text-violet-400" },
  camera_source: { icon: Camera, cls: "bg-amber-500/15 text-amber-400" },
  camera_upload: { icon: Save, cls: "bg-violet-500/15 text-violet-400" },
  camera_video_delete: { icon: CameraOff, cls: "bg-red-500/15 text-red-400" },
  pin_update: { icon: KeyRound, cls: "bg-emerald-500/15 text-emerald-400" },
  pin_verify_ok: { icon: CheckCircle2, cls: "bg-emerald-500/15 text-emerald-400" },
  pin_verify_fail: { icon: XCircle, cls: "bg-amber-500/15 text-amber-400" },
  pin_locked_out: { icon: TriangleAlert, cls: "bg-red-500/15 text-red-400" },
  audit_clear: { icon: Trash2, cls: "bg-zinc-500/15 text-muted-foreground" },
  audit_export: { icon: FileDown, cls: "bg-teal-500/15 text-teal-400" },
  target: { icon: TriangleAlert, cls: "bg-orange-500/15 text-orange-400" },
  preset_save: { icon: Save, cls: "bg-sky-500/15 text-sky-400" },
  preset_delete: { icon: Trash2, cls: "bg-amber-500/15 text-amber-400" },
};

function actionMeta(action: string) {
  return ACTION_META[action] ?? { icon: ScrollText, cls: "bg-zinc-500/15 text-muted-foreground" };
}

function actionLabel(action: string, t: Dict): string {
  const key = `aksi${action
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("")}` as keyof Dict;
  return (t[key] as string) ?? t.aksiUnknown;
}

/** Waktu relatif ringkas: "Baru saja" / "5 mnt lalu" / "3 jam lalu" / "Kemarin" / tanggal */
function relTime(ts: string, t: Dict): string {
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return ts;
  const diff = Date.now() - then;
  if (diff < 45_000) return t.logBaruSaja;
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} ${t.logMenitLalu}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${t.logJamLalu}`;
  if (hours < 48) return t.logKemarin;
  return new Date(ts).toLocaleDateString();
}

export function AuditLogDialog({ t, lang }: { t: Dict; lang: "id" | "en" }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [actions, setActions] = useState<AuditActionCount[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);

  /** Muat halaman pertama sesuai filter aktif */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ayamApi.getAuditLog(PAGE_SIZE, 0, filter || undefined);
      setEntries(Array.isArray(res.entries) ? res.entries : []);
      setTotal(typeof res.total === "number" ? res.total : res.entries?.length ?? 0);
      setActions(Array.isArray(res.actions) ? res.actions : []);
    } catch {
      toast.error(
        lang === "id" ? "Gagal memuat log aktivitas" : "Failed to load activity log"
      );
    } finally {
      setLoading(false);
    }
  }, [filter, lang]);

  /** Muat halaman berikutnya (append) */
  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await ayamApi.getAuditLog(
        PAGE_SIZE,
        entries.length,
        filter || undefined
      );
      const more = Array.isArray(res.entries) ? res.entries : [];
      setEntries((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...more.filter((e) => !seen.has(e.id))];
      });
      if (typeof res.total === "number") setTotal(res.total);
    } catch {
      toast.error(
        lang === "id" ? "Gagal memuat log aktivitas" : "Failed to load activity log"
      );
    } finally {
      setLoadingMore(false);
    }
  }, [entries.length, filter, lang]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handleClear = useCallback(async () => {
    setClearBusy(true);
    try {
      const res = await ayamApi.clearAuditLog();
      toast.success(t.logDibersihkan, {
        description: `${res.deleted} ${lang === "id" ? "entri dihapus" : "entries removed"}`,
      });
      setConfirmClear(false);
      setFilter("");
      await load();
    } catch (e) {
      if (e instanceof PinRequiredError) {
        toast.info(t.pinDibutuhkan);
        return;
      }
      toast.error(t.gagalBersihkanLog);
    } finally {
      setClearBusy(false);
    }
  }, [t, lang, load]);

  const handleCsv = useCallback(async () => {
    setCsvBusy(true);
    try {
      await ayamApi.downloadAuditCsv(filter || undefined);
      toast.success(t.logCsvBerhasil, {
        description: filter
          ? `${t.logFilterLabel}: ${actionLabel(filter, t)}`
          : undefined,
      });
    } catch (e) {
      if (e instanceof PinRequiredError) {
        toast.info(t.pinDibutuhkan);
        return;
      }
      toast.error(t.logCsvGagal);
    } finally {
      setCsvBusy(false);
    }
  }, [filter, t]);

  const hasMore = entries.length < total;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={t.logAktivitas}
          title={t.logAktivitas}
          className="h-9 w-9 border-border bg-card text-muted-foreground transition-colors hover:border-sky-500/50 hover:bg-muted hover:text-sky-400"
        >
          <ScrollText className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border bg-background text-foreground sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
              <ScrollText className="h-4 w-4" />
            </span>
            {t.logAktivitas}
            {!loading ? (
              <Badge
                variant="outline"
                className="ml-1 border-border px-1.5 py-0 text-[10px] font-semibold text-muted-foreground"
                title={`${total} ${t.logEntri}`}
              >
                {total}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>{t.logAktivitasDesc}</DialogDescription>
        </DialogHeader>

        {/* Toolbar: filter aksi + unduh CSV + bersihkan (ronde 8: flex-wrap agar tak overflow di 390px) */}
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={filter || "all"}
            onValueChange={(v) => setFilter(v === "all" ? "" : v)}
          >
            <SelectTrigger
              aria-label={t.logFilterLabel}
              className="h-8 min-w-0 flex-1 gap-1 border-border bg-card text-xs text-foreground hover:bg-muted focus:ring-sky-500/40 sm:w-[190px] sm:flex-none"
            >
              <SelectValue placeholder={t.logFilterSemua} />
            </SelectTrigger>
            <SelectContent className="border-border bg-background text-foreground">
              <SelectItem value="all" className="text-xs focus:bg-card">
                {t.logFilterSemua}
              </SelectItem>
              {actions.map((a) => {
                const meta = actionMeta(a.action);
                const Icon = meta.icon;
                return (
                  <SelectItem
                    key={a.action}
                    value={a.action}
                    className="text-xs focus:bg-card"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded-full ${meta.cls}`}
                      >
                        <Icon className="h-2.5 w-2.5" />
                      </span>
                      {actionLabel(a.action, t)}
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {a.n}
                      </span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={csvBusy || (total === 0 && !loading)}
              onClick={() => void handleCsv()}
              title={t.logUnduhCsv}
              aria-label={t.logUnduhCsv}
              className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:bg-teal-950/60 hover:text-teal-400 disabled:opacity-40"
            >
              {csvBusy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <FileDown className="h-3 w-3" />
              )}
              {t.logUnduhCsv}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={loading || entries.length === 0}
              onClick={() => setConfirmClear(true)}
              className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:bg-red-950/50 hover:text-red-400 disabled:opacity-40"
            >
              <Trash2 className="h-3 w-3" />
              {t.logBersihkan}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
            <ScrollText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">{t.logKosong}</p>
            <p className="max-w-64 text-xs text-muted-foreground">
              {filter ? `${t.logFilterLabel}: ${actionLabel(filter, t)}` : t.logKosongDesc}
            </p>
          </div>
        ) : (
          <>
            <div className="ayam-scroll -mr-1 max-h-[55vh] overflow-y-auto pr-1">
              <ol className="relative space-y-0 border-l border-border pl-0">
                {entries.map((e, idx) => {
                  const meta = actionMeta(e.action);
                  const Icon = meta.icon;
                  return (
                    <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                      {/* timeline line connector */}
                      {idx < entries.length - 1 ? (
                        <span
                          aria-hidden
                          className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-muted/80"
                        />
                      ) : null}
                      <span
                        className={`relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-background ${meta.cls}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1 rounded-lg border border-border/70 bg-card/40 px-3 py-2 transition-colors hover:border-border">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-semibold text-foreground">
                            {actionLabel(e.action, t)}
                          </p>
                          <span
                            className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-muted-foreground"
                            title={new Date(e.ts).toLocaleString()}
                          >
                            <Clock className="h-2.5 w-2.5" />
                            {relTime(e.ts, t)}
                          </span>
                        </div>
                        {e.detail ? (
                          <p
                            className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground"
                            title={e.detail}
                          >
                            {e.detail}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>

              {/* Muat lebih banyak */}
              {hasMore ? (
                <div className="flex justify-center pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                    className="h-8 gap-1.5 border-border bg-card px-4 text-xs text-foreground hover:border-sky-500/50 hover:bg-muted hover:text-sky-400"
                  >
                    {loadingMore ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    {loadingMore ? t.logMemuat : t.logMuatLagi}
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {entries.length}/{total}
                    </span>
                  </Button>
                </div>
              ) : (
                <p className="pt-1 text-center font-mono text-[10px] text-muted-foreground">
                  {entries.length}/{total} {t.logEntri}
                </p>
              )}
            </div>
          </>
        )}

        {/* Konfirmasi bersihkan log */}
        <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
          <AlertDialogContent className="border-border bg-background text-foreground">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-red-500" />
                {t.logBersihkanKonfirmasi}
              </AlertDialogTitle>
              <AlertDialogDescription>{t.logBersihkanDesc}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={clearBusy}
                className="border-border bg-transparent text-foreground hover:bg-card hover:text-foreground"
              >
                {t.batalkan}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={clearBusy}
                onClick={(e) => {
                  e.preventDefault();
                  void handleClear();
                }}
                className="bg-red-600 font-semibold text-white hover:bg-red-700"
              >
                {clearBusy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.menghapus}
                  </>
                ) : (
                  t.yaHapus
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
