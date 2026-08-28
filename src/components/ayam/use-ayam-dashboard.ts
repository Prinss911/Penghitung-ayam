"use client";

/**
 * Hook utama dashboard Ayam Counter.
 * - Real-time stats via SocketIO (path /socket.io/ + XTransformPort → Caddy → Flask:5000)
 * - Fallback & sinkronisasi berkala via REST polling
 * - Device info, history, exports via REST
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import {
  ayamApi,
  type Stats,
  type DeviceInfo,
  type ExportFile,
  type HistoryResponse,
  type TimelinePoint,
} from "@/lib/ayam/api";

export type ConnMode = "connecting" | "socket" | "polling" | "offline";

const EMPTY_STATS: Stats = {
  count: 0,
  speed: 0,
  tracks: 0,
  session_active: false,
  session_data: { asal_ayam: "", tanggal: "", jam: "", keterangan: "" },
  method: "Simple Counter",
};

const EMPTY_HISTORY: HistoryResponse = {
  history: [],
  stats: { total_sessions: 0, total_count: 0 },
};

export function useAyamDashboard() {
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [history, setHistory] = useState<HistoryResponse>(EMPTY_HISTORY);
  const [exports, setExports] = useState<ExportFile[]>([]);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [connMode, setConnMode] = useState<ConnMode>("connecting");
  const [videoOk, setVideoOk] = useState<boolean | null>(null); // null = belum tahu

  const socketRef = useRef<Socket | null>(null);
  const lastSocketStatsAt = useRef<number>(0);
  const mounted = useRef(true);

  // =====================================================
  // REST polling: sinkronisasi stats + data lainnya
  // =====================================================
  const pollStats = useCallback(async () => {
    try {
      const s = await ayamApi.getStats();
      if (!mounted.current) return;
      // Jangan timpa stats socket yang lebih baru dari 2 detik
      const stale = Date.now() - lastSocketStatsAt.current > 2000;
      if (stale || lastSocketStatsAt.current === 0) {
        setStats(s);
      }
      if (connMode === "connecting" || connMode === "offline") {
        setConnMode((m) => (m === "socket" ? m : "polling"));
      }
    } catch {
      if (!mounted.current) return;
      setConnMode((m) => (m === "socket" ? m : "offline"));
    }
  }, [connMode]);

  const refreshSideData = useCallback(async () => {
    try {
      const [h, e] = await Promise.all([
        ayamApi.getHistory(),
        ayamApi.getExports(),
      ]);
      if (!mounted.current) return;
      setHistory(h);
      setExports(Array.isArray(e) ? e : []);
    } catch {
      /* abaikan */
    }
  }, []);

  const pollTimeline = useCallback(async () => {
    try {
      const tl = await ayamApi.getTimeline();
      if (!mounted.current) return;
      setTimeline(Array.isArray(tl.points) ? tl.points : []);
    } catch {
      /* abaikan — grafik tetap memakai data terakhir */
    }
  }, []);

  // =====================================================
  // SocketIO realtime
  // =====================================================
  useEffect(() => {
    mounted.current = true;

    let socket: Socket | null = null;
    try {
      socket = io("/?XTransformPort=5000", {
        path: "/socket.io/",
        query: { XTransformPort: "5000" },
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        timeout: 8000,
        transports: ["polling", "websocket"],
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        if (!mounted.current) return;
        setConnMode("socket");
        // Minta stats terkini begitu tersambung
        socket?.emit("get_stats");
      });

      socket.on("update_stats", (data: Stats) => {
        if (!mounted.current) return;
        lastSocketStatsAt.current = Date.now();
        setStats(data);
      });

      socket.on("file_saved", () => {
        // File Excel baru tersimpan → refresh daftar & riwayat
        refreshSideData();
      });

      socket.on("disconnect", () => {
        if (!mounted.current) return;
        setConnMode((m) => (m === "socket" ? "polling" : m));
      });

      socket.on("connect_error", () => {
        if (!mounted.current) return;
        setConnMode((m) => (m === "socket" ? "polling" : m));
      });
    } catch {
      // Pembuatan socket gagal secara sinkron — biarkan interval polling
      // REST yang menentukan mode koneksi (polling/offline).
    }

    return () => {
      mounted.current = false;
      socket?.removeAllListeners();
      socket?.disconnect();
      socketRef.current = null;
    };
  }, []);

  // =====================================================
  // Interval: polling stats + side data
  // =====================================================
  useEffect(() => {
    const t1 = setInterval(pollStats, 2000);
    const t2 = setInterval(refreshSideData, 6000);
    const t3 = setInterval(pollTimeline, 2000);
    // Panggilan awal dijadwalkan agar tidak setState sinkron dalam effect
    const initial = setTimeout(() => {
      pollStats();
      refreshSideData();
      pollTimeline();
    }, 0);
    return () => {
      clearTimeout(initial);
      clearInterval(t1);
      clearInterval(t2);
      clearInterval(t3);
    };
  }, [pollStats, refreshSideData, pollTimeline]);

  // =====================================================
  // Device info (sekali saat mount + retry)
  // =====================================================
  useEffect(() => {
    let attempts = 0;
    const fetchDevice = async () => {
      try {
        const d = await ayamApi.getDevice();
        if (mounted.current) setDevice(d);
      } catch {
        attempts += 1;
        if (attempts < 10 && mounted.current) {
          setTimeout(fetchDevice, 3000);
        }
      }
    };
    fetchDevice();
    const t = setInterval(fetchDevice, 10000);
    return () => clearInterval(t);
  }, []);

  return {
    stats,
    device,
    history,
    exports,
    timeline,
    connMode,
    videoOk,
    setVideoOk,
    refreshSideData,
  };
}
