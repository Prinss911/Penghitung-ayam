# modules/detector.py
import cv2
import torch
from ultralytics import YOLO
from app.config import Config
from app.services.hardware import HardwareDetector, DeviceProfile
import os
from typing import Optional
import logging

logger = logging.getLogger("detector")

# === Kompatibilitas PyTorch 2.6+ (worklog Task 13) ===
# PyTorch 2.6 mengubah default `weights_only` pada torch.load dari False ke
# True. Checkpoint ultralytics 8.0.x mem-pickle class model utuh
# (ultralytics.nn.tasks.DetectionModel) sehingga gagal dimuat dengan
# weights_only=True. File model di sini adalah hasil training sendiri
# (sumber terpercaya), jadi default-kan weights_only=False.
_orig_torch_load = torch.load

def _torch_load_trusted(*args, **kwargs):
    kwargs.setdefault("weights_only", False)
    return _orig_torch_load(*args, **kwargs)

torch.load = _torch_load_trusted


class AyamDetector:
    def __init__(self, hardware_profile: Optional[DeviceProfile] = None):
        """
        Initialize detector with hardware-first detection approach.
        
        Args:
            hardware_profile: Optional DeviceProfile (auto-detected if None)
                             This ensures hardware is probed BEFORE loading YOLO model
                             as per user requirement "wajib deteksi hardware dahulu"
        """
        # === HARDWARE-FIRST DETECTION (USER REQUIREMENT) ===
        if hardware_profile is None:
            hardware_profile = HardwareDetector.detect()
        
        self.hardware = hardware_profile
        
        # Select optimal model for detected backend
        self.model_path = self._select_optimal_model(hardware_profile)
        
        # Log hardware profile banner (observability)
        self._log_hardware_banner()
        
        print(f"[INFO] Loading YOLO model from {self.model_path}")
        
        try:
            self.model = YOLO(self.model_path)
            
            if hasattr(self.model, 'names'):
                self.class_names = self.model.names
                print(f"[INFO] Model classes: {self.class_names}")
            else:
                self.class_names = Config.CLASS_NAMES
                print(f"[INFO] Using config classes: {self.class_names}")
                
        except Exception as e:
            print(f"[ERROR] Failed to load model: {e}")
            self.model = None
            self.class_names = Config.CLASS_NAMES
        
        # Set device based on hardware profile
        self.device = self.hardware.device_str
        self.confidence = Config.CONFIDENCE_THRESHOLD
        self.imgsz = Config.YOLO_IMGSZ
        
        # Apply backend-specific optimizations
        self._apply_backend_optimizations()
        
        print(f"[INFO] Device: {self.device}")
        print(f"[INFO] Input size: {self.imgsz}")
        print(f"[INFO] Confidence threshold: {self.confidence}")
        
        self.chicken_classes = Config.CHICKEN_CLASSES
    
    def _select_optimal_model(self, hw_profile: DeviceProfile) -> str:
        """Select best model path for detected hardware."""
        base_model = Config.YOLO_MODEL_PATH
        
        # For CUDA/NVIDIA: use original .pt file (optimal)
        if hw_profile.name == "cuda":
            logger.info(f"Using CUDA model: {base_model}")
            return base_model
        
        # For OpenVINO iGPU: check or export OpenVINO IR
        elif hw_profile.name == "openvino":
            output_dir = os.path.join("models", "openvino", "best_shackle_openvino_model")
            if not os.path.exists(output_dir):
                logger.warning(
                    f"OpenVINO model not found at {output_dir}, "
                    f"attempting one-time export from {base_model}"
                )
                self._export_to_openvino(base_model, output_dir)
            logger.info(f"Using OpenVINO IR: {output_dir}")
            return output_dir
        
        # DirectML/DML fallback
        elif hw_profile.name == "dml":
            logger.info(f"Using ONNX model for DirectML: {base_model}")
            return base_model
        
        # CPU fallback - use standard FP32 model
        else:  # cpu
            logger.info(f"Using CPU-optimized model: {base_model}")
            return base_model
    
    def _export_to_openvino(self, source: str, output_dir: str):
        """Export YOLO model to OpenVINO IR format (one-time operation)."""
        try:
            import openvino as ov
            
            logger.info(f"Exporting to OpenVINO IR: {source} → {output_dir}")
            
            # CRITICAL FIX: Export BEFORE assigning self.model
            # This prevents using self.model before it's initialized
            model_export = YOLO(source)
            model_export.export(format="openvino", imgsz=(224, 128), half=True, int8=False)
            del model_export
            
            # Now assign self.model with the exported path
            self.model = YOLO(output_dir)
            
            # Verify export succeeded
            xml_path = os.path.join(output_dir, "best_shackle.xml")
            if os.path.exists(xml_path):
                logger.info(f"✓ OpenVINO export successful: {xml_path}")
                print(f"[INFO] Model loaded from OpenVINO IR: {output_dir}")
            else:
                logger.error(f"✗ OpenVINO export failed - XML not found at {xml_path}")
                
        except ImportError:
            logger.error("OpenVINO not installed, cannot export IR model")
        except Exception as e:
            logger.error(f"OpenVINO export failed: {e}")
            self.model = None  # Ensure model stays None on failure
    
    def _apply_backend_optimizations(self):
        """Apply backend-specific settings (CUDA/FPU/AVX tuning)."""
        if self.hardware.name == "cuda":
            pass  # Future enhancements: torch.cuda.set_per_process_memory_fraction()
        # Other backends already handled via format selection
    
    def _log_hardware_banner(self):
        """Print hardware profile banner for observability."""
        logger_info = logging.getLogger(__name__)
        info_msg = [
            "=" * 70,
            "🖥️ HARDWARE PROFILE SELECTED",
            "=" * 70,
            f"  Backend:   {self.hardware.name.upper()}",
            f"  Device:    {self.hardware.device_str}",
            f"  Vendor:    {self.hardware.vendor}",
            f"  GPU Type:  {'dGPU' if self.hardware.gpu_type == 'dGPU' else ('iGPU' if self.hardware.gpu_type == 'iGPU' else 'N/A')}",
        ]
        
        if self.hardware.vram_gb:
            info_msg.append(f"  VRAM:      {self.hardware.vram_gb:.1f} GB")
        else:
            info_msg.append("  VRAM:      N/A (shared memory)")
        
        info_msg.extend([
            f"  Precision: {self.hardware.precision}",
            f"  Reason:    {self.hardware.reason}",
            f"  Verified:  {'✓ YES' if self.hardware.verified else '✗ NO'}",
            "=" * 70,
        ])
        
        print("\n".join(info_msg))
        self.empty_classes = Config.EMPTY_CLASSES

    def detect(self, frame):
        """Run YOLO detection on frame"""
        if self.model is None:
            return []
        
        try:
            results = self.model(
                frame,
                conf=self.confidence,
                device=self.device,
                imgsz=self.imgsz,
                verbose=False
            )
            
            detections = []
            
            for result in results:
                boxes = result.boxes
                if boxes is None:
                    continue
                
                for box in boxes:
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
                    
                    conf = float(box.conf[0].item())
                    cls = int(box.cls[0].item())
                    
                    class_name = self.class_names.get(cls, f"class_{cls}")
                    
                    # Both classes are chickens
                    is_chicken = cls in self.chicken_classes
                    is_empty = cls in self.empty_classes
                    
                    center_x = (x1 + x2) // 2
                    center_y = (y1 + y2) // 2
                    
                    detections.append({
                        "x1": x1,
                        "y1": y1,
                        "x2": x2,
                        "y2": y2,
                        "bbox": [x1, y1, x2, y2],
                        "confidence": conf,
                        "class_id": cls,
                        "class_name": class_name,
                        "center_x": center_x,
                        "center_y": center_y,
                        "is_chicken": is_chicken,
                        "is_empty": is_empty,
                        "counted": False  # Tambahkan flag untuk counter
                    })
            
            return detections
            
        except Exception as e:
            print(f"[ERROR] Detection failed: {e}")
            return []

    def draw_detections(self, frame, detections):
        """Draw detection results on frame"""
        for det in detections:
            x1, y1, x2, y2 = det["x1"], det["y1"], det["x2"], det["y2"]
            conf = det["confidence"]
            name = det["class_name"]
            
            # Cek apakah sudah dihitung
            if det.get("counted", False):
                color = (0, 255, 0)  # Hijau - sudah dihitung
                label = f"✓ {name} {conf:.2f}"
            else:
                color = (0, 255, 255)  # Kuning - belum dihitung
                label = f"? {name} {conf:.2f}"
            
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame, label, (x1, y1-10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
            cv2.circle(frame, (det["center_x"], det["center_y"]), 4, (255, 0, 0), -1)
        
        return frame

    def get_chicken_count(self, detections):
        """Get count of chicken detections"""
        return len([d for d in detections if d.get("is_chicken", False)])

    def get_empty_count(self, detections):
        """Get count of empty shackle detections"""
        return len([d for d in detections if d.get("is_empty", False)])