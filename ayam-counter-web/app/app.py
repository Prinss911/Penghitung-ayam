# app.py
from flask import Flask, render_template, Response, jsonify, request, send_file
from flask_socketio import SocketIO, emit
from werkzeug.utils import secure_filename

import cv2
import numpy as np
import time
import os
import json
import threading
import queue

from datetime import datetime, timedelta

from app.config import Config

from app.services.detector import AyamDetector
from app.services.hybrid_counter import HybridCounter
from app.services.database import Database
from app.services.excel_exporter import ExcelExporter


# =====================================================
# FLASK APP INITIALIZATION
# =====================================================

app = Flask(__name__)
app.config['SECRET_KEY'] = Config.SECRET_KEY

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading"
)

# =====================================================
# MODULE INITIALIZATION
# =====================================================

detector = AyamDetector()
counter = HybridCounter()  # Sekarang menggunakan SimpleCounter
db = Database()
excel_exporter = ExcelExporter()

# =====================================================
# GLOBAL VARIABLES
# =====================================================

is_processing = False
current_count = 0
current_speed = 0
current_tracks = 0
session_active = False
session_data = {
    "asal_ayam": "",
    "tanggal": "",
    "jam": "",
    "keterangan": ""
}

# Queues
frame_queue = queue.Queue(maxsize=2)

# Shared data
latest_frame = None
latest_frame_seq = 0          # Sequence untuk deteksi frame baru (Fix 1)
latest_display_frame = None   # Frame yang sudah digambar overlay (Fix 3)
latest_display_seq = 0
latest_detections = []
frame_lock = threading.Lock()
detection_lock = threading.Lock()

# Thread control
capture_running = True
detection_running = True

# =====================================================
# SESSION BOOKKEEPING (worklog Task 13)
# =====================================================
session_start_ts = None       # epoch saat sesi dimulai (untuk durasi & timeline)
timeline_points = []          # [{t, total}] grafik kumulatif sesi berjalan
timeline_lock = threading.Lock()
last_session = None           # ringkasan sesi terakhir yg selesai (untuk /api/stats)
daily_target = 0              # target harian (0 = tanpa target)
camera_reopen = threading.Event()  # sinyal ganti sumber kamera saat runtime
UPLOAD_DIR = 'uploads'
PRESETS_FILE = 'camera_presets.json'

# =====================================================
# CAMERA THREAD
# =====================================================

def capture_thread():
    """Thread untuk menangkap frame dari camera.

    Mendukung penggantian sumber saat runtime via event `camera_reopen`
    (di-set oleh POST /api/camera-source), retry open yang robust, dan
    throttle playback untuk sumber file video (worklog Task 13).
    """
    global latest_frame, latest_frame_seq

    print("[CAPTURE] Started")

    # Try different backends for camera capture
    # Priority order for Windows/local camera:
    # 1. DSHOW - Best for Windows USB/webcam devices
    # 2. FFMPEG - Good fallback for video files/streaming
    # 3. ANY - Last resort
    backends = [
        cv2.CAP_DSHOW,  # Windows DirectShow API (PRIMARY for webcam)
        cv2.CAP_FFMPEG, # FFmpeg backend
        cv2.CAP_ANY     # Auto-detect
    ]

    def open_source(source):
        """Buka sumber video; return (cap, frame_delay). cap=None bila gagal."""
        # Index kamera dari env/.env berbentuk string ("0"/"1") - cast ke int
        # supaya cv2 membacanya sebagai device index, bukan nama file.
        src = int(source) if str(source).isdigit() else source
        cap_ = None
        for backend in backends:
            try:
                cap_ = cv2.VideoCapture(src, backend)
                if cap_.isOpened():
                    backend_name = "DSHOW" if backend == cv2.CAP_DSHOW else ("FFMPEG" if backend == cv2.CAP_FFMPEG else "ANY")
                    print(f"[CAPTURE] Connected with {backend_name} backend")
                    break
            except Exception as e:
                print(f"[CAPTURE] Failed with backend: {e}")
                continue

        if cap_ is None or not cap_.isOpened():
            return None, 0.0

        # Settings for RTSP
        cap_.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        cap_.set(cv2.CAP_PROP_FPS, Config.CAMERA_FPS)
        cap_.set(cv2.CAP_PROP_FRAME_WIDTH, Config.CAMERA_WIDTH)
        cap_.set(cv2.CAP_PROP_FRAME_HEIGHT, Config.CAMERA_HEIGHT)

        print(f"[CAPTURE] Camera opened: {source}")
        print(f"[CAPTURE] Resolution: {Config.CAMERA_WIDTH}x{Config.CAMERA_HEIGHT}")
        print(f"[CAPTURE] FPS: {Config.CAMERA_FPS}")

        # Throttle playback untuk sumber FILE VIDEO (worklog Task 13):
        # OpenCV membaca file secepat mungkin (CAP_PROP_FPS diabaikan untuk
        # file), sehingga video tampak fast-forward. Batasi sesuai FPS asli
        # video. Untuk kamera/RTSP: tanpa throttle (frame hidup).
        delay = 0.0
        if isinstance(source, str) and not str(source).isdigit() and os.path.isfile(source):
            native_fps = cap_.get(cv2.CAP_PROP_FPS)
            if native_fps and native_fps > 0:
                delay = 1.0 / native_fps
                print(f"[CAPTURE] File video terdeteksi ({native_fps:.1f} fps asli) - throttle {delay*1000:.0f}ms/frame")

        return cap_, delay

    cap, frame_delay = open_source(Config.CAMERA_SOURCE)
    while cap is None and capture_running:
        print("[CAPTURE] Camera failed to open, retry dalam 3 detik...")
        time.sleep(3)
        cap, frame_delay = open_source(Config.CAMERA_SOURCE)
    if cap is None:
        print("[CAPTURE] Stopped (tidak pernah berhasil open)")
        return

    while capture_running:
        # Penggantian sumber kamera saat runtime (POST /api/camera-source)
        if camera_reopen.is_set():
            camera_reopen.clear()
            print(f"[CAPTURE] Reopen diminta -> {Config.CAMERA_SOURCE}")
            cap.release()
            time.sleep(0.5)
            cap, frame_delay = open_source(Config.CAMERA_SOURCE)
            while cap is None and capture_running and not camera_reopen.is_set():
                print("[CAPTURE] Reopen gagal, retry dalam 3 detik...")
                time.sleep(3)
                cap, frame_delay = open_source(Config.CAMERA_SOURCE)
            continue

        ret, frame = cap.read()

        if not ret:
            print("[CAPTURE] Failed to read frame, reconnecting...")
            cap.release()
            time.sleep(2)
            cap, frame_delay = open_source(Config.CAMERA_SOURCE)
            while cap is None and capture_running and not camera_reopen.is_set():
                print("[CAPTURE] Reconnect gagal, retry dalam 3 detik...")
                time.sleep(3)
                cap, frame_delay = open_source(Config.CAMERA_SOURCE)
            continue

        if frame_delay > 0:
            time.sleep(frame_delay)

        with frame_lock:
            latest_frame = frame.copy()
            latest_frame_seq += 1

        # ALWAYS process frames for detection
        # This works whether is_processing=True (active counting) or False (idle monitoring)
            try:
                frame_queue.put_nowait(frame)
            except queue.Full:
                # Drop-oldest policy: buang frame terlama, masukkan frame terbaru
                # sehingga queue selalu berisi frame paling baru (akurasi crossing)
                try:
                    frame_queue.get_nowait()
                except queue.Empty:
                    pass
                frame_queue.put_nowait(frame)

    cap.release()
    print("[CAPTURE] Stopped")

# =====================================================
# DETECTION THREAD
# =====================================================

def detection_thread():
    """Thread untuk menjalankan deteksi dan penghitungan"""
    global current_count, current_speed, current_tracks, latest_detections
    global latest_display_frame, latest_display_seq
    
    print("[DETECTION] Started")
    frame_count = 0
    last_emit_time = time.time()
    
    while detection_running:
        try:
            frame = frame_queue.get(timeout=1)
            frame_count += 1
            
            # ============================================
            # DETEKSI
            # ============================================
            detections = detector.detect(frame)
            
            # ============================================
            # HITUNG DENGAN SIMPLE COUNTER
            # ============================================
            count = counter.update(detections)
            
            # Update global variables
            current_count = count
            current_speed = 0  # Tidak ada speed tracking
            current_tracks = len([d for d in detections if d.get("is_chicken", False)])
            
            # ============================================
            # FILTER DETEKSI YANG SUDAH DIHITUNG
            # ============================================
            # Hapus deteksi yang sudah dihitung dari tampilan
            filtered_detections = []
            for d in detections:
                if not d.get("counted", False):
                    filtered_detections.append(d)
            
            # Simpan untuk ditampilkan
            with detection_lock:
                latest_detections = filtered_detections.copy()
            
            # ============================================
            # GAMBAR VISUALISASI PADA FRAME YANG DIDETEKSI
            # ============================================
            # Overlay digambar di sini (frame deteksi + deteksi yang sama),
            # sehingga feed tidak mencampur dua frame berbeda (Fix 3).
            display_frame = draw_visualization(
                frame,
                filtered_detections,
                counter.count_line_x,
                count
            )
            with detection_lock:
                latest_display_frame = display_frame
                latest_display_seq += 1
            
            # ============================================
            # SAVE KE EXCEL
            # ============================================
            if session_active and count > 0:
                # Simpan setiap penambahan count (dedup otomatis oleh exporter)
                for d in detections:
                    if d.get("is_chicken", False):
                        excel_exporter.add_detection_direct(
                            count, 0, d
                        )
                        break
            
            # ============================================
            # EMIT STATS KE CLIENT
            # ============================================
            if time.time() - last_emit_time > 0.3:
                socketio.emit("update_stats", {
                    "count": count,
                    "speed": 0,
                    "tracks": current_tracks,
                    "timestamp": time.time(),
                    "session_active": session_active,
                    "session_data": session_data,
                    "method": "Simple Counter",
                    "frame": frame_count
                })
                last_emit_time = time.time()

            # Rekam titik timeline grafik kumulatif saat sesi berjalan
            # (dipakai GET /api/timeline, worklog Task 13).
            if session_active and session_start_ts is not None:
                t = time.time() - session_start_ts
                with timeline_lock:
                    timeline_points.append({"t": round(t, 1), "total": count})
                    if len(timeline_points) > 30000:
                        del timeline_points[:len(timeline_points) - 30000]
            
        except queue.Empty:
            continue
        except Exception as e:
            print(f"[DETECTION ERROR] {e}")

# =====================================================
# VIDEO FEED GENERATOR
# =====================================================

def draw_visualization(frame, detections, count_line_x, total_count):
    """
    Gambar visualisasi dengan garis di kiri
    """
    height, width = frame.shape[:2]
    
    # ============================================
    # 1. GARIS MERAH DI KIRI (VERTIKAL)
    # ============================================
    cv2.line(frame, (count_line_x, 0), (count_line_x, height), (0, 0, 255), 3)
    
    # Label garis
    cv2.putText(frame, "COUNT LINE", (count_line_x - 60, 30),
               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
    
    # ============================================
    # 2. ZONE DETEKSI (KUNING)
    # ============================================
    zone_start = count_line_x - counter.zone_width // 2
    zone_end = count_line_x + counter.zone_width // 2
    cv2.rectangle(frame, (zone_start, 0), (zone_end, height), (0, 255, 255), 1)
    
    # ============================================
    # 3. GAMBAR DETEKSI
    # ============================================
    for det in detections:
        if det.get("is_chicken", False):
            x1, y1, x2, y2 = det["x1"], det["y1"], det["x2"], det["y2"]
            cx, cy = det["center_x"], det["center_y"]
            conf = det["confidence"]
            
            # Cek apakah sudah dihitung (tidak akan muncul karena sudah difilter)
            if det.get("counted", False):
                color = (0, 255, 0)  # Hijau - sudah dihitung
                label = f"✓ {conf:.2f}"
            else:
                color = (0, 255, 255)  # Kuning - belum dihitung
                label = f"? {conf:.2f}"
            
            # Gambar bounding box
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            
            # Gambar center point
            cv2.circle(frame, (cx, cy), 4, (255, 0, 0), -1)
            
            # Label
            cv2.putText(frame, label, (x1, y1-10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)
    
    # ============================================
    # 4. TOTAL COUNTER
    # ============================================
    cv2.putText(frame, f"TOTAL: {total_count}", (10, 60),
               cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 0), 3)
    
    # ============================================
    # 5. INFORMASI TAMBAHAN
    # ============================================
    # Jumlah ayam yang terdeteksi
    total_detected = len([d for d in detections if d.get("is_chicken", False)])
    
    cv2.putText(frame, f"DETEKSI: {total_detected}", (10, 90),
               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    
    # Status session
    status = "ACTIVE" if session_active else "INACTIVE"
    color = (0, 255, 0) if session_active else (0, 0, 255)
    cv2.putText(frame, f"SESSION: {status}", (10, 120),
               cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
    
    # ============================================
    # 6. PANAH PETUNJUK
    # ============================================
    cv2.putText(frame, "--> COUNT HERE", (count_line_x + 30, height - 20),
               cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1)
    
    return frame

def generate_frames():
    """Generate video frames with overlay (paced, hanya yield frame baru)"""
    frame_count = 0
    last_seq = -1
    last_yield_time = 0.0
    target_interval = 1.0 / max(Config.CAMERA_FPS, 1)

    while True:
        processing = is_processing

        # Saat processing: pakai frame display hasil deteksi (sinkron, Fix 3).
        # Saat idle: pakai frame mentah dari kamera agar feed tetap tampil.
        if processing:
            with detection_lock:
                seq = latest_display_seq
                frame = latest_display_frame.copy() if latest_display_frame is not None else None
        else:
            with frame_lock:
                seq = latest_frame_seq
                frame = latest_frame.copy() if latest_frame is not None else None

        if frame is None:
            time.sleep(0.05)
            continue

        # ============================================
        # PACING: hanya yield jika ada frame baru (seq berubah)
        # ============================================
        # Mencegah encode duplikat frame yang sama (kurangi beban CPU).
        if seq == last_seq:
            time.sleep(0.02)
            continue

        # Pace output ke interval stabil agar tidak burst
        now = time.time()
        wait = target_interval - (now - last_yield_time)
        if wait > 0:
            time.sleep(wait)

        # Baca ulang frame terbaru setelah pacing.
        # Selalu tampilkan frame PALING BARU (tidak skip) agar feed tidak
        # berhenti ketika producer menghasilkan frame secepat target interval.
        if processing:
            with detection_lock:
                seq = latest_display_seq
                frame = latest_display_frame.copy() if latest_display_frame is not None else None
        else:
            with frame_lock:
                seq = latest_frame_seq
                frame = latest_frame.copy() if latest_frame is not None else None
            if frame is not None:
                # Idle: gambar visualisasi tanpa deteksi
                frame = draw_visualization(
                    frame,
                    [],
                    counter.count_line_x,
                    current_count
                )

        if frame is None:
            time.sleep(0.02)
            continue

        last_seq = seq
        last_yield_time = time.time()
        frame_count += 1

        # Frame counter
        height, width = frame.shape[:2]
        cv2.putText(frame, f"FRAME: {frame_count}", (width-150, 30),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        
        # ============================================
        # ENCODE DAN YIELD
        # ============================================
        ret, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        yield (b"--frame\r\n"
               b"Content-Type: image/jpeg\r\n\r\n" +
               buffer.tobytes() +
               b"\r\n")

# =====================================================
# ROUTES
# =====================================================

@app.route("/")
def index():
    """Main page"""
    stats = db.get_daily_stats()
    history = db.get_history(20)
    return render_template(
        "index.html",
        stats=stats,
        history=history
    )

@app.route("/video_feed")
def video_feed():
    """Video streaming endpoint"""
    return Response(
        generate_frames(),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )

@app.route("/api/stats")
def get_stats():
    """Get current statistics"""
    return jsonify({
        "count": current_count,
        "speed": 0,
        "tracks": current_tracks,
        "session_active": session_active,
        "session_data": session_data,
        "method": "Simple Counter",
        "is_processing": is_processing,
        "target": daily_target,
        "last_session": last_session
    })

@app.route("/api/device")
def device_info():
    """Info perangkat & kamera.

    Dipakai dashboard Next.js sebagai health-check dan panel info device.
    Bentuk respons mengikuti interface DeviceInfo di dashboard
    (src/lib/ayam/api.ts): backend, device, vendor, gpu_type, vram_gb,
    precision, reason, verified, model_path, model_loaded, confidence,
    camera_source, camera_connected, camera_error, camera_fps,
    camera_resolution, count_line_x, zone_width.
    """
    hw = getattr(detector, "hardware", None)

    # Kamera dianggap terhubung bila frame masih mengalir.
    # (capture_thread me-reopen sumber video saat EOF/gagal baca,
    # jadi selama sumber valid, latest_frame akan terus terisi.)
    with frame_lock:
        camera_connected = latest_frame is not None

    return jsonify({
        "backend": hw.name if hw else "cpu",
        "device": hw.device_str if hw else "cpu",
        "vendor": hw.vendor if hw else "CPU",
        "gpu_type": hw.gpu_type if hw else None,
        "vram_gb": hw.vram_gb if hw else None,
        "precision": hw.precision if hw else "FP32",
        "reason": hw.reason if hw else "hardware info unavailable",
        "verified": bool(hw.verified) if hw else False,
        "model_path": getattr(detector, "model_path", Config.YOLO_MODEL_PATH),
        "model_loaded": getattr(detector, "model", None) is not None,
        "confidence": Config.CONFIDENCE_THRESHOLD,
        "camera_source": str(Config.CAMERA_SOURCE),
        "camera_connected": camera_connected,
        "camera_error": None,
        "camera_fps": Config.CAMERA_FPS,
        "camera_resolution": f"{Config.CAMERA_WIDTH}x{Config.CAMERA_HEIGHT}",
        "count_line_x": Config.COUNT_LINE_X,
        "zone_width": Config.ZONE_WIDTH,
    })

@app.route("/api/exports")
def list_exports():
    """List exported Excel files"""
    if not os.path.exists('exports'):
        return jsonify([])
    
    files = []
    for f in os.listdir('exports'):
        if f.endswith('.xlsx'):
            file_path = os.path.join('exports', f)
            files.append({
                'name': f,
                'size': os.path.getsize(file_path),
                'size_kb': round(os.path.getsize(file_path) / 1024, 1),
                'modified': os.path.getmtime(file_path),
                'modified_str': datetime.fromtimestamp(
                    os.path.getmtime(file_path)
                ).strftime("%Y-%m-%d %H:%M:%S")
            })
    
    files.sort(key=lambda x: x['modified'], reverse=True)
    return jsonify(files)

@app.route("/api/download/<filename>")
def download_file(filename):
    """Download exported file"""
    # Security: prevent directory traversal
    if '..' in filename or '/' in filename or '\\' in filename:
        return jsonify({"error": "Invalid filename"}), 400
    
    # BUGFIX: send_file resolve path relatif terhadap app.root_path
    # (folder app/), bukan CWD - sehingga 'exports/x.xlsx' gagal.
    file_path = os.path.abspath(os.path.join('exports', filename))
    if os.path.exists(file_path):
        return send_file(file_path, as_attachment=True, download_name=filename)
    return jsonify({"error": "File not found"}), 404

@app.route("/api/session/status")
def session_status():
    """Get session status"""
    return jsonify({
        "active": session_active,
        "data": session_data,
        "count": current_count,
        "speed": current_speed,
        "tracks": current_tracks
    })

# =====================================================
# REST API UNTUK DASHBOARD NEXT.JS (worklog Task 13)
# Endpoint berikut menyamakan backend lama dengan kontrak
# dashboard (src/lib/ayam/api.ts).
# =====================================================

@app.route("/health")
def health():
    return jsonify({"status": "ok"})

@app.route("/api/session/start", methods=["POST"])
def session_start_http():
    """Mulai sesi via HTTP (dashboard)."""
    data = request.get_json(silent=True) or {}
    result, code = _do_start_session(data)
    if code == 200:
        try:
            socketio.emit("processing_status", {"status": "running"})
        except Exception:
            pass
    return jsonify(result), code

@app.route("/api/session/stop", methods=["POST"])
def session_stop_http():
    """Hentikan sesi via HTTP (dashboard)."""
    result, code = _do_stop_session()
    try:
        socketio.emit("processing_status", {"status": "stopped"})
    except Exception:
        pass
    return jsonify(result), code

@app.route("/api/history")
def history():
    """Riwayat sesi + statistik keseluruhan."""
    items = db.get_history(200)
    return jsonify({"history": items, "stats": db.get_totals()})

@app.route("/api/history/<int:session_id>")
def history_detail(session_id):
    """Detail satu sesi (timeline sesi lama tidak disimpan → kosong)."""
    item = db.get_session(session_id)
    if item is None:
        return jsonify({"error": "not_found"}), 404
    item["timeline"] = []
    return jsonify(item)

@app.route("/api/history/<int:session_id>", methods=["DELETE"])
def history_delete(session_id):
    """Hapus sesi + file Excel terkait."""
    item = db.get_session(session_id)
    if item is None:
        return jsonify({"error": "not_found"}), 404
    file_removed = False
    base = os.path.basename(item.get("file_name") or "")
    if base:
        fpath = os.path.abspath(os.path.join('exports', base))
        if os.path.exists(fpath):
            try:
                os.remove(fpath)
                file_removed = True
            except Exception as e:
                print(f"[HISTORY] Gagal hapus file: {e}")
    db.delete_session(session_id)
    return jsonify({"status": "ok", "id": session_id, "file_removed": file_removed})

@app.route("/api/timeline")
def timeline():
    """Grafik kumulatif sesi berjalan."""
    with timeline_lock:
        points = list(timeline_points)
    return jsonify({
        "points": points,
        "total": current_count,
        "active": session_active,
        "session": session_data
    })

@app.route("/api/settings")
def get_settings():
    """Pengaturan runtime aktif."""
    return jsonify({
        "confidence": float(detector.confidence),
        "count_line_x": int(counter.count_line_x),
        "zone_width": int(counter.zone_width),
        "camera_fps": Config.CAMERA_FPS,
        "count_line_config": Config.COUNT_LINE_X,
        "zone_width_config": Config.ZONE_WIDTH
    })

@app.route("/api/settings", methods=["POST"])
def update_settings():
    """Ubah confidence / posisi garis / lebar zona saat runtime."""
    data = request.get_json(silent=True) or {}
    applied = {}
    if "confidence" in data:
        try:
            v = float(data["confidence"])
            detector.confidence = min(max(v, 0.05), 0.95)
            applied["confidence"] = detector.confidence
        except (TypeError, ValueError):
            pass
    if "count_line_x" in data:
        try:
            v = int(data["count_line_x"])
            counter.count_line_x = min(max(v, 10), max(11, Config.CAMERA_WIDTH - 10))
            applied["count_line_x"] = counter.count_line_x
        except (TypeError, ValueError):
            pass
    if "zone_width" in data:
        try:
            v = int(data["zone_width"])
            counter.zone_width = min(max(v, 10), 400)
            applied["zone_width"] = counter.zone_width
        except (TypeError, ValueError):
            pass
    return jsonify({"status": "ok", "applied": applied})

@app.route("/api/count/adjust", methods=["POST"])
def adjust_count():
    """Koreksi manual +1/-1 saat sesi berjalan."""
    global current_count
    data = request.get_json(silent=True) or {}
    try:
        delta = int(data.get("delta", 0))
    except (TypeError, ValueError):
        delta = 0
    if delta not in (-1, 1):
        return jsonify({"error": "invalid_delta"}), 400
    counter.total_count = max(0, counter.total_count + delta)
    current_count = counter.total_count
    return jsonify({"status": "ok", "count": current_count, "delta": delta})

def _list_demo_videos():
    """Daftar video demo (root + folder upload) untuk dialog sumber kamera."""
    videos = []
    seen = set()
    for d in ('.', UPLOAD_DIR):
        if not os.path.isdir(d):
            continue
        for f in os.listdir(d):
            if not f.lower().endswith(('.mp4', '.avi', '.mkv', '.mov')):
                continue
            full = os.path.normpath(os.path.join(d, f))
            if full in seen:
                continue
            seen.add(full)
            rel = f if d == '.' else os.path.join(d, f)
            videos.append({
                "path": rel.replace(os.sep, "/"),
                "name": f,
                "size_mb": round(os.path.getsize(full) / (1024 * 1024), 1)
            })
    videos.sort(key=lambda v: v["name"])
    return videos

@app.route("/api/camera-source")
def camera_source_info():
    """Info sumber kamera aktif + daftar video demo."""
    src_str = str(Config.CAMERA_SOURCE)
    with frame_lock:
        connected = latest_frame is not None
    return jsonify({
        "source": src_str,
        "is_stream": src_str.lower().startswith(("rtsp://", "http://", "https://")),
        "is_webcam": src_str.isdigit(),
        "connected": connected,
        "error": None,
        "fps": Config.CAMERA_FPS,
        "resolution": f"{Config.CAMERA_WIDTH}x{Config.CAMERA_HEIGHT}",
        "videos": _list_demo_videos()
    })

@app.route("/api/camera-source", methods=["POST"])
def set_camera_source():
    """Ganti sumber kamera saat runtime (capture thread reopen via event)."""
    data = request.get_json(silent=True) or {}
    source = str(data.get("source", "")).strip()
    if not source:
        return jsonify({"error": "source_required"}), 400
    Config.CAMERA_SOURCE = int(source) if source.isdigit() else source
    camera_reopen.set()
    return jsonify({"status": "ok", "source": str(Config.CAMERA_SOURCE)})

@app.route("/api/camera/test", methods=["POST"])
def camera_test():
    """Tes koneksi sumber tanpa mengganggu capture aktif."""
    t0 = time.time()
    data = request.get_json(silent=True) or {}
    source = str(data.get("source", "")).strip()
    result = {
        "ok": False, "frames": 0, "width": 0, "height": 0, "fps": 0,
        "source_type": "invalid", "error": None, "elapsed_ms": 0
    }
    if not source:
        result["error"] = "source kosong"
        result["elapsed_ms"] = int((time.time() - t0) * 1000)
        return jsonify(result)

    if source.lower().startswith(("rtsp://", "http://", "https://")):
        result["source_type"] = "rtsp"
        src = source
    elif source.isdigit():
        result["source_type"] = "webcam"
        src = int(source)
    elif os.path.isfile(source):
        result["source_type"] = "file"
        src = source
    else:
        result["error"] = "sumber tidak dikenal / file tidak ada"
        result["elapsed_ms"] = int((time.time() - t0) * 1000)
        return jsonify(result)

    cap = None
    try:
        cap = cv2.VideoCapture(src)
        if not cap.isOpened():
            result["error"] = "gagal membuka sumber"
        else:
            frames = 0
            deadline = time.time() + 5.0
            while frames < 5 and time.time() < deadline:
                ret, _fr = cap.read()
                if not ret:
                    break
                frames += 1
            result["frames"] = frames
            result["width"] = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
            result["height"] = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
            result["fps"] = float(cap.get(cv2.CAP_PROP_FPS) or 0)
            result["ok"] = frames > 0
            if frames == 0:
                result["error"] = "terbuka tapi tidak ada frame"
    except Exception as e:
        result["error"] = str(e)
    finally:
        if cap is not None:
            cap.release()
    result["elapsed_ms"] = int((time.time() - t0) * 1000)
    return jsonify(result)

@app.route("/api/camera-source/upload", methods=["POST"])
def upload_camera_video():
    """Unggah video → simpan di uploads/ + langsung jadi sumber kamera."""
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    f = request.files.get("file") if request.files else None
    if f is None or not f.filename:
        return jsonify({"status": "error", "message": "file tidak ada"}), 400
    safe = secure_filename(f.filename) or "video.mp4"
    name = f"upload_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{safe}"
    path = os.path.join(UPLOAD_DIR, name)
    f.save(path)
    size_mb = round(os.path.getsize(path) / (1024 * 1024), 1)
    rel = path.replace(os.sep, "/")
    Config.CAMERA_SOURCE = rel
    camera_reopen.set()
    return jsonify({"status": "ok", "source": rel, "name": name, "size_mb": size_mb})

@app.route("/api/camera-source/video", methods=["DELETE"])
def delete_camera_video():
    """Hapus video hasil unggahan (hanya upload_*)."""
    data = request.get_json(silent=True) or {}
    name = os.path.basename(str(data.get("name", "")))
    if not name.startswith("upload"):
        return jsonify({"error": "hanya video upload yang bisa dihapus"}), 400
    if str(Config.CAMERA_SOURCE).replace(os.sep, "/").endswith(name):
        return jsonify({"error": "video sedang aktif"}), 400
    path = os.path.join(UPLOAD_DIR, name)
    if not os.path.exists(path):
        return jsonify({"error": "file tidak ditemukan"}), 404
    try:
        os.remove(path)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({"status": "ok", "deleted": name})

@app.route("/api/target")
def get_target():
    return jsonify({"target": daily_target})

@app.route("/api/target", methods=["POST"])
def set_target():
    global daily_target
    data = request.get_json(silent=True) or {}
    try:
        daily_target = max(0, int(data.get("target", 0)))
    except (TypeError, ValueError):
        return jsonify({"error": "invalid_target"}), 400
    return jsonify({"status": "ok", "target": daily_target})

@app.route("/api/target/history")
def target_history():
    """Riwayat capaian per hari (total & jumlah sesi nyata dari DB)."""
    try:
        days = min(31, max(1, int(request.args.get("days", 7))))
    except ValueError:
        days = 7
    per_day = db.get_daily_totals(days)
    out = []
    for i in range(days - 1, -1, -1):
        d = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
        total, sessions = per_day.get(d, (0, 0))
        out.append({
            "date": d,
            "total": total,
            "target": daily_target,
            "sessions": sessions,
            "achieved": bool(daily_target > 0 and total >= daily_target)
        })
    return jsonify({"days": out})

def _load_presets():
    try:
        with open(PRESETS_FILE, "r", encoding="utf-8") as fh:
            data = json.load(fh)
            return data if isinstance(data, list) else []
    except Exception:
        return []

def _save_presets(presets):
    with open(PRESETS_FILE, "w", encoding="utf-8") as fh:
        json.dump(presets, fh, ensure_ascii=False, indent=2)

@app.route("/api/camera-presets")
def get_presets():
    return jsonify({"presets": _load_presets()})

@app.route("/api/camera-presets", methods=["POST"])
def save_preset():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()[:40]
    source = str(data.get("source", "")).strip()
    if not name or not source:
        return jsonify({"error": "name/source wajib diisi"}), 400
    presets = [p for p in _load_presets() if p.get("name") != name]
    presets.append({
        "name": name,
        "source": source,
        "created": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })
    _save_presets(presets)
    return jsonify({"status": "ok", "presets": presets})

@app.route("/api/camera-presets", methods=["DELETE"])
def delete_preset():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    presets = [p for p in _load_presets() if p.get("name") != name]
    _save_presets(presets)
    return jsonify({"status": "ok", "presets": presets})

@app.route("/api/audit")
def audit_log():
    """Log aktivitas operator — backend ini belum mencatat audit → kosong."""
    return jsonify({"entries": [], "total": 0, "actions": []})

@app.route("/api/audit", methods=["DELETE"])
def audit_clear():
    return jsonify({"status": "ok", "deleted": 0})

@app.route("/api/audit/export")
def audit_export():
    header = "id,ts,action,detail\n"
    return Response(
        header,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=log_aktivitas.csv"}
    )

@app.route("/api/pin")
def pin_status():
    """Backend ini tidak implementasi PIN → proteksi nonaktif."""
    return jsonify({"enabled": False, "is_default": True})

@app.route("/api/pin/verify", methods=["POST"])
def pin_verify():
    return jsonify({"valid": True})

@app.route("/api/pin", methods=["POST"])
def pin_update():
    return jsonify({"error": "fitur PIN tidak didukung backend ini"}), 501

@app.route("/api/download/csv/<filename>")
def download_csv(filename):
    """Konversi file Excel export ke CSV lalu unduh."""
    if '..' in filename or '/' in filename or '\\' in filename:
        return jsonify({"error": "Invalid filename"}), 400
    if not filename.endswith('.xlsx'):
        return jsonify({"error": "bukan file xlsx"}), 400
    file_path = os.path.abspath(os.path.join('exports', filename))
    if not os.path.exists(file_path):
        return jsonify({"error": "File not found"}), 404
    try:
        import csv as csv_mod
        import io
        import openpyxl
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        buf = io.StringIO()
        writer = csv_mod.writer(buf)
        first_sheet = True
        for ws in wb.worksheets:
            if not first_sheet:
                writer.writerow([f"=== {ws.title} ==="])
            first_sheet = False
            for row in ws.iter_rows(values_only=True):
                writer.writerow(["" if c is None else c for c in row])
        wb.close()
        out = io.BytesIO(buf.getvalue().encode("utf-8-sig"))
        csv_name = os.path.splitext(filename)[0] + ".csv"
        return send_file(out, mimetype="text/csv", as_attachment=True,
                         download_name=csv_name)
    except Exception as e:
        return jsonify({"error": f"gagal konversi: {e}"}), 500

@app.route("/api/report/daily")
def report_daily():
    return jsonify({"error": "laporan PDF tidak didukung backend ini"}), 501

@app.route("/api/report/range")
def report_range():
    return jsonify({"error": "laporan PDF tidak didukung backend ini"}), 501

# =====================================================
# SOCKET EVENTS
# =====================================================

@socketio.on("connect")
def connect():
    """Client connected"""
    print(f"[SOCKET] Client connected: {request.sid}")

@socketio.on("disconnect")
def disconnect():
    """Client disconnected"""
    print(f"[SOCKET] Client disconnected: {request.sid}")

# =====================================================
# SESSION HELPERS (dipakai socket event & REST, worklog Task 13)
# =====================================================

def _do_start_session(data):
    """Mulai sesi hitung. Return (payload_dict, http_code)."""
    global is_processing, session_active, session_data, current_count
    global current_tracks, session_start_ts, timeline_points, last_session

    if getattr(detector, "model", None) is None:
        return {"error": "model_not_loaded"}, 503

    # Reset counter
    counter.reset()
    current_count = 0
    current_tracks = 0

    # Set session data
    session_data = {
        "asal_ayam": data.get("asal_ayam", "Unknown"),
        "tanggal": data.get("tanggal", datetime.now().strftime("%Y-%m-%d")),
        "jam": data.get("jam", datetime.now().strftime("%H:%M")),
        "keterangan": data.get("keterangan", "")
    }

    # Start Excel session
    excel_exporter.start_new_session(
        session_data["asal_ayam"],
        session_data["jam"],
        session_data["tanggal"],
        session_data["keterangan"]
    )

    session_active = True
    is_processing = True
    session_start_ts = time.time()
    with timeline_lock:
        timeline_points = []
    last_session = None

    print(f"[SESSION] Started: {session_data}")
    return {"status": "ok", "session": session_data}, 200


def _do_stop_session():
    """Hentikan sesi, simpan Excel + DB, reset counter. Return (payload, code)."""
    global is_processing, session_active, current_count, current_tracks, last_session

    if not session_active:
        return {"status": "ok", "file": None}, 200

    total = current_count
    started_iso = (
        datetime.fromtimestamp(session_start_ts).isoformat()
        if session_start_ts else datetime.now().isoformat()
    )
    ended_iso = datetime.now().isoformat()

    is_processing = False
    session_active = False

    saved_file = excel_exporter.stop_and_save()

    # BUGFIX (Task 13): sesi TIDAK PERNAH disimpan ke SQLite sebelumnya,
    # sehingga riwayat selalu kosong. Simpan sekarang.
    try:
        db.add_session(
            session_data.get("asal_ayam", ""),
            session_data.get("tanggal", ""),
            session_data.get("jam", ""),
            session_data.get("keterangan", ""),
            total,
            started_iso,
            ended_iso,
            saved_file or ""
        )
    except Exception as e:
        print(f"[SESSION] Gagal simpan ke DB: {e}")

    durasi = int(time.time() - session_start_ts) if session_start_ts else 0
    last_session = {
        "asal_ayam": session_data.get("asal_ayam", ""),
        "total": total,
        "durasi_detik": durasi,
        "selesai": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "file": os.path.basename(saved_file) if saved_file else ""
    }

    # Dashboard ekspektasi count otomatis kembali 0 setelah sesi disimpan.
    counter.reset()
    current_count = 0
    current_tracks = 0

    print(f"[SESSION] Stopped, total={total}, file={saved_file}")
    return {"status": "ok", "file": os.path.basename(saved_file) if saved_file else None}, 200


@socketio.on("start_processing")
def start_processing(data):
    """Start counting session"""
    result, code = _do_start_session(data or {})
    if code == 200:
        emit("processing_status", {"status": "running"})


@socketio.on("stop_processing")
def stop_processing():
    """Stop counting session"""
    result, _code = _do_stop_session()
    emit("processing_status", {"status": "stopped"})
    if result.get("file"):
        emit("file_saved", {"file": result["file"]})

@socketio.on("reset_counter")
def reset_counter():
    """Reset counter"""
    global current_count, current_tracks
    
    print("[SOCKET] Reset counter")
    
    counter.reset()
    current_count = 0
    current_tracks = 0
    
    emit("counter_reset", {"count": 0})

@app.route("/api/reset", methods=["POST"])
def reset_counter_http():
    """Reset counter via HTTP (dipakai dashboard Next.js, worklog Task 13).

    Respons mengikuti ekspektasi dashboard: { count, status }.
    """
    global current_count, current_tracks

    print("[HTTP] Reset counter")

    counter.reset()
    current_count = 0
    current_tracks = 0

    try:
        socketio.emit("counter_reset", {"count": 0})
    except Exception:
        pass

    return jsonify({"count": 0, "status": "ok"})

@socketio.on("get_stats")
def get_stats_socket():
    """Send current stats via socket"""
    emit("update_stats", {
        "count": current_count,
        "speed": 0,
        "tracks": current_tracks,
        "timestamp": time.time(),
        "session_active": session_active,
        "session_data": session_data,
        "method": "Simple Counter"
    })

# =====================================================
# STARTUP
# =====================================================

def start_threads():
    """Start background threads"""
    capture_thread_obj = threading.Thread(target=capture_thread, daemon=True)
    capture_thread_obj.start()
    
    detection_thread_obj = threading.Thread(target=detection_thread, daemon=True)
    detection_thread_obj.start()
    
    print("[STARTUP] Threads started")

if __name__ == "__main__":
    print("""
    ════════════════════════════════════════════════════════
      🐔 AYAM COUNTER SYSTEM - SIMPLE COUNTER v2.0
      Count when detection touches left line
    ════════════════════════════════════════════════════════
    """)
    
    print(f"[STARTUP] Config:")
    print(f"  - Camera: {Config.CAMERA_SOURCE}")
    print(f"  - Resolution: {Config.CAMERA_WIDTH}x{Config.CAMERA_HEIGHT}")
    print(f"  - FPS: {Config.CAMERA_FPS}")
    print(f"  - Count Line X: {Config.COUNT_LINE_X}")
    print(f"  - Zone Width: {Config.ZONE_WIDTH}")
    print(f"  - Confidence: {Config.CONFIDENCE_THRESHOLD}")
    print(f"  - Model: {Config.YOLO_MODEL_PATH}")
    print("")
    
    # Start threads
    start_threads()
    
    # Run Flask app
    socketio.run(
        app,
        host="127.0.0.1",
        port=5000,
        debug=False,
        allow_unsafe_werkzeug=True
    )
