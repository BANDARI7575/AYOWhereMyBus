"""Local-only development entry point; reload Python changes without a debugger."""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app import app

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=5050)
    args = parser.parse_args()
    print(f"AYO local server: http://127.0.0.1:{args.port}/ "
          f"planner API v{app.config['AYO_PLANNER_API_VERSION']}, "
          f"revision {app.config['AYO_SOURCE_REVISION']}", flush=True)
    app.run(host='127.0.0.1', port=args.port, debug=False, use_reloader=True)
