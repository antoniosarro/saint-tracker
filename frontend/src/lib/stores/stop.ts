import { writable, derived } from 'svelte/store';
import { type Stop, type StopDetectionConfig } from '$types/stop';
import { DEFAULT_STOP_CONFIG, StopTracker } from '$lib/utils/stop';

interface StopState {
	stops: Stop[];
	tracker: StopTracker | null;
	config: StopDetectionConfig;
}

const INITIAL_STOPS: Stop[] = [];

const createStopsStore = () => {
	const { subscribe, set, update } = writable<StopState>({
		stops: [...INITIAL_STOPS],
		tracker: new StopTracker([...INITIAL_STOPS], DEFAULT_STOP_CONFIG),
		config: DEFAULT_STOP_CONFIG
	});

	const processWaypoint = (waypoint: {
		latitude: number;
		longitude: number;
		created_at: number;
	}) => {
		update((state) => {
			if (!state.tracker) return state;

			const updatedStops = state.tracker.processWaypoint(waypoint);

			return {
				...state,
				stops: updatedStops
			};
		});
	};

	const resetStops = () => {
		update((state) => {
			if (state.tracker) {
				state.tracker.reset();
			}
			return {
				...state,
				stops: state.tracker ? state.tracker.getStops() : [...INITIAL_STOPS]
			};
		});
	};

	const updateConfig = (newConfig: Partial<StopDetectionConfig>) => {
		update((state) => {
			const updatedConfig = { ...state.config, ...newConfig };
			const newTracker = new StopTracker(state.stops, updatedConfig);

			return {
				...state,
				config: updatedConfig,
				tracker: newTracker
			};
		});
	};

	const getCurrentStop = (): Stop | null => {
		let currentStop: Stop | null = null;

		update((state) => {
			if (state.tracker) {
				currentStop = state.tracker.getCurrentStop();
			}
			return state;
		});

		return currentStop;
	};

	const getNextPlannedStop = (): Stop | null => {
		let nextStop: Stop | null = null;

		update((state) => {
			if (state.tracker) {
				nextStop = state.tracker.getNextPlannedStop();
			}
			return state;
		});

		return nextStop;
	};

	const markStopAsSkipped = (stopId: number) => {
		update((state) => {
			if (state.tracker) {
				state.tracker.markStopAsSkipped(stopId);
				return {
					...state,
					stops: state.tracker.getStops()
				};
			}
			return state;
		});
	};

	const unmarkStopAsSkipped = (stopId: number) => {
		update((state) => {
			if (state.tracker) {
				state.tracker.unmarkStopAsSkipped(stopId);
				return {
					...state,
					stops: state.tracker.getStops()
				};
			}
			return state;
		});
	};

	const getStopsByVisitOrder = (): Stop[] => {
		let visitOrderStops: Stop[] = [];

		update((state) => {
			if (state.tracker) {
				visitOrderStops = state.tracker.getStopsByVisitOrder();
			}
			return state;
		});

		return visitOrderStops;
	};

	return {
		subscribe,
		processWaypoint,
		resetStops,
		updateConfig,
		getCurrentStop,
		getNextPlannedStop,
		markStopAsSkipped,
		unmarkStopAsSkipped,
		getStopsByVisitOrder
	};
};

export const stopsStore = createStopsStore();

// Derived stores for different aspects of stops data
export const sortedStops = derived(stopsStore, ($stopsStore) => {
	return [...$stopsStore.stops].sort((a, b) => a.id - b.id);
});

export const stopStats = derived(stopsStore, ($stopsStore) => {
	if (!$stopsStore.tracker) {
		return {
			completed: 0,
			skipped: 0,
			remaining: 0,
			total: 0,
			totalDuration: 0,
			progress: 0,
			visitedProgress: 0,
			currentStop: null,
			nextStop: null,
			skippedStops: []
		};
	}

	const stats = $stopsStore.tracker.getStats();
	const currentStop = $stopsStore.tracker.getCurrentStop();
	const nextStop = $stopsStore.tracker.getNextPlannedStop();
	const skippedStops = $stopsStore.tracker.getSkippedStops();

	return {
		...stats,
		currentStop,
		nextStop,
		skippedStops
	};
});

export const currentStop = derived(stopsStore, ($stopsStore) => {
	return $stopsStore.stops.find((s) => s.startTime && !s.endTime) || null;
});

export const nextStop = derived(stopsStore, ($stopsStore) => {
	if (!$stopsStore.tracker) return null;
	return $stopsStore.tracker.getNextPlannedStop();
});

export const skippedStops = derived(stopsStore, ($stopsStore) => {
	return $stopsStore.stops.filter((s) => s.skipped);
});

export const stopsByVisitOrder = derived(stopsStore, ($stopsStore) => {
	if (!$stopsStore.tracker) return [];
	return $stopsStore.tracker.getStopsByVisitOrder();
});
