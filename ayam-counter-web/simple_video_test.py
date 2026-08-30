#!/usr/bin/env python3
"""
Simple Video Test Script - No hardware dependency
Tests if video can be processed with basic OpenCV only
"""

import cv2
from pathlib import Path
import time
import sys

# Fix Windows console encoding
if sys.stdout.encoding == 'cp1252':
    import codecs
    # Force UTF-8 output
    try:
        sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    except:
        pass


def test_video_basic(video_path: str):
    """Test video file with basic OpenCV only"""
    
    print(f"\n{'='*70}")
    print(f"SIMPLE VIDEO TEST")
    print(f"{'='*70}\n")
    
    # Validate file
    if not Path(video_path).exists():
        print(f"ERROR: Video file not found: {video_path}")
        return False
    
    # Open video
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        print(f"ERROR: Cannot open video: {video_path}")
        return False
    
    # Get properties
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    print(f"Video OPENED successfully!")
    print(f"\nVideo Properties:")
    print(f"   Resolution: {width} x {height}")
    print(f"   FPS: {fps:.2f}")
    print(f"   Duration: {frame_count / fps:.2f} seconds")
    print(f"   File Size: ~{Path(video_path).size/1024/1024:.1f} MB")
    print()
    
    # Test read frames
    start_time = time.time()
    frames_read = 0
    
    while True:
        ret, frame = cap.read()
        
        if not ret:
            break
        
        frames_read += 1
        
        # Show progress every 50 frames
        if frames_read % 50 == 0:
            elapsed = time.time() - start_time
            print(f"\rProgress: {frames_read}/{frame_count} ({(frames_read/frame_count)*100:.1f}%) | "
                  f"Time: {elapsed:.1f}s", end="")
    
    elapsed = time.time() - start_time
    cap.release()
    
    print(f"\n\n{'='*70}")
    print(f"BASIC TEST COMPLETE!")
    print(f"{'='*70}")
    print(f"Results:")
    print(f"   Total Frames Read: {frames_read}")
    print(f"   Processing Time: {elapsed:.2f} seconds")
    print(f"   Frame Rate: {frames_read/elapsed:.1f} fps")
    print()
    
    if frames_read > 0 and elapsed < 60:
        print("TEST PASSED - Video file is valid!\n")
        return True
    else:
        print("TEST WARNING - Slow processing or issues detected\n")
        return False


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python simple_test.py <video_file>")
        print("\nExamples:")
        print("  python simple_test.py video_shackle_berisi.mp4")
        print("  python simple_test.py video_shackle_kosong.mp4")
        sys.exit(1)
    
    video_file = sys.argv[1]
    
    # List available videos
    print("\n📁 Available video files:")
    for video in ["video_shackle_berisi.mp4", "video_shackle_kosong.mp4"]:
        if Path(video).exists():
            size = Path(video).size/1024/1024
            print(f"   ✅ {video} ({size:.1f} MB)")
        else:
            print(f"   ❌ {video} (not found)")
    
    print(f"\n▶️  Testing: {video_file}\n")
    
    success = test_video_basic(video_file)
    sys.exit(0 if success else 1)
