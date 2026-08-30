"""
Simple camera check - no unicode
"""
import cv2

print("Testing cameras...")

for i in range(3):
    print(f"Camera {i}:")
    cap = cv2.VideoCapture(i, cv2.CAP_DSHOW)
    
    if cap.isOpened():
        ret, frame = cap.read()
        if ret and frame is not None:
            print(f"  FOUND - Resolution: {frame.shape[1]}x{frame.shape[0]}")
            
            # Save sample
            cv2.imwrite("camera_sample.jpg", frame)
            print("  Sample saved: camera_sample.jpg")
            
            cap.release()
            
            # Check other cameras
            for j in range(i+1, 3):
                cap2 = cv2.VideoCapture(j)
                if cap2.isOpened():
                    cap2.release()
            
            print("\nCAMERA WORKS!")
            print("Start Flask app: python main.py")
            exit(0)
        
        cap.release()
    else:
        print("  Not found or in use")

print("\nNO CAMERA FOUND")
