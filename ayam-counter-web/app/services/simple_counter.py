# modules/simple_counter.py
import time
from app.config import Config


class SimpleCounter:
    """
    Penghitung berbasis tracking antar frame:
    - Objek dilacak dengan nearest-match (jarak < 60px = objek yang sama)
    - Count HANYA jika center melewati garis (perubahan tanda posisi)
    - Zona hanya sebagai buffer/hysteresis, BUKAN pemicu hitung
    """

    # Jarak maksimum (px) agar dua deteksi dianggap objek yang sama
    MATCH_THRESHOLD = 60.0

    # Berapa lama (detik) track tanpa deteksi dianggap hilang
    TRACK_TIMEOUT = 2.0

    # Berapa lama (detik) ID yang sudah dihitung disimpan (sliding window)
    COUNT_EXPIRY = 10.0

    def __init__(self, count_line_x=50, zone_width=20):
        """
        Args:
            count_line_x: Posisi garis vertikal dari kiri (dalam pixel)
            zone_width: Lebar zona buffer di sekitar garis
        """
        self.count_line_x = count_line_x
        self.zone_width = zone_width

        # Counter total
        self.total_count = 0

        # Track aktif: id -> dict
        self.tracks = {}
        self.next_id = 0

        # ID yang sudah dihitung + timestamp (sliding window expiry)
        self.counted_ids = {}

        # History untuk debugging
        self.count_history = []

        print(f"[INIT] Simple Counter")
        print(f"[INIT] Count line at x={self.count_line_x}")
        print(f"[INIT] Zone width: {self.zone_width}")

    def _nearest_track(self, cx, cy):
        """Cari track terdekat dengan jarak < MATCH_THRESHOLD"""
        best_id = None
        best_dist = self.MATCH_THRESHOLD
        for track_id, track in self.tracks.items():
            tx, ty = track["position"]
            dist = ((cx - tx) ** 2 + (cy - ty) ** 2) ** 0.5
            if dist < best_dist:
                best_dist = dist
                best_id = track_id
        return best_id

    def _crossed_line(self, prev_x, curr_x):
        """True jika center melewati garis (perubahan tanda posisi)"""
        return (prev_x < self.count_line_x <= curr_x) or \
               (curr_x < self.count_line_x <= prev_x)

    def _in_zone(self, cx):
        """True jika center berada di dalam zona buffer"""
        half = self.zone_width / 2
        return self.count_line_x - half <= cx <= self.count_line_x + half

    def update(self, detections):
        """
        Update counter dengan deteksi baru

        Args:
            detections: List detections dari YOLO

        Returns:
            total_count: Jumlah total ayam yang terhitung
        """
        now = time.time()

        # Filter hanya ayam dengan confidence >= Config.CONFIDENCE_THRESHOLD
        chickens = []
        for d in detections:
            if d.get("is_chicken", False) and d.get("confidence", 0) >= Config.CONFIDENCE_THRESHOLD:
                chickens.append(d)

        matched = set()

        # ============================================
        # 1. MATCH DETEKSI KE TRACK (nearest-match)
        # ============================================
        for chicken in chickens:
            cx = chicken["center_x"]
            cy = chicken["center_y"]

            track_id = self._nearest_track(cx, cy)

            if track_id is None:
                # Objek baru -> buat track baru
                track_id = self.next_id
                self.next_id += 1
                self.tracks[track_id] = {
                    "position": (cx, cy),
                    "counted": False,
                    "last_seen": now,
                    "side": None  # sisi terakhir saat berada di luar zona (buffer)
                }
                matched.add(track_id)
                continue

            track = self.tracks[track_id]
            prev_x = track["position"][0]
            track["position"] = (cx, cy)
            track["last_seen"] = now
            matched.add(track_id)

            if track["counted"]:
                continue

            # ============================================
            # 2. ZONE HANYA SEBAGAI BUFFER/HYSTERESIS
            # ============================================
            # Simpan sisi terakhir saat objek BERADA DI LUAR zona.
            # Ini mencegah jitter di sekitar garis memicu hitung.
            if not self._in_zone(cx):
                track["side"] = "right" if cx >= self.count_line_x else "left"

            # ============================================
            # 3. HITUNG HANYA SAAT CENTER MELEWATI GARIS
            # ============================================
            # Syarat: center berpindah sisi (crossing) DAN objek
            # sebelumnya terlihat jelas di sisi yang berlawanan (buffer).
            if self._crossed_line(prev_x, cx):
                side = "right" if cx >= self.count_line_x else "left"
                if track["side"] is not None and track["side"] != side:
                    # HITUNG +1
                    track["counted"] = True
                    self.counted_ids[track_id] = now
                    self.total_count += 1

                    self.count_history.append({
                        'count': self.total_count,
                        'position': (cx, cy),
                        'id': track_id,
                        'timestamp': now
                    })

                    print(f"[✓ COUNT] #{self.total_count} | Posisi: ({cx}, {cy}) | ID: {track_id}")

                    # Tandai kotak sudah dihitung
                    chicken["counted"] = True
                    chicken["counted_id"] = track_id

        # ============================================
        # 4. CLEANUP TRACK YANG HILANG
        # ============================================
        for track_id in list(self.tracks.keys()):
            if track_id not in matched and now - self.tracks[track_id]["last_seen"] > self.TRACK_TIMEOUT:
                del self.tracks[track_id]

        # ============================================
        # 5. SLIDING WINDOW EXPIRY COUNTED IDS
        # ============================================
        # Hapus ID yang sudah lama (bukan bulk clear)
        for track_id in list(self.counted_ids.keys()):
            if now - self.counted_ids[track_id] > self.COUNT_EXPIRY:
                del self.counted_ids[track_id]

        return self.total_count

    def get_count(self):
        """Dapatkan total count saat ini"""
        return self.total_count

    def reset(self):
        """Reset counter ke 0"""
        self.total_count = 0
        self.tracks.clear()
        self.counted_ids.clear()
        self.next_id = 0
        self.count_history.clear()
        print("[RESET] Counter reset to 0")
        return self.total_count

    def get_stats(self):
        """Dapatkan statistik counter"""
        return {
            'total': self.total_count,
            'active_ids': len(self.tracks),
            'counted_ids': len(self.counted_ids),
            'history_count': len(self.count_history)
        }
