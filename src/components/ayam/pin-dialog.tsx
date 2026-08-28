"use client";

/**
 * Operator PIN dialogs:
 * - PinGateDialog    : gate saat aksi terproteksi dipanggil tanpa PIN valid
 * - PinManagerDialog : kelola PIN (aktif/nonaktif + ganti PIN) dari header
 *
 * PIN disimpan di sessionStorage per-tab (aman untuk terminal bersama) dan
 * otomatis dilampirkan api.ts ke setiap request mutasi (X-Operator-Pin).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  KeyRound,
  Loader2,
  ShieldCheck,
  ShieldOff,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

import {
  ayamApi,
  getStoredPin,
  setStoredPin,
  clearStoredPin,
  type PinStatus,
} from "@/lib/ayam/api";
import type { Dict } from "@/lib/ayam/i18n";

// =====================================================
// GATE DIALOG
// =====================================================

export function PinGateDialog({
  open,
  onOpenChange,
  onSuccess,
  t,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess: () => void;
  t: Dict;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset tiap kali dialog dibuka
  useEffect(() => {
    if (open) {
      setPin("");
      setError(false);
      const id = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(id);
    }
  }, [open]);

  const submit = useCallback(async () => {
    if (!pin.trim() || busy) return;
    setBusy(true);
    setError(false);
    try {
      await ayamApi.verifyPin(pin.trim());
      setStoredPin(pin.trim());
      toast.success(t.pinBerhasilDibuka);
      // PENTING: onSuccess dulu (menangkap aksi tertunda sebelum di-null-kan
      // oleh onOpenChange(false) di parent), baru tutup dialog.
      onSuccess();
      onOpenChange(false);
    } catch {
      setError(true);
      setPin("");
      toast.error(t.pinSalah);
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }, [pin, busy, t, onOpenChange, onSuccess]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-amber-900/60 bg-zinc-950 text-zinc-100 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
              <KeyRound className="h-4 w-4" />
            </span>
            {t.pinGateTitle}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {t.pinGateDesc}
          </DialogDescription>
        </DialogHeader>

        <motion.div
          animate={error ? { x: [0, -7, 7, -5, 5, 0] } : { x: 0 }}
          transition={{ duration: 0.36 }}
          className="space-y-1.5"
        >
          <Label htmlFor="pin-gate-input" className="text-zinc-400">
            {t.pinLabel}
          </Label>
          <Input
            ref={inputRef}
            id="pin-gate-input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, "").slice(0, 8));
              setError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            aria-invalid={error}
            placeholder="••••"
            className={`border-zinc-800 bg-zinc-900 text-center font-mono text-xl tracking-[0.5em] text-zinc-100 placeholder:text-zinc-700 focus-visible:ring-amber-500 ${
              error ? "border-red-500/60" : ""
            }`}
          />
          {error ? (
            <p className="flex items-center gap-1 text-[11px] text-red-400">
              <TriangleAlert className="h-3 w-3" /> {t.pinSalah}
            </p>
          ) : null}
        </motion.div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-zinc-800 bg-transparent text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
          >
            {t.batalkan}
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={busy || pin.length < 4}
            className="bg-amber-500 font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t.pinMembuka}
              </>
            ) : (
              <>
                <ShieldCheck className="mr-2 h-4 w-4" />
                {t.pinBuka}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================
// MANAGER DIALOG (trigger dari header)
// =====================================================

export function PinManagerDialog({ t }: { t: Dict }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<PinStatus | null>(null);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await ayamApi.getPinStatus();
      setStatus(s);
      setEnabled(s.enabled);
      // Prefill PIN tersimpan di tab ini agar operator tak mengetik dua kali
      setCurrentPin(getStoredPin());
    } catch {
      /* backend offline — biarkan null */
    }
  }, []);

  useEffect(() => {
    if (open) void refreshStatus();
  }, [open, refreshStatus]);

  const save = useCallback(
    async (patch: { new_pin?: string; enabled?: boolean }) => {
      const cur = currentPin.trim();
      if (!cur) {
        toast.error(t.pinGagal, { description: t.pinSaatIni });
        return;
      }
      setBusy(true);
      try {
        const res = await ayamApi.updatePin({
          current_pin: cur,
          ...patch,
        });
        setEnabled(res.enabled);
        setStatus((s) => (s ? { ...s, enabled: res.enabled } : s));
        if (patch.new_pin) {
          setStoredPin(patch.new_pin);
          setCurrentPin(patch.new_pin);
          setNewPin("");
        }
        toast.success(t.pinTersimpan);
      } catch (e) {
        if (e instanceof Error && e.message.includes("403")) {
          toast.error(t.pinSalah);
        } else if (e instanceof Error && e.message.includes("400")) {
          toast.error(t.pinGagal, { description: t.pinLabel });
        } else {
          toast.error(t.pinGagal);
        }
      } finally {
        setBusy(false);
      }
    },
    [currentPin, t]
  );

  const toggleEnabled = useCallback(
    async (v: boolean) => {
      if (v) {
        // Mengaktifkan cukup simpan enabled=true (PIN tetap yang lama)
        await save({ enabled: true });
      } else {
        await save({ enabled: false });
      }
    },
    [save]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={t.pinKelola}
          title={t.pinKelola}
          className={`h-9 w-9 border-zinc-800 bg-zinc-900 transition-colors ${
            status?.enabled
              ? "border-emerald-900 text-emerald-400 hover:bg-zinc-800 hover:text-emerald-300"
              : "text-zinc-400 hover:border-amber-500/50 hover:bg-zinc-800 hover:text-amber-400"
          }`}
        >
          {status?.enabled ? (
            <ShieldCheck className="h-4 w-4" />
          ) : (
            <ShieldOff className="h-4 w-4" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            {t.pinProteksi}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {t.pinProteksiDesc}
          </DialogDescription>
        </DialogHeader>

        {/* Status aktif */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold">
              {status ? (
                <Badge
                  variant="outline"
                  className={`px-1.5 py-0 text-[10px] font-semibold uppercase ${
                    enabled
                      ? "border-emerald-900 bg-emerald-950 text-emerald-400"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400"
                  }`}
                >
                  {enabled ? t.pinAktif : t.pinNonaktif}
                </Badge>
              ) : (
                <Skeleton1 />
              )}
            </p>
            {status?.enabled && status.is_default ? (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-400">
                <TriangleAlert className="h-3 w-3" /> {t.pinStatusDefault}
              </p>
            ) : null}
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => void toggleEnabled(v)}
            disabled={busy || !currentPin}
            aria-label={enabled ? t.pinNonaktifkanP : t.pinAktifkan}
          />
        </div>

        <Separator className="bg-zinc-800" />

        {/* Ganti PIN */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            {t.pinUbah}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pin-cur" className="text-zinc-400">
                {t.pinSaatIni}
              </Label>
              <Input
                id="pin-cur"
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={currentPin}
                onChange={(e) =>
                  setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 8))
                }
                placeholder="••••"
                className="border-zinc-800 bg-zinc-900 font-mono tracking-widest text-zinc-100 placeholder:text-zinc-700 focus-visible:ring-amber-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pin-new" className="text-zinc-400">
                {t.pinBaru}
              </Label>
              <Input
                id="pin-new"
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={newPin}
                onChange={(e) =>
                  setNewPin(e.target.value.replace(/\D/g, "").slice(0, 8))
                }
                placeholder={t.pinBaruPh}
                className="border-zinc-800 bg-zinc-900 font-mono tracking-widest text-zinc-100 placeholder:font-sans placeholder:tracking-normal placeholder:text-zinc-600 focus-visible:ring-amber-500"
              />
            </div>
          </div>
          <Button
            onClick={() => void save({ new_pin: newPin.trim() })}
            disabled={busy || currentPin.length < 4 || newPin.trim().length < 4}
            variant="outline"
            className="w-full border-zinc-800 bg-zinc-900 text-zinc-200 hover:border-amber-500/50 hover:bg-amber-500 hover:text-zinc-950 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="mr-2 h-4 w-4" />
            )}
            {t.pinUbah}
          </Button>
        </div>

        <p className="text-[11px] leading-relaxed text-zinc-600">
          {t.pinKeamananInfo}
        </p>
      </DialogContent>
    </Dialog>
  );
}

function Skeleton1() {
  return <span className="inline-block h-5 w-16 animate-pulse rounded bg-zinc-800" />;
}
