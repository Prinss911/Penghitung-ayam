# app/services/hybrid_counter.py
from app.services.simple_counter import SimpleCounter
from app.config import Config

# Untuk kompatibilitas dengan app.py
class HybridCounter(SimpleCounter):
    """Wrapper untuk kompatibilitas dengan app.py"""
    
    def __init__(self):
        # Gunakan konfigurasi dari Config
        super().__init__(
            count_line_x=Config.COUNT_LINE_X,
            zone_width=Config.ZONE_WIDTH
        )
        print("[HYBRID COUNTER] Using SimpleCounter")