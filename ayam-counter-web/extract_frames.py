"""
EKSTRAK FRAME DARI VIDEO
Ambil gambar dari video untuk dataset training
"""
import cv2
import os
import random
from sklearn.model_selection import train_test_split

def extract_frames_from_video(video_path, output_dir, prefix, interval=30, target_size=(640, 480)):
    """
    Ekstrak frame dari video
    interval=30 → ambil 1 frame per detik (30 FPS)
    """
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        print(f"❌ Gagal buka video: {video_path}")
        return 0
    
    frame_count = 0
    saved_count = 0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    
    print(f"📹 Video: {os.path.basename(video_path)}")
    print(f"   Total frame: {total_frames}, FPS: {fps:.2f}")
    print(f"   Interval: setiap {interval} frame")
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        if frame_count % interval == 0:
            # Resize ke ukuran yang diinginkan
            frame = cv2.resize(frame, target_size)
            
            filename = f"{prefix}_{saved_count:06d}.jpg"
            filepath = os.path.join(output_dir, filename)
            cv2.imwrite(filepath, frame)
            saved_count += 1
            
            if saved_count % 50 == 0:
                print(f"   ✅ {saved_count} gambar terekstrak...")
        
        frame_count += 1
    
    cap.release()
    print(f"   ✅ Selesai! {saved_count} gambar diekstrak")
    return saved_count

def split_dataset(source_dir, train_dir, val_dir, val_size=0.2):
    """Split gambar menjadi train (80%) dan val (20%)"""
    images = [f for f in os.listdir(source_dir) if f.endswith('.jpg')]
    
    if len(images) == 0:
        return 0, 0
    
    train_images, val_images = train_test_split(images, test_size=val_size, random_state=42)
    
    os.makedirs(train_dir, exist_ok=True)
    os.makedirs(val_dir, exist_ok=True)
    
    for img in train_images:
        os.rename(os.path.join(source_dir, img), os.path.join(train_dir, img))
    
    for img in val_images:
        os.rename(os.path.join(source_dir, img), os.path.join(val_dir, img))
    
    return len(train_images), len(val_images)

def main():
    print("=" * 60)
    print("📹 EKSTRAK FRAME DARI VIDEO")
    print("=" * 60)
    
    # ============================================
    # SETUP FOLDER
    # ============================================
    BASE_DIR = 'dataset'
    IMAGES_DIR = os.path.join(BASE_DIR, 'images')
    TEMP_DIR = os.path.join(IMAGES_DIR, 'temp_all')
    
    folders = [
        os.path.join(BASE_DIR, 'images', 'train'),
        os.path.join(BASE_DIR, 'images', 'val'),
        os.path.join(BASE_DIR, 'labels', 'train'),
        os.path.join(BASE_DIR, 'labels', 'val'),
        TEMP_DIR
    ]
    
    for folder in folders:
        os.makedirs(folder, exist_ok=True)
        print(f"✅ Folder: {folder}")
    
    print("\n" + "-" * 60)
    
    # ============================================
    # SETTING VIDEO
    # ============================================
    VIDEO_KOSONG = "video_shackle_kosong.mp4"
    VIDEO_BERISI = "video_shackle_berisi.mp4"
    
    INTERVAL = 30
    TARGET_SIZE = (640, 480)
    
    print("📹 SETTING VIDEO:")
    print(f"   Video Kosong: {VIDEO_KOSONG}")
    print(f"   Video Berisi: {VIDEO_BERISI}")
    print(f"   Interval: setiap {INTERVAL} frame")
    print(f"   Resolusi: {TARGET_SIZE[0]}x{TARGET_SIZE[1]}")
    print("")
    
    # ============================================
    # EKSTRAK
    # ============================================
    print("-" * 60)
    print("🔗 1. Ekstrak SHACKLE KOSONG...")
    print("-" * 60)
    
    count_kosong = extract_frames_from_video(
        VIDEO_KOSONG,
        os.path.join(IMAGES_DIR, 'raw_kosong'),
        'kosong',
        INTERVAL,
        TARGET_SIZE
    )
    
    print("\n" + "-" * 60)
    print("🐔 2. Ekstrak SHACKLE BERISI AYAM...")
    print("-" * 60)
    
    count_berisi = extract_frames_from_video(
        VIDEO_BERISI,
        os.path.join(IMAGES_DIR, 'raw_berisi'),
        'berisi',
        INTERVAL,
        TARGET_SIZE
    )
    
    # ============================================
    # GABUNG & SPLIT
    # ============================================
    print("\n" + "=" * 60)
    print("📊 GABUNG DAN SPLIT TRAIN/VAL")
    print("=" * 60)
    
    total_moved = 0
    
    for raw_dir in [os.path.join(IMAGES_DIR, 'raw_kosong'), os.path.join(IMAGES_DIR, 'raw_berisi')]:
        if os.path.exists(raw_dir):
            for f in os.listdir(raw_dir):
                if f.endswith('.jpg'):
                    os.rename(os.path.join(raw_dir, f), os.path.join(TEMP_DIR, f))
                    total_moved += 1
    
    print(f"\n📸 Total gambar: {total_moved}")
    
    if total_moved == 0:
        print("❌ Tidak ada gambar! Cek path video Anda.")
        return
    
    train_dir = os.path.join(IMAGES_DIR, 'train')
    val_dir = os.path.join(IMAGES_DIR, 'val')
    
    train_count, val_count = split_dataset(TEMP_DIR, train_dir, val_dir, val_size=0.2)
    
    print(f"\n✅ Split selesai:")
    print(f"   Train: {train_count} gambar (80%)")
    print(f"   Val: {val_count} gambar (20%)")
    
    # Hapus folder temporary
    try:
        os.rmdir(TEMP_DIR)
        os.rmdir(os.path.join(IMAGES_DIR, 'raw_kosong'))
        os.rmdir(os.path.join(IMAGES_DIR, 'raw_berisi'))
    except:
        pass
    
    print("\n" + "=" * 60)
    print("✅ EKSTRAK SELESAI!")
    print(f"📁 Dataset: {BASE_DIR}/")
    print(f"📸 Train: {train_count} gambar")
    print(f"📸 Val: {val_count} gambar")
    print("📌 SELANJUTNYA: Labeli gambar dengan LabelImg")
    print("   Kelas: shackle_berisi (0), shackle_kosong (1)")
    print("=" * 60)

if __name__ == "__main__":
    main()