export interface WaypointDTO {
	id: string;
	latitude: number;
	longitude: number;
	speed: number;
	created_at: string;
	updated_at: string;
}

export interface WebSocketMessage {
	type: 'waypoint';
	data: {
		count: number;
		waypoints: WaypointDTO[];
	};
}

export interface ApiResponse<T> {
	data: T;
	error?: string;
	status: number;
}