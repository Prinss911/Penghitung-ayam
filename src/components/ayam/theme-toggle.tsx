"use client";

/**
 * ThemeToggle — ganti mode gelap/terang.
 * Tema disimpan di localStorage ("ayam-theme") dan diterapkan sebagai
 * class EKSKLUSIF pada <html>: `dark` ATAU `light` (tidak pernah keduanya —
 * ronde 9: sebelumnya class 'dark' tertinggal saat pindah ke light sehingga
 * teks putih dari tema gelap jadi tak terlihat di latar terang).
 */

import { useCallback, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Dict } from "@/lib/ayam/i18n";

/** Terapkan tema secara eksklusif: tambah satu class, buang yang lain. */
export function applyThemeClass(light: boolean) {
  const el = document.documentElement;
  el.classList.toggle("light", light);
  el.classList.toggle("dark", !light);
}

export function ThemeToggle({ t }: { t: Dict }) {
  const [light, setLight] = useState(false);

  // Baca tema awal via rAF (client only — hindari hydration mismatch
  // dan setState sinkron dalam effect body)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setLight(document.documentElement.classList.contains("light"));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const apply = useCallback((next: boolean) => {
    setLight(next);
    applyThemeClass(next);
    try {
      window.localStorage.setItem("ayam-theme", next ? "light" : "dark");
    } catch {
      /* abaikan */
    }
  }, []);

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={light ? t.temaGelap : t.temaTerang}
      title={light ? t.temaGelap : t.temaTerang}
      onClick={() => apply(!light)}
      className="relative h-9 w-9 overflow-hidden border-border bg-card text-muted-foreground transition-colors hover:border-amber-500/50 hover:bg-muted hover:text-amber-400 max-sm:h-8 max-sm:w-8"
    >
      {/* ikon cross-fade halus saat berganti tema */}
      <Sun
        className={`absolute h-4 w-4 transition-all duration-300 ${
          light ? "scale-0 -rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"
        }`}
      />
      <Moon
        className={`absolute h-4 w-4 transition-all duration-300 ${
          light ? "scale-100 rotate-0 opacity-100" : "scale-0 rotate-90 opacity-0"
        }`}
      />
    </Button>
  );
}
