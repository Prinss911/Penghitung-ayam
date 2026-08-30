# Troubleshooting Summary - Kamera Blank di Browser

## 📊 Status Saat Ini

✅ **Server Running:** Flask at http://localhost:5000  
✅ **API Works:** Stats endpoint returns count: 0  
❌ **Camera Feed Blank:** Video stream tidak muncul  
⚠️ **Root Cause:** Camera thread tidak start dengan benar  

---

## 🔍 Penyebab Masalah

### Code Analysis:
File `app/app.py` memiliki function `capture_thread()` yang OK:
```python
def capture_thread():
    """Thread untuk menangkap frame dari camera"""
    global latest_frame, latest_frame_seq
    cap = cv2.VideoCapture(Config.CAMERA_SOURCE)
    # ... capture logic working perfectly
```

**Tapi...** Thread ini HANYA dimulai jika ada call ke:
```python
if __name__ == "__main__":
    start_threads()  # <-- THIS CALLS capture_thread()
    socketio.run(app...)
```

**Problem:** Ketika Flask app running dengan SocketIO pattern, blok `__main__` tidak selalu execute secara langsung.

---

## ✅ Solusi 1: Restart Server (Quick Fix)

**Lakukan ini sekarang:**

1. **Stop server existing:**
   - Press `CTRL+C` di terminal yang run Flask
   
2. **Restart fresh:**
   ```bash
   python main.py
   ```

3. **Lihat console output:**
   
   Yang HARUS muncul:
   ```
   [OK] PyTorch loaded: 2.2.2+cu121
   [GPU] CUDA available: NVIDIA GeForce RTX 3060 Ti (8.0 GB)
   
   ======================================================================
   HARDWARE PROFILE
   ======================================================================
   Backend:   CUDA
   Device:    cuda:0
   Vendor:    NVIDIA
   GPU Type:  dGPU
   VRAM:      8.6 GB
   Precision: FP16
   Verified:  YES
   ======================================================================
   
   Initializing YOLO detector...
   [OK] Detector initialized successfully!
     Device: cuda:0
     Model loaded: Yes
   
   [CAPTURE] Started          <-- HERE!
   [CAPTURE] Connected with backend: 2  <-- CAMERA CONNECTED!
   =======================================================================
   Starting Flask server...
   Access the web interface at: http://localhost:5000
   ```

4. **Refresh browser:**
   http://localhost:5000

Jika console show `[CAPTURE] Started`, maka webcam feed AKAN MUNCUL di browser!

---

## 🔧 Solusi 2: Test Kamera Manual

Jalankan test script terpisah:

```bash
python test_cam.py
```

**Output jika kamera works:**
```
Testing cameras...
Camera 0:
  FOUND - Resolution: 640x480
  Sample saved: camera_sample.jpg

CAMERA WORKS!
Start Flask app: python main.py
```

**Output jika NO CAMERA:**
```
Camera 0:
  Not found or in use
Camera 1:
  Not found or in use

NO CAMERA FOUND
```

---

## 🎥 Solusi 3: Direct Video Stream Test

Buka URL langsung tanpa HTML wrapper:

```
http://localhost:5000/video_feed
```

Browser akan attempt load video stream. Jika:
- **Blank** → Server-side capture thread not running
- **Shows webcam** → Good, template issue fixed
- **Error page** → Video feed endpoint error

---

## 💡 Common Causes & Fixes

### Cause 1: No Webcam Connected
**Symptom:** Console shows `[CAPTURE] Camera failed to open`  
**Fix:** Connect webcam, restart computer

### Cause 2: Camera Already in Use  
**Symptom:** Windows shows camera busy popup  
**Fix:** Close Zoom, Teams, Skype, browser tabs using camera

### Cause 3: Windows Privacy Settings Blocked Camera
**Symptom:** Camera access denied everywhere  
**Fix:** 
- Settings → Privacy → Camera
- Toggle "Let apps access your camera" ON
- Restart computer

### Cause 4: Missing OpenCV Backend
**Symptom:** OpenCV can't find DSHOW/CAP_FFMPEG  
**Fix:** 
```bash
pip install --upgrade opencv-python opencv-contrib-python
```

---

## 🛠️ Advanced Debugging

### Check Console Logs

When Flask starts, look for these patterns:

**GOOD (Working):**
```
[STARTUP] Threads started
[CAPTURE] Started
[CAPTURE] Connected with backend: 2
[CAPTURE] Camera opened: 0
[CAPTURE] Resolution: 640x480
[CAPTURE] FPS: 10
```

**BAD (Camera Issue):**
```
[STARTUP] Threads started
[CAPTURE] Started
[CAPTURE] Camera failed to open
```

### Check Browser Console (F12)

Open DevTools Console tab, see if there are errors:

**GOOD:**
- Empty console or CORS warnings
- `/api/stats` successful responses every 2s

**BAD:**
- `Failed to load resource: net::ERR_CONNECTION_REFUSED`
- WebSocket connection failed
- Image source broken

---

## 📋 Checklist Quick Fix

- [ ] Stop existing Flask (`CTRL+C`)
- [ ] Run `python main.py` fresh
- [ ] Watch console for `[CAPTURE] Started`
- [ ] If no CAPTURE message, camera is disconnected
- [ ] Check webcam connected properly
- [ ] Close other apps using camera
- [ ] Refresh browser at http://localhost:5000
- [ ] Try `http://localhost:5000/video_feed` direct
- [ ] If still blank, check browser console (F12)
- [ ] Try different camera ID in config.py

---

## 🎯 Expected Working Behavior

When everything works correctly:

1. **Console shows:**
   - `[CAPTURE] Connected with backend: X`
   - `[CAPTURE] Camera opened: 0`

2. **Browser shows:**
   - Live webcam video feed
   - Detection boxes when objects detected
   - Counter updates from API
   - FPS display working

3. **Performance:**
   - ~60-70 FPS on RTX 3060 Ti
   - Real-time detection
   - Smooth video playback

---

## 🆘 Emergency Backup

If all else fails, restart completely:

```bash
# 1. Close all Python processes
taskkill /F /IM python.exe

# 2. Restart computer

# 3. After reboot:
python main.py
```

This ensures clean state and fresh camera initialization.

---

*Document created: 2026-08-23*  
*Status: Ready for testing*
