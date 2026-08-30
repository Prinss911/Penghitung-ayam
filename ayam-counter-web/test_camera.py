"""
Simple camera test - check if webcam is accessible
"""
import cv2
import sys

print("Testing camera access...")

# Try with different backends
backends = [cv2.CAP_DSHOW, cv2.CAP_ANY]

for backend in backends:
    print(f"\nTrying backend: {backend}")
    
    try:
        cap = cv2.VideoCapture(0, backend)
        
        if not cap.isOpened():
            print("[FAIL] Camera opened failed")
            continue
        
        # Read frame
        ret, frame = cap.read()
        
        if ret and frame is not None:
            print("[SUCCESS] Camera works!")
            print(f"Resolution: {frame.shape[1]}x{frame.shape[0]}")
            
            # Save first frame
            cv2.imwrite("camera_test_frame.jpg", frame)
            print("Saved frame: camera_test_frame.jpg")
            
            cap.release()
            sys.exit(0)
        else:
            print("[FAIL] Cannot read frame")
            
    except Exception as e:
        print(f"[ERROR] {e}")

print("\n[RESULT] Camera NOT available or not working")
print("\nTo use webcam, you need:")
print("1. Connected webcam")
print("2. No other app using the camera")
print("3. Proper drivers installed")
