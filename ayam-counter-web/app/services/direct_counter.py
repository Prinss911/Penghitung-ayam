import numpy as np
from collections import deque
from app.config import Config
import time


class DirectCounter:
    """
    Counter berbasis posisi langsung
    - Menghitung ayam berdasarkan posisi unik di zone
    - Tidak bergantung pada tracking ID
    - Dioptimalkan untuk laptop + CCTV
    """
    def __init__(self):
        self.count_line = Config.COUNT_LINE_POSITION
        self.zone_width = Config.ZONE_WIDTH
        
        # ============================================
        # PARAMETER - OPTIMAL UNTUK LAPTOP
        # ============================================
        self.counted = 0
        self.counted_positions = set()  # Posisi yang sudah dihitung
        self.position_history = {}  # History per posisi
        
        self.min_confidence = 0.40
        self.min_frames = 5  # Minimal 5 frame sebelum dihitung
        self.grid_size = 20  # Grid size untuk deduplication
        self.movement_threshold = 10  # Minimal pergerakan pixel
        self.cooldown_seconds = 1.5  # Cooldown per posisi
        
        # ============================================
        # STATISTIK UNTUK DEBUG
        # ============================================
        self.total_frames_processed = 0
        self.last_count = 0
        
        print(f"[DIRECT COUNTER] Initialized")
        print(f"[DIRECT COUNTER] Count line: {self.count_line}")
        print(f"[DIRECT COUNTER] Zone width: {self.zone_width}")
        print(f"[DIRECT COUNTER] Grid size: {self.grid_size}")
        print(f"[DIRECT COUNTER] Min frames: {self.min_frames}")
        print(f"[DIRECT COUNTER] Movement threshold: {self.movement_threshold}px")

    def update(self, detections):
        """
        Hitung ayam berdasarkan posisi di zone
        """
        self.total_frames_processed += 1
        
        # ============================================
        # FILTER CHICKEN
        # ============================================
        chickens = []
        for det in detections:
            if det.get("is_chicken", False) and det.get("confidence", 0) >= self.min_confidence:
                chickens.append(det)
        
        if not chickens:
            return self.counted
        
        zone_start = self.count_line - self.zone_width // 2
        zone_end = self.count_line + self.zone_width // 2
        current_time = time.time()
        
        # ============================================
        # KELOMPOKKAN BERDASARKAN POSISI (GRID)
        # ============================================
        position_groups = {}
        
        for ch in chickens:
            cx = ch["center_x"]
            cy = ch["center_y"]
            
            # Grid position - dibulatkan ke kelipatan grid_size
            pos_key = (round(cx / self.grid_size) * self.grid_size,
                      round(cy / self.grid_size) * self.grid_size)
            
            if pos_key not in position_groups:
                position_groups[pos_key] = []
            position_groups[pos_key].append(ch)
        
        # ============================================
        # PROSES SETIAP KELOMPOK POSISI
        # ============================================
        for pos_key, group in position_groups.items():
            cx = group[0]["center_x"]
            cy = group[0]["center_y"]
            
            # Cek apakah di zone
            if not (zone_start <= cx <= zone_end):
                continue
            
            # Cek cooldown (sudah dihitung sebelumnya)
            if pos_key in self.counted_positions:
                continue
            
            # ============================================
            # UPDATE HISTORY PER POSISI
            # ============================================
            if pos_key not in self.position_history:
                self.position_history[pos_key] = {
                    'frames': 1,
                    'first_seen': current_time,
                    'last_seen': current_time,
                    'positions': [(cx, cy)]
                }
            else:
                self.position_history[pos_key]['frames'] += 1
                self.position_history[pos_key]['last_seen'] = current_time
                self.position_history[pos_key]['positions'].append((cx, cy))
                
                # Keep last 15 positions (cukup untuk deteksi movement)
                if len(self.position_history[pos_key]['positions']) > 15:
                    self.position_history[pos_key]['positions'].pop(0)
            
            history = self.position_history[pos_key]
            
            # ============================================
            # CEK SYARAT HITUNG
            # ============================================
            
            # Syarat 1: Minimal frames (harus muncul di beberapa frame)
            if history['frames'] < self.min_frames:
                continue
            
            # Syarat 2: Ada pergerakan (bukan noise)
            positions = history['positions']
            if len(positions) >= 3:
                first_x = positions[0][0]
                last_x = positions[-1][0]
                movement = abs(last_x - first_x)
                
                if movement < self.movement_threshold:
                    continue
            else:
                continue
            
            # ============================================
            # HITUNG!
            # ============================================
            self.counted += 1
            self.counted_positions.add(pos_key)
            
            print(f"[✓ DIRECT] #{self.counted} | Pos: {pos_key} | Movement: {movement:.0f}px | Frames: {history['frames']}")
        
        # ============================================
        # CLEANUP HISTORY LAMA (lebih dari 3 detik tidak terlihat)
        # ============================================
        to_remove = []
        for pos_key, data in self.position_history.items():
            if current_time - data['last_seen'] > 3:
                to_remove.append(pos_key)
        
        for pos_key in to_remove:
            del self.position_history[pos_key]
        
        # ============================================
        # CLEANUP COUNTED POSITIONS (batasi jumlah)
        # ============================================
        if len(self.counted_positions) > 100:
            # Keep only last 50 counted positions
            counted_list = list(self.counted_positions)
            self.counted_positions = set(counted_list[-50:])
        
        # ============================================
        # DEBUG SETIAP 60 FRAME
        # ============================================
        if self.total_frames_processed % 60 == 0:
            print(f"[DIRECT DEBUG] Frames: {self.total_frames_processed} | Count: {self.counted} | Active: {len(self.position_history)}")
        
        return self.counted

    def get_average_speed(self):
        """
        Direct counter tidak menghitung speed
        Gunakan tracker.py untuk speed
        """
        return 0.0

    def get_status(self):
        """Dapatkan status counter untuk debugging"""
        return {
            'counted': self.counted,
            'active_positions': len(self.position_history),
            'counted_positions': len(self.counted_positions),
            'total_frames': self.total_frames_processed
        }

    def reset_counter(self):
        """Reset semua state"""
        self.counted = 0
        self.counted_positions.clear()
        self.position_history.clear()
        self.total_frames_processed = 0
        self.last_count = 0
        print("[DIRECT COUNTER] Reset complete")