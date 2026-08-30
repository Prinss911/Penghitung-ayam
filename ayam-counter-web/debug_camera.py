"""
Flask Camera Feed Debug Test
Checks if camera capture works properly
"""
import cv2
from pathlib import Path

print("="*70)
print("CAMERA CAPTURE DEBUG TEST")
print("="*70)

# Check available cameras
print("\n1. Testing Camera Sources...")
for i in range(3):
    print(f"\n  Trying camera ID {i}:")
    
    try:
        # Try different backends
        backends = [cv2.CAP_DSHOW, cv2.CAP_FFMPEG, cv2.CAP_ANY]
        
        for backend_name, backend_id in [("DSHOW", cv2.CAP_DSHOW), 
                                         ("FFMPEG", cv2.CAP_FFMPEG), 
                                         ("ANY", cv2.CAP_ANY)]:
            cap = cv2.VideoCapture(i, backend_id)
            
            if cap.isOpened():
                ret, frame = cap.read()
                
                if ret and frame is not None:
                    print(f"    ✓ SUCCESS with {backend_name}")
                    print(f"      Resolution: {frame.shape[1]}x{frame.shape[0]}")
                    
                    # Save sample
                    sample_file = f"camera_{i}_{backend_name.lower()}.jpg"
                    cv2.imwrite(sample_file, frame)
                    print(f"      Sample saved: {sample_file}")
                    
                    cap.release()
                    
                    if i > 0:
                        cap2 = cv2.VideoCapture(i-1)
                        cap2.release()
                    
                    print("\n\nCamera IS AVAILABLE!")
                    print(f"You can now access the webcam at http://localhost:5000")
                    exit(0)
                
                cap.release()
    
    except Exception as e:
        print(f"    ✗ ERROR: {e}")

print("\n" + "="*70)
print("NO CAMERA FOUND")
print("="*70)

print("\nPossible causes:")
print("1. No webcam connected")
print("2. Camera already in use by another app (Zoom, Teams, etc.)")
print("3. Privacy settings blocking camera access")
print("4. Missing drivers")

print("\nSolutions:")
print("- Connect a webcam")
print("- Close other apps using camera")
print("- Check Windows privacy settings: Settings > Privacy > Camera")
print("- Restart computer")
