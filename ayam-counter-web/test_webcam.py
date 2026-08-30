import cv2

print("🔍 Mencari webcam...")

for i in range(5):
    cap = cv2.VideoCapture(i, cv2.CAP_DSHOW)
    if cap.isOpened():
        ret, frame = cap.read()
        if ret:
            print(f"✅ Camera index {i} BERHASIL! Size: {frame.shape}")
            cv2.imwrite(f'camera_{i}.jpg', frame)
            print(f"📷 Gambar disimpan: camera_{i}.jpg")
        else:
            print(f"⚠️ Camera index {i} terbuka tapi gagal baca frame")
        cap.release()
    else:
        print(f"❌ Camera index {i} tidak tersedia")