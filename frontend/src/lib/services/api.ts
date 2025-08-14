import type { WaypointDTO } from '$types/api';

const API_BASE_URL = 'https://backend.giva.lol/api/v1'; // Adjust based on your backend URL

class ApiService {
	private baseUrl: string;

	constructor(baseUrl: string = API_BASE_URL) {
		this.baseUrl = baseUrl;
	}

	/**
	 * Fetches all waypoints from the backend
	 */
	async getWaypoints(): Promise<WaypointDTO[]> {
		try {
			const response = await fetch(`${this.baseUrl}/waypoint/list`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data: WaypointDTO[] = await response.json();
			return data || [];
		} catch (error) {
			console.error('Failed to fetch waypoints:', error);
			throw new Error('Failed to fetch waypoints from server');
		}
	}

	/**
	 * Creates a WebSocket connection for real-time waypoint updates
	 */
	createWebSocket(): WebSocket {
		const wsUrl = this.baseUrl.replace('http', 'ws') + '/ws/connect';

		try {
			const ws = new WebSocket(wsUrl);
			return ws;
		} catch (error) {
			console.error('Failed to create WebSocket connection:', error);
			throw new Error('Failed to connect to WebSocket server');
		}
	}
}

export const apiService = new ApiService();
