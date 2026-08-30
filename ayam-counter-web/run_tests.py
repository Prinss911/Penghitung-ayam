#!/usr/bin/env python3
"""
Ayam Counter Web - Full Test Script
Supports both Webcam and Video File modes

Usage (Webcam):
    python run_tests.py --mode webcam [--camera 0]

Usage (Video):
    python run_tests.py --mode video --video <path>

Example:
    python run_tests.py --mode video --video video_shackle_berisi.mp4
"""

import argparse
from pathlib import Path


def print_separator(title=None):
    """Print separator line"""
    print("\n" + "="*70)
    if title:
        print(f" {title}")
        print("="*70)
    else:
        print("="*70)


def check_dependencies():
    """Check if required packages are installed"""
    print("Checking dependencies...")
    
    missing = []
    
    try:
        import cv2
        print(f"  ✓ OpenCV: available")
    except ImportError:
        print(f"  ✗ OpenCV: NOT INSTALLED")
        missing.append("opencv-python")
    
    try:
        import torch
        print(f"  ✓ PyTorch: available (version {torch.__version__})")
    except ImportError:
        print(f"  ✗ PyTorch: NOT INSTALLED")
        missing.append("torch")
    
    try:
        from ultralytics import YOLO
        print(f"  ✓ Ultralytics YOLO: available")
    except ImportError:
        print(f"  ✗ Ultralytics YOLO: NOT INSTALLED")
        missing.append("ultralytics")
    
    try:
        import flask
        print(f"  ✓ Flask: available")
    except ImportError:
        print(f"  ✗ Flask: NOT INSTALLED")
        missing.append("flask")
    
    return len(missing) == 0, missing


def check_hardware():
    """Check hardware capabilities"""
    print("\nHardware Detection:")
    
    try:
        import torch
        
        # Check CUDA
        if torch.cuda.is_available():
            cuda_device = torch.cuda.get_device_name(0)
            cuda_memory = torch.cuda.get_device_properties(0).total_memory / 1024**3
            print(f"  GPU: NVIDIA found!")
            print(f"    Device: {cuda_device}")
            print(f"    VRAM: {cuda_memory:.1f} GB")
            print(f"    Status: READY for acceleration")
            has_gpu = True
        else:
            print(f"  No NVIDIA GPU detected")
            print(f"    Falling back to CPU mode")
            has_gpu = False
        
        # Show device info
        print(f"\n  Current setup:")
        print(f"    Device string: cuda:{0} if CUDA available else cpu")
        
    except Exception as e:
        print(f"  Hardware check failed: {e}")
        has_gpu = False
    
    return has_gpu


def test_webcam(camera_source=0):
    """Test webcam input"""
    print(f"\n[WEBCAM TEST] Testing camera {camera_source}...")
    
    try:
        import cv2
        
        cap = cv2.VideoCapture(camera_source, cv2.CAP_DSHOW)
        
        if not cap.isOpened():
            print(f"ERROR: Cannot open camera {camera_source}")
            print(f"       Make sure camera is connected and not used by other apps")
            return False
        
        # Get properties
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        
        print(f"Camera opened successfully!")
        print(f"  Resolution: {width} x {height}")
        print(f"  FPS: {fps:.1f}")
        
        # Try reading a frame
        ret, frame = cap.read()
        
        if not ret:
            print(f"ERROR: Failed to read frame from camera")
            cap.release()
            return False
        
        print(f"  Frame read successfully: {frame.shape}")
        print(f"\n✅ WEBCAM TEST PASSED!")
        
        # Show sample frame (optional - very slow!)
        # cv2.imwrite(f'camera_{camera_source}_test.jpg', frame)
        # print(f"Saved first frame to camera_{camera_source}_test.jpg")
        
        cap.release()
        return True
        
    except Exception as e:
        print(f"ERROR in webcam test: {e}")
        return False


def test_video_file(video_path, detector=None):
    """Test video file processing"""
    print(f"\n[VIDEO TEST] Testing video file...")
    
    if not Path(video_path).exists():
        print(f"ERROR: Video file not found: {video_path}")
        return False
    
    print(f"Video file: {Path(video_path).name}")
    print(f"Size: ~{Path(video_path).size/1024/1024:.1f} MB")
    
    try:
        import cv2
        
        cap = cv2.VideoCapture(video_path)
        
        if not cap.isOpened():
            print(f"ERROR: Cannot open video file")
            return False
        
        # Get properties
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        print(f"  Resolution: {width} x {height}")
        print(f"  FPS: {fps:.1f}")
        print(f"  Duration: {frame_count/fps:.1f} seconds")
        print(f"  Frames: {frame_count}")
        
        # Test reading few frames
        import time
        start_time = time.time()
        frames_read = 0
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            frames_read += 1
            if frames_read % 50 == 0:
                elapsed = time.time() - start_time
                print(f"  Progress: {frames_read}/{frame_count} ({(frames_read/frame_count)*100:.0f}%) | {elapsed:.1f}s")
        
        elapsed = time.time() - start_time
        cap.release()
        
        avg_fps = frames_read / elapsed
        
        print(f"\n✅ VIDEO TEST PASSED!")
        print(f"   Processed: {frames_read} frames in {elapsed:.1f} seconds")
        print(f"   Speed: {avg_fps:.1f} fps")
        
        if detector:
            print(f"\nWith YOLO detection:")
            try:
                from app.services.detector import AyamDetector
                
                detector = AyamDetector()  # Auto-detect hardware
                
                # Test on first frame only
                cap = cv2.VideoCapture(video_path)
                ret, frame = cap.read()
                
                if ret:
                    start_detect = time.time()
                    detections = detector.detect(frame)
                    detect_time = (time.time() - start_detect) * 1000
                    
                    chicken_count = len([d for d in detections if d.get("is_chicken", False)])
                    empty_count = len([d for d in detections if d.get("is_empty", False)])
                    
                    print(f"   Detection time: {detect_time:.1f}ms per frame")
                    print(f"   Objects found: {len(detections)} total")
                    print(f"   Chickens: {chicken_count}, Empty shackles: {empty_count}")
                    
                    cap.release()
                
            except Exception as e:
                print(f"   ERROR during detection: {e}")
                print(f"   NOTE: Install ultralytics and other dependencies first")
        
        return True
        
    except Exception as e:
        print(f"ERROR in video test: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Test Ayam Counter Web with webcam or video",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  Full test (check deps + hardware + video):
    python run_tests.py --mode full

  Webcam test:
    python run_tests.py --mode webcam --camera 0

  Video test:
    python run_tests.py --mode video --video video_shackle_berisi.mp4
    python run_tests.py --mode video --video video_shackle_kosong.mp4
        """
    )
    
    parser.add_argument(
        "--mode",
        "-m",
        choices=["full", "webcam", "video"],
        default="full",
        help="Test mode: 'full' (all), 'webcam', or 'video'"
    )
    
    parser.add_argument(
        "--camera",
        "-c",
        type=int,
        default=0,
        help="Camera source index (default: 0)"
    )
    
    parser.add_argument(
        "--video",
        "-v",
        help="Video file path to process"
    )
    
    args = parser.parse_args()
    
    # Show header
    print_separator("AYAM COUNTER WEB - TEST SCRIPT")
    
    # Mode: FULL - do everything
    if args.mode == "full":
        print("\nRunning FULL test suite...\n")
        
        # Check dependencies
        success, missing = check_dependencies()
        
        if missing:
            print(f"\nMissing packages: {', '.join(missing)}")
            print(f"To install: pip install {' '.join(missing)}")
        
        # Check hardware
        has_gpu = check_hardware()
        
        # Check available videos
        print_separator("Available Videos")
        for video in ["video_shackle_berisi.mp4", "video_shackle_kosong.mp4"]:
            if Path(video).exists():
                size = Path(video).size/1024/1024
                print(f"  [OK] {video} ({size:.1f} MB)")
            else:
                print(f"  [MISSING] {video}")
        
        # Test webcam if dependencies ok
        if success:
            print_separator("Testing Webcam")
            webcam_ok = test_webcam(args.camera)
        else:
            print("Skipping webcam test (dependencies not met)")
        
        # Test videos
        print_separator("Testing Videos")
        for video in ["video_shackle_berisi.mp4", "video_shackle_kosong.mp4"]:
            if Path(video).exists():
                video_ok = test_video_file(video)
                print()
        
        print_separator("SUMMARY")
        print("All tests completed!")
        print("\nTo use in production:")
        print("  python run_tests.py --mode video --video your_video.mp4")
        print("\nOr start web interface:")
        print("  python app.py")
        
    # Mode: WEBCAM only
    elif args.mode == "webcam":
        print(f"\nTesting webcam {args.camera}...")
        
        success, missing = check_dependencies()
        if not success:
            print(f"\nDependencies missing: {missing}")
            print("Install them first with: pip install opencv-python ultralytics torch")
            return
        
        ok = test_webcam(args.camera)
        return 0 if ok else 1
    
    # Mode: VIDEO only
    elif args.mode == "video":
        if not args.video:
            print("ERROR: Must specify video file with --video <path>")
            print("Example: python run_tests.py --mode video --video video_shackle_berisi.mp4")
            return 1
        
        video_ok = test_video_file(args.video)
        print(f"\n{'='*70}")
        if video_ok:
            print("Video test PASSED!")
        else:
            print("Video test FAILED!")
        
        return 0 if video_ok else 1


if __name__ == "__main__":
    import sys
    sys.exit(main() or 0)
