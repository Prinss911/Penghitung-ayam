"use client";

/**
 * Ayam Counter Pro — Dashboard utama
 * Frontend Next.js untuk backend Flask + YOLOv8 (port 5000 via gateway)
 * Bilingual: Bahasa Indonesia / English
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bird,
  Camera,
  Cpu,
  Crosshair,
  Download,
  FileSpreadsheet,
  Gauge,
  History,
  Info,
  Play,
  RotateCcw,
  ScanEye,
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
import { Separator } from "@/components/ui/separator";
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
import { ayamApi } from "@/lib/ayam/api";
import { dict, type Lang } from "@/lib/ayam/i18n";

// =====================================================
// SMALL BUILDING BLOCKS
// =====================================================

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
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent: string;
}) {
  return (
    <Card className="bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 transition-colors">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              {label}
            </p>
            <p className="mt-1.5 text-2xl sm:text-3xl font-bold tabular-nums text-zinc-50 truncate">
              {value}
            </p>
            {sub ? <div className="mt-1 text-xs text-zinc-500">{sub}</div> : null}
          </div>
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent}`}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ConnBadge({ mode, t }: { mode: ConnMode; t: (typeof dict)[Lang] }) {
  const map: Record<
    ConnMode,
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
  const M = map[mode];
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
  const [lang, setLang] = useState<Lang>("id");
  const t = dict[lang];

  const {
    stats,
    device,
    history,
    exports,
    connMode,
    refreshSideData,
  } = useAyamDashboard();

  // ----- form state -----
  const [asalAyam, setAsalAyam] = useState("");
  const [tanggal, setTanggal] = useState("");
  const [jam, setJam] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [busy, setBusy] = useState<"start" | "stop" | "reset" | null>(null);

  // default tanggal & jam (client only, hindari hydration mismatch)
  useEffect(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setTanggal(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
    setJam(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  }, []);

  const sessionActive = stats.session_active || stats.is_processing === true;

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
      toast.success(t.sesiDimulai, {
        description: `${t.asalAyam}: ${asalAyam.trim() || "Unknown"}`,
      });
    } catch {
      toast.error(t.gagalStart, {
        description: lang === "id" ? "Cek apakah backend Flask berjalan." : "Check if the Flask backend is running.",
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
          ? `${res.file.split("/").pop()} — ${stats.count} ${lang === "id" ? "ayam" : "chickens"}`
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
      toast.info(t.counterDireset);
    } catch {
      toast.error(t.gagalReset);
    } finally {
      setBusy(null);
    }
  }, [t]);

  // ----- derived -----
  const daily = history.stats;
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
        <section aria-label="statistics" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard
            icon={Bird}
            label={t.totalAyam}
            value={stats.count.toLocaleString(lang === "id" ? "id-ID" : "en-US")}
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
                  {device.model_loaded ? t.modelTermuat : (
                    <span className="text-red-400">{t.modelBelum}</span>
                  )}
                </span>
              ) : (
                <Skeleton className="h-3 w-24 bg-zinc-800" />
              )
            }
            accent="bg-violet-500/15 text-violet-400"
          />
        </section>

        {/* ---- Video + session panel ---- */}
        <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* ---------- Video feed ---------- */}
          <Card className="overflow-hidden border-zinc-800 bg-zinc-900/60 lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Camera className="h-4 w-4 text-amber-400" />
                    {t.feedLangsung}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {t.feedDeskripsi}
                  </CardDescription>
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
                <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/40 p-3 text-xs">
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
                </div>
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
        </section>

        {/* ---- Daily summary cards ---- */}
        <section className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-900/40">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
                <History className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  {t.hariIni}
                </p>
                <p className="text-2xl font-bold tabular-nums">
                  {daily.total_sessions}
                </p>
              </div>
              <Separator orientation="vertical" className="mx-1 hidden h-10 sm:block" />
              <div className="hidden sm:block">
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  {t.totalHariIni}
                </p>
                <p className="text-2xl font-bold tabular-nums text-amber-400">
                  {(daily.total_count ?? 0).toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-900/40">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  {t.fileExcel}
                </p>
                <p className="text-2xl font-bold tabular-nums">{exports.length}</p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ---- Hardware + Exports ---- */}
        <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
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
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                {t.fileExcel}
              </CardTitle>
              <CardDescription>{t.fileExcelDesc}</CardDescription>
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
                      <a
                        href={ayamApi.downloadUrl(f.name)}
                        download
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-xs font-semibold text-zinc-300 transition-colors hover:border-amber-500/50 hover:bg-amber-500 hover:text-zinc-950"
                        aria-label={`${t.unduh} ${f.name}`}
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{t.unduh}</span>
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* ---- History table ---- */}
        <section className="mt-4">
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4 text-sky-400" />
                {t.riwayatSesi}
              </CardTitle>
              <CardDescription>{t.riwayatDesc}</CardDescription>
            </CardHeader>
            <CardContent>
              {history.history.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-800 py-10 text-center">
                  <History className="h-8 w-8 text-zinc-700" />
                  <p className="text-sm font-medium text-zinc-400">{t.belumAdaRiwayat}</p>
                  <p className="text-xs text-zinc-600">{t.belumAdaRiwayatDesc}</p>
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
                      {history.history.map((h) => (
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
        </section>
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
