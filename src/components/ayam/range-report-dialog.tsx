"use client";

/**
 * Dialog Laporan Rentang Tanggal (PDF mingguan/bulanan).
 * Preset cepat: 7 hari, 30 hari, bulan ini — lalu unduh via <a> klik.
 */

import { useCallback, useEffect, useState } from "react";
import { CalendarRange, Download, Loader2 } from "lucide-react";

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
import { toast } from "sonner";

import { ayamApi } from "@/lib/ayam/api";
import type { Dict } from "@/lib/ayam/i18n";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function fmt(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function RangeReportDialog({ t, lang }: { t: Dict; lang: string }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);

  // Default: 7 hari terakhir (client only)
  useEffect(() => {
    if (open && !from && !to) {
      const now = new Date();
      const prev = new Date(now);
      prev.setDate(now.getDate() - 6);
      setFrom(fmt(prev));
      setTo(fmt(now));
    }
  }, [open, from, to]);

  const applyPreset = useCallback((days: number) => {
    const now = new Date();
    const prev = new Date(now);
    prev.setDate(now.getDate() - (days - 1));
    setFrom(fmt(prev));
    setTo(fmt(now));
  }, []);

  const applyThisMonth = useCallback(() => {
    const now = new Date();
    setFrom(fmt(new Date(now.getFullYear(), now.getMonth(), 1)));
    setTo(fmt(now));
  }, []);

  const generate = useCallback(() => {
    if (!from || !to) {
      toast.error(t.rentangTidakValid);
      return;
    }
    if (from > to) {
      toast.error(t.rentangTidakValid);
      return;
    }
    setBusy(true);
    try {
      // Unduh via anchor sementara (GET → PDF attachment)
      const a = document.createElement("a");
      a.href = ayamApi.rangeReportUrl(from, to);
      a.download = `laporan_rentang_${from}_${to}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(t.laporanDibuat, { description: `${from} → ${to}` });
      setOpen(false);
    } catch {
      toast.error(t.gagalLaporan);
    } finally {
      setBusy(false);
    }
  }, [from, to, t]);

  const invalid = from.length === 10 && to.length === 10 && from > to;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          title={t.laporanRentangPh}
          aria-label={t.laporanRentang}
          className="h-9 border-violet-900/70 bg-violet-950/40 px-2.5 text-xs font-semibold text-violet-300 transition-all hover:-translate-y-px hover:border-violet-500/60 hover:bg-violet-900/50 hover:text-violet-200"
        >
          <CalendarRange className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">{t.laporanRentang}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-violet-400" />
            {t.laporanRentang}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {t.laporanRentangPh}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rr-from" className="text-zinc-400">
              {t.dariTanggal}
            </Label>
            <Input
              id="rr-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-invalid={invalid}
              className={`border-zinc-800 bg-zinc-900 text-zinc-100 focus-visible:ring-violet-500 ${
                invalid ? "border-red-500/60" : ""
              }`}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rr-to" className="text-zinc-400">
              {t.sampaiTanggal}
            </Label>
            <Input
              id="rr-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-invalid={invalid}
              className={`border-zinc-800 bg-zinc-900 text-zinc-100 focus-visible:ring-violet-500 ${
                invalid ? "border-red-500/60" : ""
              }`}
            />
          </div>
        </div>

        {invalid ? (
          <p className="text-[11px] text-red-400">{t.rentangTidakValid}</p>
        ) : null}

        {/* Preset cepat */}
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: lang === "id" ? "7 hari" : "7 days", fn: () => applyPreset(7) },
            { label: lang === "id" ? "14 hari" : "14 days", fn: () => applyPreset(14) },
            { label: lang === "id" ? "30 hari" : "30 days", fn: () => applyPreset(30) },
            { label: lang === "id" ? "Bulan ini" : "This month", fn: applyThisMonth },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={p.fn}
              className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:border-violet-500/50 hover:bg-violet-950/60 hover:text-violet-300"
            >
              {p.label}
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            className="border-zinc-800 bg-transparent text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
          >
            {t.batalkan}
          </Button>
          <Button
            onClick={generate}
            disabled={busy || invalid || !from || !to}
            className="bg-violet-600 font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {t.buatLaporan}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
