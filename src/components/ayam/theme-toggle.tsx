"use client";

/**
 * ThemeToggle — ganti mode gelap/terang.
 * Tema disimpan di localStorage ("ayam-theme") dan diterapkan sebagai
 * class `light` pada <html> (lihat script no-flash di layout.tsx).
 */

import { useCallback, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Dict } from "@/lib/ayam/i18n";

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
    document.documentElement.classList.toggle("light", next);
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
      className="relative h-9 w-9 overflow-hidden border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-amber-500/50 hover:bg-zinc-800 hover:text-amber-400"
    >
      {light ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Sun className="h-4 w-4" />
      )}
    </Button>
  );
}
