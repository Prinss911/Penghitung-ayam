"use client";

/**
 * Ayam Counter Pro — Dashboard utama (v2.1)
 * Frontend Next.js untuk backend Flask + YOLOv8 (port 5000 via gateway)
 * Bilingual: Bahasa Indonesia / English
 * Fitur: live feed canvas, kontrol sesi, pengaturan runtime, grafik tren,
 *        ringkasan 7 hari, milestone toast + beep, filter riwayat, CSV.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BellOff,
  BellRing,
  Bird,
  Camera,
  ChevronRight,
  Cpu,
  Crosshair,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  Gauge,
  History,
  Info,
  Loader2,
  Minus,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  ScanEye,
  Search,
  Signal,
  SignalHigh,
  SignalZero,
  Square,
  Target,
  Timer,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useAyamDashboard } from "@/components/ayam/use-ayam-dashboard";
import { VideoFeed } from "@/components/ayam/video-feed";
import { SettingsDialog } from "@/components/ayam/settings-dialog";
import { CameraSourceDialog } from "@/components/ayam/camera-source-dialog";
import { SessionTrendChart } from "@/components/ayam/session-trend-chart";
import { SessionDetailDialog } from "@/components/ayam/session-detail-dialog";
import { ThemeToggle } from "@/components/ayam/theme-toggle";
import { AnimatedNumber } from "@/components/ayam/animated-number";
import { PinGateDialog, PinManagerDialog } from "@/components/ayam/pin-dialog";
import { RangeReportDialog } from "@/components/ayam/range-report-dialog";
import { AuditLogDialog } from "@/components/ayam/audit-log-dialog";
import {
  ayamApi,
  PinRequiredError,
  type HistoryItem,
  type LastSession,
} from "@/lib/ayam/api";
import { dict, type Lang } from "@/lib/ayam/i18n";

// =====================================================
// SMALL BUILDING BLOCKS
// =====================================================

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

function LiveDot({ active }: { active: boolean }) {
  return (
    <span
      className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
        active ? "ayam-live-dot text-emerald-400 bg-emerald-400" : "bg-zinc-500"
      }`}
    />
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  glow,
  accentLine,
  delay = 0,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent: string;
  glow: string;
  /** Gradasi garis aksen tipis di tepi atas kartu (per warna) */
  accentLine: string;
  /** Delay animasi masuk (stagger antar kartu, ronde 8) */
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay, ease: "easeOut" }}
      className="min-w-0"
    >
      <Card
        className={`group relative overflow-hidden border-zinc-800 bg-zinc-900/60 transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-700 ${glow}`}
      >
        {/* garis aksen warna per kartu (ronde 7) */}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] opacity-70 transition-opacity duration-300 group-hover:opacity-100 ${accentLine}`}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-zinc-600 to-transparent" />
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 sm:text-[11px]">
                {label}
              </p>
              {/* ronde 8: ukuran responsif — tidak lagi terpotong di layar 390px */}
              <p className="mt-1.5 truncate text-xl font-bold tabular-nums text-zinc-50 sm:text-2xl md:text-3xl">
                {value}
              </p>
              {sub ? <div className="mt-1 text-xs text-zinc-500">{sub}</div> : null}
            </div>
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110 sm:h-10 sm:w-10 ${accent}`}
            >
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Format durasi "Xj Ym Zs" / "Ym Zs" / "Zs" dari detik
function fmtDur(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return "—";
  const s = Math.round(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${ss.toString().padStart(2, "0")}s`;
  return `${ss}s`;
}

function ConnBadge({ mode, t }: { mode: string; t: (typeof dict)[Lang] }) {
  const map: Record<
    string,
    { cls: string; icon: React.ComponentType<{ className?: string }>; text: string }
  > = {
    connecting: {
      cls: "bg-zinc-800 text-zinc-400 border-zinc-700",
      icon: Signal,
      text: `${t.koneksiMode}: …`,
    },
    socket: {
      cls: "bg-emerald-950 text-emerald-400 border-emerald-900",
      icon: SignalHigh,
      text: `${t.koneksiSoket} ${t.terhubung}`,
    },
    polling: {
      cls: "bg-amber-950 text-amber-400 border-amber-900",
      icon: Signal,
      text: t.koneksiPolling,
    },
    offline: {
      cls: "bg-red-950 text-red-400 border-red-900",
      icon: SignalZero,
      text: "Offline",
    },
  };
  const M = map[mode] ?? map.connecting;
  const Icon = M.icon;
  return (
    <Badge variant="outline" className={`${M.cls} gap-1.5 px-2 py-1 font-medium sm:px-2.5`}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="hidden min-w-0 truncate sm:inline">{M.text}</span>
    </Badge>
  );
}

// =====================================================
// MAIN PAGE
// =====================================================

export default function AyamCounterPage() {
  const [lang, setLangState] = useState<Lang>("id");

  // Muat bahasa tersimpan (client only, hindari hydration mismatch)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("ayam-lang");
      if (saved === "id" || saved === "en") setLangState(saved);
    } catch {
      /* abaikan */
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem("ayam-lang", l);
    } catch {
      /* abaikan */
    }
  }, []);

  const t = dict[lang];

  const {
    stats,
    device,
    history,
    exports,
    timeline,
    connMode,
    refreshSideData,
    refreshDevice,
    refreshStats,
  } = useAyamDashboard();

  // ----- form state -----
  const [asalAyam, setAsalAyam] = useState("");
  const [tanggal, setTanggal] = useState("");
  const [jam, setJam] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [busy, setBusy] = useState<"start" | "stop" | "reset" | null>(null);
  const [adjustBusy, setAdjustBusy] = useState<1 | -1 | null>(null);

  // ----- history filter -----
  const [historySearch, setHistorySearch] = useState("");
  const [historyDate, setHistoryDate] = useState("");

  // ----- detail & delete dialog -----
  const [detailSession, setDetailSession] = useState<HistoryItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HistoryItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // ----- target harian (ronde 8) -----
  const [targetOpen, setTargetOpen] = useState(false);
  const [targetInput, setTargetInput] = useState("");
  const [targetBusy, setTargetBusy] = useState(false);
  const targetCelebratedRef = useRef("");

  // ----- PIN gate (aksi terproteksi) -----
  const [pinGateOpen, setPinGateOpen] = useState(false);
  // Aksi yang ditunda karena 401 pin_required → diulang setelah PIN benar
  const pendingActionRef = useRef<(() => void) | null>(null);

  /** Bungkus aksi mutasi: bila backend minta PIN, tunda & buka gate */
  const guardedAction = useCallback(
    (fn: () => Promise<void>) =>
      async () => {
        try {
          await fn();
        } catch (e) {
          if (e instanceof PinRequiredError) {
            pendingActionRef.current = () => void fn();
            setPinGateOpen(true);
            toast.info(t.pinDibutuhkan);
            return;
          }
          throw e;
        }
      },
    [t]
  );

  // Event global dari api.ts (aksi di dialog lain juga membuka gate ini)
  useEffect(() => {
    const onPinRequired = () => {
      setPinGateOpen(true);
      toast.info(t.pinDibutuhkan);
    };
    try {
      window.addEventListener("ayam:pin-required", onPinRequired);
      return () =>
        window.removeEventListener("ayam:pin-required", onPinRequired);
    } catch {
      /* abaikan */
    }
  }, [t]);

  // ----- milestone & self-healing toast -----
  const lastMilestoneRef = useRef(0);
  // Tandai observasi count pertama agar toast milestone tidak meledak saat
  // halaman dimuat di tengah sesi dengan count yang sudah tinggi.
  const firstCountObserved = useRef(false);
  const prevConnMode = useRef<string>("connecting");
  const [recoveryTick, setRecoveryTick] = useState(0);

  // ----- notifikasi browser (milestone saat tab di background) -----
  const [notifEnabled, setNotifEnabled] = useState(false);
  useEffect(() => {
    try {
      setNotifEnabled(
        "Notification" in window &&
          localStorage.getItem("ayam-notif") === "1" &&
          Notification.permission === "granted"
      );
    } catch {
      /* abaikan */
    }
  }, []);

  const toggleNotif = useCallback(async () => {
    if (!("Notification" in window)) {
      toast.error(t.notifTidakDidukung);
      return;
    }
    if (notifEnabled) {
      setNotifEnabled(false);
      try {
        localStorage.setItem("ayam-notif", "0");
      } catch {}
      return;
    }
    let perm = Notification.permission;
    if (perm === "default") {
      try {
        perm = await Notification.requestPermission();
      } catch {
        perm = "denied";
      }
    }
    if (perm === "granted") {
      setNotifEnabled(true);
      try {
        localStorage.setItem("ayam-notif", "1");
      } catch {}
      toast.success(t.notifAktif);
    } else {
      toast.error(t.notifIzinDitolak);
    }
  }, [notifEnabled, t]);

  // default tanggal & jam (client only, hindari hydration mismatch)
  useEffect(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setTanggal(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
    setJam(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  }, []);

  const sessionActive = stats.session_active || stats.is_processing === true;
  const canStart = asalAyam.trim().length > 0;

  // Ringkasan sesi terakhir (ronde 7): tampil saat idle setelah stop —
  // backend kini auto-reset count ke 0 begitu sesi disimpan.
  const lastSession: LastSession | null = stats.last_session ?? null;

  // ----- durasi sesi berjalan (dari timeline backend, detik) -----
  const elapsedSec = useMemo(() => {
    if (!sessionActive || timeline.length === 0) return 0;
    return timeline[timeline.length - 1]?.t ?? 0;
  }, [sessionActive, timeline]);
  const elapsedLabel = useMemo(() => {
    const s = Math.max(0, Math.floor(elapsedSec));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const p = (n: number) => String(n).padStart(2, "0");
    return hh > 0 ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
  }, [elapsedSec]);

  // ----- toast saat backend down / pulih (self-healing) -----
  useEffect(() => {
    const prev = prevConnMode.current;
    if (prev !== connMode) {
      if (connMode === "offline") {
        toast.info(t.backendMulaiUlang, { duration: 8000 });
      } else if (prev === "offline" && (connMode === "socket" || connMode === "polling")) {
        toast.success(t.backendPulih);
        // Picu sambung-ulang otomatis video feed
        setRecoveryTick((k) => k + 1);
      }
      prevConnMode.current = connMode;
    }
  }, [connMode, t]);

  // ----- beep (WebAudio, tanpa asset) -----
  const makeBeep = useCallback(
    (freqs: number[], durPer = 0.12, gap = 0.02) => {
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new Ctx();
        let t0 = ctx.currentTime;
        let lastOsc: OscillatorNode | null = null;
        for (const f of freqs) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = "sine";
          osc.frequency.value = f;
          gain.gain.setValueAtTime(0.001, t0);
          gain.gain.exponentialRampToValueAtTime(0.09, t0 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, t0 + durPer);
          osc.start(t0);
          osc.stop(t0 + durPer + 0.02);
          lastOsc = osc;
          t0 += durPer + gap;
        }
        if (lastOsc) {
          lastOsc.onended = () => void ctx.close();
        } else {
          void ctx.close();
        }
      } catch {
        /* audio diblokir browser — abaikan */
      }
    },
    []
  );

  const playBeep = useCallback(() => makeBeep([880], 0.45), [makeBeep]);
  // Bunyi koreksi manual: dua nada rendah (beda dari milestone)
  const playCorrectionBeep = useCallback(
    () => makeBeep([520, 390], 0.1, 0.05),
    [makeBeep]
  );

  // ----- milestone setiap kelipatan 10 -----
  useEffect(() => {
    const c = stats.count;
    const STEP = 10;
    if (!firstCountObserved.current) {
      // Observasi pertama (termasuk setelah reload): jangan bersuara
      firstCountObserved.current = true;
      lastMilestoneRef.current = c;
      return;
    }
    if (c < lastMilestoneRef.current) {
      // reset / sesi baru
      lastMilestoneRef.current = c;
      return;
    }
    const prevLevel = Math.floor(lastMilestoneRef.current / STEP);
    const level = Math.floor(c / STEP);
    if (c > 0 && level > prevLevel) {
      const milestoneVal = level * STEP;
      toast.success(`${milestoneVal} ${t.milestoneDesc}`, {
        description: `🎯 ${t.milestone}`,
      });
      playBeep();
      // Notifikasi browser saat tab di background
      if (
        notifEnabled &&
        typeof document !== "undefined" &&
        document.hidden &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        try {
          const n = new Notification(
            `${t.notifMilestoneTitle} — ${milestoneVal}`,
            {
              body: `${milestoneVal} ${t.notifMilestoneBody}`,
              tag: "ayam-milestone",
            }
          );
          setTimeout(() => n.close(), 6000);
        } catch {
          /* abaikan */
        }
      }
    }
    lastMilestoneRef.current = Math.max(lastMilestoneRef.current, c);
  }, [stats.count, t, playBeep, notifEnabled]);

  // ----- actions -----
  const handleStart = useCallback(async () => {
    if (!canStart) {
      toast.error(t.gagalStart, { description: t.asalAyamRequired });
      return;
    }
    setBusy("start");
    try {
      await ayamApi.startSession({
        asal_ayam: asalAyam.trim(),
        tanggal: tanggal,
        jam: jam,
        keterangan: keterangan.trim(),
      });
      lastMilestoneRef.current = 0;
      toast.success(t.sesiDimulai, {
        description: `${t.asalAyam}: ${asalAyam.trim() || "Unknown"}`,
      });
    } catch (e) {
      if (e instanceof PinRequiredError) throw e; // ditangani guardedAction
      toast.error(t.gagalStart, {
        description:
          lang === "id"
            ? "Cek apakah backend Flask berjalan."
            : "Check if the Flask backend is running.",
      });
    } finally {
      setBusy(null);
    }
  }, [asalAyam, tanggal, jam, keterangan, t, lang, canStart]);

  const handleStop = useCallback(async () => {
    setBusy("stop");
    try {
      const res = await ayamApi.stopSession();
      toast.success(t.sesiDihentikan, {
        description: res.file
          ? `${res.file.split("/").pop()} — ${stats.count} ${
              lang === "id" ? "ayam" : "chickens"
            }`
          : lang === "id"
            ? "Tidak ada data deteksi untuk disimpan"
            : "No detection data to save",
      });
      refreshSideData();
    } catch (e) {
      if (e instanceof PinRequiredError) throw e; // ditangani guardedAction
      toast.error(t.gagalStop);
    } finally {
      setBusy(null);
    }
  }, [t, lang, stats.count, refreshSideData]);

  const handleReset = useCallback(async () => {
    setBusy("reset");
    try {
      await ayamApi.resetCounter();
      lastMilestoneRef.current = 0;
      toast.info(t.counterDireset);
    } catch (e) {
      if (e instanceof PinRequiredError) throw e; // ditangani guardedAction
      toast.error(t.gagalReset);
    } finally {
      setBusy(null);
    }
  }, [t]);

  // ----- koreksi manual hitung (+1 / -1) saat sesi aktif -----
  const handleAdjust = useCallback(
    async (delta: 1 | -1) => {
      setAdjustBusy(delta);
      try {
        const res = await ayamApi.adjustCount(delta);
        toast.success(`${res.count} ${t.totalAyam.toLowerCase()}`, {
          description: `${t.koreksiBerhasil} (${delta > 0 ? "+1" : "−1"})`,
        });
        playCorrectionBeep(); // bunyi khusus beda dari milestone
        await refreshStats();
      } catch (e) {
        if (e instanceof PinRequiredError) throw e; // ditangani guardedAction
        toast.error(t.koreksiGagal, {
          description:
            e instanceof Error && e.message.includes("400")
              ? lang === "id"
                ? "Hanya bisa saat sesi berjalan"
                : "Only available while a session is running"
              : undefined,
        });
      } finally {
        setAdjustBusy(null);
      }
    },
    [t, lang, refreshStats, playCorrectionBeep]
  );

  // ----- hapus sesi riwayat -----
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const res = await ayamApi.deleteSession(deleteTarget.id);
      toast.success(t.sesiDihapus, {
        description: res.file_removed
          ? `${deleteTarget.file_name?.split("/").pop()} — ✓`
          : `#${deleteTarget.id}`,
      });
      setDeleteTarget(null);
      refreshSideData();
    } catch (e) {
      if (e instanceof PinRequiredError) throw e; // ditangani guardedAction
      toast.error(t.gagalHapus);
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, t, refreshSideData]);

  const openDetail = useCallback((h: HistoryItem) => {
    setDetailSession(h);
    setDetailOpen(true);
  }, []);

  // ----- target harian: buka dialog + simpan (ronde 8) -----
  const openTargetDialog = useCallback(() => {
    setTargetInput(stats.target ? String(stats.target) : "");
    setTargetOpen(true);
  }, [stats.target]);

  const handleSaveTarget = useCallback(async () => {
    const raw = targetInput.trim().replace(/[^0-9]/g, "");
    const n = raw === "" ? 0 : Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) {
      toast.error(t.targetGagal);
      return;
    }
    setTargetBusy(true);
    try {
      const res = await ayamApi.setTarget(n);
      toast.success(t.targetTersimpan, {
        description:
          res.target > 0
            ? `${t.targetHarian}: ${res.target.toLocaleString()} ${lang === "id" ? "ayam/hari" : "chickens/day"}`
            : t.targetTanpa,
      });
      setTargetOpen(false);
      refreshStats();
    } catch (e) {
      if (e instanceof PinRequiredError) return; // gate global sudah terbuka via event
      toast.error(t.targetGagal);
    } finally {
      setTargetBusy(false);
    }
  }, [targetInput, t, lang, refreshStats]);

  // ----- derived -----
  const daily = history.stats;

  // ----- target harian: progres hari ini (ronde 8) -----
  const target = stats.target ?? 0;
  const todayCount = daily.total_count ?? 0;
  const targetPct =
    target > 0 ? Math.min(100, Math.round((todayCount / target) * 100)) : 0;

  // Toast sekali per (hari, target) bila target tercapai
  useEffect(() => {
    if (target <= 0 || todayCount < target) return;
    const key = `${new Date().toDateString()}-${target}`;
    if (targetCelebratedRef.current === key) return;
    targetCelebratedRef.current = key;
    toast.success(t.targetTercapai, {
      description: `${todayCount.toLocaleString()} / ${target.toLocaleString()} — ${targetPct}%`,
    });
    playBeep();
  }, [todayCount, target, targetPct, t, playBeep]);

  const weeklyData = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of history.history) {
      if (!h.tanggal) continue;
      map.set(h.tanggal, (map.get(h.tanggal) ?? 0) + (h.total_count ?? 0));
    }
    // Zero-fill: selalu tampilkan 7 hari terakhir (hari tanpa data = 0)
    const pad = (n: number) => String(n).padStart(2, "0");
    const now = new Date();
    const days: { day: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      days.push({ day: key.slice(5), total: map.get(key) ?? 0 });
    }
    return days;
  }, [history]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return history.history.filter((h) => {
      const okSearch = !q || (h.asal_ayam ?? "").toLowerCase().includes(q);
      const okDate = !historyDate || h.tanggal === historyDate;
      return okSearch && okDate;
    });
  }, [history.history, historySearch, historyDate]);

  // daftar asal ayam unik untuk quick-pick (datalist)
  const originOptions = useMemo(() => {
    const set = new Set<string>();
    for (const h of history.history) {
      const o = (h.asal_ayam ?? "").trim();
      if (o) set.add(o);
    }
    return Array.from(set).slice(0, 12);
  }, [history.history]);

  const sortedExports = useMemo(
    () => [...exports].sort((a, b) => b.modified - a.modified),
    [exports]
  );

  const backendBadge =
    device?.backend === "cuda"
      ? "bg-emerald-950 text-emerald-400 border-emerald-900"
      : device?.backend === "cpu"
        ? "bg-amber-950 text-amber-400 border-amber-900"
        : "bg-zinc-800 text-zinc-300 border-zinc-700";

  return (
    <div className="relative flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* ==== Background depth: glow atas + grid halus (ronde 8: class agar light mode juga terlihat) ==== */}
      <div aria-hidden className="ayam-bg-layer pointer-events-none fixed inset-0 z-0" />

      {/* ================= HEADER ================= */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/60">
        {/* garis aksen gradasi di bawah header */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent"
        />
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-zinc-950 shadow-lg shadow-amber-500/20">
              <Bird className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold leading-tight sm:text-lg">
                {t.appName}
              </h1>
              <p className="hidden truncate text-xs text-zinc-500 sm:block">
                {t.appTagline}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <ConnBadge mode={connMode} t={t} />
            <SettingsDialog t={t} onSaved={refreshDevice} />
            <PinManagerDialog t={t} />
            <AuditLogDialog t={t} lang={lang} />
            <Button
              variant="outline"
              size="icon"
              onClick={() => void toggleNotif()}
              aria-label={notifEnabled ? t.notifNonaktifkan : t.notifAktifkan}
              aria-pressed={notifEnabled}
              title={notifEnabled ? t.notifNonaktifkan : t.notifAktifkan}
              className={`h-9 w-9 border-zinc-800 bg-zinc-900 transition-colors ${
                notifEnabled
                  ? "border-emerald-900 text-emerald-400 hover:bg-zinc-800 hover:text-emerald-300"
                  : "text-zinc-400 hover:border-emerald-500/50 hover:bg-zinc-800 hover:text-emerald-400"
              }`}
            >
              {notifEnabled ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            </Button>
            <ThemeToggle t={t} />
            {/* Language toggle */}
            <div className="flex overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 text-xs font-semibold">
              <button
                onClick={() => setLang("id")}
                className={`px-3 py-1.5 transition-colors ${
                  lang === "id"
                    ? "bg-amber-500 text-zinc-950"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
                aria-pressed={lang === "id"}
              >
                ID
              </button>
              <button
                onClick={() => setLang("en")}
                className={`px-3 py-1.5 transition-colors ${
                  lang === "en"
                    ? "bg-amber-500 text-zinc-950"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
                aria-pressed={lang === "en"}
              >
                EN
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ================= MAIN ================= */}
      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-6">
        {/* ---- Stat cards ---- */}
        <motion.section
          aria-label="statistics"
          initial={fadeUp.initial}
          animate={fadeUp.animate}
          transition={{ duration: 0.35 }}
          className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"
        >
          <StatCard
            icon={Bird}
            delay={0}
            label={t.totalAyam}
            value={
              <AnimatedNumber
                value={stats.count}
                className={sessionActive ? "text-emerald-400" : undefined}
              />
            }
            sub={
              sessionActive ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-400">
                  <LiveDot active /> {t.aktifBerjalan}
                </span>
              ) : lastSession ? (
                <span
                  className="inline-flex max-w-full items-center gap-1.5 truncate text-amber-400/90"
                  title={`${lastSession.asal_ayam} · ${lastSession.total} ${t.totalAyam.toLowerCase()} · ${fmtDur(lastSession.durasi_detik)}`}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                  <span className="truncate">
                    {t.sesiTerakhir}: {lastSession.asal_ayam} · {lastSession.total} {" "}
                    {(lang === "id" ? "ayam" : "chickens")} · {fmtDur(lastSession.durasi_detik)}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-zinc-500">
                  <LiveDot active={false} /> {t.menungguSesi}
                </span>
              )
            }
            accent="bg-amber-500/15 text-amber-400"
            glow="hover:shadow-[0_8px_32px_-12px_rgba(245,158,11,0.35)]"
            accentLine="bg-gradient-to-r from-transparent via-amber-500/80 to-transparent"
          />
          <StatCard
            icon={ScanEye}
            delay={0.06}
            label={t.objekDiFrame}
            value={stats.tracks.toLocaleString(lang === "id" ? "id-ID" : "en-US")}
            sub={
              <span>
                {t.bingkai}: {stats.frame ?? "-"} · {stats.method}
              </span>
            }
            accent="bg-emerald-500/15 text-emerald-400"
            glow="hover:shadow-[0_8px_32px_-12px_rgba(16,185,129,0.35)]"
            accentLine="bg-gradient-to-r from-transparent via-emerald-500/80 to-transparent"
          />
          <StatCard
            icon={Gauge}
            delay={0.12}
            label={t.statusSession}
            value={
              sessionActive ? (
                <span className="text-emerald-400">{t.aktif}</span>
              ) : (
                <span className="text-zinc-400">{t.nonaktif}</span>
              )
            }
            sub={
              sessionActive && stats.session_data?.asal_ayam
                ? `${t.asalAyam}: ${stats.session_data.asal_ayam}`
                : `—`
            }
            accent="bg-sky-500/15 text-sky-400"
            glow="hover:shadow-[0_8px_32px_-12px_rgba(14,165,233,0.35)]"
            accentLine="bg-gradient-to-r from-transparent via-sky-500/80 to-transparent"
          />
          <StatCard
            icon={Cpu}
            delay={0.18}
            label={t.backend}
            value={device ? device.backend.toUpperCase() : "…"}
            sub={
              device ? (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className={`${backendBadge} px-1.5 py-0 text-[10px] uppercase`}
                  >
                    {device.verified ? "✓ verified" : "unverified"}
                  </Badge>
                  {device.model_loaded ? (
                    t.modelTermuat
                  ) : (
                    <span className="text-red-400">{t.modelBelum}</span>
                  )}
                </span>
              ) : (
                <Skeleton className="h-3 w-24 bg-zinc-800" />
              )
            }
            accent="bg-violet-500/15 text-violet-400"
            glow="hover:shadow-[0_8px_32px_-12px_rgba(139,92,246,0.35)]"
            accentLine="bg-gradient-to-r from-transparent via-violet-500/80 to-transparent"
          />
        </motion.section>

        {/* ---- Video + session panel ---- */}
        <motion.section
          className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3"
          initial={fadeUp.initial}
          animate={fadeUp.animate}
          transition={{ duration: 0.35, delay: 0.06 }}
        >
          {/* ---------- Video feed ---------- */}
          <Card className="overflow-hidden border-zinc-800 bg-zinc-900/60 lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Camera className="h-4 w-4 text-amber-400" />
                    {t.feedLangsung}
                  </CardTitle>
                  <CardDescription className="mt-1">{t.feedDeskripsi}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <CameraSourceDialog t={t} onSaved={refreshDevice} />
                  <Badge
                    variant="outline"
                    className={`gap-1.5 px-2.5 py-1 font-semibold ${
                      sessionActive
                        ? "border-emerald-900 bg-emerald-950 text-emerald-400"
                        : "border-zinc-700 bg-zinc-900 text-zinc-400"
                    }`}
                  >
                    <LiveDot active={sessionActive} />
                    {sessionActive ? t.live : t.idle}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="relative mx-4 mb-4 overflow-hidden rounded-lg border border-zinc-800 bg-black sm:mx-6">
                <div className="aspect-video w-full">
                  <VideoFeed
                    url={ayamApi.videoFeedUrl()}
                    connectingText={t.kameraTerputus}
                    errorTitle={t.kameraGagal}
                    errorDesc={t.kameraGagalDesc}
                    retryLabel={lang === "id" ? "Coba lagi" : "Retry"}
                    autoRetryKey={recoveryTick}
                  />
                </div>

                {/* overlay footer info */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 bg-zinc-950/90 px-3 py-2 text-[11px] text-zinc-500">
                  <span className="inline-flex items-center gap-1.5">
                    <Crosshair className="h-3 w-3 text-amber-400" />
                    {t.sumberKamera}:{" "}
                    {device
                      ? device.camera_source.startsWith("rtsp")
                        ? "RTSP CCTV Dahua"
                        : t.fileVideo
                      : "…"}
                  </span>
                  <span className="inline-flex items-center gap-3">
                    <span>
                      {t.resolusi}: {device?.camera_resolution ?? "—"}
                    </span>
                    <span>
                      {t.fps}: {device?.camera_fps ?? "—"}
                    </span>
                  </span>
                </div>
                {device?.camera_error ? (
                  <div className="flex items-start gap-2 border-t border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="min-w-0">
                      <span className="font-semibold">{t.kameraErrorAktif}:{" "}</span>
                      {device.camera_error}
                    </span>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* ---------- Session control ---------- */}
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Play className="h-4 w-4 text-amber-400" />
                {t.kontrolSesi}
              </CardTitle>
              <CardDescription className="mt-1">{t.kontrolSesiDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="asal" className="text-zinc-400">
                  {t.asalAyam} <span className="text-amber-500">*</span>
                </Label>
                <Input
                  id="asal"
                  value={asalAyam}
                  onChange={(e) => setAsalAyam(e.target.value)}
                  placeholder={t.asalAyamPh}
                  disabled={sessionActive}
                  list="asal-ayam-options"
                  aria-required="true"
                  aria-invalid={!canStart}
                  className={`border-zinc-800 bg-zinc-950 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-amber-500 ${
                    !canStart ? "border-amber-500/40" : ""
                  }`}
                />
                <datalist id="asal-ayam-options">
                  {originOptions.map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
                {!canStart && !sessionActive ? (
                  <p className="flex items-center gap-1 text-[11px] text-amber-500/90">
                    <Info className="h-3 w-3" /> {t.asalAyamRequired}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tgl" className="text-zinc-400">
                    {t.tanggal}
                  </Label>
                  <Input
                    id="tgl"
                    type="date"
                    value={tanggal}
                    onChange={(e) => setTanggal(e.target.value)}
                    disabled={sessionActive}
                    className="border-zinc-800 bg-zinc-950 text-zinc-100 focus-visible:ring-amber-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="jam" className="text-zinc-400">
                    {t.jam}
                  </Label>
                  <Input
                    id="jam"
                    type="time"
                    value={jam}
                    onChange={(e) => setJam(e.target.value)}
                    disabled={sessionActive}
                    className="border-zinc-800 bg-zinc-950 text-zinc-100 focus-visible:ring-amber-500"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ket" className="text-zinc-400">
                  {t.keterangan}
                </Label>
                <Input
                  id="ket"
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  placeholder={t.keteranganPh}
                  disabled={sessionActive}
                  className="border-zinc-800 bg-zinc-950 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-amber-500"
                />
              </div>

              {/* active session info */}
              {sessionActive && stats.session_data?.asal_ayam ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-lg border border-emerald-900/60 bg-emerald-950/40 p-3 text-xs"
                >
                  <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-emerald-400">
                    <LiveDot active /> {t.aktifBerjalan}
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-zinc-400">
                    <span className="truncate">
                      {t.asalAyam}:{" "}
                      <span className="font-medium text-zinc-200">
                        {stats.session_data.asal_ayam}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Timer className="h-3 w-3 text-emerald-500" />
                      {t.durasiBerjalan}:{" "}
                      <span className="font-mono font-semibold tabular-nums text-emerald-400">
                        {elapsedLabel}
                      </span>
                    </span>
                    <span>
                      {t.tanggal}:{" "}
                      <span className="font-medium text-zinc-200">
                        {stats.session_data.tanggal}
                      </span>
                    </span>
                    <span>
                      {t.jam}:{" "}
                      <span className="font-medium text-zinc-200">
                        {stats.session_data.jam}
                      </span>
                    </span>
                    <span className="truncate">
                      {t.totalAyam}:{" "}
                      <span className="font-bold tabular-nums text-emerald-400">
                        {stats.count}
                      </span>
                    </span>
                  </div>

                  {/* Koreksi manual (+1 / -1) */}
                  <div className="mt-2.5 border-t border-emerald-900/50 pt-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-300">
                          <ScanEye className="h-3 w-3" />
                          {t.koreksiHitung}
                        </p>
                        <p className="truncate text-[10px] text-emerald-500/70">
                          {t.koreksiHint}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={t.koreksiMin}
                          title={t.koreksiMin}
                          disabled={adjustBusy !== null}
                          onClick={() => void guardedAction(() => handleAdjust(-1))()}
                          className="h-8 w-8 border-emerald-800 bg-emerald-950/60 p-0 text-emerald-300 transition-all hover:scale-105 hover:border-red-500/60 hover:bg-red-950/60 hover:text-red-300 disabled:opacity-40"
                        >
                          {adjustBusy === -1 ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Minus className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <span className="min-w-8 text-center font-mono text-sm font-bold tabular-nums text-emerald-300">
                          {stats.count}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={t.koreksiPlus}
                          title={t.koreksiPlus}
                          disabled={adjustBusy !== null}
                          onClick={() => void guardedAction(() => handleAdjust(1))()}
                          className="h-8 w-8 border-emerald-800 bg-emerald-950/60 p-0 text-emerald-300 transition-all hover:scale-105 hover:border-emerald-500/60 hover:bg-emerald-900/60 hover:text-emerald-200 disabled:opacity-40"
                        >
                          {adjustBusy === 1 ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : null}

              {/* action buttons */}
              <div className="flex flex-col gap-2 pt-1">
                {sessionActive ? (
                  <Button
                    onClick={() => void guardedAction(handleStop)()}
                    disabled={busy === "stop"}
                    className="h-11 bg-red-600 font-semibold text-white hover:bg-red-700 focus-visible:ring-red-500"
                  >
                    {busy === "stop" ? (
                      <>
                        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        {t.menghentikan}
                      </>
                    ) : (
                      <>
                        <Square className="mr-2 h-4 w-4" />
                        {t.hentikan}
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={() => void guardedAction(handleStart)()}
                    disabled={busy === "start" || !canStart}
                    title={!canStart ? t.asalAyamRequired : undefined}
                    className="h-11 bg-amber-500 font-semibold text-zinc-950 hover:bg-amber-400 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === "start" ? (
                      <>
                        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-zinc-900/40 border-t-zinc-900" />
                        {t.memuat}
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        {t.mulaiHitung}
                      </>
                    )}
                  </Button>
                )}
                <Button
                  onClick={() => void guardedAction(handleReset)()}
                  disabled={busy === "reset" || sessionActive}
                  variant="outline"
                  className="h-10 border-zinc-800 bg-transparent text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {t.reset}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.section>

        {/* ---- Charts row: trend + weekly ---- */}
        <motion.section
          className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2"
          initial={fadeUp.initial}
          animate={fadeUp.animate}
          transition={{ duration: 0.35, delay: 0.12 }}
        >
          <SessionTrendChart
            points={timeline}
            total={stats.count}
            active={sessionActive}
            t={t}
          />

          {/* Weekly summary */}
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <History className="h-4 w-4 text-sky-400" />
                    {t.ringkasan7hari}
                  </CardTitle>
                  <CardDescription className="mt-1">{t.ayamPerHari}</CardDescription>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className="border-sky-900 bg-sky-950 px-2 py-1 text-[10px] font-semibold text-sky-400"
                  >
                    {t.hariIni}: {daily.total_sessions}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-amber-900 bg-amber-950 px-2 py-1 text-[10px] font-semibold text-amber-400"
                  >
                    {t.totalHariIni}: {(daily.total_count ?? 0).toLocaleString()}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* ---- Target harian: progres hari ini (ronde 8) ---- */}
              <div
                className="mb-3 rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3 transition-colors hover:border-zinc-700/80"
                role="group"
                aria-label={t.targetHarian}
              >
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Target className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <span className="truncate text-xs font-semibold text-zinc-300">
                      {t.targetHarian}
                    </span>
                    {targetPct >= 100 ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-900 bg-emerald-950 px-1.5 py-0 text-[9px] font-bold uppercase text-emerald-400"
                      >
                        ✓ 100%
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span
                      className={`font-mono text-[11px] ${
                        targetPct >= 100
                          ? "text-emerald-400"
                          : "text-zinc-400"
                      }`}
                    >
                      {target > 0
                        ? `${todayCount.toLocaleString(lang === "id" ? "id-ID" : "en-US")} / ${target.toLocaleString()} · ${targetPct}%`
                        : t.targetTanpa}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={openTargetDialog}
                      title={t.targetAtur}
                      aria-label={t.targetAtur}
                      className="h-6 gap-1 px-1.5 text-[10px] text-zinc-500 hover:bg-amber-950/50 hover:text-amber-400"
                    >
                      <Pencil className="h-2.5 w-2.5" />
                      {t.targetAtur}
                    </Button>
                  </div>
                </div>
                {target > 0 ? (
                  <div
                    className="relative mt-2 h-2 overflow-hidden rounded-full bg-zinc-800"
                    role="progressbar"
                    aria-valuenow={targetPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={t.targetHarian}
                  >
                    <motion.div
                      className={`relative h-full overflow-hidden rounded-full ${
                        targetPct >= 100
                          ? "bg-gradient-to-r from-emerald-600 to-emerald-400"
                          : "bg-gradient-to-r from-amber-600 to-amber-400"
                      }`}
                      initial={false}
                      animate={{ width: `${targetPct}%` }}
                      transition={{ type: "spring", stiffness: 80, damping: 20 }}
                    >
                      {/* kilau halus bergerak di dalam bar terisi (ronde 8) */}
                      {targetPct > 4 && targetPct < 100 ? (
                        <span
                          aria-hidden
                          className="ayam-target-shine pointer-events-none absolute inset-y-0 left-0 w-full"
                        />
                      ) : null}
                    </motion.div>
                  </div>
                ) : null}
              </div>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyData} margin={{ top: 14, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="barFillToday" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#059669" stopOpacity={0.4} />
                      </linearGradient>
                      <linearGradient id="barFillPast" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#d97706" stopOpacity={0.3} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tick={{ fill: "var(--chart-tick)", fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: "var(--chart-grid)" }}
                    />
                    <YAxis
                      tick={{ fill: "var(--chart-tick)", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <ReTooltip
                      cursor={{ fill: "#18181b", opacity: 0.6 }}
                      contentStyle={{
                        background: "#09090b",
                        border: "1px solid #3f3f46",
                        borderRadius: 8,
                        fontSize: 12,
                        color: "#f4f4f5",
                      }}
                      formatter={(value: number | string) => [value, t.totalAyam]}
                    />
                    <Bar
                      dataKey="total"
                      radius={[5, 5, 0, 0]}
                      maxBarSize={44}
                      animationDuration={500}
                    >
                      {weeklyData.map((entry, idx) => (
                        <Cell
                          key={idx}
                          fill={
                            idx === weeklyData.length - 1
                              ? "url(#barFillToday)"
                              : "url(#barFillPast)"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1.5 flex items-center justify-end gap-3 text-[10px] text-zinc-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-gradient-to-b from-amber-400 to-amber-600" />
                  {lang === "id" ? "Sebelumnya" : "Previous"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-gradient-to-b from-emerald-400 to-emerald-600" />
                  {lang === "id" ? "Hari ini" : "Today"}
                </span>
              </p>
            </CardContent>
          </Card>
        </motion.section>

        {/* ---- Hardware + Exports ---- */}
        <motion.section
          className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2"
          initial={fadeUp.initial}
          animate={fadeUp.animate}
          transition={{ duration: 0.35, delay: 0.18 }}
        >
          {/* Hardware detail */}
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Cpu className="h-4 w-4 text-violet-400" />
                {t.infoHardware}
              </CardTitle>
              <CardDescription>{t.infoHardwareDesc}</CardDescription>
            </CardHeader>
            <CardContent>
              {device ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-zinc-500">{t.backend}</dt>
                    <dd className="mt-0.5 font-semibold uppercase">
                      {device.backend}
                      {device.device && device.device !== device.backend ? (
                        <span className="ml-1.5 text-xs font-normal text-zinc-400">
                          ({device.device})
                        </span>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">{t.vendor}</dt>
                    <dd className="mt-0.5 font-semibold">{device.vendor}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">{t.presisi}</dt>
                    <dd className="mt-0.5 font-semibold">{device.precision}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">Confidence</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">
                      {(device.confidence * 100).toFixed(0)}%
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-zinc-500">{t.model}</dt>
                    <dd className="mt-0.5 flex items-center gap-2 font-mono text-xs text-zinc-300">
                      <span className="truncate">{device.model_path}</span>
                      <Badge
                        variant="outline"
                        className={`shrink-0 px-1.5 py-0 text-[10px] ${
                          device.model_loaded
                            ? "border-emerald-900 bg-emerald-950 text-emerald-400"
                            : "border-red-900 bg-red-950 text-red-400"
                        }`}
                      >
                        {device.model_loaded ? "LOADED" : "ERROR"}
                      </Badge>
                    </dd>
                  </div>
                  <div className="col-span-2 rounded-md bg-zinc-950/60 p-2.5">
                    <dt className="flex items-center gap-1.5 text-xs text-zinc-500">
                      <Info className="h-3 w-3" /> {t.alasan}
                    </dt>
                    <dd className="mt-1 text-xs leading-relaxed text-zinc-400">
                      {device.reason}
                    </dd>
                  </div>
                </dl>
              ) : (
                <div className="space-y-3">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-5 w-full bg-zinc-800" />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Exports list */}
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                    {t.fileExcel}
                  </CardTitle>
                  <CardDescription className="mt-1">{t.fileExcelDesc}</CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="border-emerald-900 bg-emerald-950 px-2 py-1 text-[10px] font-semibold text-emerald-400"
                >
                  {exports.length} file
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {sortedExports.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-800 py-10 text-center">
                  <FileSpreadsheet className="h-8 w-8 text-zinc-700" />
                  <p className="text-sm font-medium text-zinc-400">{t.belumAdaFile}</p>
                  <p className="text-xs text-zinc-600">{t.belumAdaFileDesc}</p>
                </div>
              ) : (
                <div className="ayam-scroll max-h-96 space-y-2 overflow-y-auto pr-1">
                  {sortedExports.map((f) => (
                    <div
                      key={f.name}
                      className="group flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 transition-colors hover:border-zinc-700 hover:bg-zinc-900"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
                          <FileSpreadsheet className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-200">
                            {f.name}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            {f.modified_str} · {f.size_kb} KB
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <a
                          href={ayamApi.csvUrl(f.name)}
                          download
                          title={t.unduhCsv}
                          aria-label={`${t.unduhCsv} ${f.name}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-400 transition-colors hover:border-sky-500/50 hover:bg-sky-500 hover:text-zinc-950"
                        >
                          <FileDown className="h-4 w-4" />
                        </a>
                        <a
                          href={ayamApi.downloadUrl(f.name)}
                          download
                          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-xs font-semibold text-zinc-300 transition-colors hover:border-amber-500/50 hover:bg-amber-500 hover:text-zinc-950"
                          aria-label={`${t.unduh} ${f.name}`}
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{t.unduh}</span>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.section>

        {/* ---- History table ---- */}
        <motion.section
          className="mt-4"
          initial={fadeUp.initial}
          animate={fadeUp.animate}
          transition={{ duration: 0.35, delay: 0.24 }}
        >
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <History className="h-4 w-4 text-sky-400" />
                    {t.riwayatSesi}
                  </CardTitle>
                  <CardDescription className="mt-1">{t.riwayatDesc}</CardDescription>
                </div>
                {/* filter controls */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
                    <Input
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder={t.cariRiwayat}
                      className="h-9 w-44 border-zinc-800 bg-zinc-950 pl-8 text-xs text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-amber-500"
                    />
                  </div>
                  <Input
                    type="date"
                    value={historyDate}
                    onChange={(e) => setHistoryDate(e.target.value)}
                    aria-label={t.filterTanggal}
                    className="h-9 w-36 border-zinc-800 bg-zinc-950 text-xs text-zinc-100 focus-visible:ring-amber-500"
                  />
                  {/* Laporan harian PDF (mengikuti filter tanggal / hari ini) */}
                  <a
                    href={ayamApi.dailyReportUrl(historyDate || tanggal || new Date().toISOString().slice(0, 10))}
                    download
                    title={t.laporanHarianPh}
                    aria-label={t.laporanHarian}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-900 bg-emerald-950/60 px-2.5 text-xs font-semibold text-emerald-400 transition-all hover:-translate-y-px hover:border-emerald-500/50 hover:bg-emerald-900/60 hover:text-emerald-300"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">{t.laporanHarian}</span>
                  </a>
                  {/* Laporan rentang tanggal (mingguan/bulanan) */}
                  <RangeReportDialog t={t} lang={lang} />
                  {historySearch || historyDate ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setHistorySearch("");
                        setHistoryDate("");
                      }}
                      className="h-9 px-2 text-xs text-zinc-400 hover:text-zinc-200"
                    >
                      {t.tampilkanSemua}
                    </Button>
                  ) : null}
                  <Badge variant="outline" className="border-zinc-800 px-2 py-1 text-[10px] text-zinc-500">
                    {filteredHistory.length} {t.hasilFilter}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {history.history.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-800 py-10 text-center">
                  <History className="h-8 w-8 text-zinc-700" />
                  <p className="text-sm font-medium text-zinc-400">{t.belumAdaRiwayat}</p>
                  <p className="text-xs text-zinc-600">{t.belumAdaRiwayatDesc}</p>
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-800 py-10 text-center">
                  <Search className="h-8 w-8 text-zinc-700" />
                  <p className="text-sm font-medium text-zinc-400">
                    {lang === "id" ? "Tidak ada hasil" : "No results"}
                  </p>
                </div>
              ) : (
                <div className="ayam-scroll max-h-96 overflow-x-auto overflow-y-auto rounded-lg border border-zinc-800">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-zinc-900">
                      <TableRow className="border-zinc-800 hover:bg-zinc-900">
                        <TableHead className="text-zinc-500">#</TableHead>
                        <TableHead className="text-zinc-500">{t.asalAyam}</TableHead>
                        <TableHead className="text-zinc-500">{t.tanggal}</TableHead>
                        <TableHead className="text-zinc-500">{t.jam}</TableHead>
                        <TableHead className="hidden text-right text-zinc-500 md:table-cell">
                          {t.durasi}
                        </TableHead>
                        <TableHead className="hidden text-right text-zinc-500 lg:table-cell">
                          {t.rataRata}
                        </TableHead>
                        <TableHead className="text-right text-zinc-500">
                          {t.total}
                        </TableHead>
                        <TableHead className="text-right text-zinc-500">
                          {t.selesai}
                        </TableHead>
                        <TableHead className="w-16 text-right text-zinc-500">
                          <span className="sr-only">{t.hapus}</span>
                          <Trash2 className="ml-auto h-3.5 w-3.5" />
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHistory.map((h) => {
                        const st = h.start_time ? new Date(h.start_time).getTime() : NaN;
                        const en = h.end_time ? new Date(h.end_time).getTime() : NaN;
                        const durSec =
                          Number.isFinite(st) && Number.isFinite(en)
                            ? Math.max(0, (en - st) / 1000)
                            : NaN;
                        const rate =
                          Number.isFinite(durSec) && durSec > 0
                            ? ((h.total_count ?? 0) / durSec) * 60
                            : NaN;
                        return (
                        <TableRow
                          key={h.id}
                          className="group cursor-pointer border-zinc-800/70 transition-colors hover:bg-amber-500/5"
                          onClick={() => openDetail(h)}
                          title={t.lihatDetail}
                        >
                          <TableCell className="font-mono text-xs text-zinc-500">
                            {h.id}
                          </TableCell>
                          <TableCell className="max-w-40 truncate font-medium text-zinc-200">
                            <span className="inline-flex items-center gap-1.5">
                              {h.asal_ayam}
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100" />
                            </span>
                          </TableCell>
                          <TableCell className="text-zinc-400">{h.tanggal}</TableCell>
                          <TableCell className="text-zinc-400">{h.jam}</TableCell>
                          <TableCell className="hidden text-right font-mono text-[11px] tabular-nums text-zinc-400 md:table-cell">
                            {Number.isFinite(durSec) && durSec > 0 ? fmtDur(durSec) : "—"}
                          </TableCell>
                          <TableCell className="hidden text-right font-mono text-[11px] tabular-nums text-sky-400/90 lg:table-cell">
                            {Number.isFinite(rate) && rate > 0
                              ? `${rate.toFixed(1)}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right font-bold tabular-nums text-amber-400">
                            {h.total_count?.toLocaleString() ?? 0}
                          </TableCell>
                          <TableCell className="text-right font-mono text-[11px] text-zinc-500">
                            {h.end_time
                              ? new Date(h.end_time).toLocaleTimeString(
                                  lang === "id" ? "id-ID" : "en-US"
                                )
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`${t.hapus} #${h.id} (${h.asal_ayam})`}
                              title={t.hapus}
                              disabled={deleteBusy}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(h);
                              }}
                              className="h-8 w-8 text-zinc-600 opacity-0 transition-all hover:bg-red-500/15 hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.section>
      </main>

      {/* ================= DIALOGS ================= */}
      <SessionDetailDialog
        session={detailSession}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        t={t}
        lang={lang}
      />

      {/* Gate PIN — dibuka saat aksi terproteksi ditolak (401 pin_required).
          Setelah PIN benar, aksi yang tertunda diulang otomatis. */}
      <PinGateDialog
        open={pinGateOpen}
        onOpenChange={(o) => {
          setPinGateOpen(o);
          if (!o) pendingActionRef.current = null;
        }}
        onSuccess={() => {
          const retry = pendingActionRef.current;
          pendingActionRef.current = null;
          if (retry) setTimeout(retry, 120);
        }}
        t={t}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-400" />
              {t.hapusSesi}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {t.hapusSesiDesc}
              {deleteTarget ? (
                <span className="mt-2 block rounded-md bg-zinc-900 p-2 font-mono text-xs text-zinc-300">
                  #{deleteTarget.id} — {deleteTarget.asal_ayam} ({deleteTarget.tanggal}) ·{" "}
                  {deleteTarget.total_count} {t.totalAyam.toLowerCase()}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteBusy}
              className="border-zinc-800 bg-transparent text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
            >
              {t.batalkan}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteBusy}
              onClick={(e) => {
                e.preventDefault();
                void guardedAction(handleDelete)();
              }}
              className="bg-red-600 font-semibold text-white hover:bg-red-700"
            >
              {deleteBusy ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  {t.menghapus}
                </>
              ) : (
                t.yaHapus
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ================= DIALOG TARGET HARIAN (ronde 8) ================= */}
      <Dialog open={targetOpen} onOpenChange={setTargetOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                <Target className="h-4 w-4" />
              </span>
              {t.targetAtur}
            </DialogTitle>
            <DialogDescription>{t.targetHarianDesc}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSaveTarget();
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="target-input" className="text-xs text-zinc-400">
                {t.targetLabel}
              </Label>
              <Input
                id="target-input"
                inputMode="numeric"
                autoComplete="off"
                placeholder={t.targetTanpa}
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value.replace(/[^0-9]/g, ""))}
                disabled={targetBusy}
                className="border-zinc-800 bg-zinc-900 font-mono tabular-nums text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-amber-500/40"
              />
              <p className="text-[11px] text-zinc-600">
                0 = {t.targetTanpa} · maks 1.000.000
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={targetBusy}
                onClick={() => setTargetOpen(false)}
                className="border-zinc-800 bg-transparent text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
              >
                {t.batalkan}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={targetBusy}
                className="bg-amber-500 font-semibold text-zinc-950 hover:bg-amber-400"
              >
                {targetBusy ? (
                  <>
                    <div className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-900/40 border-t-zinc-900" />
                    {t.logMemuat}
                  </>
                ) : (
                  t.simpan
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ================= FOOTER (sticky bottom) ================= */}
      <footer className="relative z-10 mt-auto border-t border-zinc-800 bg-zinc-950 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-4">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-4 text-xs text-zinc-600 sm:flex-row sm:px-6">
          <p className="flex items-center gap-1.5">
            <Bird className="h-3.5 w-3.5 text-amber-500/70" />
            {t.footerText}
          </p>
          <p className="flex items-center gap-2 font-mono text-[10px] text-zinc-700">
            <span className="hidden h-1 w-1 rounded-full bg-zinc-700 sm:inline-block" />
            {t.footerHint}
          </p>
        </div>
      </footer>
    </div>
  );
}
