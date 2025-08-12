<script lang="ts">
	import { items } from '$data/gps';
	import type { Waypoint } from '$types/map';
	import { calculateTotalDistance, smoothGpsPointsWeighted } from '$utils/map';
	import type {
		Map,
		Marker,
		Polyline,
		Icon,
		DivIcon,
		LatLngTuple,
		LatLngExpression
	} from 'leaflet';
	import { onDestroy, onMount } from 'svelte';

	export let deviceInfo = {
		id: 'ESP32-Alpha',
		saint: "Sant\'Antonio",
		location: 'Montefalcione',
		status: 'Online',
		lastUpdate: '2 min. fa'
	};

	const mfCenter = [40.9610384, 14.8822149];

	export let gpsData: Waypoint[] = items;

	// Map Variables
	let mapContainer: HTMLDivElement;
	let map: Map;
	let currentPositionMarker: Marker;
	let routePolyline: Polyline;
	let L: typeof import('leaflet');

	// Component state
	let currentPosition: Waypoint | null = null;
	let totalDistance: number = 0;

	onMount(async () => {
		L = await import('leaflet');
		await import('leaflet/dist/leaflet.css');

		map = L.map(mapContainer, {
			center: mfCenter as LatLngTuple,
			zoom: 16,
			zoomControl: false,
			attributionControl: false
		});

		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '© OpenStreetMap contributors'
		}).addTo(map);

		if (gpsData.length > 0) {
			processGpsData();
			updateMap();
		}
	});

	onDestroy((): void => {
		if (map) {
			map.remove();
		}
	});

	function processGpsData() {
		if (gpsData.length === 0) return;

		// Sort data by timestamp
		const sortedData = [...gpsData].sort(
			(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
		);

		// Calculate total distance
		totalDistance = calculateTotalDistance(sortedData);

		// Set current position
		currentPosition = sortedData[sortedData.length - 1];
	}

	function updateMap() {
		if (!map || gpsData.length === 0 || !L) return;

		// Clear existing markers and polylines
		if (currentPositionMarker) {
			map.removeLayer(currentPositionMarker);
		}
		if (routePolyline) {
			map.removeLayer(routePolyline);
		}

		// Sort data by timestamp
		const sortedData = [...gpsData].sort(
			(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
		);

		// Create route polyline
		const routeCoords = smoothGpsPointsWeighted(sortedData).map((point) => [
			point.latitude,
			point.longitude
		]) as LatLngExpression[];

		routePolyline = L.polyline(routeCoords, {
			color: '#3b82f6',
			weight: 4,
			opacity: 0.8
		}).addTo(map);

		// Add current position marker
		if (currentPosition) {
			const currentIcon: DivIcon = L.divIcon({
				className: 'current-position-marker',
				html: `<div class="w-5 h-5 bg-red-500 border-2 border-white rounded-full shadow-lg animate-pulse"></div>`,
				iconSize: [20, 20],
				iconAnchor: [10, 10]
			});

			currentPositionMarker = L.marker([currentPosition.latitude, currentPosition.longitude], {
				icon: currentIcon
			}).addTo(map);
		}

		// Fit map to show all points
		if (routeCoords.length > 0) {
			map.fitBounds(routePolyline.getBounds(), { padding: [20, 20] });
		}
	}
</script>

<div class="flex h-full">
	<!-- Left Panel -->
	<div class="mr-4 flex h-full w-72 flex-col bg-white shadow-lg">
		<!-- Header -->
		<div class="flex-shrink-0 border-b border-gray-200 p-4">
			<div class="mb-4 flex items-center">
				<h1 class="text-xl font-semibold text-gray-900">{deviceInfo.saint}</h1>
			</div>
		</div>

		<!-- Device Information -->
		<div class="flex-shrink-0 border-b border-gray-200 p-4">
			<h2 class="mb-4 text-lg font-semibold text-gray-900">Informazioni</h2>
			<div class="space-y-3">
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium text-gray-600">Luogo:</span>
					<span class="text-sm text-gray-900">{deviceInfo.location}</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium text-gray-600">Stato:</span>
					<span class="flex items-center text-sm font-medium text-green-600">
						<div class="mr-2 h-2 w-2 rounded-full bg-green-500"></div>
						{deviceInfo.status}
					</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium text-gray-600">Ultimo aggiornamento:</span>
					<span class="text-sm text-gray-900">{deviceInfo.lastUpdate}</span>
				</div>
			</div>
		</div>

		<!-- Stops Section -->
		<div class="flex min-h-0 flex-1 flex-col p-4">
			<h2 class="mb-4 flex-shrink-0 text-lg font-semibold text-gray-900">Fermate</h2>
			<div class="flex-1 overflow-y-auto pr-4"></div>
		</div>

		<!-- Trip Statistics -->
		<div class="border-t border-gray-200 p-4">
			<h2 class="mb-4 text-lg font-semibold text-gray-900">Statistiche</h2>
			<div class="space-y-3">
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium text-gray-600">Distanza totale:</span>
					<span class="text-sm text-gray-900">{(totalDistance / 1000).toFixed(1)} km</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium text-gray-600">Velocita' massima:</span>
					<span class="text-sm text-gray-900">
						{Math.max(...gpsData.map(p => p.speed || 0)).toFixed(1)} km/h</span
					>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium text-gray-600">Velocita' media:</span>
					<span class="text-sm text-gray-900">
						{(gpsData.reduce((sum, p) => sum + (p.speed || 0), 0) / gpsData.length).toFixed(1)} km/h</span
					>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium text-gray-600">Durata:</span>
					<span class="text-sm text-gray-900"> 54 minuti </span>
				</div>
			</div>
		</div>
	</div>

	<!-- Map Container -->
	<div class="relative flex-1">
		<div bind:this={mapContainer} class="h-full w-full"></div>

		<!-- Map Controls Overlay -->
		<div class="absolute right-4 top-4 z-10 space-y-2">
			<!-- Additional controls can be added here -->
		</div>
	</div>
</div>
