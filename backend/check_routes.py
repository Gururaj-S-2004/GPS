import sys, math
sys.path.insert(0, '.')
from app.routers.simulation import ROAD_ROUTES, WaypointWalker, _SPEED_MPS

print('Road-following simulation -- route summary')
print('=' * 55)
for i, route in enumerate(ROAD_ROUTES, 1):
    total = sum(
        math.sqrt(
            ((route[j+1][0]-route[j][0])*111000)**2 +
            ((route[j+1][1]-route[j][1])*108100)**2
        )
        for j in range(len(route)-1)
    )
    duration_s = total / _SPEED_MPS
    print(f'  Route {i}: {len(route)} waypoints, ~{total:.0f} m total, ~{duration_s:.0f}s at {_SPEED_MPS*3.6:.0f} km/h')

print()
print('Walker smoke test (Route 1, 40 ticks)...')
walker = WaypointWalker(ROAD_ROUTES[0], _SPEED_MPS)
for _ in range(40):
    lat, lon, hdg = walker.advance(0.5)
print(f'  After 40 ticks: lat={lat:.6f} lon={lon:.6f} hdg={hdg:.1f} done={walker.done}')
print('All OK')
