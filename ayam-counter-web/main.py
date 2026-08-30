#!/usr/bin/env python3
"""
Ayam Counter Web - Simple Entry Point
Run this from the project root directory:
    python main.py
    
Or if you want to start Flask server directly:
    python main.py --server
"""

import sys
import os

# Add current directory to Python path
if '' not in sys.path:
    sys.path.insert(0, '')

def main():
    """Main entry point"""
    
    print("="*70)
    print("AYAM COUNTER WEB")
    print("="*70)
    
    # Check for --server flag
    if len(sys.argv) > 1 and sys.argv[1] == "--server":
        start_server()
    else:
        print("\nStarting Ayam Counter Web application...")
        print("\nThis will start the Flask web server at:")
        print("  http://localhost:5000")
        print("\nPress CTRL+C to stop.")
        print()
        
        try:
            start_server()
        except KeyboardInterrupt:
            print("\n\nServer stopped by user")
            sys.exit(0)


def start_server():
    """Start Flask server"""
    
    try:
        import torch
        print(f"[OK] PyTorch loaded: {torch.__version__}")
        
        # Check CUDA
        if torch.cuda.is_available():
            cuda_device = torch.cuda.get_device_name(0)
            cuda_memory = torch.cuda.get_device_properties(0).total_memory / 1024**3
            print(f"[GPU] CUDA available: {cuda_device} ({cuda_memory:.1f} GB)")
        else:
            print("[CPU] No CUDA detected - running on CPU")
            
    except Exception as e:
        print(f"[WARN] Could not load PyTorch: {e}")
    
    print("\nLoading hardware detector...")
    
    try:
        from app.services.hardware import HardwareDetector
        hardware = HardwareDetector.detect()
        print("\n" + "="*70)
        print("HARDWARE PROFILE")
        print("="*70)
        print(f"Backend:   {hardware.name.upper()}")
        print(f"Device:    {hardware.device_str}")
        print(f"Vendor:    {hardware.vendor}")
        print(f"GPU Type:  {'dGPU' if hardware.gpu_type == 'dGPU' else ('iGPU' if hardware.gpu_type == 'iGPU' else 'N/A')}")
        if hardware.vram_gb:
            print(f"VRAM:      {hardware.vram_gb:.1f} GB")
        print(f"Precision: {hardware.precision}")
        print(f"Verified:  {'YES' if hardware.verified else 'NO'}")
        print("="*70 + "\n")
        
    except Exception as e:
        print(f"[WARN] Hardware detection failed: {e}")
        print("Running with default settings...")
    
    print("\nInitializing YOLO detector...")
    
    try:
        from app.services.detector import AyamDetector
        detector = AyamDetector()
        print(f"[OK] Detector initialized successfully!")
        print(f"  Device: {detector.device}")
        print(f"  Model loaded: {'Yes' if detector.model else 'No'}")
    except Exception as e:
        print(f"[ERROR] Detector initialization failed: {e}")
        print("Please ensure ultralytics model files are available.")
    
    print("\nStarting Flask server...")
    print("Access the web interface at: http://localhost:5000")
    print("\n" + "="*70)
    
    try:
        from app.app import app
        
        # CRITICAL FIX: Start camera capture threads before Flask runs
        print("\n[STARTUP] Initializing camera capture threads...")
        from app.app import start_threads
        start_threads()
        
        app.run(host="0.0.0.0", port=5000, debug=False)
        
    except Exception as e:
        print(f"\n[ERROR] Starting server: {e}")
        print("\nTo fix this error:")
        print("  1. Make sure all dependencies are installed:")
        print("     pip install torch ultralytics flask opencv-python")
        print("  2. Check that all .py files are in the correct locations")
        print("  3. If using GPU, ensure NVIDIA drivers are up to date")
        sys.exit(1)


if __name__ == "__main__":
    main()
