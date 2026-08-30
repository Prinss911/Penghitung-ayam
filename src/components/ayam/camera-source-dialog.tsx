"use client";

/**
 * CameraSourceDialog — ganti sumber kamera runtime tanpa restart backend:
 * - Pilih dari video demo yang tersedia di server
 * - Isi URL RTSP / path file video / "0" untuk webcam
 * Pergantian diterapkan asinkron oleh capture thread (lihat /api/camera-source).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookmarkPlus,
  Check,
  CloudUpload,
  Loader2,
  PlugZap,
  RadioTower,
  ShieldCheck,
  ShieldX,
  Trash2,
  Video,
  Webcam,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ayamApi,
  PinRequiredError,
  type CameraPreset,
  type CameraSourceInfo,
} from "@/lib/ayam/api";
import type { Dict } from "@/lib/ayam/i18n";

interface CameraSourceDialogProps {
  t: Dict;
  /** Dipanggil setelah sumber berhasil diterapkan (refresh info kamera) */
  onSaved?: () => void;
}

function sourceLabel(src: string, t: Dict): string {
  if (src === "0") return t.webcam;
  if (src.startsWith("rtsp://")) return `RTSP — ${src.slice(0, 42)}${src.length > 42 ? "…" : ""}`;
  if (src.startsWith("http")) return `HTTP — ${src.slice(0, 40)}…`;
  const name = src.split("/").pop() ?? src;
  return `${t.videoLokal}: ${name}`;
}

const ALLOWED_EXT = [".mp4", ".avi", ".mov", ".mkv"];
const MAX_UPLOAD_MB = 300;

function videoExtOk(name: string): boolean {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return ALLOWED_EXT.includes(ext);
}

export function CameraSourceDialog({ t, onSaved }: CameraSourceDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [info, setInfo] = useState<CameraSourceInfo | null>(null);
  const [custom, setCustom] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [deleteVideoName, setDeleteVideoName] = useState<string | null>(null);
  const [deleteVideoBusy, setDeleteVideoBusy] = useState(false);
  // ===== Preset kamera (ronde 7) =====
  const [presets, setPresets] = useState<CameraPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [presetBusy, setPresetBusy] = useState(false);
  const [deletePresetName, setDeletePresetName] = useState<string | null>(null);
  // ===== Tes koneksi sumber (ronde 9) =====
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    Awaited<ReturnType<typeof ayamApi.testCameraSource>> | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        ayamApi.getCameraSource(),
        ayamApi.getCameraPresets().catch(() => ({ presets: [] })),
      ]);
      setInfo(s);
      setCustom(s.source === "0" ? "0" : s.source);
      setPresets(Array.isArray(p.presets) ? p.presets : []);
    } catch {
      toast.error(t.gagalSumber);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const apply = useCallback(
    async (source: string) => {
      const val = source.trim();
      if (!val) return;
      setApplying(true);
      try {
        await ayamApi.setCameraSource(val);
        toast.success(t.sumberDiterapkan, {
          description: sourceLabel(val, t),
        });
        setOpen(false);
        onSaved?.();
      } catch (e) {
        if (e instanceof PinRequiredError) {
          toast.info(t.pinDibutuhkan);
          return;
        }
        const msg = e instanceof Error ? e.message : "";
        toast.error(t.gagalSumber, {
          description: msg.includes("400")
            ? (info?.error ?? t.sumberKustom)
            : undefined,
        });
      } finally {
        setApplying(false);
      }
    },
    [t, onSaved, info]
  );

  const current = info?.source ?? "";

  // ===== Tes koneksi sumber tanpa mengganggu capture aktif (ronde 9) =====
  const runTest = useCallback(
    async (source?: string) => {
      const val = (source ?? custom).trim();
      if (!val || testing) return;
      setTesting(true);
      setTestResult(null);
      try {
        const res = await ayamApi.testCameraSource(val);
        setTestResult(res);
      } catch (e) {
        if (e instanceof PinRequiredError) {
          toast.info(t.pinDibutuhkan);
          return;
        }
        toast.error(t.kameraTesGagal, {
          description: e instanceof Error ? e.message : undefined,
        });
      } finally {
        setTesting(false);
      }
    },
    [custom, testing, t]
  );

  // ===== Preset: simpan sumber aktif sebagai preset (upsert by name) =====
  const savePreset = useCallback(async () => {
    const name = presetName.trim().slice(0, 40);
    if (!name) {
      toast.error(t.presetGagal, { description: t.presetNamaWajib });
      return;
    }
    if (!current) return;
    setPresetBusy(true);
    try {
      const res = await ayamApi.saveCameraPreset(name, current);
      setPresets(Array.isArray(res.presets) ? res.presets : []);
      setPresetName("");
      toast.success(t.presetTersimpan, { description: name });
    } catch (e) {
      if (e instanceof PinRequiredError) {
        toast.info(t.pinDibutuhkan);
        return;
      }
      toast.error(t.presetGagal);
    } finally {
      setPresetBusy(false);
    }
  }, [presetName, current, t]);

  const removePreset = useCallback(
    async (name: string) => {
      setPresetBusy(true);
      try {
        const res = await ayamApi.deleteCameraPreset(name);
        setPresets(Array.isArray(res.presets) ? res.presets : []);
        setDeletePresetName(null);
        toast.success(t.presetDihapus, { description: name });
      } catch (e) {
        if (e instanceof PinRequiredError) {
          toast.info(t.pinDibutuhkan);
          return;
        }
        toast.error(t.presetGagalHapus);
      } finally {
        setPresetBusy(false);
      }
    },
    [t]
  );

  const handleDeleteVideo = useCallback(async () => {
    if (!deleteVideoName) return;
    setDeleteVideoBusy(true);
    try {
      const res = await ayamApi.deleteCameraVideo(deleteVideoName);
      toast.success(t.videoDihapus, { description: res.deleted });
      setDeleteVideoName(null);
      await load();
    } catch (e) {
      if (e instanceof PinRequiredError) {
        toast.info(t.pinDibutuhkan);
        return;
      }
      const msg = e instanceof Error ? e.message : "";
      toast.error(t.gagalHapusVideo, {
        description: msg.includes("400") ? t.videoAktifWarning : undefined,
      });
    } finally {
      setDeleteVideoBusy(false);
    }
  }, [deleteVideoName, t, load]);

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file || uploading) return;
      if (!videoExtOk(file.name)) {
        toast.error(t.unggahGagal, { description: t.extSalah });
        return;
      }
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        toast.error(t.unggahGagal, { description: t.ukuranMax });
        return;
      }
      setUploading(true);
      setUploadPct(0);
      try {
        const res = await ayamApi.uploadCameraVideo(file, setUploadPct);
        toast.success(t.unggahBerhasil, {
          description: `${res.name} · ${res.size_mb} MB`,
        });
        await load();
        onSaved?.();
      } catch (e) {
        if (e instanceof PinRequiredError) {
          toast.info(t.pinDibutuhkan);
          return;
        }
        toast.error(t.unggahGagal, {
          description: e instanceof Error ? e.message : undefined,
        });
      } finally {
        setUploading(false);
        setUploadPct(0);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [uploading, t, load, onSaved]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={t.gantiSumber}
          title={t.gantiSumber}
          className="h-8 gap-1.5 border-border bg-card px-2.5 text-xs text-muted-foreground hover:border-amber-500/50 hover:bg-muted hover:text-amber-400"
        >
          <Video className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t.gantiSumber}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border bg-background text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-4 w-4 text-amber-400" />
            {t.sumberKameraSetting}
          </DialogTitle>
          <DialogDescription>{t.sumberKameraDesc}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Current source */}
            <div className="rounded-lg border border-border bg-card/60 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t.sumberSaatIni}
              </p>
              <p className="mt-1 truncate font-mono text-xs text-foreground" title={current}>
                {current ? sourceLabel(current, t) : "—"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={`px-1.5 py-0 text-[10px] font-semibold ${
                    info?.connected
                      ? "border-emerald-900 bg-emerald-950 text-emerald-400"
                      : "border-red-900 bg-red-950 text-red-400"
                  }`}
                >
                  {info?.connected ? (
                    <span className="inline-flex items-center gap-1">
                      <Check className="h-3 w-3" />
                      connected
                    </span>
                  ) : (
                    "disconnected"
                  )}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-border px-1.5 py-0 text-[10px] text-muted-foreground"
                >
                  {current === "0"
                    ? t.webcam
                    : info?.is_stream
                      ? t.stream
                      : t.videoLokal}
                </Badge>
                {info?.resolution ? (
                  <Badge
                    variant="outline"
                    className="border-border px-1.5 py-0 text-[10px] text-muted-foreground"
                  >
                    {info.resolution} · {info.fps} fps
                  </Badge>
                ) : null}
              </div>
              {info?.error ? (
                <p className="mt-2 flex items-start gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-300">
                  <RadioTower className="mt-0.5 h-3 w-3 shrink-0" />
                  {info.error}
                </p>
              ) : null}
            </div>

            {/* Preset kamera (ronde 7) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">{t.presetKamera}</p>
                <p className="truncate text-[10px] text-muted-foreground">{t.presetKameraDesc}</p>
              </div>
              {presets.length > 0 ? (
                <div className="ayam-scroll max-h-36 space-y-1.5 overflow-y-auto pr-1">
                  {presets.map((p) => {
                    const active = p.source === current;
                    return (
                      <div
                        key={p.name}
                        role="button"
                        tabIndex={0}
                        aria-label={`${t.presetTerapkan}: ${p.name}`}
                        onClick={() => !presetBusy && apply(p.source)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !presetBusy) {
                            e.preventDefault();
                            apply(p.source);
                          }
                        }}
                        title={p.source}
                        className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border p-2.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                          active
                            ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
                            : "border-border bg-card/60 text-foreground hover:border-sky-500/40 hover:bg-card"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <RadioTower className="h-3.5 w-3.5 shrink-0 text-sky-400/80" />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{p.name}</span>
                            <span className="block truncate font-mono text-[10px] text-muted-foreground">
                              {p.source.startsWith("rtsp") ? "RTSP" : p.source === "0" ? t.webcam : p.source.split("/").pop()}
                            </span>
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {active ? <Check className="h-3.5 w-3.5 text-sky-400" /> : null}
                          <button
                            type="button"
                            aria-label={`${t.hapus}: ${p.name}`}
                            title={`${t.hapus}: ${p.name}`}
                            disabled={presetBusy}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletePresetName(p.name);
                            }}
                            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-red-950/60 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border px-3 py-2 text-center text-[11px] text-muted-foreground">
                  {t.presetKosong}
                </p>
              )}
              {/* Simpan sumber aktif sebagai preset */}
              <div className="flex gap-2">
                <Input
                  id="preset-name"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder={t.presetNamaPh}
                  maxLength={40}
                  aria-label={t.presetNamaPh}
                  className="h-9 flex-1 border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus-visible:ring-sky-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !presetBusy) void savePreset();
                  }}
                />
                <Button
                  onClick={() => void savePreset()}
                  disabled={presetBusy || !presetName.trim() || !current}
                  title={`${t.presetSimpanDariAktif}: ${current}`}
                  className="h-9 shrink-0 gap-1.5 bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                >
                  {presetBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <BookmarkPlus className="h-3.5 w-3.5" />
                  )}
                  {t.presetSimpan}
                </Button>
              </div>
            </div>

            {/* Upload zone */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{t.unggahVideo}</p>
              <div
                role="button"
                tabIndex={0}
                aria-label={t.unggahVideo}
                onClick={() => !uploading && fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && !uploading) {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!uploading) setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  void handleFile(e.dataTransfer.files?.[0]);
                }}
                className={`group relative flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed p-5 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                  dragOver
                    ? "border-amber-400 bg-amber-500/10"
                    : "border-border bg-card/40 hover:border-amber-500/50 hover:bg-card"
                } ${uploading ? "pointer-events-none opacity-70" : ""}`}
              >
                {uploading ? (
                  <>
                    <CloudUpload className="h-6 w-6 animate-pulse text-amber-400" />
                    <p className="text-xs font-semibold text-amber-300">
                      {t.mengunggah}… {uploadPct}%
                    </p>
                    <div
                      className="mt-1 h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={uploadPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-200"
                        style={{ width: `${uploadPct}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <CloudUpload className="h-6 w-6 text-muted-foreground transition-colors group-hover:text-amber-400" />
                    <p className="text-xs font-medium text-foreground">{t.jatuhkanVideo}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t.atauPilih} · {t.extDiizinkan}
                    </p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="sr-only"
                  accept="video/mp4,video/x-msvideo,video/quicktime,video/x-matroska,.mp4,.avi,.mov,.mkv"
                  onChange={(e) => void handleFile(e.target.files?.[0])}
                />
              </div>
            </div>

            {/* Demo videos */}
            {info && info.videos.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{t.pilihVideoDemo}</p>
                <div className="ayam-scroll max-h-40 space-y-1.5 overflow-y-auto pr-1">
                  {info.videos.map((v) => {
                    const active = v.path === current;
                    const isUpload = v.name.startsWith("upload_");
                    return (
                      <div
                        key={v.path}
                        role="button"
                        tabIndex={0}
                        onClick={() => !deleteVideoBusy && apply(v.path)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !deleteVideoBusy) {
                            e.preventDefault();
                            apply(v.path);
                          }
                        }}
                        title={v.path}
                        className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border p-2.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                          active
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                            : "border-border bg-card/60 text-foreground hover:border-amber-500/40 hover:bg-card"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {v.path === "0" ? (
                            <Webcam className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <Video className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <span className="truncate font-medium">{v.name}</span>
                          {isUpload ? (
                            <Badge
                              variant="outline"
                              className="shrink-0 border-violet-900 bg-violet-950/60 px-1.5 py-0 text-[9px] font-semibold uppercase text-violet-400"
                            >
                              {t.videoUnggahan}
                            </Badge>
                          ) : null}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                          {v.size_mb > 0 ? `${v.size_mb} MB` : ""}
                          {isUpload ? (
                            <button
                              type="button"
                              aria-label={`${t.hapusVideo}: ${v.name}`}
                              title={t.hapusVideo}
                              disabled={deleteVideoBusy || active}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteVideoName(v.name);
                              }}
                              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-red-950/60 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          {active ? <Check className="h-3.5 w-3.5 text-amber-400" /> : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Custom source */}
            <div className="space-y-1.5">
              <label
                htmlFor="cam-source"
                className="text-xs font-medium text-muted-foreground"
              >
                {t.sumberKustom}
              </label>
              <div className="flex gap-2">
                <Input
                  id="cam-source"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder={t.sumberKustomPh}
                  spellCheck={false}
                  className="flex-1 border-border bg-background font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:ring-amber-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !applying) apply(custom);
                  }}
                />
                <Button
                  onClick={() => apply(custom)}
                  disabled={applying || !custom.trim()}
                  className="h-9 shrink-0 bg-amber-500 px-3 font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
                >
                  {applying ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      {t.menerapkanSumber}
                    </>
                  ) : (
                    t.terapkanSumber
                  )}
                </Button>
              </div>
              {/* Tes koneksi (ronde 9): periksa sumber sebelum diterapkan */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void runTest()}
                  disabled={testing || !custom.trim()}
                  title={t.kameraTesHint}
                  className="h-7 gap-1.5 border-border bg-card px-2.5 text-[11px] font-medium text-muted-foreground hover:border-sky-500/50 hover:bg-muted hover:text-sky-400 disabled:opacity-50"
                >
                  {testing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <PlugZap className="h-3 w-3" />
                  )}
                  {testing ? t.kameraTesMenguji : t.kameraTes}
                </Button>
                {testResult ? (
                  <span
                    role="status"
                    className={`inline-flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                      testResult.ok
                        ? "border-emerald-900 bg-emerald-950 text-emerald-400"
                        : "border-red-900 bg-red-950 text-red-400"
                    }`}
                  >
                    {testResult.ok ? (
                      <ShieldCheck className="h-3 w-3 shrink-0" />
                    ) : (
                      <ShieldX className="h-3 w-3 shrink-0" />
                    )}
                    <span className="truncate">
                      {testResult.ok
                        ? `${t.kameraTesOk} · ${testResult.width}×${testResult.height} · ${Math.round(testResult.fps)} fps · ${testResult.elapsed_ms} ms`
                        : testResult.error || t.kameraTesGagal}
                    </span>
                  </span>
                ) : (
                  <span className="truncate text-[10px] text-muted-foreground">{t.kameraTesHint}</span>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t.sumberKameraDesc}
              </p>
            </div>
          </div>
        )}

        {/* Konfirmasi hapus preset */}
        <AlertDialog
          open={deletePresetName !== null}
          onOpenChange={(o) => !o && setDeletePresetName(null)}
        >
          <AlertDialogContent className="border-border bg-background text-foreground">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-red-500" />
                {t.presetHapusKonfirmasi}
              </AlertDialogTitle>
              <AlertDialogDescription>
                <span className="block font-mono text-xs text-sky-300/90">{deletePresetName}</span>
                {t.presetHapusDesc}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={presetBusy}
                className="border-border bg-card text-foreground hover:bg-muted hover:text-foreground"
              >
                {t.batalkan}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={presetBusy}
                onClick={(e) => {
                  e.preventDefault();
                  if (deletePresetName) void removePreset(deletePresetName);
                }}
                className="bg-red-600 font-semibold text-white hover:bg-red-700"
              >
                {presetBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                {presetBusy ? t.menghapus : t.yaHapus}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Konfirmasi hapus video unggahan */}
        <AlertDialog
          open={deleteVideoName !== null}
          onOpenChange={(o) => !o && setDeleteVideoName(null)}
        >
          <AlertDialogContent className="border-border bg-background text-foreground">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-red-500" />
                {t.hapusVideoKonfirmasi}
              </AlertDialogTitle>
              <AlertDialogDescription>
                <span className="block font-mono text-xs text-amber-300/90">
                  {deleteVideoName}
                </span>
                {t.hapusVideoDesc}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={deleteVideoBusy}
                className="border-border bg-card text-foreground hover:bg-muted hover:text-foreground"
              >
                {t.batalkan}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={deleteVideoBusy}
                onClick={(e) => {
                  e.preventDefault();
                  void handleDeleteVideo();
                }}
                className="bg-red-600 font-semibold text-white hover:bg-red-700"
              >
                {deleteVideoBusy ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                {deleteVideoBusy ? t.menghapus : t.yaHapus}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
