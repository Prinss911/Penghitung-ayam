"use client";

/**
 * CameraSourceDialog — ganti sumber kamera runtime tanpa restart backend:
 * - Pilih dari video demo yang tersedia di server
 * - Isi URL RTSP / path file video / "0" untuk webcam
 * Pergantian diterapkan asinkron oleh capture thread (lihat /api/camera-source).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CloudUpload, Loader2, RadioTower, Trash2, Video, Webcam } from "lucide-react";
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
import { ayamApi, type CameraSourceInfo } from "@/lib/ayam/api";
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await ayamApi.getCameraSource();
      setInfo(s);
      setCustom(s.source === "0" ? "0" : s.source);
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

  const handleDeleteVideo = useCallback(async () => {
    if (!deleteVideoName) return;
    setDeleteVideoBusy(true);
    try {
      const res = await ayamApi.deleteCameraVideo(deleteVideoName);
      toast.success(t.videoDihapus, { description: res.deleted });
      setDeleteVideoName(null);
      await load();
    } catch (e) {
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
          className="h-8 gap-1.5 border-zinc-800 bg-zinc-900 px-2.5 text-xs text-zinc-400 hover:border-amber-500/50 hover:bg-zinc-800 hover:text-amber-400"
        >
          <Video className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t.gantiSumber}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
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
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {t.sumberSaatIni}
              </p>
              <p className="mt-1 truncate font-mono text-xs text-zinc-200" title={current}>
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
                  {info?.connected ? "✓ connected" : "disconnected"}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-zinc-800 px-1.5 py-0 text-[10px] text-zinc-400"
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
                    className="border-zinc-800 px-1.5 py-0 text-[10px] text-zinc-400"
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

            {/* Upload zone */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-400">{t.unggahVideo}</p>
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
                    : "border-zinc-700 bg-zinc-900/40 hover:border-amber-500/50 hover:bg-zinc-900"
                } ${uploading ? "pointer-events-none opacity-70" : ""}`}
              >
                {uploading ? (
                  <>
                    <CloudUpload className="h-6 w-6 animate-pulse text-amber-400" />
                    <p className="text-xs font-semibold text-amber-300">
                      {t.mengunggah}… {uploadPct}%
                    </p>
                    <div
                      className="mt-1 h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-zinc-800"
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
                    <CloudUpload className="h-6 w-6 text-zinc-500 transition-colors group-hover:text-amber-400" />
                    <p className="text-xs font-medium text-zinc-300">{t.jatuhkanVideo}</p>
                    <p className="text-[11px] text-zinc-500">
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
                <p className="text-xs font-medium text-zinc-400">{t.pilihVideoDemo}</p>
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
                            : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-amber-500/40 hover:bg-zinc-900"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {v.path === "0" ? (
                            <Webcam className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                          ) : (
                            <Video className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
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
                        <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-zinc-500">
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
                              className="rounded-md p-1 text-zinc-600 transition-colors hover:bg-red-950/60 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
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
                className="text-xs font-medium text-zinc-400"
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
                  className="flex-1 border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-amber-500"
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
              <p className="text-[11px] leading-relaxed text-zinc-500">
                {t.sumberKameraDesc}
              </p>
            </div>
          </div>
        )}

        {/* Konfirmasi hapus video unggahan */}
        <AlertDialog
          open={deleteVideoName !== null}
          onOpenChange={(o) => !o && setDeleteVideoName(null)}
        >
          <AlertDialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
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
                className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
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
