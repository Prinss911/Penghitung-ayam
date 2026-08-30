#!/usr/bin/env python3
"""
Video Processing Script for Ayam Counter Web
Uses hardware-first detection system

Usage:
    python test_video.py --video <path> [--camera 0]

Requirements:
    Hardware profile auto-detected at startup (CUDA > IGPU > CPU)
"""

import argparse
import sys
from pathlib import Path
from app.services.detector import AyamDetector
from app.config import Config
import cv2
import time


def process_video(video_path: str, detector: AyamDetector):
    """Process video file with YOLO detection"""
    
    print(f"\n{'='*70}")
    print(f"🎬 PROCESSING VIDEO: {Path(video_path).name}")
    print(f"{'='*70}\n")
    
    # Open video file
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        print(f"❌ ERROR: Cannot open video file: {video_path}")
        return
    
    # Get video properties
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    print(f"📊 Video Info:")
    print(f"   Resolution: {width} x {height}")
    print(f"   FPS: {fps:.2f}")
    print(f"   Duration: {frame_count / fps:.2f} seconds")
    print(f"   Frame Rate: {fps:.0f} fps")
    print()
    
    # Process frames
    total_chickens = 0
    total_empty = 0
    processed_frames = 0
    start_time = time.time()
    
    frame_times = []
    frame_data = {}
    
    try:
        while True:
            ret, frame = cap.read()
            
            if not ret:
                break
            
            # Detect on this frame
            frame_start = time.time()
            detections = detector.detect(frame)
            frame_time = (time.time() - frame_start) * 1000  # ms
            frame_times.append(frame_time)
            
            chicken_count = len([d for d in detections if d.get("is_chicken", False)])
            empty_count = len([d for d in detections if d.get("is_empty", False)])
            
            # Store data for this frame
            frame_data[processed_frames] = {
                "chicken": chicken_count,
                "empty": empty_count
            }
            
            total_chickens += chicken_count
            total_empty += empty_count
            
            processed_frames += 1
            
            # Print progress every 5 frames
            if processed_frames % 5 == 0:
                elapsed = time.time() - start_time
                avg_fps = processed_frames / elapsed
                print(f"\r📋 Frame {processed_frames}/{frame_count} | "
                      f"Avg: {avg_fps:.1f} FPS | "
                      f"Chicken: {total_chickens} | Empty: {total_empty} | "
                      f"Last: {frame_time:.1f}ms", end="")
            
            # Optional: Draw detections (slow down!)
            frame = detector.draw_detections(frame, detections)
            
            # Show output video (optional - very slow)
            # cv2.imwrite(f'output_frame_{processed_frames:04d}.jpg', frame)
            
    except KeyboardInterrupt:
        print(f"\n⚠️ Interrupted by user!")
    except Exception as e:
        print(f"\n❌ Error during processing: {e}")
        raise
    finally:
        cap.release()
    
    # Calculate final stats
    elapsed = time.time() - start_time
    avg_fps = processed_frames / elapsed
    avg_inference_time = sum(frame_times) / len(frame_times)
    
    print(f"\n\n{'='*70}")
    print(f"✅ PROCESSING COMPLETE!")
    print(f"{'='*70}")
    print(f"📊 Statistics:")
    print(f"   Total Frames Processed: {processed_frames}")
    print(f"   Total Processing Time: {elapsed:.2f} seconds")
    print(f"   Average FPS: {avg_fps:.1f}")
    print(f"   Average Inference Time: {avg_inference_time:.1f}ms per frame")
    print(f"   Detection Rate: {avg_fps * 100:.0f}% of target ({fps:.0f} fps)")
    print()
    print(f"🐔 Counting Results:")
    print(f"   Total Chicken Detections: {total_chickens}")
    print(f"   Total Empty Shackle Detections: {total_empty}")
    print(f"   Unique Frames with Objects: {len(frame_data)}")
    print()
    print(f"📈 Per-Frame Data:")
    for frame_num, data in list(frame_data.items())[:20]:  # First 20 frames
        print(f"   Frame {frame_num}: chicken={data['chicken']}, empty={data['empty']}")
    if len(frame_data) > 20:
        print(f"   ... and {len(frame_data) - 20} more frames")
    print()
    print(f"{'='*70}")


def main():
    parser = argparse.ArgumentParser(
        description="Process video file with Ayam Counter Web detection",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python test_video.py --video video_shackle_berisi.mp4
  python test_video.py --video path/to/video.mp4 --camera 0
        """
    )
    
    parser.add_argument(
        "--video", 
        "-v",
        required=True,
        help="Path to video file to process"
    )
    
    parser.add_argument(
        "--camera",
        "-c",
        type=int,
        default=Config.CAMERA_SOURCE,
        help=f"Camera source index (default: {Config.CAMERA_SOURCE})"
    )
    
    parser.add_argument(
        "--confidence",
        "-conf",
        type=float,
        default=Config.CONFIDENCE_THRESHOLD,
        help=f"Confidence threshold (default: {Config.CONFIDENCE_THRESHOLD})"
    )
    
    args = parser.parse_args()
    
    # Validate video file exists
    if not Path(args.video).exists():
        print(f"❌ ERROR: Video file not found: {args.video}")
        sys.exit(1)
    
    print(f"\n{'='*70}")
    print(f"🎯 AYAM COUNTER WEB - VIDEO PROCESSOR")
    print(f"{'='*70}")
    print(f"Starting hardware detection...")
    print()
    
    # Initialize detector (auto-detects hardware)
    print("🖥️ Initializing detector...")
    detector = AyamDetector()
    
    print(f"✓ Detector initialized successfully!")
    print(f"   Device: {detector.device}")
    print(f"   Confidence: {detector.confidence}")
    print(f"   Input Size: {detector.imgsz}")
    print()
    
    # Process video
    process_video(args.video, detector)
    
    print("\n✨ All done! Check console output above.\n")


if __name__ == "__main__":
    main()
