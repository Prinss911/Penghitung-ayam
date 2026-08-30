#!/usr/bin/env python3
"""
Quick Camera Fix Script
Automatically tests and starts camera capture thread
"""

import cv2
import sys

print("="*70)
print("QUICK CAMERA FIX")
print("="*70)

# Step 1: Test if camera available
print("\nStep 1: Testing camera access...")

camera_found = False
for i in range(3):
    cap = cv2.VideoCapture(i, cv2.CAP_DSHOW)
    
    if cap.isOpened():
        ret, frame = cap.read()
        
        if ret and frame is not None:
            print(f"[OK] Camera {i} FOUND!")
            print(f"     Resolution: {frame.shape[1]}x{frame.shape[0]}")
            camera_found = True
            cap.release()
            break
    
    cap.release()

if not camera_found:
    print("\n[ERROR] No camera found!")
    print("\nPlease check:")
    print("1. Webcam connected?")
    print("2. Camera used by another app (Zoom, Teams)?")
    print("3. Windows privacy settings allow camera?")
    sys.exit(1)

print("\nStep 2: Camera test PASSED!")
print("\nNext steps:")
print("-"*70)
print("1. Stop any running Flask server (CTRL+C in that terminal)")
print("2. Run: python main.py")
print("3. Watch console for:")
print("   [CAPTURE] Started")
print("   [CAPTURE] Connected with backend: X")
print("4. Refresh browser: http://localhost:5000")
print("-"*70)
print("\nIf you still don't see video:")
print("- Check browser console (F12)")
print("- Try direct stream: http://localhost:5000/video_feed")
print("- See TROUBLESHOOTING_CAMERA.md for more help")
