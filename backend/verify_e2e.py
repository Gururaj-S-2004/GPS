import urllib.request, json, sys, os

# 1. Backend health
try:
    res = urllib.request.urlopen('http://localhost:8000/health', timeout=5)
    print('BACKEND HEALTH:', json.loads(res.read()))
except Exception as e:
    print('BACKEND ERROR:', e)

try:
    res = urllib.request.urlopen('http://localhost:8000/', timeout=5)
    print('BACKEND ROOT:', json.loads(res.read()))
except Exception as e:
    print('ROOT ERROR:', e)

# 2. PATH_C handover simulation
sys.path.insert(0, '.')
from app.services.prediction_engine import TrajectoryPredictor
from app.services.tower_controller import TowerController

CENTER_LAT = 13.0827
CENTER_LON = 80.2707
OFFSET = 30 / 111_000

predictor = TrajectoryPredictor()
controller = TowerController()

print()
print('=== PATH_C SIMULATION: 6 frames at 30m from center, heading 90 ===')
lat = CENTER_LAT + OFFSET
lon = CENTER_LON

snap = {}
for i in range(6):
    pred = predictor.predict_path(lat, lon, 90.0, 36.0)
    changed = controller.apply_prediction(pred['predicted_path'], pred['confidence'])
    snap = controller.get_state_snapshot()
    active = snap['active_tower']['id'] if snap['active_tower'] else 'NONE'
    suppressed = [t['id'] for t in snap['suppressed_towers']]
    print(f"  Tick {i+1}: path={pred['predicted_path']} conf={pred['confidence']} active={active} suppressed={suppressed}")

print()
print('=== FINAL TOWER STATES ===')
for tid, t in snap['all_towers'].items():
    print(f"  {tid}: {t['status']:22s}  {t['allocated_power_dbm']} dBm")

print()
print('=== STATS ===', snap['stats'])

# 3. Frontend reachability
try:
    res = urllib.request.urlopen('http://localhost:3000', timeout=8)
    print()
    print('FRONTEND: HTTP', res.status, '- OK')
except Exception as e:
    print()
    print('FRONTEND NOTE:', e)
