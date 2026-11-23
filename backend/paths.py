"""Stable repository paths, independent of the backend package location."""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

DATA_DIR = PROJECT_ROOT / 'data'
GTFS_DIR = DATA_DIR / 'google_transit'
VEHICLE_SNAPSHOT = DATA_DIR / 'buses.json'
TEMPLATES_DIR = PROJECT_ROOT / 'templates'
STATIC_DIR = PROJECT_ROOT / 'static'
