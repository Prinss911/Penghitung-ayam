import pandas as pd
from datetime import datetime
import os
import json

class ExcelExporter:
    def __init__(self):
        self.exports_dir = 'exports'
        self.current_file = None
        self.current_data = []
        self.session_info = {}
        self.last_count = 0
        
        if not os.path.exists(self.exports_dir):
            os.makedirs(self.exports_dir)
            print(f"[INFO] Folder '{self.exports_dir}' created")
    
    def start_new_session(self, asal_ayam, jam, tanggal, keterangan=""):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{self.exports_dir}/ayam_{asal_ayam}_{tanggal}_{timestamp}.xlsx"
        
        self.current_file = filename
        self.current_data = []
        self.last_count = 0
        self.session_info = {
            'asal_ayam': asal_ayam,
            'jam': jam,
            'tanggal': tanggal,
            'keterangan': keterangan,
            'start_time': datetime.now().isoformat(),
            'file_name': filename
        }
        
        print(f"[INFO] Session started: {filename}")
        return filename
    
    def add_detection_direct(self, total_count, speed, detection):
        """Save detection directly to Excel"""
        if self.current_file is None:
            return False
        
        # Only count chicken
        if not detection.get('is_chicken', False):
            return False
        
        # Skip if same count as last
        if self.current_data:
            last_data = self.current_data[-1]
            if last_data.get('total_ayam_terhitung', 0) == total_count:
                return False
        
        data_entry = {
            'timestamp': datetime.now().isoformat(),
            'waktu': datetime.now().strftime("%H:%M:%S"),
            'tanggal': self.session_info.get('tanggal', ''),
            'asal_ayam': self.session_info.get('asal_ayam', ''),
            'total_ayam_terhitung': total_count,
            'ayam_di_frame_ini': 1,
            'kecepatan_avg': round(speed, 2),
            'confidence': round(detection.get('confidence', 0), 2),
            'class_name': detection.get('class_name', '')
        }
        
        self.current_data.append(data_entry)
        self.last_count = total_count
        
        print(f"[DATA] ✅ Chicken detected! Total: {total_count} | Speed: {speed:.2f}")
        return True
    
    def stop_and_save(self):
        """Stop session and save to Excel"""
        if self.current_file is None:
            return None
        
        if not self.current_data:
            # Jangan buat file Excel kosong untuk sesi tanpa deteksi
            print("[WARNING] No data to save - skipping empty file creation")
            self.current_file = None
            self.current_data = []
            self.session_info = {}
            self.last_count = 0
            return None
        
        try:
            df = pd.DataFrame(self.current_data)
            
            columns = ['timestamp', 'waktu', 'tanggal', 'asal_ayam', 
                      'total_ayam_terhitung', 'ayam_di_frame_ini', 
                      'kecepatan_avg', 'confidence', 'class_name']
            
            for col in columns:
                if col not in df.columns:
                    df[col] = ''
            
            df = df[columns]
            
            with pd.ExcelWriter(self.current_file, engine='openpyxl') as writer:
                df.to_excel(writer, sheet_name='Data Ayam', index=False)
                
                summary_data = {
                    'Info': [
                        'Total Ayam Terhitung',
                        'Total Transaksi',
                        'Kecepatan Rata-rata',
                        'Kecepatan Tertinggi',
                        'Kecepatan Terendah',
                        'Confidence Rata-rata',
                        'Asal Ayam',
                        'Tanggal',
                        'Jam Mulai',
                        'Jam Selesai',
                        'File Dibuat'
                    ],
                    'Nilai': [
                        df['total_ayam_terhitung'].max() if not df.empty else 0,
                        len(self.current_data),
                        df['kecepatan_avg'].mean() if not df.empty else 0,
                        df['kecepatan_avg'].max() if not df.empty else 0,
                        df['kecepatan_avg'].min() if not df.empty else 0,
                        df['confidence'].mean() if not df.empty else 0,
                        self.session_info['asal_ayam'],
                        self.session_info['tanggal'],
                        self.session_info['jam'],
                        datetime.now().strftime("%H:%M:%S"),
                        datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    ]
                }
                summary_df = pd.DataFrame(summary_data)
                summary_df.to_excel(writer, sheet_name='Summary', index=False)
            
            saved_file = self.current_file
            self.current_file = None
            self.current_data = []
            self.session_info = {}
            self.last_count = 0
            
            print(f"[INFO] File saved: {saved_file}")
            return saved_file
            
        except Exception as e:
            print(f"[ERROR] Failed to save Excel: {e}")
            return None
    
    def get_session_status(self):
        return {
            'active': self.current_file is not None,
            'data_count': len(self.current_data),
            'file_name': self.current_file,
            'info': self.session_info,
            'last_count': self.last_count
        }