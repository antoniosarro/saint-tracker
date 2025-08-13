import { writable, derived } from 'svelte/store';
import type { WaypointDTO } from '$types/api';
import type { Waypoint } from '$types/map';
import { apiService } from '$lib/services/api';

interface WaypointState {
	waypoints: WaypointDTO[];
	loading: boolean;
	error: string | null;
	lastUpdated: Date | null;
}

// Create the main waypoints store
const createWaypointStore = () => {
	const { subscribe, set, update } = writable<WaypointState>({
		waypoints: [],
		loading: false,
		error: null,
		lastUpdated: null
	});

	const loadWaypoints = async () => {
		update(state => ({ ...state, loading: true, error: null }));
		
		try {
			const waypoints = await apiService.getWaypoints();
			update(state => ({
				...state,
				waypoints: waypoints,
				loading: false,
				lastUpdated: new Date()
			}));
		} catch (error) {
			console.error('Failed to load waypoints:', error);
			update(state => ({
				...state,
				loading: false,
				error: error instanceof Error ? error.message : 'Failed to load waypoints'
			}));
		}
	};

	const addWaypoints = (newWaypoints: WaypointDTO[]) => {
		update(state => {
			// Create a map of existing waypoints by ID to avoid duplicates
			const existingWaypointsMap = new Map(
				state.waypoints.map(wp => [wp.id, wp])
			);

			// Add new waypoints, overwriting existing ones with same ID
			newWaypoints.forEach(wp => {
				existingWaypointsMap.set(wp.id, wp);
			});

			// Convert back to array and sort by created_at
			const updatedWaypoints = Array.from(existingWaypointsMap.values())
				.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

			return {
				...state,
				waypoints: updatedWaypoints,
				lastUpdated: new Date()
			};
		});
	};

	const clearWaypoints = () => {
		update(state => ({
			...state,
			waypoints: [],
			lastUpdated: new Date()
		}));
	};

	return {
		subscribe,
		loadWaypoints,
		addWaypoints,
		clearWaypoints
	};
};

export const waypointStore = createWaypointStore();

// Helper function to convert WaypointDTO to Waypoint for map rendering
const convertWaypointDTOToWaypoint = (dto: WaypointDTO): Waypoint => ({
	latitude: dto.latitude,
	longitude: dto.longitude,
	created_at: new Date(dto.created_at).getTime(),
	speed: dto.speed
});

// Derived store that provides waypoints in the format expected by the map component
export const mapWaypoints = derived(
	waypointStore,
	($waypointStore) => {
		return $waypointStore.waypoints.map(convertWaypointDTOToWaypoint);
	}
);

// Derived store for various statistics
export const waypointStats = derived(
	waypointStore,
	($waypointStore) => {
		const waypoints = $waypointStore.waypoints;
		
		if (waypoints.length === 0) {
			return {
				count: 0,
				maxSpeed: 0,
				avgSpeed: 0,
				duration: 0,
				currentPosition: null
			};
		}

		const speeds = waypoints.map(wp => wp.speed).filter(s => s > 0);
		const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;
		const avgSpeed = speeds.length > 0 ? speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length : 0;
		
		// Calculate duration between first and last waypoint
		const sortedWaypoints = [...waypoints].sort(
			(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
		);
		const firstTime = new Date(sortedWaypoints[0].created_at).getTime();
		const lastTime = new Date(sortedWaypoints[sortedWaypoints.length - 1].created_at).getTime();
		const duration = Math.round((lastTime - firstTime) / 1000 / 60); // Duration in minutes

		// Current position is the latest waypoint
		const currentPosition = sortedWaypoints[sortedWaypoints.length - 1];

		return {
			count: waypoints.length,
			maxSpeed,
			avgSpeed,
			duration,
			currentPosition
		};
	}
);