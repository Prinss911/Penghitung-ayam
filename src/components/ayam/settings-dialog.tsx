"use client";

/**
 * SettingsDialog — ubah parameter deteksi runtime:
 * confidence threshold, posisi garis hitung, lebar zona.
 * Perubahan langsung aktif di backend + dipersist ke .env.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Settings2, Sparkles } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ayamApi, PinRequiredError, type RuntimeSettings } from "@/lib/ayam/api";
import type { Dict } from "@/lib/ayam/i18n";

interface SettingsDialogProps {
  t: Dict;
  /** Dipanggil setelah pengaturan berhasil diterapkan (untuk refresh kartu Backend) */
  onSaved?: () => void;
}

export function SettingsDialog({ t, onSaved }: SettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conf, setConf] = useState(0.25);
  const [lineX, setLineX] = useState(112);
  const [zone, setZone] = useState(100);
  const [initial, setInitial] = useState<RuntimeSettings | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await ayamApi.getSettings();
      setConf(s.confidence);
      setLineX(s.count_line_x);
      setZone(s.zone_width);
      setInitial(s);
    } catch {
      toast.error(t.gagalSimpan);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const dirty =
    initial !== null &&
    (initial.confidence !== conf ||
      initial.count_line_x !== lineX ||
      initial.zone_width !== zone);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await ayamApi.updateSettings({
        confidence: conf,
        count_line_x: lineX,
        zone_width: zone,
      });
      setInitial({
        confidence: conf,
        count_line_x: lineX,
        zone_width: zone,
        camera_fps: initial?.camera_fps ?? 8,
        count_line_config: lineX,
        zone_width_config: zone,
      });
      toast.success(t.pengaturanTersimpan);
      onSaved?.();
      setOpen(false);
    } catch (e) {
      // Gate PIN sudah dibuka otomatis via event global dari api.ts
      if (!(e instanceof PinRequiredError)) {
        toast.error(t.gagalSimpan);
      }
    } finally {
      setSaving(false);
    }
  }, [conf, lineX, zone, initial, t, onSaved]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={t.bukaPengaturan}
          title={t.bukaPengaturan}
          className="h-9 w-9 border-border bg-card text-muted-foreground hover:border-amber-500/50 hover:bg-muted hover:text-amber-400"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border bg-background text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-amber-400" />
            {t.pengaturan}
          </DialogTitle>
          <DialogDescription>{t.pengaturanDesc}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {/* Confidence */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">
                  {t.confidenceLabel}
                </label>
                <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-xs font-bold text-amber-400 tabular-nums">
                  {(conf * 100).toFixed(0)}%
                </span>
              </div>
              <Slider
                value={[conf * 100]}
                min={5}
                max={95}
                step={5}
                onValueChange={(v) => setConf((v[0] ?? 25) / 100)}
                className="[&_[role=slider]]:border-amber-400 [&_[role=slider]]:bg-background"
                aria-label={t.confidenceLabel}
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t.hintConfidence}
              </p>
            </div>

            {/* Count line X */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">
                  {t.countLineLabel}
                </label>
                <span className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-mono text-xs font-bold text-red-400 tabular-nums">
                  {lineX} px
                </span>
              </div>
              <Slider
                value={[lineX]}
                min={0}
                max={480}
                step={2}
                onValueChange={(v) => setLineX(v[0] ?? 112)}
                className="[&_[role=slider]]:border-red-400 [&_[role=slider]]:bg-background"
                aria-label={t.countLineLabel}
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t.hintCountLine}
              </p>
            </div>

            {/* Zone width */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">
                  {t.zoneLabel}
                </label>
                <span className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 font-mono text-xs font-bold text-yellow-400 tabular-nums">
                  {zone} px
                </span>
              </div>
              <Slider
                value={[zone]}
                min={10}
                max={300}
                step={5}
                onValueChange={(v) => setZone(v[0] ?? 100)}
                className="[&_[role=slider]]:border-yellow-400 [&_[role=slider]]:bg-background"
                aria-label={t.zoneLabel}
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t.hintZone}
              </p>
            </div>

            {dirty ? (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300">
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                {t.pengaturanDesc}
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            className="border-border bg-transparent text-foreground hover:bg-card hover:text-foreground"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading || !dirty}
            className="bg-amber-500 font-semibold text-zinc-950 hover:bg-amber-400"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t.menyimpan}
              </>
            ) : (
              t.simpanPengaturan
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
