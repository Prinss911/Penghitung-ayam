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
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Bird,
  Camera,
  Cpu,
  Crosshair,
  Download,
  FileDown,
  FileSpreadsheet,
  Gauge,
  History,
  Info,
  Play,
  RotateCcw,
  ScanEye,
  Search,
  Signal,
  SignalHigh,
  SignalZero,
  Square,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { SessionTrendChart } from "@/components/ayam/session-trend-chart";
import { AnimatedNumber } from "@/components/ayam/animated-number";
import { ayamApi } from "@/lib/ayam/api";
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
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent: string;
  glow: string;
}) {
  return (
    <Card
      className={`group relative overflow-hidden border-zinc-800 bg-zinc-900/60 transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-700 ${glow}`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-zinc-600 to-transparent" />
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {label}
            </p>
            <p className="mt-1.5 truncate text-2xl font-bold tabular-nums text-zinc-50 sm:text-3xl">
              {value}
            </p>
            {sub ? <div className="mt-1 text-xs text-zinc-500">{sub}</div> : null}
          </div>
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110 ${accent}`}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
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
    <Badge variant="outline" className={`${M.cls} gap-1.5 px-2.5 py-1 font-medium`}>
      <Icon className="h-3.5 w-3.5" />
      {M.text}
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
  } = useAyamDashboard();

  // ----- form state -----
  const [asalAyam, setAsalAyam] = useState("");
  const [tanggal, setTanggal] = useState("");
  const [jam, setJam] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [busy, setBusy] = useState<"start" | "stop" | "reset" | null>(null);

  // ----- history filter -----
  const [historySearch, setHistorySearch] = useState("");
  const [historyDate, setHistoryDate] = useState("");

  // ----- milestone -----
  const lastMilestoneRef = useRef(0);

  // default tanggal & jam (client only, hindari hydration mismatch)
  useEffect(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setTanggal(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
    setJam(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  }, []);

  const sessionActive = stats.session_active || stats.is_processing === true;

  // ----- beep (WebAudio, tanpa asset) -----
  const playBeep = useCallback(() => {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
      osc.onended = () => void ctx.close();
    } catch {
      /* audio diblokir browser — abaikan */
    }
  }, []);

  // ----- milestone setiap kelipatan 10 -----
  useEffect(() => {
    const c = stats.count;
    const STEP = 10;
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
    }
    lastMilestoneRef.current = Math.max(lastMilestoneRef.current, c);
  }, [stats.count, t, playBeep]);

  // ----- actions -----
  const handleStart = useCallback(async () => {
    setBusy("start");
    try {
      await ayamApi.startSession({
        asal_ayam: asalAyam.trim() || "Unknown",
        tanggal: tanggal,
        jam: jam,
        keterangan: keterangan.trim(),
      });
      lastMilestoneRef.current = 0;
      toast.success(t.sesiDimulai, {
        description: `${t.asalAyam}: ${asalAyam.trim() || "Unknown"}`,
      });
    } catch {
      toast.error(t.gagalStart, {
        description:
          lang === "id"
            ? "Cek apakah backend Flask berjalan."
            : "Check if the Flask backend is running.",
      });
    } finally {
      setBusy(null);
    }
  }, [asalAyam, tanggal, jam, keterangan, t, lang]);

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
    } catch {
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
    } catch {
      toast.error(t.gagalReset);
    } finally {
      setBusy(null);
    }
  }, [t]);

  // ----- derived -----
  const daily = history.stats;

  const weeklyData = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of history.history) {
      if (!h.tanggal) continue;
      map.set(h.tanggal, (map.get(h.tanggal) ?? 0) + (h.total_count ?? 0));
    }
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    if (!map.has(todayStr)) map.set(todayStr, 0);
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-7)
      .map(([d, total]) => ({ day: d.slice(5), total }));
  }, [history]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return history.history.filter((h) => {
      const okSearch = !q || (h.asal_ayam ?? "").toLowerCase().includes(q);
      const okDate = !historyDate || h.tanggal === historyDate;
      return okSearch && okDate;
    });
  }, [history.history, historySearch, historyDate]);

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
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* ================= HEADER ================= */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/60">
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
            <SettingsDialog t={t} />
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
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-6">
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
              ) : (
                <span className="inline-flex items-center gap-1.5 text-zinc-500">
                  <LiveDot active={false} /> {t.menungguSesi}
                </span>
              )
            }
            accent="bg-amber-500/15 text-amber-400"
            glow="hover:shadow-[0_8px_32px_-12px_rgba(245,158,11,0.35)]"
          />
          <StatCard
            icon={ScanEye}
            label={t.objekDiFrame}
            value={stats.tracks.toLocaleString(lang === "id" ? "id-ID" : "en-US")}
            sub={
              <span>
                {t.bingkai}: {stats.frame ?? "-"} · {stats.method}
              </span>
            }
            accent="bg-emerald-500/15 text-emerald-400"
            glow="hover:shadow-[0_8px_32px_-12px_rgba(16,185,129,0.35)]"
          />
          <StatCard
            icon={Gauge}
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
          />
          <StatCard
            icon={Cpu}
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
                  {t.asalAyam}
                </Label>
                <Input
                  id="asal"
                  value={asalAyam}
                  onChange={(e) => setAsalAyam(e.target.value)}
                  placeholder={t.asalAyamPh}
                  disabled={sessionActive}
                  className="border-zinc-800 bg-zinc-950 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-amber-500"
                />
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
                    className="border-zinc-800 bg-zinc-950 text-zinc-100 [color-scheme:dark] focus-visible:ring-amber-500"
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
                    className="border-zinc-800 bg-zinc-950 text-zinc-100 [color-scheme:dark] focus-visible:ring-amber-500"
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
                </motion.div>
              ) : null}

              {/* action buttons */}
              <div className="flex flex-col gap-2 pt-1">
                {sessionActive ? (
                  <Button
                    onClick={handleStop}
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
                    onClick={handleStart}
                    disabled={busy === "start"}
                    className="h-11 bg-amber-500 font-semibold text-zinc-950 hover:bg-amber-400 focus-visible:ring-amber-500"
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
                  onClick={handleReset}
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
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.35} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tick={{ fill: "#71717a", fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: "#3f3f46" }}
                    />
                    <YAxis
                      tick={{ fill: "#71717a", fontSize: 11 }}
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
                      fill="url(#barFill)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={44}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
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
                    className="h-9 w-36 border-zinc-800 bg-zinc-950 text-xs text-zinc-100 [color-scheme:dark] focus-visible:ring-amber-500"
                  />
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
                <div className="ayam-scroll max-h-96 overflow-y-auto rounded-lg border border-zinc-800">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-zinc-900">
                      <TableRow className="border-zinc-800 hover:bg-zinc-900">
                        <TableHead className="text-zinc-500">#</TableHead>
                        <TableHead className="text-zinc-500">{t.asalAyam}</TableHead>
                        <TableHead className="text-zinc-500">{t.tanggal}</TableHead>
                        <TableHead className="text-zinc-500">{t.jam}</TableHead>
                        <TableHead className="text-right text-zinc-500">
                          {t.total}
                        </TableHead>
                        <TableHead className="text-right text-zinc-500">
                          {t.selesai}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHistory.map((h) => (
                        <TableRow
                          key={h.id}
                          className="border-zinc-800/70 hover:bg-zinc-900/70"
                        >
                          <TableCell className="font-mono text-xs text-zinc-500">
                            {h.id}
                          </TableCell>
                          <TableCell className="max-w-40 truncate font-medium">
                            {h.asal_ayam}
                          </TableCell>
                          <TableCell className="text-zinc-400">{h.tanggal}</TableCell>
                          <TableCell className="text-zinc-400">{h.jam}</TableCell>
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
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.section>
      </main>

      {/* ================= FOOTER (sticky bottom) ================= */}
      <footer className="mt-auto border-t border-zinc-800 bg-zinc-950 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-4">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-4 text-xs text-zinc-600 sm:flex-row sm:px-6">
          <p className="flex items-center gap-1.5">
            <Bird className="h-3.5 w-3.5 text-amber-500/70" />
            {t.footerText}
          </p>
          <p className="font-mono text-[10px] text-zinc-700">{t.footerHint}</p>
        </div>
      </footer>
    </div>
  );
}
