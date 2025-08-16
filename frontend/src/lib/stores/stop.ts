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
		id: 1,
		letter: '1',
		route: 'Chiesa Madre',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.95962,
		lng: 14.87891,
		isOngoing: true,
		done: false,
		skipped: false,
		radius: 35
	},
	{
		id: 2,
		letter: '2',
		route: 'Famiglia Catalano',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.9786,
		lng: 14.88669,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 3,
		letter: '3',
		route: 'Contrada Castelrotto, 2',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.97805,
		lng: 14.88978,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 4,
		letter: '4',
		route: 'EuroGlass De Cicco',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.977,
		lng: 14.89114,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 5,
		letter: '5',
		route: 'Famiglia Ferraro',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.97638,
		lng: 14.89207,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 6,
		letter: '6',
		route: 'Guarini Santa Marina, 36',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.9786,
		lng: 14.89442,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 35
	},
	{
		id: 7,
		letter: '7',
		route: 'Orazio Martignetti',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.98131,
		lng: 14.89836,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 8,
		letter: '8',
		route: 'Contrada Lomba - Montemiletto',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.98801,
		lng: 14.91012,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 35
	},
	{
		id: 9,
		letter: '9',
		route: 'Bosco Lumeti - Montemiletto',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.99559,
		lng: 14.90645,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 35
	},
	{
		id: 10,
		letter: '10',
		route: 'Bosco Lumeti, 8',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.99061,
		lng: 14.90216,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 11,
		letter: '11',
		route: 'Cappella Antonio Rapa',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.98193,
		lng: 14.89629,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 12,
		letter: '12',
		route: 'Famiglia Melchiorre',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.97522,
		lng: 14.89147,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 13,
		letter: '13',
		route: 'Guarini Santa Marina, 62',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.97425,
		lng: 14.8914,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 35
	},
	{
		id: 14,
		letter: '14',
		route: 'SP173, 30',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.97171,
		lng: 14.89098,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 15,
		letter: '15',
		route: 'Famiglia Mancino',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.97085,
		lng: 14.88928,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 16,
		letter: '16',
		route: 'SP173, 26',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.97055,
		lng: 14.88989,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 17,
		letter: '17',
		route: 'Pizzeria Da Totonno',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.96982,
		lng: 14.88952,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 35
	},
	{
		id: 18,
		letter: '18',
		route: 'Famiglia Iantosca',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.96753,
		lng: 14.8887,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 19,
		letter: '19',
		route: 'Ex Autolavaggio Pagliuca',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.96439,
		lng: 14.88673,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 20,
		letter: '20',
		route: 'Via Selvetelle, 6',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.96532,
		lng: 14.88864,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 21,
		letter: '21',
		route: 'Via Selvetelle, 12',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.96626,
		lng: 14.89004,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 22,
		letter: '22',
		route: 'Famiglie Fiorentino e Di Giovanni',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.96819,
		lng: 14.89178,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 23,
		letter: '23',
		route: "Famiglia D'Alelio",
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.96968,
		lng: 14.89391,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 24,
		letter: '24',
		route: 'SP214, 56',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.9651,
		lng: 14.89651,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 25,
		letter: '25',
		route: 'Contrada Lolli, 11',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.96737,
		lng: 14.90148,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 26,
		letter: '26',
		route: 'Famiglia Luigi Cataldo',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.96289,
		lng: 14.90075,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 27,
		letter: '27',
		route: "Famiglia Felicita D'Amore",
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.96178,
		lng: 14.90301,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 28,
		letter: '28',
		route: 'Famiglia Tony Martignetti',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.9625,
		lng: 14.89743,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 29,
		letter: '29',
		route: 'Famiglia Ciampa',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.95818,
		lng: 14.90007,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 30,
		letter: '30',
		route: 'SP214, 11',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.9568,
		lng: 14.90695,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 31,
		letter: '31',
		route: 'Contrada Arianiello',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.96992,
		lng: 14.92467,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 35
	},
	{
		id: 32,
		letter: '32',
		route: 'Chiesa della Madonna del Carmelo - Lapio',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.98084,
		lng: 14.94594,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 35
	},
	{
		id: 33,
		letter: '33',
		route: "Famiglia D'alelio - Selvetelle",
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.96627,
		lng: 14.89263,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 25
	},
	{
		id: 34,
		letter: '34',
		route: 'Guarini Santa Marina - Ex scuole',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.9725,
		lng: 14.8927,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 35
	},
	{
		id: 35,
		letter: '35',
		route: 'Chiesa Guarini Santa Marina',
		startTime: null,
		endTime: null,
		duration: 0,
		lat: 40.97091,
		lng: 14.8923,
		isOngoing: false,
		done: false,
		skipped: false,
		radius: 35
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
