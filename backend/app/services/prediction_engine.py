from geopy.distance import distance

class TrajectoryPredictor:
    def __init__(self):
        # 1. Fixed intersection center coordinate
        self.center_lat = 13.0827
        self.center_lon = 80.2707
        
        # 8 directional exit vectors radiating outwards
        # N=0, NE=45, E=90, SE=135, S=180, SW=225, W=270, NW=315
        self.paths = {
            'PATH_A': 0.0,
            'PATH_B': 45.0,
            'PATH_C': 90.0,
            'PATH_D': 135.0,
            'PATH_E': 180.0,
            'PATH_F': 225.0,
            'PATH_G': 270.0,
            'PATH_H': 315.0
        }
        
        # State tracking for consecutive updates per path
        self.consecutive_alignments = {path: 0 for path in self.paths}

    def _angular_difference(self, h1: float, h2: float) -> float:
        """Calculate the smallest angular difference between two headings."""
        diff = (h1 - h2 + 180) % 360 - 180
        return abs(diff)

    def predict_path(self, latitude: float, longitude: float, heading: float, speed: float) -> dict:
        """
        Predict the path of a vehicle approaching the intersection.
        """
        # Calculate distance to intersection center using GeoPy
        center = (self.center_lat, self.center_lon)
        current = (latitude, longitude)
        dist_m = distance(center, current).meters

        predicted_path = None
        confidence = 0.0

        if dist_m <= 50.0:
            aligned_path = None
            min_diff = float('inf')
            
            # Calculate angular difference between heading and each path vector
            for path, path_heading in self.paths.items():
                diff = self._angular_difference(heading, path_heading)
                # Apply threshold: within 22.5 degree tolerance (half of 45 deg sector)
                if diff <= 22.5:
                    aligned_path = path
                    min_diff = diff
                    break 
            
            # Update state for consecutive alignments
            for path in self.paths:
                if path == aligned_path:
                    self.consecutive_alignments[path] += 1
                else:
                    self.consecutive_alignments[path] = 0
            
            # If heading aligns for more than 2 consecutive updates (i.e. >= 3)
            if aligned_path and self.consecutive_alignments[aligned_path] > 2:
                predicted_path = aligned_path
                # Confidence score: 1.0 if perfectly aligned, approaches 0 at 22.5 degrees difference
                confidence = max(0.0, 1.0 - (min_diff / 22.5))
                # Round to 2 decimal places for cleaner output
                confidence = round(confidence, 2)
        else:
            # Reset state if vehicle is out of the 50m range
            for path in self.paths:
                self.consecutive_alignments[path] = 0

        return {
            'predicted_path': predicted_path,
            'confidence': confidence,
            'distance_to_center': round(dist_m, 2)
        }
