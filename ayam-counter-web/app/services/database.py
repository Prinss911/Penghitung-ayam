# modules/database.py
import sqlite3
from datetime import datetime, timedelta


class Database:
    def __init__(self, db_path='ayam_counter.db'):
        self.db_path = db_path
        self.init_db()

    def init_db(self):
        """Initialize database tables"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Create sessions table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                asal_ayam TEXT,
                tanggal TEXT,
                jam TEXT,
                keterangan TEXT,
                total_count INTEGER,
                start_time TEXT,
                end_time TEXT,
                file_name TEXT
            )
        ''')

        # Create detections table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS detections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER,
                count INTEGER,
                speed REAL,
                timestamp TEXT,
                info TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions (id)
            )
        ''')

        conn.commit()
        conn.close()

    def get_daily_stats(self):
        """Get daily statistics"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        today = datetime.now().strftime("%Y-%m-%d")
        cursor.execute('''
            SELECT COUNT(*) as total_sessions, 
                   SUM(total_count) as total_count
            FROM sessions 
            WHERE tanggal = ?
        ''', (today,))

        result = cursor.fetchone()
        conn.close()

        return {
            'total_sessions': result[0] if result[0] else 0,
            'total_count': result[1] if result[1] else 0
        }

    def get_totals(self):
        """Total keseluruhan sesi (semua tanggal)."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            SELECT COUNT(*), COALESCE(SUM(total_count), 0)
            FROM sessions
        ''')
        result = cursor.fetchone()
        conn.close()
        return {
            'total_sessions': result[0] if result[0] else 0,
            'total_count': result[1] if result[1] else 0
        }

    def get_history(self, limit=100):
        """Get recent history (lengkap dengan keterangan & file_name)."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT id, asal_ayam, tanggal, jam, total_count, start_time, end_time,
                   keterangan, file_name
            FROM sessions
            ORDER BY start_time DESC
            LIMIT ?
        ''', (limit,))

        results = cursor.fetchall()
        conn.close()

        history = []
        for row in results:
            history.append({
                'id': row[0],
                'asal_ayam': row[1],
                'tanggal': row[2],
                'jam': row[3],
                'total_count': row[4],
                'start_time': row[5],
                'end_time': row[6],
                'keterangan': row[7] or '',
                'file_name': row[8] or ''
            })

        return history

    def get_session(self, session_id):
        """Ambil satu sesi by id. Return dict atau None."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, asal_ayam, tanggal, jam, total_count, start_time, end_time,
                   keterangan, file_name
            FROM sessions
            WHERE id = ?
        ''', (session_id,))
        row = cursor.fetchone()
        conn.close()
        if row is None:
            return None
        return {
            'id': row[0],
            'asal_ayam': row[1],
            'tanggal': row[2],
            'jam': row[3],
            'total_count': row[4],
            'start_time': row[5],
            'end_time': row[6],
            'keterangan': row[7] or '',
            'file_name': row[8] or ''
        }

    def add_session(self, asal_ayam, tanggal, jam, keterangan,
                    total_count, start_time, end_time, file_name):
        """Simpan sesi selesai. Return id baris baru."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO sessions
                (asal_ayam, tanggal, jam, keterangan, total_count,
                 start_time, end_time, file_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (asal_ayam, tanggal, jam, keterangan, total_count,
              start_time, end_time, file_name))
        session_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return session_id

    def delete_session(self, session_id):
        """Hapus sesi by id. Return jumlah baris terhapus."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('DELETE FROM sessions WHERE id = ?', (session_id,))
        deleted = cursor.rowcount
        # Bersihkan deteksi terkait (bila ada). Toleran terhadap DB lama
        # yang dibuat dengan schema tanpa kolom session_id
        # (CREATE TABLE IF NOT EXISTS tidak memigrasi tabel existing).
        try:
            cursor.execute('DELETE FROM detections WHERE session_id = ?', (session_id,))
        except sqlite3.OperationalError:
            pass
        conn.commit()
        conn.close()
        return deleted

    def get_daily_totals(self, days=7):
        """Agregasi per tanggal untuk N hari terakhir.

        Return: dict { 'YYYY-MM-DD': (total_count, jumlah_sesi) }
        """
        cutoff = (datetime.now() - timedelta(days=days - 1)).strftime("%Y-%m-%d")
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            SELECT tanggal, COALESCE(SUM(total_count), 0), COUNT(*)
            FROM sessions
            WHERE tanggal >= ? AND tanggal != ''
            GROUP BY tanggal
        ''', (cutoff,))
        results = cursor.fetchall()
        conn.close()
        return {row[0]: (row[1], row[2]) for row in results}
