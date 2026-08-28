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
  /** Target harian dari backend (0 = tanpa target) — fitur ronde 8 */
  target?: number;
  /** Ringkasan sesi terakhir (tersedia setelah stop, count sudah di-reset backend;
   *  ronde 8: persisten di DB → bertahan setelah restart backend) */
  last_session?: LastSession | null;
}

/** Ringkasan sesi terakhir yang baru dihentikan (fitur ronde 7) */
export interface LastSession {
  asal_ayam: string;
  total: number;
  durasi_detik: number;
  selesai: string;
  file: string;
}

/** Satu baris log aktivitas operator (fitur ronde 7) */
export interface AuditEntry {
  id: number;
  ts: string;
  action: string;
  detail: string;
}

/** Respons log aktivitas + filter/paginasi (ronde 8) */
export interface AuditLogResponse {
  entries: AuditEntry[];
  /** Total entri yang cocok dgn filter aktif (bukan hanya halaman ini) */
  total: number;
  /** Daftar jenis aksi unik + jumlah kemunculannya (untuk dropdown filter) */
  actions: AuditActionCount[];
}

export interface AuditActionCount {
  action: string;
  n: number;
}

/** Preset sumber kamera tersimpan (fitur ronde 7) */
export interface CameraPreset {
  name: string;
  source: string;
  created: string;
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
  camera_error?: string | null;
  camera_fps: number;
  camera_resolution: string;
  count_line_x: number;
  zone_width: number;
}

export interface DemoVideo {
  path: string;
  name: string;
  size_mb: number;
}

export interface CameraSourceInfo {
  source: string;
  is_stream: boolean;
  is_webcam: boolean;
  connected: boolean;
  error?: string | null;
  fps: number;
  resolution: string;
  videos: DemoVideo[];
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
  /** Snapshot grafik kumulatif sesi (t detik / total) — bila tersimpan */
  timeline?: TimelinePoint[];
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

export interface PinStatus {
  enabled: boolean;
  is_default: boolean;
}

/** Error khusus bila backend mengunci verifikasi PIN (429 too_many_attempts) */
export class PinRateLimitedError extends Error {
  retryAfter: number;
  constructor(retryAfter: number) {
    super(`PIN rate limited (${retryAfter}s)`);
    this.name = "PinRateLimitedError";
    this.retryAfter = retryAfter;
  }
}

// =====================================================
// OPERATOR PIN (sessionStorage per-tab; dikirim otomatis)
// =====================================================

const PIN_KEY = "ayam-pin";

/** Error khusus bila backend meminta PIN (401 pin_required) */
export class PinRequiredError extends Error {
  constructor() {
    super("PIN required");
    this.name = "PinRequiredError";
  }
}

export function getStoredPin(): string {
  try {
    return window.sessionStorage.getItem(PIN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setStoredPin(pin: string) {
  try {
    window.sessionStorage.setItem(PIN_KEY, pin);
  } catch {
    /* abaikan */
  }
}

export function clearStoredPin() {
  try {
    window.sessionStorage.removeItem(PIN_KEY);
  } catch {
    /* abaikan */
  }
}

/** Buka gate PIN secara global (didengarkan di page.tsx) dengan info retry opsional */
export function requestPinUnlock(retryAfter?: number) {
  try {
    window.dispatchEvent(
      new CustomEvent("ayam:pin-required", { detail: { retryAfter } })
    );
  } catch {
    /* abaikan */
  }
}

function pinHeaders(): Record<string, string> {
  const pin = getStoredPin();
  return pin ? { "X-Operator-Pin": pin } : {};
}

/** Parse response JSON aman (body mungkin bukan JSON) */
async function safeJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// =====================================================
// API FUNCTIONS
// =====================================================

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { ...pinHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    // Backend meminta PIN operator → lempar error khusus + buka gate global
    if (res.status === 401) {
      const body = await safeJson(res);
      if (body && body["error"] === "pin_required") {
        requestPinUnlock();
        throw new PinRequiredError();
      }
    }
    throw new Error(`HTTP ${res.status} on ${url}`);
  }
  return res.json() as Promise<T>;
}

export const ayamApi = {
  getStats: () => jsonFetch<Stats>(bp("/api/stats")),


  /** Log aktivitas operator (terbaru dulu) + filter aksi + paginasi (ronde 8) */
  getAuditLog: (limit = 50, offset = 0, action?: string) => {
    const q = new URLSearchParams({
      limit: String(Math.min(500, Math.max(1, limit))),
      offset: String(Math.max(0, offset)),
    });
    if (action) q.set("action", action);
    return jsonFetch<AuditLogResponse>(bp(`/api/audit?${q.toString()}`));
  },

  /** Unduh log aktivitas sebagai CSV (PIN required di backend).
   *  Fetch blob dgn header PIN lalu simpan via anchor sementara. */
  downloadAuditCsv: async (action?: string) => {
    const q = action ? `?action=${encodeURIComponent(action)}` : "";
    const res = await fetch(bp(`/api/audit/export${q}`), {
      cache: "no-store",
      headers: pinHeaders(),
    });
    if (!res.ok) {
      if (res.status === 401) {
        const body = await safeJson(res);
        if (body && body["error"] === "pin_required") {
          requestPinUnlock();
          throw new PinRequiredError();
        }
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const blob = await res.blob();
    // Ambil filename dari Content-Disposition bila ada
    const cd = res.headers.get("Content-Disposition") ?? "";
    const m = cd.match(/filename\*?=(?:"?)([^";]+)/i);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = m?.[1] ?? "log_aktivitas.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },

  /** Target harian (ronde 8) */
  getTarget: () => jsonFetch<{ target: number }>(bp("/api/target")),

  /** Simpan target harian (PIN required) — 0 berarti tanpa target */
  setTarget: (target: number) =>
    jsonFetch<{ status: string; target: number }>(bp("/api/target"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
    }),

  /** Bersihkan seluruh log aktivitas (PIN required) */
  clearAuditLog: () =>
    jsonFetch<{ status: string; deleted: number }>(bp("/api/audit"), {
      method: "DELETE",
    }),

  /** Daftar preset sumber kamera tersimpan */
  getCameraPresets: () =>
    jsonFetch<{ presets: CameraPreset[] }>(bp("/api/camera-presets")),

  /** Simpan / perbarui preset sumber kamera (upsert by name, PIN required) */
  saveCameraPreset: (name: string, source: string) =>
    jsonFetch<{ status: string; presets: CameraPreset[] }>(
      bp("/api/camera-presets"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, source }),
      }
    ),

  /** Hapus preset sumber kamera (PIN required) */
  deleteCameraPreset: (name: string) =>
    jsonFetch<{ status: string; presets: CameraPreset[] }>(
      bp("/api/camera-presets"),
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }
    ),

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

  /** Info sumber kamera aktif + daftar video demo */
  getCameraSource: () => jsonFetch<CameraSourceInfo>(bp("/api/camera-source")),

  /** Ganti sumber kamera saat runtime (RTSP / file video / webcam) */
  setCameraSource: (source: string) =>
    jsonFetch<{ status: string; source: string }>(bp("/api/camera-source"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    }),

  /** Hapus video hasil unggahan (hanya upload_*) — 400 bila sedang aktif */
  deleteCameraVideo: (name: string) =>
    jsonFetch<{ status: string; deleted: string }>(bp("/api/camera-source/video"), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),

  /** URL unduh laporan harian PDF (tanggal YYYY-MM-DD) */
  dailyReportUrl: (date: string) =>
    bp(`/api/report/daily?date=${encodeURIComponent(date)}`),

  /** URL unduh laporan rentang tanggal PDF (mingguan/bulanan) */
  rangeReportUrl: (from: string, to: string) =>
    bp(`/api/report/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),

  /** Status proteksi PIN backend */
  getPinStatus: () => jsonFetch<PinStatus>(bp("/api/pin")),

  /** Verifikasi PIN (gate) — 401 bila salah, 429 bila terkunci (rate-limit) */
  verifyPin: async (pin: string) => {
    const res = await fetch(bp("/api/pin/verify"), {
      cache: "no-store",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    const body = await safeJson(res);
    if (res.status === 429) {
      const ra = Number(body?.["retry_after"] ?? 5);
      throw new PinRateLimitedError(Number.isFinite(ra) ? ra : 5);
    }
    if (!res.ok) {
      if (res.status === 401 && body && body["error"] === "pin_required") {
        throw new PinRequiredError();
      }
      throw new Error(`HTTP ${res.status}`);
    }
    return body as { valid: boolean };
  },

  /** Ubah PIN dan/atau aktif/nonaktif proteksi (wajib current_pin) */
  updatePin: (data: { current_pin: string; new_pin?: string; enabled?: boolean }) =>
    jsonFetch<{ status: string; enabled: boolean }>(bp("/api/pin"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  /** Unggah video (multipart) → disimpan di server + langsung jadi sumber kamera.
   *  Pakai XHR agar bisa melaporkan progres unggah. */
  uploadCameraVideo: (file: File, onProgress?: (pct: number) => void) =>
    new Promise<{ status: string; source: string; name: string; size_mb: number }>(
      (resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", bp("/api/camera-source/upload"));
        const stored = getStoredPin();
        if (stored) xhr.setRequestHeader("X-Operator-Pin", stored);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300 && data.status === "ok") {
              resolve(data);
            } else if (xhr.status === 401 && data.error === "pin_required") {
              requestPinUnlock();
              reject(new PinRequiredError());
            } else {
              reject(new Error(data.message ?? `HTTP ${xhr.status}`));
            }
          } catch {
            reject(new Error(`HTTP ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        const fd = new FormData();
        fd.append("file", file);
        xhr.send(fd);
      }
    ),

  /** Koreksi manual hitungan (+1 / -1) saat sesi berjalan */
  adjustCount: (delta: 1 | -1) =>
    jsonFetch<{ status: string; count: number; delta: number }>(
      bp("/api/count/adjust"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta }),
      }
    ),

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
