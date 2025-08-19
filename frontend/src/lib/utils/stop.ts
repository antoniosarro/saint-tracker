import type { Stop, StopDetectionConfig } from '$types/stop';
import type { Waypoint } from '$types/map';
import { calculateDistance } from '$utils/map';

// Default configuration
export const DEFAULT_STOP_CONFIG: StopDetectionConfig = {
	defaultRadius: 25, // 25 meters
	minStopDuration: 45, // 30 seconds
	exitRadius: 40 // 40 meters
};

export class StopTracker {
	private stops: Stop[];
	private config: StopDetectionConfig;
	private lastKnownPosition: Waypoint | null = null;
	private currentStopId: number | null = null;
	private entryTime: Date | null = null;
	private visitCounter: number = 0; // Tracks the order of visits

	constructor(stops: Stop[], config: StopDetectionConfig) {
		this.stops = [...stops];
		this.config = config;
	}

	/**
	 * Process a new GPS waypoint and update stop states
	 */
	processWaypoint(waypoint: Waypoint): Stop[] {
		this.lastKnownPosition = waypoint;
		const currentTime = new Date(waypoint.created_at);

		// Check if we're currently in a stop
		if (this.currentStopId !== null) {
			const currentStop = this.stops.find(s => s.id === this.currentStopId);
			if (currentStop) {
				const distance = calculateDistance(
					waypoint.latitude,
					waypoint.longitude,
					currentStop.lat,
					currentStop.lng
				);

				// Check if we've left the stop
				const exitRadius = currentStop.radius ? 
					currentStop.radius * 1.5 : this.config.exitRadius;

				if (distance > exitRadius) {
					// We've left the stop
					this.exitStop(currentTime);
				}
			}
		} else {
			// Not currently in a stop, check if we've entered any stop
			this.checkStopEntry(waypoint, currentTime);
		}

		// Update skipped stops and next stop display
		this.updateStopStates();

		return [...this.stops];
	}

	/**
	 * Check if the device has entered any stop
	 */
	private checkStopEntry(waypoint: Waypoint, currentTime: Date): void {
		// Check all stops, not just incomplete ones - we can visit completed stops again
		for (const stop of this.stops) {
			if (stop.startTime && !stop.endTime) continue; // Skip if already in progress

			const distance = calculateDistance(
				waypoint.latitude,
				waypoint.longitude,
				stop.lat,
				stop.lng
			);

			const detectionRadius = stop.radius || this.config.defaultRadius;

			if (distance <= detectionRadius) {
				// Entered a stop
				this.enterStop(stop.id, currentTime);
				break; // Only enter one stop at a time
			}
		}
	}

	/**
	 * Enter a stop
	 */
	private enterStop(stopId: number, entryTime: Date): void {
		const stop = this.stops.find(s => s.id === stopId);
		if (!stop) return;

		this.currentStopId = stopId;
		this.entryTime = entryTime;
		this.visitCounter++;

		// Update stop state
		stop.startTime = entryTime;
		stop.endTime = null;
		stop.duration = 0;
		stop.isOngoing = true;
		stop.skipped = false; // Reset skipped status if re-visiting
		stop.visitOrder = this.visitCounter;

		console.log(`Entered stop ${stop.letter} (${stop.route}) at ${entryTime.toLocaleTimeString()}`);
	}

	/**
	 * Exit the current stop
	 */
	private exitStop(exitTime: Date): void {
		const stop = this.stops.find(s => s.id === this.currentStopId);
		if (!stop || !this.entryTime) return;

		const duration = Math.floor((exitTime.getTime() - this.entryTime.getTime()) / 1000);

		// Only mark as completed if minimum duration is met
		if (duration >= this.config.minStopDuration) {
			stop.endTime = exitTime;
			stop.duration = duration;
			stop.done = true;
			stop.isOngoing = false;

			console.log(`Completed stop ${stop.letter} (${stop.route}) - Duration: ${duration}s`);
		} else {
			// Reset the stop if duration was too short
			stop.startTime = null;
			stop.endTime = null;
			stop.duration = 0;
			stop.isOngoing = false;
			stop.visitOrder = undefined;

			console.log(`Exited stop ${stop.letter} too quickly (${duration}s < ${this.config.minStopDuration}s)`);
		}

		this.currentStopId = null;
		this.entryTime = null;
	}

	/**
	 * Update stop states to handle skipped stops and next stop logic
	 */
	private updateStopStates(): void {
		// Reset all ongoing flags first
		this.stops.forEach(stop => {
			if (!stop.startTime) {
				stop.isOngoing = false;
			}
		});

		// Get the list of completed stops (excluding skipped ones)
		const completedStops = this.stops.filter(s => s.done);
		const currentStop = this.stops.find(s => s.startTime && !s.endTime);

		if (completedStops.length > 0) {
			// Find stops that should be marked as skipped
			// A stop is skipped if there's a completed stop with a higher ID and this stop is not done
			const maxCompletedId = Math.max(...completedStops.map(s => s.id));
			
			this.stops.forEach(stop => {
				if (!stop.done && !stop.startTime && stop.id < maxCompletedId) {
					stop.skipped = true;
				}
			});
		}

		// Determine the next stop to visit
		if (!currentStop) {
			// Find the next incomplete, non-skipped stop in order
			const nextStop = this.stops
				.filter(s => !s.done && !s.skipped && !s.startTime)
				.sort((a, b) => a.id - b.id)[0];

			if (nextStop) {
				nextStop.isOngoing = true;
			} else {
				// If no regular next stop, find the first incomplete stop (even if skipped)
				const fallbackStop = this.stops
					.filter(s => !s.done && !s.startTime)
					.sort((a, b) => a.id - b.id)[0];
				
				if (fallbackStop) {
					fallbackStop.isOngoing = true;
				}
			}
		}
	}

	/**
	 * Get current stop information
	 */
	getCurrentStop(): Stop | null {
		if (this.currentStopId === null) return null;
		return this.stops.find(s => s.id === this.currentStopId) || null;
	}

	/**
	 * Get the next planned stop (considering skipped stops)
	 */
	getNextPlannedStop(): Stop | null {
		// First try to get the next non-skipped stop
		const nextStop = this.stops
			.filter(s => !s.done && !s.skipped && !s.startTime)
			.sort((a, b) => a.id - b.id)[0];
		
		if (nextStop) return nextStop;

		// If no non-skipped stops, return the next incomplete stop
		return this.stops
			.filter(s => !s.done && !s.startTime)
			.sort((a, b) => a.id - b.id)[0] || null;
	}

	/**
	 * Get stops that have been skipped
	 */
	getSkippedStops(): Stop[] {
		return this.stops.filter(s => s.skipped);
	}

	/**
	 * Get stop statistics
	 */
	getStats() {
		const completed = this.stops.filter(s => s.done).length;
		const skipped = this.stops.filter(s => s.skipped).length;
		const total = this.stops.length;
		const totalDuration = this.stops
			.filter(s => s.done)
			.reduce((sum, s) => sum + s.duration, 0);

		const remaining = total - completed - skipped;

		return {
			completed,
			skipped,
			remaining,
			total,
			totalDuration,
			progress: total > 0 ? (completed / total) * 100 : 0,
			visitedProgress: total > 0 ? ((completed + skipped) / total) * 100 : 0
		};
	}

	/**
	 * Manually mark a stop as skipped
	 */
	markStopAsSkipped(stopId: number): void {
		const stop = this.stops.find(s => s.id === stopId);
		if (stop && !stop.done && !stop.startTime) {
			stop.skipped = true;
			stop.isOngoing = false;
			this.updateStopStates();
		}
	}

	/**
	 * Manually unmark a stop as skipped (make it available again)
	 */
	unmarkStopAsSkipped(stopId: number): void {
		const stop = this.stops.find(s => s.id === stopId);
		if (stop && stop.skipped) {
			stop.skipped = false;
			this.updateStopStates();
		}
	}

	/**
	 * Reset all stops
	 */
	reset(): void {
		this.stops.forEach(stop => {
			stop.startTime = null;
			stop.endTime = null;
			stop.duration = 0;
			stop.done = false;
			stop.isOngoing = false;
			stop.skipped = false;
			stop.visitOrder = undefined;
		});
		
		this.currentStopId = null;
		this.entryTime = null;
		this.visitCounter = 0;
		
		// Set first stop as ongoing
		this.updateStopStates();
	}

	/**
	 * Get all stops
	 */
	getStops(): Stop[] {
		return [...this.stops];
	}

	/**
	 * Get stops sorted by visit order
	 */
	getStopsByVisitOrder(): Stop[] {
		return [...this.stops]
			.filter(s => s.visitOrder !== undefined)
			.sort((a, b) => (a.visitOrder || 0) - (b.visitOrder || 0));
	}
}