"""
Test USB Camera Directly
Works with: USB Web Camera (Obda:5825)
"""
import cv2
import time

print("="*70)
print("USB CAMERA DIRECT TEST")
print("="*70)

# Test different methods
methods = [
    ("Direct Device Path", "\\\\.\\0"),
    ("Camera Index 0", 0),
    ("Camera Index 1", 1),
    ("Camera Index 2", 2)
]

for method_name, source in methods:
    print(f"\nTesting {method_name}:")
    
    # Try DSHOW backend
    for backend_name, backend in [("DSHOW", cv2.CAP_DSHOW), 
                                   ("ANY", cv2.CAP_ANY)]:
        try:
            cap = cv2.VideoCapture(source, backend)
            
            if cap.isOpened():
                ret, frame = cap.read()
                
                if ret and frame is not None:
                    print(f"  [OK] SUCCESS with {backend_name}")
                    print(f"    Resolution: {frame.shape[1]}x{frame.shape[0]}")
                    
                    # Save sample
                    filename = f"test_{method_name.replace(' ', '_')}_{backend_name}.jpg"
                    cv2.imwrite(filename, frame)
                    print(f"    Sample saved: {filename}")
                    
                    cap.release()
                    
                    # Success - now test if we can use it in main app
                    print(f"\n  Use this setting in config.py:")
                    print(f"    CAMERA_SOURCE = {source}")
                    print(f"    Backend: {backend_name}")
                    print("\n[OK] CAMERA WORKS!")
                    exit(0)
                else:
                    print(f"    [FAIL] Open but can't read frames")
                    cap.release()
                    
        except Exception as e:
            print(f"    [ERROR] Error: {str(e)[:50]}")

print("\n" + "="*70)
print("NO CAMERA FOUND WITH ANY METHOD")
print("="*70)
print("\nPossible issues:")
print("- Camera driver not installed")
print("- Camera disabled in Device Manager")
print("- Privacy settings blocking camera")
print("- Another app is using the camera")
