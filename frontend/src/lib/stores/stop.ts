import { writable, derived } from 'svelte/store';
import { type Stop, type StopDetectionConfig } from '$types/stop';
import { DEFAULT_STOP_CONFIG, StopTracker } from '$lib/utils/stop';

interface StopState {
	stops: Stop[];
	tracker: StopTracker | null;
	config: StopDetectionConfig;
}

const INITIAL_STOPS: Stop[] = [
	{
		id: 2,
		letter: 'A',
		route: 'Piazza Principale',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.95980,
		lng: 14.87867,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 30
	},
	{
		id: 1,
		letter: 'B',
		route: 'Via Roma',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.96085,
		lng: 14.8813,
		isOngoing: true,
		done: false,
		skipped: false,
		radius: 35
	},
	{
		id: 3,
		letter: 'C',
		route: 'Chiesa Madre',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.9614,
		lng: 14.8836,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 45
	},
	{
		id: 4,
		letter: 'D',
		route: 'Municipio',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.962,
		lng: 14.8845,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 30
	},
	{
		id: 5,
		letter: 'E',
		route: 'Scuola Elementare',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.9618,
		lng: 14.8828,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 40
	}
];

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
	return $stopsStore.stops.find(s => s.startTime && !s.endTime) || null;
});

export const nextStop = derived(stopsStore, ($stopsStore) => {
	if (!$stopsStore.tracker) return null;
	return $stopsStore.tracker.getNextPlannedStop();
});

export const skippedStops = derived(stopsStore, ($stopsStore) => {
	return $stopsStore.stops.filter(s => s.skipped);
});

export const stopsByVisitOrder = derived(stopsStore, ($stopsStore) => {
	if (!$stopsStore.tracker) return [];
	return $stopsStore.tracker.getStopsByVisitOrder();
});