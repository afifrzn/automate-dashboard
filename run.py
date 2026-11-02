"""
Dashboard App Launcher.
Starts the backend REST API & SPA server at http://127.0.0.1:8080
"""

import sys
import os

# Add root directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.server import run_server

if __name__ == "__main__":
    port = 8080
    host = os.environ.get("HOST", "0.0.0.0")
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        port = int(sys.argv[1])
    if len(sys.argv) > 2:
        host = sys.argv[2]
    print(f"============================================================")
    print(f"   Dashboard App: Grading Test & Course Audit Platform      ")
    print(f"============================================================")
    print(f"Server accessible at: http://{host}:{port}")
    print(f"Local browser: http://127.0.0.1:{port}")
    print(f"Press Ctrl+C to stop.")
    run_server(port=port, host=host)
