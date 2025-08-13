import { writable, derived } from 'svelte/store';
import type { WaypointDTO, WebSocketMessage } from '$types/api';
import { apiService } from '$lib/services/api';

interface WebSocketState {
	connected: boolean;
	connecting: boolean;
	error: string | null;
	lastMessage: WebSocketMessage | null;
}

// Create the main WebSocket state store
const createWebSocketStore = () => {
	const { subscribe, set, update } = writable<WebSocketState>({
		connected: false,
		connecting: false,
		error: null,
		lastMessage: null
	});

	let ws: WebSocket | null = null;
	let reconnectAttempts = 0;
	const maxReconnectAttempts = 10;
	const reconnectDelay = 5000; // 3 seconds

	const connect = () => {
		if (ws?.readyState === WebSocket.OPEN) {
			console.log('WebSocket already connected');
			return;
		}

		update(state => ({ ...state, connecting: true, error: null }));

		try {
			ws = apiService.createWebSocket();

			ws.onopen = () => {
				console.log('WebSocket connected');
				reconnectAttempts = 0;
				update(state => ({
					...state,
					connected: true,
					connecting: false,
					error: null
				}));
			};

			ws.onmessage = (event) => {
				try {
					const message: WebSocketMessage = JSON.parse(event.data);
					console.log('WebSocket message received:', message);
					
					update(state => ({
						...state,
						lastMessage: message
					}));
				} catch (error) {
					console.error('Failed to parse WebSocket message:', error);
				}
			};

			ws.onclose = (event) => {
				console.log('WebSocket disconnected:', event.code, event.reason);
				update(state => ({
					...state,
					connected: false,
					connecting: false
				}));

				// Auto-reconnect logic
				if (reconnectAttempts < maxReconnectAttempts && !event.wasClean) {
					reconnectAttempts++;
					console.log(`Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts}) in ${reconnectDelay}ms...`);
					
					setTimeout(() => {
						connect();
					}, reconnectDelay);
				} else if (reconnectAttempts >= maxReconnectAttempts) {
					update(state => ({
						...state,
						error: 'Failed to reconnect to server after multiple attempts'
					}));
				}
			};

			ws.onerror = (error) => {
				console.error('WebSocket error:', error);
				update(state => ({
					...state,
					error: 'WebSocket connection error',
					connecting: false
				}));
			};
		} catch (error) {
			console.error('Failed to create WebSocket:', error);
			update(state => ({
				...state,
				error: 'Failed to create WebSocket connection',
				connecting: false
			}));
		}
	};

	const disconnect = () => {
		if (ws) {
			ws.close(1000, 'Manual disconnect');
			ws = null;
		}
		update(state => ({
			...state,
			connected: false,
			connecting: false,
			error: null
		}));
	};

	const reconnect = () => {
		disconnect();
		reconnectAttempts = 0;
		connect();
	};

	return {
		subscribe,
		connect,
		disconnect,
		reconnect
	};
};

export const websocketStore = createWebSocketStore();

// Derived store for new waypoints
export const newWaypoints = derived(
	websocketStore,
	($ws) => {
		if ($ws.lastMessage?.type === 'waypoint') {
			return $ws.lastMessage.data.waypoints;
		}
		return [];
	}
);