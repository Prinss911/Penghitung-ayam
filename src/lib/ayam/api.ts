/**
 * API client untuk backend Ayam Counter (Flask, port 5000)
 * Semua request relative + query XTransformPort agar diteruskan Caddy gateway.
 */

export const BACKEND_PORT = "5000";

/** Bungkus path dengan query XTransformPort */
export function bp(path: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}XTransformPort=${BACKEND_PORT}`;
}

// =====================================================
// TYPES
// =====================================================

export interface Stats {
  count: number;
  speed: number;
  tracks: number;
  timestamp?: number;
  session_active: boolean;
  session_data: {
    asal_ayam: string;
    tanggal: string;
    jam: string;
    keterangan: string;
  };
  method: string;
  is_processing?: boolean;
  frame?: number;
}

export interface DeviceInfo {
  backend: string;
  device: string;
  vendor: string;
  gpu_type: string | null;
  vram_gb: number | null;
  precision: string;
  reason: string;
  verified: boolean;
  model_path: string;
  model_loaded: boolean;
  confidence: number;
  camera_source: string;
  camera_connected: boolean;
  camera_fps: number;
  camera_resolution: string;
  count_line_x: number;
  zone_width: number;
}

export interface ExportFile {
  name: string;
  size: number;
  size_kb: number;
  modified: number;
  modified_str: string;
}

export interface HistoryItem {
  id: number;
  asal_ayam: string;
  tanggal: string;
  jam: string;
  total_count: number;
  start_time: string;
  end_time: string;
  keterangan?: string;
  file_name?: string;
}

export interface HistoryResponse {
  history: HistoryItem[];
  stats: { total_sessions: number; total_count: number };
  error?: string;
}

export interface SessionDetail extends HistoryItem {
  keterangan: string;
  file_name: string;
}

export interface RuntimeSettings {
  confidence: number;
  count_line_x: number;
  zone_width: number;
  camera_fps: number;
  count_line_config: number;
  zone_width_config: number;
}

export interface TimelinePoint {
  t: number;
  total: number;
}

export interface TimelineResponse {
  points: TimelinePoint[];
  total: number;
  active: boolean;
  session?: Stats["session_data"];
  error?: string;
}

// =====================================================
// API FUNCTIONS
// =====================================================

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${url}`);
  }
  return res.json() as Promise<T>;
}

export const ayamApi = {
  getStats: () => jsonFetch<Stats>(bp("/api/stats")),

  getDevice: () => jsonFetch<DeviceInfo>(bp("/api/device")),

  getHistory: () => jsonFetch<HistoryResponse>(bp("/api/history")),

  getExports: () => jsonFetch<ExportFile[]>(bp("/api/exports")),

  startSession: (data: {
    asal_ayam: string;
    tanggal: string;
    jam: string;
    keterangan: string;
  }) =>
    jsonFetch<{ status: string; session: Stats["session_data"] }>(
      bp("/api/session/start"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }
    ),

  stopSession: () =>
    jsonFetch<{ status: string; file: string | null }>(bp("/api/session/stop"), {
      method: "POST",
    }),

  resetCounter: () =>
    jsonFetch<{ count: number; status: string }>(bp("/api/reset"), {
      method: "POST",
    }),

  getSettings: () => jsonFetch<RuntimeSettings>(bp("/api/settings")),

  updateSettings: (data: {
    confidence?: number;
    count_line_x?: number;
    zone_width?: number;
  }) =>
    jsonFetch<{ status: string; applied: Record<string, number> }>(
      bp("/api/settings"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }
    ),

  getTimeline: () => jsonFetch<TimelineResponse>(bp("/api/timeline")),

  /** Detail satu sesi riwayat */
  getSessionDetail: (id: number) =>
    jsonFetch<SessionDetail>(bp(`/api/history/${id}`)),

  /** Hapus sesi riwayat (+ file Excel terkait di backend) */
  deleteSession: (id: number) =>
    jsonFetch<{ status: string; id: number; file_removed: boolean }>(
      bp(`/api/history/${id}`),
      { method: "DELETE" }
    ),

  /** Cek kesehatan backend via Next.js manager */
  backendHealth: () =>
    jsonFetch<{ healthy: boolean; port: number }>("/api/ayam-backend"),

  /** Minta Next.js manager menyalakan backend bila mati (self-healing) */
  ensureBackend: () =>
    jsonFetch<{ status: string; healthy: boolean }>("/api/ayam-backend", {
      method: "POST",
    }),

  /** URL gambar MJPEG video feed */
  videoFeedUrl: () => bp("/video_feed"),

  /** URL unduh file Excel export */
  downloadUrl: (filename: string) => bp(`/api/download/${encodeURIComponent(filename)}`),

  /** URL unduh versi CSV dari file Excel export */
  csvUrl: (filename: string) =>
    bp(`/api/download/csv/${encodeURIComponent(filename)}`),
};
