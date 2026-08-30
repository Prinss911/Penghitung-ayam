"""
DroidCam Test - Try different camera indices
"""
import cv2

print("Testing DroidCam...")

for i in range(3):
    print(f"\nTrying Camera {i}:")
    
    cap = cv2.VideoCapture(i)
    if cap.isOpened():
        ret, frame = cap.read()
        print(f"  Opened: YES")
        print(f"  Frame read: {'YES' if ret else 'NO'}")
        
        if ret:
            print(f"  Resolution: {frame.shape[1]}x{frame.shape[0]}")
            filename = f"droidcam_cam{i}.jpg"
            cv2.imwrite(filename, frame)
            print(f"  Saved: {filename}")
            
            cap.release()
            print(f"\n  [OK] SUCCESS with camera index {i}!")
            exit(0)
        else:
            print(f"  Can't read frames")
            cap.release()
    else:
        print(f"  Opened: NO")

print("\n[FAIL] No virtual camera found (DroidCam not running?)")
