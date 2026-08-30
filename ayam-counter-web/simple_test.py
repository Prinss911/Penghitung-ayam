#!/usr/bin/env python3
"""
Simple Video Test for Ayam Counter Web
Works with BOTH webcam and video files

Usage:
  # Test video file (no dependencies needed - uses OpenCV only)
  python simple_test.py video
  
  # Or specify video path
  python simple_test.py --video video_shackle_berisi.mp4
  
  # Test webcam
  python simple_test.py --webcam

Requirements:
  pip install opencv-python
"""

import argparse
import time
from pathlib import Path


def test_video_file(video_path):
    """Test reading video file frames"""
    
    print("\n" + "="*70)
    print("TESTING VIDEO FILE")
    print("="*70)
    
    if not Path(video_path).exists():
        print(f"\nERROR: File not found: {video_path}")
        return False
    
    try:
        import cv2
        
        # Get file size using os module (fixes WindowsPath issue)
        import os
        file_size_mb = os.path.getsize(video_path) / 1024 / 1024
        
        print(f"\nVideo file: {Path(video_path).name}")
        print(f"Size: ~{file_size_mb:.1f} MB")
        
        # Open video
        cap = cv2.VideoCapture(video_path)
        
        if not cap.isOpened():
            print("\nERROR: Cannot open video file")
            return False
        
        # Get properties
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        print("\nVideo properties:")
        print(f"  Resolution: {width} x {height}")
        print(f"  Frame rate: {fps:.1f} fps")
        print(f"  Duration: {frame_count / fps:.1f} seconds")
        print(f"  Total frames: {frame_count}")
        
        # Test reading frames
        print("\nReading frames...")
        start_time = time.time()
        frames_read = 0
        
        while True:
            ret, frame = cap.read()
            
            if not ret:
                break
            
            frames_read += 1
            
            # Progress every 50 frames
            if frames_read % 50 == 0:
                elapsed = time.time() - start_time
                progress = (frames_read / frame_count) * 100
                print(f"\rProgress: {frames_read}/{frame_count} ({progress:.0f}%) | Time: {elapsed:.1f}s", end="")
        
        elapsed = time.time() - start_time
        cap.release()
        
        avg_fps = frames_read / elapsed
        
        print("\n\n" + "="*70)
        print("TEST PASSED!")
        print("="*70)
        print(f"\nResults:")
        print(f"  Frames processed: {frames_read}")
        print(f"  Processing time: {elapsed:.1f} seconds")
        print(f"  Speed: {avg_fps:.1f} frames per second")
        
        # Success message
        if elapsed < 60 and avg_fps > 10:
            print("\n[OK] Video file works correctly!")
            print("\nTo run YOLO detection:")
            print("  pip install ultralytics torch")
            print("  python app.py")
            print("  # Then use the web interface or API")
        else:
            print("\nWARNING: Slow processing detected")
            print("This is normal on older CPUs without GPU acceleration")
        
        return True
        
    except Exception as e:
        print(f"\nERROR: {e}")
        return False


def test_webcam(camera_id=0):
    """Test webcam input"""
    
    print("\n" + "="*70)
    print("TESTING WEBCAM")
    print("="*70)
    
    try:
        import cv2
        
        print(f"\nTrying camera ID: {camera_id}")
        
        # Try to open camera
        cap = cv2.VideoCapture(camera_id, cv2.CAP_DSHOW)
        
        if not cap.isOpened():
            print("\nERROR: Cannot open camera")
            print("\nSolutions:")
            print("  1. Make sure camera is connected")
            print("  2. Close other apps using the camera")
            print("  3. Try different camera ID:")
            print("     python simple_test.py --webcam --camera 1")
            return False
        
        # Get properties
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        
        print("\nCamera opened successfully!")
        print(f"\nProperties:")
        print(f"  Resolution: {width} x {height}")
        print(f"  Frame rate: {fps:.1f} fps")
        
        # Read one frame to verify
        ret, frame = cap.read()
        
        if not ret:
            print("\nERROR: Cannot read frame from camera")
            cap.release()
            return False
        
        print(f"\nFrame captured: {frame.shape}")
        
        # Show preview briefly (optional)
        print("\nPress any key to continue...")
        print("(Camera preview will close automatically)")
        
        # Cap preview time to 2 seconds
        preview_start = time.time()
        max_preview = 2
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            # Display frame (small size for speed)
            small = cv2.resize(frame, (320, 240))
            cv2.imshow('Preview', small)
            
            key = cv2.waitKey(1) & 0xFF
            if key != -1:  # Any key pressed
                break
            
            # Auto-exit after timeout
            if time.time() - preview_start > max_preview:
                break
        
        cap.release()
        cv2.destroyAllWindows()
        
        print("\n" + "="*70)
        print("WEBCAM TEST PASSED!")
        print("="*70)
        print("\nWebcam is working correctly!")
        
        return True
        
    except Exception as e:
        print(f"\nERROR: {e}")
        return False


def list_available_videos():
    """Show available video files"""
    videos = ["video_shackle_berisi.mp4", "video_shackle_kosong.mp4"]
    
    print("\nAvailable video files:")
    for v in videos:
        if Path(v).exists():
            size = Path(v).stat().st_size/1024/1024  # Fixed: use stat().st_size
            print(f"  [OK] {v} ({size:.1f} MB)")
        else:
            print(f"  [MISSING] {v}")
    
    print("\nYou can also provide your own video:")
    print("  python simple_test.py --video /path/to/your/video.mp4")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Test Ayam Counter Web with video or webcam",
        epilog="""
Examples:
  Video file test:
    python simple_test.py --video video_shackle_berisi.mp4
    python simple_test.py --video video_shackle_kosong.mp4

  Webcam test:
    python simple_test.py --webcam
    python simple_test.py --webcam --camera 1

  Quick test (uses first video file found):
    python simple_test.py
        """
    )
    
    group = parser.add_mutually_exclusive_group(required=False)
    group.add_argument("--video", "-v", help="Path to video file to test")
    group.add_argument("--webcam", "-c", action="store_true", help="Test webcam instead of video")
    
    parser.add_argument("--camera", type=int, default=0, 
                        help="Camera ID (default: 0)")
    
    args = parser.parse_args()
    
    # If no argument given, show videos and quick test
    if not (args.video or args.webcam):
        list_available_videos()
        
        # Quick test with first available video
        print("\nQuick testing first video file...")
        
        for v in ["video_shackle_berisi.mp4", "video_shackle_kosong.mp4"]:
            if Path(v).exists():
                test_video_file(v)
                exit(0)
        
        print("\nNo video files found!")
        print("Use --video <path> to specify a file")
        exit(1)
    
    # Mode: Webcam
    elif args.webcam:
        success = test_webcam(args.camera)
        exit(0 if success else 1)
    
    # Mode: Video
    elif args.video:
        success = test_video_file(args.video)
        exit(0 if success else 1)
    
    # Default
    else:
        parser.print_help()
        exit(1)
