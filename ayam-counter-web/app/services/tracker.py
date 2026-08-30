import numpy as np
from collections import deque
from app.config import Config
import time


class AyamTracker:
    """
    Tracker berbasis IOU + Distance
    - Untuk menghitung kecepatan dan tracking ayam
    - Dioptimalkan untuk laptop + CCTV
    """
    def __init__(self):
        self.tracked_objects = {}
        self.next_id = 0
        self.counted = 0
        self.count_line = Config.COUNT_LINE_POSITION
        self.zone_width = Config.ZONE_WIDTH
        
        # ============================================
        # PARAMETER TRACKING - DIPERKETAT UNTUK LAPTOP
        # ============================================
        self.max_lost_frames = 6  # DIPERKECIL
        self.min_iou = 0.45  # DINAIIKKAN
        self.max_tracks = 25  # BATASAN TRACK
        
        # ============================================
        # HISTORY
        # ============================================
        self.speed_history = deque(maxlen=100)
        self.counted_ids = set()
        self.crossing_history = {}
        
        print(f"[TRACKER] Initialized")
        print(f"[TRACKER] Count line: {self.count_line}")
        print(f"[TRACKER] Zone width: {self.zone_width}")
        print(f"[TRACKER] Min IOU: {self.min_iou}")
        print(f"[TRACKER] Max tracks: {self.max_tracks}")

    def update(self, detections, fps=30):
        """Update tracker dengan detections baru"""
        # Filter chicken
        valid = []
        for det in detections:
            if det.get("is_chicken", False) and det.get("confidence", 0) >= 0.40:
                valid.append(det)
        
        # Update lost
        self.update_lost()
        
        if not valid:
            return self.counted, self.get_average_speed()
        
        matched = set()
        
        # ============================================
        # MATCHING DENGAN IOU + DISTANCE
        # ============================================
        for det in valid:
            bbox = self.get_bbox(det)
            center = (det["center_x"], det["center_y"])
            best_id = None
            best_score = 0
            
            for track_id, track in self.tracked_objects.items():
                if track_id in matched:
                    continue
                
                last_bbox = track["boxes"][-1]
                iou = self.calculate_iou(bbox, last_bbox)
                
                last_center = track["positions"][-1]
                dist = np.sqrt((center[0] - last_center[0])**2 + 
                              (center[1] - last_center[1])**2)
                
                # Score: IOU 70% + Distance 30%
                score = iou * 0.7 + (1 / (1 + dist / 15)) * 0.3
                
                if score > best_score:
                    best_score = score
                    best_id = track_id
            
            # ============================================
            # UPDATE EXISTING TRACK
            # ============================================
            if best_id is not None and best_score >= self.min_iou:
                matched.add(best_id)
                track = self.tracked_objects[best_id]
                
                track["positions"].append(center)
                track["boxes"].append(bbox)
                track["lost"] = 0
                track["last_detection"] = det
                
                # Hitung kecepatan
                if len(track["positions"]) >= 2:
                    old_center = track["positions"][-2]
                    distance = np.sqrt(
                        (center[0] - old_center[0])**2 + 
                        (center[1] - old_center[1])**2
                    )
                    speed = distance * fps * 0.01
                    track["speed"] = speed
                    if speed > 0:
                        self.speed_history.append(speed)
                
                # ============================================
                # CEK CROSSING COUNT LINE
                # ============================================
                if not track["counted"] and best_id not in self.counted_ids:
                    if self.check_crossing(track):
                        track["counted"] = True
                        self.counted_ids.add(best_id)
                        self.counted += 1
                        print(f"[✓ COUNT] ID {best_id} | TOTAL: {self.counted} | SPEED: {track['speed']:.2f}")
            
            # ============================================
            # CREATE NEW TRACK
            # ============================================
            else:
                # Cek apakah benar-benar baru
                is_new = True
                for track_id, track in self.tracked_objects.items():
                    if track_id in matched:
                        continue
                    last_bbox = track["boxes"][-1]
                    iou = self.calculate_iou(bbox, last_bbox)
                    if iou > 0.2:
                        is_new = False
                        break
                
                # Cek batas maksimum track
                if is_new and len(self.tracked_objects) < self.max_tracks:
                    new_id = self.next_id
                    self.next_id += 1
                    
                    self.tracked_objects[new_id] = {
                        "positions": deque([center], maxlen=30),
                        "boxes": deque([bbox], maxlen=30),
                        "counted": False,
                        "lost": 0,
                        "speed": 0,
                        "last_detection": det,
                        "created": time.time()
                    }
                    matched.add(new_id)
                    
                    if new_id % 5 == 0:
                        print(f"[TRACK] New ID: {new_id} | Total: {len(self.tracked_objects)}")
        
        # ============================================
        # CLEANUP
        # ============================================
        for track_id in list(self.tracked_objects.keys()):
            if track_id not in matched:
                self.tracked_objects[track_id]["lost"] += 1
        
        self.cleanup_tracks()
        
        return self.counted, self.get_average_speed()

    def get_bbox(self, det):
        """Ekstrak bounding box dari detection"""
        return (det["x1"], det["y1"], det["x2"], det["y2"])

    def calculate_iou(self, a, b):
        """Calculate Intersection over Union"""
        x1 = max(a[0], b[0])
        y1 = max(a[1], b[1])
        x2 = min(a[2], b[2])
        y2 = min(a[3], b[3])
        
        inter = max(0, x2 - x1) * max(0, y2 - y1)
        
        area_a = (a[2] - a[0]) * (a[3] - a[1])
        area_b = (b[2] - b[0]) * (b[3] - b[1])
        union = area_a + area_b - inter
        
        return inter / union if union > 0 else 0

    def check_crossing(self, track):
        """
        Cek apakah ayam melewati count line
        Menggunakan center point + movement
        """
        if len(track["positions"]) < 3:
            return False
        
        pos_list = list(track["positions"])
        prev2_x = pos_list[-3][0]
        prev_x = pos_list[-2][0]
        curr_x = pos_list[-1][0]
        
        # Cek center point melewati garis
        # Moving right
        if prev_x < self.count_line and curr_x >= self.count_line:
            return True
        
        # Moving left
        if prev_x > self.count_line and curr_x <= self.count_line:
            return True
        
        # Cek pergerakan konsisten
        if len(pos_list) >= 4:
            prev3_x = pos_list[-4][0]
            
            # Moving right
            if prev3_x < prev2_x < prev_x < curr_x:
                if prev2_x < self.count_line and curr_x >= self.count_line:
                    return True
            
            # Moving left
            if prev3_x > prev2_x > prev_x > curr_x:
                if prev2_x > self.count_line and curr_x <= self.count_line:
                    return True
        
        return False

    def update_lost(self):
        """Increment lost counter untuk semua track"""
        for track_id in list(self.tracked_objects.keys()):
            self.tracked_objects[track_id]["lost"] += 1

    def cleanup_tracks(self):
        """Hapus track yang sudah hilang atau sudah dihitung"""
        to_remove = []
        current_time = time.time()
        
        for track_id, track in self.tracked_objects.items():
            # Hapus jika lost terlalu lama
            if track["lost"] > self.max_lost_frames:
                to_remove.append(track_id)
            # Hapus jika sudah dihitung dan keluar zone
            elif track["counted"] and track["lost"] > 3:
                to_remove.append(track_id)
            # Hapus track lama yang tidak aktif
            elif current_time - track["created"] > 8 and track["lost"] > 2:
                to_remove.append(track_id)
        
        for track_id in to_remove:
            if track_id in self.tracked_objects:
                del self.tracked_objects[track_id]

    def get_average_speed(self):
        """Dapatkan kecepatan rata-rata"""
        speeds = []
        for track in self.tracked_objects.values():
            if track["speed"] > 0:
                speeds.append(track["speed"])
        
        if speeds:
            return sum(speeds) / len(speeds)
        return 0.0

    def reset_counter(self):
        """Reset semua state"""
        self.counted = 0
        self.tracked_objects.clear()
        self.counted_ids.clear()
        self.next_id = 0
        self.speed_history.clear()
        self.crossing_history.clear()
        print("[TRACKER] Reset complete")