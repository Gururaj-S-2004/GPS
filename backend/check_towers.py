from app.services.tower_controller import TowerController
tc = TowerController()
print("Tower coordinates (asymmetric placements):")
print(f"{'ID':<10} {'LAT':>10} {'LON':>11}  {'DIST FROM CENTER (m)':>22}  {'PATH'}")
print("-" * 65)
import math
CENTER_LAT, CENTER_LON = 13.0827, 80.2707
for k, v in tc.towers.items():
    dlat = (v.coordinates['lat'] - CENTER_LAT) * 111_000
    dlon = (v.coordinates['lon'] - CENTER_LON) * 108_100
    dist = round(math.sqrt(dlat**2 + dlon**2), 1)
    print(f"{k:<10} {v.coordinates['lat']:>10.6f} {v.coordinates['lon']:>11.6f}  {dist:>22.1f} m  {v.path}")
