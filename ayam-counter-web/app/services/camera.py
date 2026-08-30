import cv2
import threading
from app.config import Config
import time

class CameraHandler:
    def __init__(self):
        self.cap = None
        self.is_running = False
        self.frame = None
        self.fps = Config.CAMERA_FPS
        self.lock = threading.Lock()
        self.frame_count = 0
        
    def start(self):
        try:
            source = Config.CAMERA_SOURCE
            
            if isinstance(source, str) and source.isdigit():
                source = int(source)
            
            if source == 0 or source == '0':
                self.cap = cv2.VideoCapture(source, cv2.CAP_DSHOW)
            else:
                self.cap = cv2.VideoCapture(source)
            
            self.cap.set(cv2.CAP_PROP_FPS, self.fps)
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, Config.CAMERA_WIDTH)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, Config.CAMERA_HEIGHT)
            
            ret, test_frame = self.cap.read()
            if not ret:
                raise Exception("Cannot read frame from camera")
            
            print(f"[INFO] Camera started! Frame size: {test_frame.shape}")
            
            self.is_running = True
            self.thread = threading.Thread(target=self._capture_loop)
            self.thread.daemon = True
            self.thread.start()
            return True
            
        except Exception as e:
            print(f"[ERROR] Camera error: {e}")
            return False
    
    def _capture_loop(self):
        while self.is_running:
            try:
                ret, frame = self.cap.read()
                if ret:
                    with self.lock:
                        frame = cv2.flip(frame, 1)
                        self.frame = frame.copy()
                        self.frame_count += 1
                else:
                    time.sleep(0.01)
            except Exception as e:
                print(f"[ERROR] Capture error: {e}")
                time.sleep(0.1)
    
    def get_frame(self):
        with self.lock:
            if self.frame is not None:
                return self.frame.copy()
            return None
    
    def stop(self):
        self.is_running = False
        if hasattr(self, 'thread'):
            self.thread.join(timeout=1)
        if self.cap:
            self.cap.release()
            print("[INFO] Camera released")