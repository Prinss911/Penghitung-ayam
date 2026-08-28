import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { promises as fs } from "fs";

/**
 * Backend manager untuk Flask Ayam Counter (port 5000).
 *
 * GET  → health check backend.
 * POST → start backend bila down (spawn detached dari proses Next.js,
 *        sehingga hidup di cgroup utama sandbox dan tidak ikut ter-reap).
 *
 * Dipakai dashboard untuk self-healing: saat stats offline, UI memanggil
 * POST endpoint ini lalu menghubungkan ulang tanpa campur tangan user.
 */

const HEALTH_URL = "http://127.0.0.1:5000/api/device";
const START_SH = "/home/z/my-project/mini-services/ayam-backend/start.sh";
const LOG_FILE = "/home/z/ayam-backend.log";
const PID_FILE = "/tmp/ayam-backend.pid";

async function isHealthy(timeoutMs = 2500): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(HEALTH_URL, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const healthy = await isHealthy();
  return NextResponse.json({ healthy, port: 5000 });
}

export async function POST() {
  if (await isHealthy()) {
    return NextResponse.json({ status: "already-running", healthy: true });
  }

  // Pastikan skrip launcher ada
  try {
    await fs.access(START_SH);
  } catch {
    return NextResponse.json(
      { status: "error", message: `start.sh not found at ${START_SH}` },
      { status: 500 }
    );
  }

  // Spawn terpisah dari request lifecycle — anak dari proses Next.js
  const child = spawn("bash", [START_SH], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: { ...process.env, DEVICE: "auto" },
  });
  child.unref();
  try {
    await fs.writeFile(PID_FILE, String(child.pid ?? ""));
  } catch {
    /* pid file opsional */
  }

  // Tunggu hingga sehat (model YOLO load ~10-25 dtk)
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    if (await isHealthy(2000)) {
      return NextResponse.json({ status: "started", pid: child.pid, healthy: true });
    }
  }
  return NextResponse.json(
    { status: "timeout", pid: child.pid, healthy: false },
    { status: 502 }
  );
}
