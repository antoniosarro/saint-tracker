import type { Waypoint } from '$types/map';

/**
 * Earth's radius in meters (WGS84 mean radius)
 * @constant
 */
const EARTH_RADIUS_METERS = 6371000;

/**
 * Converts degrees to radians
 * @param degrees - Angle in degrees
 * @returns Angle in radians
 */
const degreesToRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Calculates the great-circle distance between two GPS coordinates using the Haversine formula.
 *
 * The Haversine formula determines the shortest distance between two points on a sphere,
 * which provides accurate results for most practical purposes when dealing with Earth coordinates.
 *
 * @param lat1 - Latitude of the first point in decimal degrees (-90 to 90)
 * @param lng1 - Longitude of the first point in decimal degrees (-180 to 180)
 * @param lat2 - Latitude of the second point in decimal degrees (-90 to 90)
 * @param lng2 - Longitude of the second point in decimal degrees (-180 to 180)
 * @returns Distance between the two points in meters
 *
 * @throws {Error} If any coordinate is invalid (NaN, null, or out of valid range)
 *
 * @see {@link https://en.wikipedia.org/wiki/Haversine_formula} for mathematical details
 */
export function calculateDistance(
	latitude1: number,
	longitude1: number,
	latitude2: number,
	longitude2: number
): number {
	// Validate inputs
	if (!isValidLatitude(latitude1) || !isValidLatitude(latitude2)) {
		throw new Error(`Invalid latitude. Must be between -90 and 90 degrees`);
	}
	if (!isValidLongitude(longitude1) || !isValidLongitude(longitude2)) {
		throw new Error(`Invalid longitude. Must be between -180 and 180 degrees`);
	}

	// Convert coordinate differences to radians
	const deltaLat = degreesToRadians(latitude2 - latitude1);
	const deltaLng = degreesToRadians(longitude2 - longitude1);

	// Convert latitudes to radians for the formula
	const lat1Rad = degreesToRadians(latitude1);
	const lat2Rad = degreesToRadians(latitude2);

	// Haversine formula
	const haversineAngle =
		Math.sin(deltaLat / 2) ** 2 +
		Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLng / 2) ** 2;

	// Calculate angular distance
	const angularDistance = 2 * Math.atan2(Math.sqrt(haversineAngle), Math.sqrt(1 - haversineAngle));

	// Convert angular distance to meters
	return EARTH_RADIUS_METERS * angularDistance;
}

/**
 * Calculates the total distance of a route defined by a series of waypoints.
 *
 * The function sums up the distances between consecutive waypoints in the order
 * they appear in the array. For a route with n waypoints, it calculates n-1 segments.
 *
 * @param points - Array of waypoints defining the route
 * @returns Total distance of the route in meters
 *
 * @throws {Error} If the points array is null, undefined, or contains invalid waypoints
 */
export function calculateTotalDistance(points: Waypoint[]): number {
	// Validate input
	if (!points || !Array.isArray(points)) {
		throw new Error('Points must be a valid array');
	}

	if (points.length === 0) {
		return 0;
	}

	if (points.length === 1) {
		// Single point has no distance
		return 0;
	}

	// Validate all waypoints before calculation
	points.forEach((point, index) => {
		if (!point || typeof point !== 'object') {
			throw new Error(`Invalid waypoint at index ${index}`);
		}
		if (!isValidLatitude(point.latitude)) {
			throw new Error(`Invalid latitude at waypoint ${index}: ${point.latitude}`);
		}
		if (!isValidLongitude(point.longitude)) {
			throw new Error(`Invalid longitude at waypoint ${index}: ${point.longitude}`);
		}
	});

	// Calculate cumulative distance
	let totalDistance = 0;

	for (let i = 1; i < points.length; i++) {
		const segmentDistance = calculateDistance(
			points[i - 1].latitude,
			points[i - 1].longitude,
			points[i].latitude,
			points[i].longitude
		);
		totalDistance += segmentDistance;
	}

	return totalDistance;
}

/**
 * Calculates distances for each segment in a route.
 *
 * @param points - Array of waypoints defining the route
 * @returns Array of segment distances in meters, where index i represents
 *          the distance from waypoint i to waypoint i+1
 *
 */
export function calculateSegmentDistances(points: Waypoint[]): number[] {
	if (!points || points.length < 2) {
		return [];
	}

	const segments: number[] = [];

	for (let i = 1; i < points.length; i++) {
		segments.push(
			calculateDistance(
				points[i - 1].latitude,
				points[i - 1].longitude,
				points[i].latitude,
				points[i].longitude
			)
		);
	}

	return segments;
}

export function smoothGpsPointsWeighted(points: Waypoint[], windowSize = 1) {
	if (points.length <= windowSize) return points;

	const smoothed = [...points];
	for (let i = windowSize; i < points.length - windowSize; i++) {
		let latSum = 0,
			lngSum = 0,
			weightSum = 0;

		for (let j = -windowSize; j <= windowSize; j++) {
			// Give more weight to points closer to center
			const weight = windowSize + 1 - Math.abs(j);
			latSum += points[i + j].latitude * weight;
			lngSum += points[i + j].longitude * weight;
			weightSum += weight;
		}

		smoothed[i] = {
			...points[i],
			latitude: latSum / weightSum,
			longitude: lngSum / weightSum
		};
	}
	return smoothed;
}

/**
 * Formats a distance value into a human-readable string.
 *
 * @param meters - Distance in meters
 * @param options - Formatting options
 * @returns Formatted distance string
 *
 */
export function formatDistance(
	meters: number,
	options: {
		decimals?: number;
		unit?: 'auto' | 'meters' | 'km' | 'miles';
	} = {}
): string {
	const { decimals = 2, unit = 'auto' } = options;

	if (unit === 'miles') {
		const miles = meters * 0.000621371;
		return `${miles.toFixed(decimals)} mi`;
	}

	if (unit === 'km' || (unit === 'auto' && meters >= 1000)) {
		const km = meters / 1000;
		return `${km.toFixed(decimals)} km`;
	}

	return `${Math.round(meters)} m`;
}

/**
 * Validates if a latitude value is within the valid range.
 *
 * @param latitude - Latitude value to validate
 * @returns true if the latitude is valid, false otherwise
 */
function isValidLatitude(latitude: number): boolean {
	return typeof latitude === 'number' && !isNaN(latitude) && latitude >= -90 && latitude <= 90;
}

/**
 * Validates if a longitude value is within the valid range.
 *
 * @param longitude - Longitude value to validate
 * @returns true if the longitude is valid, false otherwise
 */
function isValidLongitude(longitude: number): boolean {
	return (
		typeof longitude === 'number' && !isNaN(longitude) && longitude >= -180 && longitude <= 180
	);
}
