import type { NextConfig } from "next";

/**
 * Fallback proxy: request yang membawa query `XTransformPort=5000` (dipakai
 * API client dashboard) diteruskan langsung ke Flask backend :5000.
 *
 * Lewat preview gateway (Caddy :81) routing XTransformPort sudah ditangani
 * gateway, sehingga rewrite ini tidak pernah aktif. Rewrite ini membuat
 * dashboard tetap hidup bila halaman dibuka langsung dari port Next.js
 * (mis. http://localhost:3000) — tanpa ini semua fetch backend 404 dan UI
 * jatuh ke kondisi "Offline" palsu.
 *
 * Catatan: /api/ayam-backend sengaja TIDAK masuk daftar — itu route Next.js
 * manager (health/spawn backend).
 */
const FLASK_PROXY_ROUTES: Array<[string, string]> = [
  ["/api/stats", "/api/stats"],
  ["/api/device", "/api/device"],
  ["/api/settings", "/api/settings"],
  ["/api/timeline", "/api/timeline"],
  ["/api/history", "/api/history"],
  ["/api/history/:path*", "/api/history/:path*"],
  ["/api/exports", "/api/exports"],
  ["/api/session/:path*", "/api/session/:path*"],
  ["/api/reset", "/api/reset"],
  ["/api/download/:path*", "/api/download/:path*"],
  ["/api/camera-source", "/api/camera-source"],
  ["/api/camera-source/:path*", "/api/camera-source/:path*"],
  ["/api/count/adjust", "/api/count/adjust"],
  ["/api/report/:path*", "/api/report/:path*"],
  ["/api/audit", "/api/audit"],
  ["/api/audit/:path*", "/api/audit/:path*"],
  ["/api/target", "/api/target"],
  ["/api/target/history", "/api/target/history"],
  ["/api/camera/test", "/api/camera/test"],
  ["/api/camera-presets", "/api/camera-presets"],
  ["/api/pin", "/api/pin"],
  ["/api/pin/:path*", "/api/pin/:path*"],
  ["/video_feed", "/video_feed"],
  ["/socket.io/", "/socket.io/"],
  ["/socket.io/:path*", "/socket.io/:path*"],
];

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // FIX: tanpa ini Next.js me-redirect 308 `/socket.io/` → `/socket.io`
  // (tanpa trailing slash) SEBELUM rewrite jalan → Flask-SocketIO balas 404
  // dan dashboard yang dibuka langsung dari port :3000 tak pernah dapat
  // koneksi realtime (selalu fallback "Polling").
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return {
      beforeFiles: FLASK_PROXY_ROUTES.map(([source, destination]) => ({
        source,
        has: [{ type: "query", key: "XTransformPort", value: "5000" }],
        destination: `http://127.0.0.1:5000${destination}`,
      })),
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
