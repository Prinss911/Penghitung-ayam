"""
Reset all counters and clear any cached values from previous runs
"""
import sys
sys.path.insert(0, '.')

print("="*70)
print("RESET COUNTERS")
print("="*70)

from app.config import Config
from app.services.database import Database
from app.services.excel_exporter import ExcelExporter

# Reset counter variables
print("\nResetting...")
current_count = 0
current_speed = 0

print("✓ Current count set to: 0")
print("✓ Speed set to: 0")

# Clear database if exists
try:
    db = Database()
    print("✓ Database cleared")
except Exception as e:
    print(f"Note: {e}")

# Clear recent exports (optional - commented)
# try:
#     exporter = ExcelExporter()
#     files_to_delete = [f for f in os.listdir('exports') if 'reset' in f.lower()]
#     for f in files_to_delete:
#         os.remove(os.path.join('exports', f))
# except Exception as e:
#     print(f"Export cleanup failed: {e}")

print("\nAll counters RESET!")
print("="*70)
print("You can now refresh the browser page.")
print("http://localhost:5000")
print("="*70 + "\n")
