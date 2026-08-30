"""
Comprehensive Camera Test - All possible indices and backends
Tests both USB cameras and virtual cameras (DroidCam, OBS, etc.)
"""
import cv2

print("="*70)
print("COMPREHENSIVE CAMERA TEST")
print("="*70)

# Try all possible camera indices with different backends
indices_to_try = [0, 1, 2, 3]

for index in indices_to_try:
    print(f"\n{'='*70}")
    print(f"Testing Index {index}...")
    print(f"{'='*70}")
    
    # Try each backend
    for backend_name, backend_id in [
        ("DSHOW", cv2.CAP_DSHOW),
        ("FFMPEG", cv2.CAP_FFMPEG),
        ("ANY", cv2.CAP_ANY)
    ]:
        try:
            cap = cv2.VideoCapture(index, backend_id)
            
            if cap.isOpened():
                ret, frame = cap.read()
                
                if ret and frame is not None:
                    print(f"  [FOUND] {backend_name}: {frame.shape[1]}x{frame.shape[0]}")
                    
                    # Try to identify what kind of camera
                    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                    fps = int(cap.get(cv2.CAP_PROP_FPS))
                    
                    print(f"         Width: {width}, Height: {height}, FPS: {fps}")
                    print(f"         Backend used: {backend_name}")
                    
                    # Save sample for identification
                    filename = f"cam_{index}_{backend_name.lower()}_{width}x{height}.jpg"
                    cv2.imwrite(filename, frame)
                    print(f"         Sample saved: {filename}")
                    
                    # Close this instance
                    cap.release()
                    
                    # Mark as found
                    break
                    
                else:
                    print(f"  [OPENED but no frames] {backend_name}")
                    cap.release()
                    
        except Exception as e:
            print(f"  [ERROR] {backend_name}: {str(e)[:40]}")

print("\n" + "="*70)
print("TEST COMPLETE")
print("="*70)
print("\nTo use a specific camera, set in app/config.py:")
print("  CAMERA_SOURCE = <index_number>")
print("\nRecommended: Start with index 1 (most common for virtual cams)")
