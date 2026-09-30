"""
Unit tests for TrajectoryPredictor in prediction_engine.py

Intersection center: Lat 13.0827, Lon 80.2707
PATH_A = 0°  (North)
PATH_B = 90° (East)
PATH_C = 180° (South)
PATH_D = 270° (West)

To place a vehicle ~30m from the center and within the 50m threshold:
  - North of center → lat += ~0.00027  (~30m north)
  - East of center  → lon += ~0.00027  (~30m east)
  - South of center → lat -= 0.00027   (~30m south)
  - West of center  → lon -= 0.00027   (~30m west)

Each test simulates >2 consecutive aligned updates to trigger a prediction.
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
from app.services.prediction_engine import TrajectoryPredictor


# ~30m offset in degrees latitude/longitude (approx 1° lat ≈ 111,000m)
OFFSET = 30 / 111_000  # ≈ 0.00027°


def make_vehicle_near_center(direction: str):
    """
    Return (lat, lon) for a vehicle ~30m from the intersection center
    in the given cardinal direction.
    """
    center_lat = 13.0827
    center_lon = 80.2707
    if direction == 'north':
        return center_lat + OFFSET, center_lon
    elif direction == 'east':
        return center_lat, center_lon + OFFSET
    elif direction == 'south':
        return center_lat - OFFSET, center_lon
    elif direction == 'west':
        return center_lat, center_lon - OFFSET
    raise ValueError(f"Unknown direction: {direction}")


def simulate_path(predictor: TrajectoryPredictor, lat: float, lon: float,
                  heading: float, speed: float = 10.0, updates: int = 3) -> dict:
    """
    Feed `updates` consecutive ticks to the predictor and return the last result.
    """
    result = {}
    for _ in range(updates):
        result = predictor.predict_path(lat, lon, heading, speed)
    return result


# ---------------------------------------------------------------------------
# Test: PATH_A — Vehicle heading North (0°), positioned north of center
# ---------------------------------------------------------------------------
class TestPathA:
    def test_path_a_is_predicted(self):
        """Vehicle north of center, heading 0° → should predict PATH_A."""
        predictor = TrajectoryPredictor()
        lat, lon = make_vehicle_near_center('north')
        result = simulate_path(predictor, lat, lon, heading=0.0, updates=3)
        assert result['predicted_path'] == 'PATH_A'
        assert result['confidence'] > 0.0

    def test_path_a_exact_heading_max_confidence(self):
        """Exact heading 0° → confidence should be 1.0."""
        predictor = TrajectoryPredictor()
        lat, lon = make_vehicle_near_center('north')
        result = simulate_path(predictor, lat, lon, heading=0.0, updates=3)
        assert result['confidence'] == 1.0

    def test_path_a_boundary_heading(self):
        """Heading at exactly 25° tolerance boundary → still PATH_A but lower confidence."""
        predictor = TrajectoryPredictor()
        lat, lon = make_vehicle_near_center('north')
        result = simulate_path(predictor, lat, lon, heading=25.0, updates=3)
        assert result['predicted_path'] == 'PATH_A'
        assert result['confidence'] >= 0.0

    def test_path_a_outside_tolerance(self):
        """Heading at 30° (outside ±25° tolerance) → no prediction."""
        predictor = TrajectoryPredictor()
        lat, lon = make_vehicle_near_center('north')
        result = simulate_path(predictor, lat, lon, heading=30.0, updates=3)
        assert result['predicted_path'] is None


# ---------------------------------------------------------------------------
# Test: PATH_B — Vehicle heading East (90°), positioned east of center
# ---------------------------------------------------------------------------
class TestPathB:
    def test_path_b_is_predicted(self):
        """Vehicle east of center, heading 90° → should predict PATH_B."""
        predictor = TrajectoryPredictor()
        lat, lon = make_vehicle_near_center('east')
        result = simulate_path(predictor, lat, lon, heading=90.0, updates=3)
        assert result['predicted_path'] == 'PATH_B'
        assert result['confidence'] > 0.0

    def test_path_b_exact_heading_max_confidence(self):
        """Exact heading 90° → confidence should be 1.0."""
        predictor = TrajectoryPredictor()
        lat, lon = make_vehicle_near_center('east')
        result = simulate_path(predictor, lat, lon, heading=90.0, updates=3)
        assert result['confidence'] == 1.0

    def test_path_b_negative_tolerance(self):
        """Heading 70° (−20° from East) → still PATH_B."""
        predictor = TrajectoryPredictor()
        lat, lon = make_vehicle_near_center('east')
        result = simulate_path(predictor, lat, lon, heading=70.0, updates=3)
        assert result['predicted_path'] == 'PATH_B'

    def test_path_b_not_enough_consecutive_updates(self):
        """Only 2 updates (not > 2) → no prediction yet."""
        predictor = TrajectoryPredictor()
        lat, lon = make_vehicle_near_center('east')
        result = simulate_path(predictor, lat, lon, heading=90.0, updates=2)
        assert result['predicted_path'] is None


# ---------------------------------------------------------------------------
# Test: PATH_C — Vehicle heading South (180°), positioned south of center
# ---------------------------------------------------------------------------
class TestPathC:
    def test_path_c_is_predicted(self):
        """Vehicle south of center, heading 180° → should predict PATH_C."""
        predictor = TrajectoryPredictor()
        lat, lon = make_vehicle_near_center('south')
        result = simulate_path(predictor, lat, lon, heading=180.0, updates=3)
        assert result['predicted_path'] == 'PATH_C'
        assert result['confidence'] > 0.0

    def test_path_c_exact_heading_max_confidence(self):
        """Exact heading 180° → confidence should be 1.0."""
        predictor = TrajectoryPredictor()
        lat, lon = make_vehicle_near_center('south')
        result = simulate_path(predictor, lat, lon, heading=180.0, updates=3)
        assert result['confidence'] == 1.0

    def test_path_c_within_tolerance(self):
        """Heading 165° (within 25° of 180°) → still PATH_C."""
        predictor = TrajectoryPredictor()
        lat, lon = make_vehicle_near_center('south')
        result = simulate_path(predictor, lat, lon, heading=165.0, updates=3)
        assert result['predicted_path'] == 'PATH_C'

    def test_path_c_confidence_range(self):
        """Confidence must always be between 0.0 and 1.0."""
        predictor = TrajectoryPredictor()
        lat, lon = make_vehicle_near_center('south')
        result = simulate_path(predictor, lat, lon, heading=170.0, updates=3)
        assert 0.0 <= result['confidence'] <= 1.0


# ---------------------------------------------------------------------------
# Test: PATH_D — Vehicle heading West (270°), positioned west of center
# ---------------------------------------------------------------------------
class TestPathD:
    def test_path_d_is_predicted(self):
        """Vehicle west of center, heading 270° → should predict PATH_D."""
        predictor = TrajectoryPredictor()
        lat, lon = make_vehicle_near_center('west')
        result = simulate_path(predictor, lat, lon, heading=270.0, updates=3)
        assert result['predicted_path'] == 'PATH_D'
        assert result['confidence'] > 0.0

    def test_path_d_exact_heading_max_confidence(self):
        """Exact heading 270° → confidence should be 1.0."""
        predictor = TrajectoryPredictor()
        lat, lon = make_vehicle_near_center('west')
        result = simulate_path(predictor, lat, lon, heading=270.0, updates=3)
        assert result['confidence'] == 1.0

    def test_path_d_wrap_around_heading(self):
        """Heading 255° (−15° from West) → still PATH_D."""
        predictor = TrajectoryPredictor()
        lat, lon = make_vehicle_near_center('west')
        result = simulate_path(predictor, lat, lon, heading=255.0, updates=3)
        assert result['predicted_path'] == 'PATH_D'


# ---------------------------------------------------------------------------
# Test: Range guard — vehicle too far from intersection
# ---------------------------------------------------------------------------
class TestRangeGuard:
    def test_no_prediction_outside_50m(self):
        """Vehicle more than 50m away → no prediction, state reset."""
        predictor = TrajectoryPredictor()
        # Place vehicle ~200m south of center
        big_offset = 200 / 111_000
        lat = 13.0827 - big_offset
        lon = 80.2707
        result = simulate_path(predictor, lat, lon, heading=180.0, updates=5)
        assert result['predicted_path'] is None
        assert result['confidence'] == 0.0

    def test_state_resets_after_leaving_zone(self):
        """
        Vehicle builds up 3 aligned updates, then leaves zone.
        After re-entering with only 1 new update, no prediction yet.
        """
        predictor = TrajectoryPredictor()
        lat_in, lon_in = make_vehicle_near_center('south')
        big_offset = 200 / 111_000
        lat_out = 13.0827 - big_offset

        # 3 in-zone updates → triggers prediction
        r = simulate_path(predictor, lat_in, lon_in, heading=180.0, updates=3)
        assert r['predicted_path'] == 'PATH_C'

        # 1 out-of-zone update → state resets
        predictor.predict_path(lat_out, 80.2707, 180.0, 10.0)

        # 1 fresh in-zone update → not enough consecutive, no prediction
        result = predictor.predict_path(lat_in, lon_in, 180.0, 10.0)
        assert result['predicted_path'] is None
