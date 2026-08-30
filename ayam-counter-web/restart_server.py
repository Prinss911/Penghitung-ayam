#!/usr/bin/env python3
"""
Quick restart script - kills old process and starts new one
Run this to easily restart the Flask server
"""
import subprocess
import sys
import time

print("Stopping any running server...")

# Try to find and kill existing Python processes running app.py
import os
for pid_file in ['app.pid']:
    if os.path.exists(pid_file):
        try:
            with open(pid_file, 'r') as f:
                pid = int(f.read().strip())
                os.kill(pid, 9)  # Force kill
                print(f"Killed process {pid}")
        except:
            pass

print("Starting new server...")
time.sleep(1)  # Wait a moment

# Start new server
subprocess.Popen([sys.executable, "main.py"], 
                 creationflags=subprocess.DETACHED_PROCESS)

print("\n✓ Server started!")
print("Access at: http://localhost:5000")
print("\nTo stop later, use:")
print("  TaskManager -> End Task on python.exe")
