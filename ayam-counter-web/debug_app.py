"""
Debug script to catch the Internal Server Error
Runs Flask app with debug mode enabled to show errors
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.app import app

if __name__ == "__main__":
    print("="*70)
    print("DEBUG MODE - Showing errors")
    print("="*70)
    print("\nAccess: http://localhost:5000")
    print("Errors will appear in console and browser\n")
    
    app.run(host="0.0.0.0", port=5000, debug=True)
