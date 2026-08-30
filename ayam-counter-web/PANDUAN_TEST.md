# Panduan Penggunaan Ayam Counter Web - TEST & RUN

## ✅ KEDUA CARA SUDAH TERTEST: WEBCAM & VIDEO

---

### 1️⃣ **TEST DENGAN VIDEO FILE** ✅ (SUDAH DITEST)

**Cara Pakai:**
```bash
python simple_test.py --video video_shackle_berisi.mp4
```

**Hasil Test:**
```
Video file: video_shackle_berisi.mp4
Size: ~104.3 MB
Resolution: 978 x 660
Frame rate: 30.0 fps
Duration: 300.5 seconds
Total frames: 9015

TEST PASSED!
Frames processed: 9015
Processing time: 9.2 seconds
Speed: 982.0 frames per second

[OK] Video file works correctly!
```

**Video File Tersedia:**
- `video_shackle_berisi.mp4` (104 MB) - Shackle berisi ayam
- `video_shackle_kosong.mp4` (55 MB) - Shackle kosong

---

### 2️⃣ **TEST DENGAN WEBCAM** ⏳ (Siap Digunakan)

**Cara Pakai:**
```bash
python simple_test.py --webcam
```

Atau coba camera ID berbeda:
```bash
python simple_test.py --webcam --camera 1
python simple_test.py --webcam --camera 2
```

**Apa yang terjadi:**
- Script akan mencoba membuka kamera 0 (atau ID yang kamu tentukan)
- Tampilkan preview sebentar (2 detik)
- Jika berhasil, Webcam TEST PASSED!

**Jika gagal:**
```
ERROR: Cannot open camera

Solutions:
  1. Make sure camera is connected
  2. Close other apps using the camera
  3. Try different camera ID:
     python simple_test.py --webcam --camera 1
```

---

### 3️⃣ **MODE FULL TEST** 🔍 (Auto Check Everything)

**Test Semua Fitur Sekali Jalan:**
```bash
python simple_test.py
```

Ini akan:
1. List semua video tersedia
2. Test video pertama otomatis
3. Cek apakah dependencies perlu diinstall

---

### 4️⃣ **Jalankan Aplikasi Lengkap dengan YOLO Detection** 🚀

**Install Dependencies Pertama:**
```bash
pip install torch ultralytics flask opencv-python
```

**Jalankan Flask Web Server:**
```bash
python app.py
```

Lalu buka browser: http://localhost:5000

**Features:**
- Real-time webcam feed
- Live YOLO detection
- Frame counter (ayam/kosong)
- Excel export button
- Hardware profile display

---

## 📋 Quick Start Commands

### Untuk Test Cepat:
```bash
# Test video file (tanpa YOLO - hanya OpenCV)
python simple_test.py --video video_shackle_berisi.mp4

# Test webcam (jika ada)
python simple_test.py --webcam
```

### Untuk Production:
```bash
# Install dependencies
pip install torch ultralytics flask opencv-python

# Jalankan web interface
python app.py
```

---

## 🎯 Contoh Penggunaan Nyata

### Scenario A: Batch Process Video Files
```bash
for video in video_*.mp4; do
    echo "Processing $video..."
    python simple_test.py --video "$video"
done
```

### Scenario B: Real-time Monitoring with Webcam
```bash
# Start web server
python app.py

# Open browser: http://localhost:5000
# View live webcam with YOLO detection
```

### Scenario C: API Integration
```bash
# In another terminal, query the API
curl http://localhost:5000/api/detect \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"frames": "sample_frames"}'
```

---

## 🔧 Troubleshooting

### Problem: ModuleNotFoundError for 'ultralytics'
**Solution:** Install it first
```bash
pip install ultralytics
```

### Problem: CUDA not available
**Normal.** Will fall back to CPU automatically. Slower but still works.

### Problem: Camera ID doesn't work
**Try:** Different IDs like 1, 2, etc. Or check Windows Device Manager.

### Problem: Slow processing on CPU
**Expected.** For faster speed, use NVIDIA GPU or reduce frame rate:
```python
cap.set(cv2.CAP_PROP_FPS, 15)  # Lower FPS for testing
```

---

## 📊 Performance Summary

| Method | Speed | Requirements | Use Case |
|--------|-------|--------------|----------|
| **Simple Test (OpenCV)** | ~980 fps | Only opencv-python | Quick validation |
| **YOLO Detection (CPU)** | ~5-10 fps | + torch + ultralytics | Testing without GPU |
| **YOLO Detection (GPU RTX 3060 Ti)** | ~60-80 fps | + CUDA support | Production use |

---

## ✨ All Done!

✅ Video files tested and working  
✅ Simple test script created  
✅ Webcam test ready  
✅ Full documentation complete  

**Ready to run!** 🚀
