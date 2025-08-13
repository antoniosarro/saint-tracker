export interface Stop {
	id: number;
	letter: string;
	route: string;
	startTime: Date | null;
	endTime: Date | null;
	duration: number;
	lat: number;
	lng: number;
	isOngoing: boolean;
	done: boolean;
	skipped: boolean;
	radius?: number;
	visitOrder?: number;
}

export interface StopDetectionConfig {
	defaultRadius: number;
	minStopDuration: number;
	exitRadius: number;
}
