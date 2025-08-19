// Cache to store previously filtered results
let filteredCache: Map<string, Waypoint> = new Map();
let lastProcessedCount = 0;

interface Waypoint {
	latitude: number;
	longitude: number;
	created_at: number;
	speed?: number;
}

/**
 * Calculates the distance between two points using Haversine formula
 */
function calculateDistance(point1: Waypoint, point2: Waypoint): number {
	const R = 6371000; // Earth's radius in meters
	const lat1Rad = (point1.latitude * Math.PI) / 180;
	const lat2Rad = (point2.latitude * Math.PI) / 180;
	const deltaLatRad = ((point2.latitude - point1.latitude) * Math.PI) / 180;
	const deltaLngRad = ((point2.longitude - point1.longitude) * Math.PI) / 180;

	const a =
		Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
		Math.cos(lat1Rad) *
			Math.cos(lat2Rad) *
			Math.sin(deltaLngRad / 2) *
			Math.sin(deltaLngRad / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	return R * c;
}

/**
 * Calculates perpendicular distance from a point to a line segment
 */
function perpendicularDistance(point: Waypoint, lineStart: Waypoint, lineEnd: Waypoint): number {
	const A = point.latitude - lineStart.latitude;
	const B = point.longitude - lineStart.longitude;
	const C = lineEnd.latitude - lineStart.latitude;
	const D = lineEnd.longitude - lineStart.longitude;

	const dot = A * C + B * D;
	const lenSq = C * C + D * D;
	
	if (lenSq === 0) return calculateDistance(point, lineStart);

	const param = dot / lenSq;
	let closestPoint: Waypoint;

	if (param < 0) {
		closestPoint = lineStart;
	} else if (param > 1) {
		closestPoint = lineEnd;
	} else {
		closestPoint = {
			latitude: lineStart.latitude + param * C,
			longitude: lineStart.longitude + param * D,
			created_at: 0
		};
	}

	return calculateDistance(point, closestPoint);
}

/**
 * Douglas-Peucker algorithm for path simplification
 */
function douglasPeucker(points: Waypoint[], epsilon: number): Waypoint[] {
	if (points.length <= 2) return points;

	let maxDistance = 0;
	let maxIndex = 0;
	const end = points.length - 1;

	// Find the point with maximum distance from the line segment
	for (let i = 1; i < end; i++) {
		const distance = perpendicularDistance(points[i], points[0], points[end]);
		if (distance > maxDistance) {
			maxDistance = distance;
			maxIndex = i;
		}
	}

	// If max distance is greater than epsilon, recursively simplify
	if (maxDistance > epsilon) {
		const leftSegment = douglasPeucker(points.slice(0, maxIndex + 1), epsilon);
		const rightSegment = douglasPeucker(points.slice(maxIndex), epsilon);
		
		// Combine results, avoiding duplicate middle point
		return [...leftSegment.slice(0, -1), ...rightSegment];
	}

	// If max distance is less than epsilon, return just the endpoints
	return [points[0], points[end]];
}

/**
 * Creates a unique key for a waypoint
 */
function createWaypointKey(waypoint: Waypoint): string {
	return `${waypoint.latitude.toFixed(7)}_${waypoint.longitude.toFixed(7)}_${waypoint.created_at}`;
}

/**
 * Filters waypoints to remove redundant points while maintaining consistency
 * @param sortedWaypoints - Array of waypoints sorted by timestamp
 * @param options - Filtering options
 * @returns Filtered array of waypoints
 */
function filterWaypoints(
	sortedWaypoints: Waypoint[],
	options: {
		minDistance?: number; // Minimum distance between points in meters
		minTimeInterval?: number; // Minimum time interval between points in seconds
		douglasPeuckerEpsilon?: number; // Tolerance for Douglas-Peucker algorithm in meters
		maxPoints?: number; // Maximum number of points to keep
	} = {}
): Waypoint[] {
	const {
		minDistance = 10, // 10 meters
		minTimeInterval = 5, // 5 seconds
		douglasPeuckerEpsilon = 5, // 5 meters
		maxPoints = 1000
	} = options;

	if (sortedWaypoints.length === 0) {
		return [];
	}

	// If we have fewer waypoints than last time, reset cache
	if (sortedWaypoints.length < lastProcessedCount) {
		filteredCache.clear();
		lastProcessedCount = 0;
	}

	// Determine which waypoints are new
	const newWaypoints = sortedWaypoints.slice(lastProcessedCount);
	let result: Waypoint[] = [];

	// Get previously filtered waypoints from cache
	if (lastProcessedCount > 0) {
		for (let i = 0; i < lastProcessedCount; i++) {
			const key = createWaypointKey(sortedWaypoints[i]);
			if (filteredCache.has(key)) {
				result.push(filteredCache.get(key)!);
			}
		}
	}

	// If no new waypoints, return cached result
	if (newWaypoints.length === 0) {
		return result;
	}

	// Process new waypoints
	let allWaypointsToProcess = [...sortedWaypoints];
	
	// Step 1: Remove points that are too close in distance or time
	let filtered: Waypoint[] = [];
	
	if (allWaypointsToProcess.length > 0) {
		filtered.push(allWaypointsToProcess[0]); // Always keep first point
		
		for (let i = 1; i < allWaypointsToProcess.length; i++) {
			const current = allWaypointsToProcess[i];
			const last = filtered[filtered.length - 1];
			
			const distance = calculateDistance(current, last);
			const timeInterval = Math.abs(current.created_at - last.created_at) / 1000;
			
			// Keep point if it's far enough or enough time has passed
			if (distance >= minDistance || timeInterval >= minTimeInterval) {
				filtered.push(current);
			}
		}
		
		// Always keep the last point if it's not already included
		const lastPoint = allWaypointsToProcess[allWaypointsToProcess.length - 1];
		if (filtered[filtered.length - 1] !== lastPoint) {
			filtered.push(lastPoint);
		}
	}

	// Step 2: Apply Douglas-Peucker algorithm for path simplification
	if (filtered.length > 2) {
		filtered = douglasPeucker(filtered, douglasPeuckerEpsilon);
	}

	// Step 3: If still too many points, sample evenly
	if (filtered.length > maxPoints) {
		const step = Math.floor(filtered.length / maxPoints);
		const sampled = [];
		
		sampled.push(filtered[0]); // Always keep first
		
		for (let i = step; i < filtered.length - 1; i += step) {
			sampled.push(filtered[i]);
		}
		
		sampled.push(filtered[filtered.length - 1]); // Always keep last
		filtered = sampled;
	}

	// Update cache with all processed waypoints
	filteredCache.clear();
	for (let i = 0; i < sortedWaypoints.length; i++) {
		const waypoint = sortedWaypoints[i];
		const key = createWaypointKey(waypoint);
		
		// Check if this waypoint should be in the filtered result
		const isFiltered = filtered.some(f => 
			f.latitude === waypoint.latitude && 
			f.longitude === waypoint.longitude && 
			f.created_at === waypoint.created_at
		);
		
		if (isFiltered) {
			filteredCache.set(key, waypoint);
		}
	}

	lastProcessedCount = sortedWaypoints.length;
	return filtered;
}

// Export the main function
export { filterWaypoints };