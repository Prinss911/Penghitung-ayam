"""
Verify DroidCam is accessible by Flask server
"""
import cv2
from app.config import Config

print("="*70)
print("DROIDCAM VERIFICATION")
print("="*70)

print(f"\nConfig CAMERA_SOURCE: {Config.CAMERA_SOURCE}")
print(f"Expected: 1 (DroidCam virtual camera)")

# Test with CAP_DSHOW backend
cap = cv2.VideoCapture(Config.CAMERA_SOURCE, cv2.CAP_DSHOW)

if cap.isOpened():
    print(f"\n[OK] DSHOW opened camera {Config.CAMERA_SOURCE}")
    
    ret, frame = cap.read()
    
    if ret and frame is not None:
        h, s, c = frame.shape
        size_mb = h * s * c / 1024 / 1024
        
        print(f"[OK] Successfully read frame!")
        print(f"      Resolution: {s}x{h}")
        print(f"      Size: {size_mb:.1f} MB")
        
        # Save sample
        cv2.imwrite("droidcam_verify.jpg", frame)
        print(f"      Saved sample: droidcam_verify.jpg")
        
        cap.release()
        print("\n[SUCCESS] DroidCam working properly!")
        exit(0)
    else:
        print(f"\n[ERROR] Can't read frame from DroidCam")
        cap.release()
        exit(1)
else:
    print(f"\n[ERROR] Cannot open DroidCam at index {Config.CAMERA_SOURCE}")
    print("\nPossible issues:")
    print("- DroidCam app not running/streaming")
    print("- Virtual camera driver not installed")
    print("- Wrong camera index")
    exit(1)