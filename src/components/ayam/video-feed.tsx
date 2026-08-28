"use client";

/**
 * VideoFeed — renderer MJPEG berbasis canvas + fetch streaming.
 * Lebih andal daripada <img src=mjpeg> di lingkungan headless/proxy,
 * dan memberi kontrol penuh atas status frame (loading/error/live).
 */

import { useEffect, useRef, useState } from "react";
import { RotateCcw, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";

// Cari pola byte dalam buffer (JPEG SOI/EOI)
function findBytes(haystack: Uint8Array, a: number, b: number, from = 0): number {
  for (let i = from; i < haystack.length - 1; i++) {
    if (haystack[i] === a && haystack[i + 1] === b) return i;
  }
  return -1;
}

interface VideoFeedProps {
  url: string;
  connectingText: string;
  errorTitle: string;
  errorDesc: string;
  retryLabel?: string;
  /** Naikkan nilai ini untuk menyambungkan ulang stream otomatis (mis. saat backend pulih) */
  autoRetryKey?: number;
  /** Label overlay "menyiapkan video" saat sumber diganti (ronde 9);
   *  kosong/undefined = overlay dinonaktifkan */
  switchingLabel?: string;
}

export function VideoFeed({
  url,
  connectingText,
  errorTitle,
  errorDesc,
  retryLabel = "Retry",
  autoRetryKey = 0,
  switchingLabel,
}: VideoFeedProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "error">("connecting");
  const [nonce, setNonce] = useState(0); // untuk retry (re-mount effect)
  // ===== Overlay "menyiapkan video" saat sumber kamera diganti (ronde 9) =====
  const [switching, setSwitching] = useState(false);

  // Dengarkan event global ayam:switching-source (dikirim api.setCameraSource)
  useEffect(() => {
    if (!switchingLabel) return;
    const onSwitch = () => setSwitching(true);
    try {
      window.addEventListener("ayam:switching-source", onSwitch);
      return () =>
        window.removeEventListener("ayam:switching-source", onSwitch);
    } catch {
      /* abaikan */
    }
  }, [switchingLabel]);

  // Overlay hilang saat frame pertama masuk lagi (status live) + failsafe 20 dtk
  useEffect(() => {
    if (status === "live") setSwitching(false);
  }, [status]);
  useEffect(() => {
    if (!switching) return;
    const to = setTimeout(() => setSwitching(false), 20_000);
    return () => clearTimeout(to);
  }, [switching]);

  // Sambungkan ulang otomatis ketika autoRetryKey berubah (backend pulih)
  const firstKey = useRef(true);
  useEffect(() => {
    if (firstKey.current) {
      firstKey.current = false;
      return;
    }
    setNonce((n) => n + 1);
    setStatus("connecting");
  }, [autoRetryKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const controller = new AbortController();
    let running = true;
    let frameCount = 0;

    const run = async () => {
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          cache: "no-store",
          headers: { Accept: "multipart/x-mixed-replace, image/jpeg" },
        });
        if (!res.ok || !res.body) {
          throw new Error(`Stream HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        let buffered = new Uint8Array(0);

        while (running) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value || value.length === 0) continue;

          // Gabungkan buffer + chunk baru
          const merged = new Uint8Array(buffered.length + value.length);
          merged.set(buffered);
          merged.set(value, buffered.length);
          buffered = merged;

          // Ekstrak semua frame JPEG lengkap (SOI 0xFFD8 ... EOI 0xFFD9)
          for (;;) {
            const start = findBytes(buffered, 0xff, 0xd8);
            if (start < 0) {
              buffered = new Uint8Array(0);
              break;
            }
            const end = findBytes(buffered, 0xff, 0xd9, start + 2);
            if (end < 0) {
              if (start > 0) buffered = buffered.slice(start);
              break;
            }
            const jpegBytes = buffered.slice(start, end + 2);
            buffered = buffered.slice(end + 2);
            if (jpegBytes.length < 100) continue;

            const blob = new Blob([jpegBytes as BlobPart], { type: "image/jpeg" });
            const bitmap = await createImageBitmap(blob);
            if (!running) {
              bitmap.close();
              break;
            }
            if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
              canvas.width = bitmap.width;
              canvas.height = bitmap.height;
            }
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close();
            frameCount += 1;
            if (frameCount === 1) setStatus("live");
          }
        }
        // Stream berakhir normal (backend restart dll)
        if (running) setStatus("error");
      } catch {
        if (running) setStatus("error");
      }
    };

    run();

    return () => {
      running = false;
      controller.abort();
    };
  }, [url, nonce]);

  return (
    <div className="relative h-full w-full bg-black">
      <canvas ref={canvasRef} className="h-full w-full object-contain" />

      {/* Overlay pergantian sumber (ronde 9): di atas frame lama, di bawah status */}
      {switching && status === "live" ? (
        <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-3 bg-zinc-950/70 backdrop-blur-[2px]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-400" />
          <p className="text-xs font-medium text-amber-300">{switchingLabel}</p>
        </div>
      ) : null}

      {status === "connecting" ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-zinc-950">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-400" />
          <p className="text-xs text-zinc-500">{connectingText}</p>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-zinc-950 p-6 text-center">
          <VideoOff className="h-10 w-10 text-zinc-600" />
          <div>
            <p className="font-semibold text-zinc-300">{errorTitle}</p>
            <p className="mt-1 text-xs text-zinc-500">{errorDesc}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
            onClick={() => {
              setStatus("connecting");
              setNonce((n) => n + 1);
            }}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            {retryLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
