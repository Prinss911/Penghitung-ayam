"""
Entry point for Ayam Counter Web Flask application
"""
import os
import sys

# Add parent directory to path so imports work
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.app import app

if __name__ == "__main__":
    print("="*70)
    print("AYAM COUNTER WEB - Flask Application")
    print("="*70)
    print("\nStarting server...")
    print("Access at: http://localhost:5000")
    print("\nPress CTRL+C to stop\n")
    
    try:
        app.run(debug=False, host="0.0.0.0", port=5000)
    except KeyboardInterrupt:
        print("\nServer stopped by user")
        sys.exit(0)
