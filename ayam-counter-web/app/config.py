import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # ============================================
    # CAMERA SETTINGS
    # ============================================
    CAMERA_SOURCE = os.getenv('CAMERA_SOURCE', 1)  # USB camera at index 1
    CAMERA_FPS = int(os.getenv('CAMERA_FPS', 10))
    CAMERA_WIDTH = int(os.getenv('CAMERA_WIDTH', 640))
    CAMERA_HEIGHT = int(os.getenv('CAMERA_HEIGHT', 480))
    
    # ============================================
    # YOLO MODEL
    # ============================================
    YOLO_MODEL_PATH = os.getenv('YOLO_MODEL_PATH', 'models/best_shackle.pt')
    CONFIDENCE_THRESHOLD = float(os.getenv('CONFIDENCE_THRESHOLD', 0.25))
    YOLO_IMGSZ = (224, 128)  # width, height
    
    # ============================================
    # COUNTER SETTINGS - GARIS DI KIRI
    # ============================================
    # Posisi garis hitung (dari kiri) - sesuaikan dengan video Anda
    # Dukung dua nama env: COUNT_LINE_X (baru) dan COUNT_LINE_POSITION (lama)
    COUNT_LINE_X = int(os.getenv('COUNT_LINE_X') or os.getenv('COUNT_LINE_POSITION') or 50)
    COUNT_LINE_POSITION = int(os.getenv('COUNT_LINE_POSITION') or os.getenv('COUNT_LINE_X') or 50)
    
    # Lebar zona deteksi (agar tidak terlalu sensitif)
    ZONE_WIDTH = int(os.getenv('ZONE_WIDTH', 20))
    
    # ============================================
    # CLASS MAPPING
    # ============================================
    CLASS_NAMES = {
        0: "Shackle-Detection 2",
        1: "Shackle-Detection 3",
    }
    
    # BOTH classes are chickens
    CHICKEN_CLASSES = [0, 1]
    EMPTY_CLASSES = []
    
    # ============================================
    # FLASK
    # ============================================
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-key-ubah-di-production')

    # ============================================
    # HARDWARE ACCELERATION SETTINGS
    # ============================================
    DEVICE = os.getenv('DEVICE', 'auto')  # auto | cuda | cpu | openvino | dml
    HW_BENCHMARK = os.getenv('HW_BENCHMARK', 'enabled')  # enabled | disabled

# Alias at module level for import convenience
DEVICE = Config.DEVICE
HW_BENCHMARK = Config.HW_BENCHMARK
