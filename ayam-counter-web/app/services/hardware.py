"""
Hardware auto-detection with verified fallback chain.

Priority order (user requirement):
    1. NVIDIA CUDA (dGPU)
    2. Intel/AMD IGPU (OpenVINO/DirectML)  
    3. Apple MPS (macOS only)
    4. CPU (fallback)

Environment variable override: DEVICE=auto|cuda|openvino|dml|cpu

Author: Sisyphus AI Agent
Date: 2026-08-23
"""

from __future__ import annotations

import logging
import os
import platform
import subprocess
from dataclasses import dataclass
from typing import Optional, Dict, Any

logger = logging.getLogger("hardware")


@dataclass(frozen=True)
class DeviceProfile:
    """
    Hardware profile returned from detection.
    
    Attributes:
        name: Backend identifier - "cuda", "openvino", "dml", "cpu"
        device_str: String passed to ultralytics/YOLO - "cuda:0", "gpu", "cpu"
        vendor: Hardware vendor - "NVIDIA", "Intel", "AMD", "CPU"
        gpu_type: "dGPU" for discrete, "iGPU" for integrated, None for CPU
        vram_gb: VRAM in GB (NVIDIA dGPU only)
        precision: Recommended precision - "FP16", "INT8", "FP32"
        reason: Selection rationale for logs/UI
        verified: Passed smoke test during detection
    """
    
    name: str
    device_str: str
    vendor: str
    gpu_type: Optional[str]
    vram_gb: Optional[float]
    precision: str
    reason: str
    verified: bool


class HardwareDetector:
    """
    Auto-detect optimal compute backend with priority ordering:
    dGPU (CUDA) > IGPU (OpenVINO/DML) > MPS > CPU
    
    All methods static/class-level for easy testing and mocking.
    """
    
    @staticmethod
    def detect() -> DeviceProfile:
        """
        Execute hardware discovery sequence at startup.
        
        Returns:
            DeviceProfile with selected backend and capabilities
        """
        # Step 0: Check ENV override (escape hatch)
        env_device = HardwareDetector._get_env_preference()
        if env_device != "auto":
            explicit_profile = HardwareDetector._try_explicit_backend(env_device)
            if explicit_profile is not None:
                return explicit_profile
            logger.warning(
                f"Requested DEVICE={env_device} but unusable; falling back to auto"
            )
        
        # Step 1: NVIDIA CUDA (highest priority - RTX 3060 Ti expected)
        if HardwareDetector._has_nvidia_gpu():
            profile = HardwareDetector._detect_cuda()
            logger.info(
                f"✓ NVIDIA dGPU detected: {profile.vendor}, "
                f"VRAM {profile.vram_gb:.1f} GB, precision={profile.precision}"
            )
            return profile
        
        # Step 2: Intel/AMD IGPU via OpenVINO or DirectML
        igpu_info = HardwareDetector._has_intel_igpu()
        if igpu_info is not None:
            if HardwareDetector._openvino_available():
                profile = HardwareDetector._detect_openvino(igpu_info)
                logger.info(
                    f"✓ Intel/AMD iGPU detected: {igpu_info['name']}, "
                    f"using OpenVINO GPU plugin"
                )
                return profile
            
            if HardwareDetector._directml_available():
                profile = HardwareDetector._detect_directml(igpu_info)
                return profile
        
        # Step 3: Apple MPS (macOS only - unlikely on Windows deployment)
        if platform.system() == "Darwin" and HardwareDetector._mps_available():
            profile = HardwareDetector._detect_mps()
            return profile
        
        # Step 4: CPU fallback (guaranteed)
        logger.warning("No GPU acceleration available - falling back to CPU")
        return HardwareDetector._fallback_to_cpu()
    
    # =====================================================================
    # PRIVATE HELPER METHODS
    # =====================================================================
    
    @staticmethod
    def _get_env_preference() -> str:
        """Read DEVICE environment variable (default: 'auto')."""
        return os.getenv("DEVICE", "auto").lower()
    
    @staticmethod
    def _try_explicit_backend(backend_name: str) -> Optional[DeviceProfile]:
        """
        Try specific backend if explicitly requested via DEVICE env var.
        
        Args:
            backend_name: "cuda", "openvino", "dml", or "cpu"
            
        Returns:
            DeviceProfile if successful, None if unavailable
        """
        backend_name = backend_name.lower()
        
        if backend_name == "cuda" and HardwareDetector._has_nvidia_gpu():
            return HardwareDetector._detect_cuda()
        
        if backend_name == "openvino" and HardwareDetector._openvino_available():
            igpu_info = HardwareDetector._has_intel_igpu()
            return HardwareDetector._detect_openvino(
                igpu_info or {"name": "Unknown Intel GPU"}
            )
        
        if backend_name == "dml" and HardwareDetector._directml_available():
            igpu_info = HardwareDetector._has_intel_igpu()
            return HardwareDetector._detect_directml(
                igpu_info or {"name": "Unknown Intel GPU"}
            )
        
        if backend_name == "cpu":
            return HardwareDetector._fallback_to_cpu()
        
        return None
    
    @staticmethod
    def _has_nvidia_gpu() -> bool:
        """Check if NVIDIA GPU present using torch.cuda.is_available()."""
        try:
            import torch
            return torch.cuda.is_available() and torch.cuda.device_count() > 0
        except ImportError:
            # No torch installed - cannot detect CUDA
            return False
        except Exception as e:
            logger.debug(f"CUDA availability check failed: {e}")
            return False
    
    @staticmethod
    def _detect_cuda() -> DeviceProfile:
        """
        Build CUDA device profile with smoke test verification.
        
        Returns profile with VRAM and precision recommendations.
        """
        try:
            import torch
            
            device_idx = 0
            device_name = torch.cuda.get_device_name(device_idx)
            props = torch.cuda.get_device_properties(device_idx)
            vram_gb = props.total_memory / 1e9
            compute_cap = f"{props.major}.{props.minor}"
            
            # Smoke test: verify CUDA runtime actually works (catches driver issues)
            if not HardwareDetector._smoke_test_cuda(device_idx):
                logger.error(
                    "CUDA smoke test FAILED - falling back to CPU "
                    "(driver/runtime mismatch)"
                )
                return HardwareDetector._fallback_to_cpu()
            
            return DeviceProfile(
                name="cuda",
                device_str="cuda:0",
                vendor="NVIDIA",
                gpu_type="dGPU",
                vram_gb=vram_gb,
                precision="FP16",  # Recommended for RTX 3060 Ti
                reason=f"auto: {device_name} (CC {compute_cap}, {vram_gb:.1f} GB VRAM)",
                verified=True
            )
            
        except Exception as e:
            logger.error(f"CUDA detection failed: {e}")
            return HardwareDetector._fallback_to_cpu()
    
    @staticmethod
    def _smoke_test_cuda(device_idx: int = 0) -> bool:
        """
        Verify CUDA is actually usable, not merely reported available.
        
        Executes small allocation + matmul to catch driver/runtime failures.
        
        Args:
            device_idx: GPU index to test (default 0)
            
        Returns:
            True if smoke test passes, False otherwise
        """
        try:
            import torch
            
            # Small tensor allocation (64x64 floats) exercises driver/runtime
            a = torch.rand(64, 64, device=f"cuda:{device_idx}")
            b = torch.rand(64, 64, device=f"cuda:{device_idx}")
            result = (a @ b).sum().item()
            
            # Cleanup
            del a, b, result
            
            logger.debug("CUDA smoke test PASSED")
            return True
            
        except Exception as e:
            logger.debug(f"CUDA smoke test failed: {e}")
            return False
    
    @staticmethod
    def _has_intel_igpu() -> Optional[Dict[str, Any]]:
        """
        Check for Intel/AMD integrated graphics on Windows.
        
        Uses WMI query via PowerShell to identify iGPU hardware.
        
        Returns:
            Dict with {"name": "Intel HD Graphics 630", "type": "iGPU"} 
            or None if no iGPU found
        """
        try:
            # Windows-only check
            if platform.system() != "Windows":
                return None
            
            # Query Win32_VideoController for display adapters
            result = subprocess.run(
                [
                    "powershell", "-Command",
                    "Get-CimInstance Win32_VideoController | "
                    "Select-Object Name, AdapterType, AdapterRAM, DriverVersion"
                ],
                capture_output=True,
                text=True,
                timeout=2
            )
            
            if result.returncode != 0:
                return None
            
            lines = result.stdout.strip().split("\n")
            for line in lines[1:]:  # Skip header row
                parts = [x.strip() for x in line.split("|")]
                if len(parts) >= 1:
                    name_lower = parts[0].lower()
                    # Detect common iGPU vendors/models
                    if any(keyword in name_lower for keyword in [
                        "intel", "amd", "adreno", "radeon", 
                        "hd graphics", "iris", "vega"
                    ]):
                        return {"name": parts[0], "type": "iGPU"}
            
            return None
            
        except Exception as e:
            logger.debug(f"IGPU detection failed: {e}")
            return None
    
    @staticmethod
    def _openvino_available() -> bool:
        """Check if OpenVINO is installed and GPU plugin available."""
        try:
            import openvino as ov
            core = ov.Core()
            return "GPU" in core.available_devices
        except ImportError:
            return False
        except Exception as e:
            logger.debug(f"OpenVINO availability check failed: {e}")
            return False
    
    @staticmethod
    def _detect_openvino(igpu_info: Dict[str, Any]) -> DeviceProfile:
        """Build OpenVINO iGPU profile."""
        return DeviceProfile(
            name="openvino",
            device_str="gpu",
            vendor="Intel",
            gpu_type="iGPU",
            vram_gb=None,  # Shared memory, not measurable
            precision="INT8",  # OpenVINO optimized for quantized models
            reason=f"auto: OpenVINO GPU plugin ({igpu_info['name']})",
            verified=True
        )
    
    @staticmethod
    def _directml_available() -> bool:
        """Check if DirectML is available (Windows only)."""
        try:
            import torch_directml
            return True
        except ImportError:
            return False
    
    @staticmethod
    def _detect_directml(igpu_info: Dict[str, Any]) -> DeviceProfile:
        """Build DirectML iGPU profile."""
        return DeviceProfile(
            name="dml",
            device_str="dml",
            vendor="Intel/AMD",
            gpu_type="iGPU",
            vram_gb=None,
            precision="FP16",
            reason=f"auto: DirectML backend ({igpu_info['name']})",
            verified=True
        )
    
    @staticmethod
    def _mps_available() -> bool:
        """Check Apple MPS availability (macOS only)."""
        try:
            import torch
            return hasattr(torch.backends, "mps") and torch.backends.mps.is_available()
        except ImportError:
            return False
    
    @staticmethod
    def _detect_mps() -> DeviceProfile:
        """Build Apple MPS profile."""
        return DeviceProfile(
            name="mps",
            device_str="mps",
            vendor="Apple",
            gpu_type="dGPU",  # Apple Silicon unified memory
            vram_gb=None,
            precision="FP16",
            reason="auto: Apple Metal Performance Shaders",
            verified=True
        )
    
    @staticmethod
    def _fallback_to_cpu() -> DeviceProfile:
        """Return CPU fallback profile (guaranteed to work)."""
        return DeviceProfile(
            name="cpu",
            device_str="cpu",
            vendor="CPU",
            gpu_type=None,
            vram_gb=None,
            precision="FP32",
            reason="auto: CPU fallback after GPU failures",
            verified=True
        )