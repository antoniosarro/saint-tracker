<script lang="ts">
	import type { Waypoint } from '$types/map';
	import { calculateDistance, calculateTotalDistance, smoothGpsPointsWeighted } from '$utils/map';
	import { waypointStore, mapWaypoints, waypointStats } from '$lib/stores/waypoints';
	import { websocketStore, newWaypoints } from '$lib/stores/websocket';
	import { stopsStore, sortedStops, stopStats, currentStop, nextStop } from '$lib/stores/stop';
	import type {
		Map as LeafMap,
		Marker,
		Polyline,
		DivIcon,
		LatLngTuple,
		LatLngExpression,
		Circle
	} from 'leaflet';
	import { onDestroy, onMount } from 'svelte';
	import { derived } from 'svelte/store';
	import { browser } from '$app/environment';
	import type { Stop } from '$types/stop';

	export let deviceInfo = {
		id: 'ESP32-Alpha',
		saint: "Sant\'Antonio per le campagne",
		saintSub: 'Giorno 1',
		location: 'Montefalcione',
		status: 'Online',
		lastUpdate: '2 min. fa'
	};

	const mfCenter = [40.9610384, 14.8822149];

	// Map Variables
	let mobileMapContainer: HTMLDivElement;
	let desktopMapContainer: HTMLDivElement;
	let map: LeafMap;
	let currentPositionMarker: Marker;
	let routePolyline: Polyline;
	let stopMarkers: Map<number, Marker> = new Map();
	let stopCircles: Map<number, Circle> = new Map();
	let L: typeof import('leaflet');
	let LRM: any = null;
	let routingControl: any = null;

	// Add a flag to track if routing is loaded
	let routingLoaded = false;

	// Track current container and screen size
	let currentContainer: HTMLDivElement | null = null;
	let isMobile = false;

	// Mobile scroll state
	let showScrollToTop = false;
	let scrollContainer: HTMLDivElement;

	// Data processing
	let lastProcessedIndex = 0;
	let cachedTotalDistance = 0;
	let cachedSortedData: Waypoint[] = [];

	// Reactive variable from stores
	$: gpsData = $mapWaypoints;
	$: stats = $waypointStats;
	$: wsState = $websocketStore;
	$: newWaypointData = $newWaypoints;
	$: stops = $sortedStops;
	$: stopsStats = $stopStats;
	$: currentStopData = $currentStop;
	$: nextStopData = $nextStop;

	// Component state
	let currentPosition: Waypoint | null = null;
	let totalDistance: number = 0;

	const connectionStatus = derived([websocketStore, waypointStore], ([$ws, $waypoints]) => {
		// Initial loading of waypoints
		if ($waypoints.loading) {
			return 'loading';
		}

		// WebSocket states
		if ($ws.connecting) {
			return 'loading';
		} else if ($ws.connected) {
			return 'connected';
		} else if ($ws.error || $waypoints.error) {
			return 'error';
		} else {
			return 'disconnected';
		}
	});

	onMount(async () => {
		// Only run in browser
		if (!browser) return;

		// Load Leaflet
		L = await import('leaflet');
		await import('leaflet/dist/leaflet.css');

		// Load leaflet-routing-machine dynamically
		try {
			// Import the module - it attaches to window.L
			await import('leaflet-routing-machine');
			await import('leaflet-routing-machine/dist/leaflet-routing-machine.css');

			// Need to give it a moment to attach to L
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Check if routing was attached to the global L object
			// leaflet-routing-machine attaches to window.L, not the imported L
			if (browser && window.L && (window.L as any).Routing && (window.L as any).Routing.control) {
				LRM = (window.L as any).Routing;
				routingLoaded = true;
				console.log('Leaflet routing loaded successfully via window.L');
			} else if (L && (L as any).Routing && (L as any).Routing.control) {
				LRM = (L as any).Routing;
				routingLoaded = true;
				console.log('Leaflet routing loaded successfully via imported L');
			} else {
				console.warn('L.Routing not found after import - routing will not be available');
				console.log('window.L:', window.L);
				console.log('imported L:', L);
				console.log(
					'window.L.Routing:',
					window.L ? (window.L as any).Routing : 'window.L not found'
				);
				routingLoaded = false;
			}
		} catch (error) {
			console.warn('Failed to load leaflet-routing-machine:', error);
			routingLoaded = false;
		}

		// Determine initial container based on screen size
		checkScreenSize();

		await new Promise((resolve) => setTimeout(resolve, 0));

		// Initialize map in the appropriate container
		initializeMap();

		// Set up resize listener
		window.addEventListener('resize', handleResize);

		// Load initial waypoints from API
		try {
			await waypointStore.loadWaypoints();
		} catch (error) {
			console.error('Failed to load initial waypoints:', error);
		}

		// Start WebSocket connection
		websocketStore.connect();

		// Setup scroll listener for mobile scroll-to-top button
		if (scrollContainer) {
			scrollContainer.addEventListener('scroll', handleScroll);
		}
	});

	onDestroy(() => {
		if (browser && map) {
			map.remove();
		}
		if (browser) {
			window.removeEventListener('resize', handleResize);
		}
		websocketStore.disconnect();
	});

	function checkScreenSize() {
		const wasMobile = isMobile;
		if (browser) {
			isMobile = window.innerWidth < 768; // md breakpoint
		}

		// Return true if screen size category changed
		return wasMobile !== isMobile;
	}

	function initializeMap() {
		if (!browser) return;

		// Use window.L if available (for routing compatibility), otherwise use imported L
		const leaflet = window.L && window.L.map ? window.L : L;

		if (!leaflet) return;

		const targetContainer = isMobile ? mobileMapContainer : desktopMapContainer;

		if (!targetContainer) return;

		// If map already exists, move it to the new container
		if (map && currentContainer !== targetContainer) {
			moveMapToContainer(targetContainer);
			return;
		}

		// Create new map if it doesn't exist
		if (!map) {
			currentContainer = targetContainer;
			map = leaflet.map(targetContainer, {
				center: mfCenter as LatLngTuple,
				zoom: 16,
				zoomControl: false,
				attributionControl: false
			});

			leaflet
				.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
					attribution: '© OpenStreetMap contributors'
				})
				.addTo(map);
		}
	}

	function moveMapToContainer(newContainer: HTMLDivElement) {
		if (!browser || !map || !newContainer || currentContainer === newContainer) return;

		// Use window.L if available, otherwise use imported L
		const leaflet = window.L && window.L.map ? window.L : L;

		if (!leaflet) return;

		try {
			// Get current map state
			const center = map.getCenter();
			const zoom = map.getZoom();

			// Remove map from current container
			map.remove();

			// Create new map in the new container
			currentContainer = newContainer;
			map = leaflet.map(newContainer, {
				center: [center.lat, center.lng],
				zoom: zoom,
				zoomControl: false,
				attributionControl: false
			});

			leaflet
				.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
					attribution: '© OpenStreetMap contributors'
				})
				.addTo(map);

			// Restore map data
			setTimeout(() => {
				updateMap();
				updateStopMarkers();
				// Force a resize to ensure proper rendering
				map.invalidateSize();
			}, 100);
		} catch (error) {
			console.error('Error moving map to new container:', error);
			// Fallback: reinitialize the map
			if (map) {
				map.remove();
			}
			currentContainer = null;
			initializeMap();
		}
	}

	function handleResize() {
		if (!browser) return;

		const screenSizeChanged = checkScreenSize();

		if (screenSizeChanged && map) {
			// Screen size category changed, move map to appropriate container
			const targetContainer = isMobile ? mobileMapContainer : desktopMapContainer;
			if (targetContainer && currentContainer !== targetContainer) {
				moveMapToContainer(targetContainer);
			}
		} else if (map) {
			// Same screen size category, just invalidate size
			setTimeout(() => {
				map.invalidateSize();
			}, 100);
		}
	}

	// Handle scroll for showing/hiding scroll-to-top button
	function handleScroll() {
		if (scrollContainer) {
			showScrollToTop = scrollContainer.scrollTop > 300;
		}
	}

	// Scroll to top function
	function scrollToTop() {
		if (scrollContainer) {
			scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}

	// React to GPS data changes
	$: if (browser && gpsData.length > 0) {
		processGpsData();
		updateMap();
	}

	// React to stops changes
	$: if (browser && stops.length > 0 && map && L) {
		updateStopMarkers();
	}

	// React to new waypoints from WebSocket
	$: if (newWaypointData.length > 0) {
		waypointStore.addWaypoints(newWaypointData);
	}

	// React to container changes - ensure map is in the right place
	$: if (browser && mobileMapContainer && desktopMapContainer && map) {
		const targetContainer = isMobile ? mobileMapContainer : desktopMapContainer;
		if (currentContainer !== targetContainer) {
			moveMapToContainer(targetContainer);
		}
	}

	function processGpsData() {
		if (gpsData.length === 0) {
			// Reset when no data
			lastProcessedIndex = 0;
			cachedTotalDistance = 0;
			cachedSortedData = [];
			totalDistance = 0;
			currentPosition = null;
			return;
		}

		// Sort data by timestamp
		const sortedData = [...gpsData].sort(
			(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
		);

		// Check if we need to recalculate everything (data changed significantly)
		const needsFullRecalculation =
			cachedSortedData.length === 0 ||
			sortedData.length < cachedSortedData.length ||
			// Check if existing data has changed (different timestamps or positions)
			sortedData
				.slice(0, Math.min(cachedSortedData.length, 10))
				.some(
					(point, index) =>
						index < cachedSortedData.length &&
						(point.created_at !== cachedSortedData[index].created_at ||
							Math.abs(point.latitude - cachedSortedData[index].latitude) > 0.00001 ||
							Math.abs(point.longitude - cachedSortedData[index].longitude) > 0.00001)
				);

		if (needsFullRecalculation) {
			// Full recalculation needed
			console.log('Full GPS data recalculation');
			cachedTotalDistance = calculateTotalDistance(sortedData);
			cachedSortedData = [...sortedData];
			lastProcessedIndex = sortedData.length;

			// Process all waypoints for stops
			sortedData.forEach((waypoint) => {
				stopsStore.processWaypoint(waypoint);
			});
		} else if (sortedData.length > cachedSortedData.length) {
			// Incremental calculation for new points only
			console.log(
				`Incremental GPS processing: ${sortedData.length - cachedSortedData.length} new points`
			);

			const newPoints = sortedData.slice(cachedSortedData.length);

			// Calculate distance for new segments
			let additionalDistance = 0;

			// Distance from last cached point to first new point
			if (cachedSortedData.length > 0 && newPoints.length > 0) {
				const lastCachedPoint = cachedSortedData[cachedSortedData.length - 1];
				const firstNewPoint = newPoints[0];
				additionalDistance += calculateDistance(
					lastCachedPoint.latitude,
					lastCachedPoint.longitude,
					firstNewPoint.latitude,
					firstNewPoint.longitude
				);
			}

			// Distance between new points
			for (let i = 1; i < newPoints.length; i++) {
				additionalDistance += calculateDistance(
					newPoints[i - 1].latitude,
					newPoints[i - 1].longitude,
					newPoints[i].latitude,
					newPoints[i].longitude
				);
			}

			cachedTotalDistance += additionalDistance;
			cachedSortedData = [...sortedData];
			lastProcessedIndex = sortedData.length;

			// Process new waypoints for stops
			newPoints.forEach((waypoint) => {
				stopsStore.processWaypoint(waypoint);
			});
		}

		// Update component state
		totalDistance = cachedTotalDistance;
		currentPosition = sortedData[sortedData.length - 1];
	}

	// Updated updateMap function with routing
	function updateMap() {
		if (!browser || !map || gpsData.length === 0 || !L) return;

		// Clear existing markers and routing
		if (currentPositionMarker) {
			map.removeLayer(currentPositionMarker);
		}
		if (routePolyline) {
			map.removeLayer(routePolyline);
		}
		if (routingControl) {
			map.removeControl(routingControl);
			routingControl = null;
		}

		// Sort data by timestamp
		const sortedData = [...gpsData].sort(
			(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
		);

		if (sortedData.length < 2) {
			// If less than 2 points, just show the position marker
			if (sortedData.length === 1) {
				currentPosition = sortedData[0];
				addCurrentPositionMarker();
			}
			return;
		}

		createRoutingPathWithProxy(sortedData);

		// Add current position marker
		currentPosition = sortedData[sortedData.length - 1];
		addCurrentPositionMarker();
	}

	function addCurrentPositionMarker() {
		if (!browser || !currentPosition || !map) return;

		// Use window.L if available, otherwise use imported L
		const leaflet = window.L && window.L.divIcon ? window.L : L;
		if (!leaflet) return;

		const currentIcon: DivIcon = leaflet.divIcon({
			className: 'current-position-marker',
			html: `<div class="w-5 h-5 z-20 bg-red-500 border-2 border-white rounded-full shadow-lg animate-pulse"></div>`,
			iconSize: [20, 20],
			iconAnchor: [10, 10]
		});

		currentPositionMarker = leaflet
			.marker([currentPosition.latitude, currentPosition.longitude], {
				icon: currentIcon
			})
			.addTo(map);
	}

	async function createRoutingPathWithProxy(sortedData: Waypoint[]) {
		if (!browser || !map || !L) {
			console.log('Prerequisites not met for routing');
			createSimplePolyline(sortedData);
			return;
		}

		// Use window.L if available, otherwise use imported L
		const leaflet = window.L && window.L.latLng ? window.L : L;
		if (!leaflet) {
			console.log('Leaflet not available, falling back to simple polyline');
			createSimplePolyline(sortedData);
			return;
		}

		// Validate and filter waypoints
		const validData = sortedData.filter((point) => {
			const isValid =
				point.latitude !== null &&
				point.latitude !== undefined &&
				point.longitude !== null &&
				point.longitude !== undefined &&
				!isNaN(point.latitude) &&
				!isNaN(point.longitude) &&
				Math.abs(point.latitude) <= 90 &&
				Math.abs(point.longitude) <= 180;

			if (!isValid) {
				console.warn('Invalid waypoint filtered out:', point);
			}
			return isValid;
		});

		if (validData.length < 2) {
			console.log('Not enough valid waypoints for routing');
			if (validData.length > 0) {
				createSimplePolyline(validData);
			}
			return;
		}

		// For routing, use a subset of points to optimize performance
		const maxWaypoints = Math.round(validData.length / 3); // Increased since server handles batching
		let waypointsForRouting: [number, number][] = [];

		if (validData.length <= maxWaypoints) {
			waypointsForRouting = validData.map((point) => [point.latitude, point.longitude]);
		} else {
			// Always include first point
			waypointsForRouting.push([validData[0].latitude, validData[0].longitude]);

			// Add intermediate points
			const step = Math.floor((validData.length - 1) / (maxWaypoints - 2));
			for (let i = step; i < validData.length - 1; i += step) {
				if (waypointsForRouting.length < maxWaypoints - 1) {
					waypointsForRouting.push([validData[i].latitude, validData[i].longitude]);
				}
			}

			// Always include last point
			const lastPoint = validData[validData.length - 1];
			waypointsForRouting.push([lastPoint.latitude, lastPoint.longitude]);

			console.log(
				`Using ${waypointsForRouting.length} waypoints for routing out of ${validData.length} total points`
			);
		}

		try {
			// Call our caching proxy instead of OSRM directly
			const response = await fetch('/api/routing', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					waypoints: waypointsForRouting
				})
			});

			if (!response.ok) {
				throw new Error(`Proxy API error: ${response.status}`);
			}

			const data = await response.json();

			if (!data.success || !data.route) {
				throw new Error('Invalid response from routing proxy');
			}

			// Create polyline from the route geometry
			const route = data.route;
			if (route.routes && route.routes[0] && route.routes[0].geometry) {
				const geometry = route.routes[0].geometry;

				// Convert coordinates from [lng, lat] to [lat, lng] for Leaflet
				const routeCoords = geometry.coordinates.map((coord: [number, number]) => [
					coord[1],
					coord[0]
				]);

				routePolyline = leaflet
					.polyline(routeCoords, {
						color: '#3b82f6',
						weight: 4,
						opacity: 0.8
					})
					.addTo(map);

				try {
					const bounds = routePolyline.getBounds();
					if (bounds.isValid()) {
						map.fitBounds(bounds, { padding: [20, 20] });
					}
				} catch (error) {
					console.warn('Error fitting bounds:', error);
				}

				console.log('Route created successfully from proxy cache');
			} else {
				throw new Error('Invalid route geometry in response');
			}
		} catch (error) {
			console.warn('Failed to get route from proxy, falling back to simple polyline:', error);
			createSimplePolyline(validData);
		}
	}
	function createSimplePolyline(sortedData: Waypoint[]) {
		// Use window.L if available, otherwise use imported L
		const leaflet = window.L && window.L.polyline ? window.L : L;
		if (!leaflet) return;

		// Validate waypoints before creating polyline
		const validData = sortedData.filter((point) => {
			return (
				point.latitude !== null &&
				point.latitude !== undefined &&
				point.longitude !== null &&
				point.longitude !== undefined &&
				!isNaN(point.latitude) &&
				!isNaN(point.longitude) &&
				Math.abs(point.latitude) <= 90 &&
				Math.abs(point.longitude) <= 180
			);
		});

		if (validData.length < 2) {
			console.warn('Not enough valid points for polyline');
			return;
		}

		const routeCoords = smoothGpsPointsWeighted(validData).map((point) => [
			point.latitude,
			point.longitude
		]) as LatLngExpression[];

		routePolyline = leaflet
			.polyline(routeCoords, {
				color: '#3b82f6',
				weight: 4,
				opacity: 0.8
			})
			.addTo(map);

		try {
			const bounds = routePolyline.getBounds();
			if (bounds.isValid()) {
				map.fitBounds(bounds, { padding: [20, 20] });
			}
		} catch (error) {
			console.warn('Error fitting bounds for polyline:', error);
		}
	}

	function updateStopMarkers() {
		if (!map || !L || stops.length === 0) return;

		// Clear existing stop markers and circles
		stopMarkers.forEach((marker) => map.removeLayer(marker));
		stopCircles.forEach((circle) => map.removeLayer(circle));
		stopMarkers.clear();
		stopCircles.clear();

		// Add stop markers and detection circles
		stops.forEach((stop) => {
			// Determine marker color based on stop status
			let markerColor, borderColor;

			if (stop.done) {
				markerColor = '#10b981'; // green
				borderColor = '#059669';
			} else if (stop.skipped) {
				markerColor = '#f97316'; // orange
				borderColor = '#ea580c';
			} else if (stop.startTime && !stop.endTime) {
				markerColor = '#f59e0b'; // yellow
				borderColor = '#d97706';
			} else if (stop.isOngoing) {
				markerColor = '#3b82f6'; // blue
				borderColor = '#2563eb';
			} else {
				markerColor = '#6b7280'; // gray
				borderColor = '#4b5563';
			}

			const stopIcon: DivIcon = L.divIcon({
				className: 'stop-marker',
				html: `<div class="flex items-center justify-center w-8 h-8 rounded-full border-2 text-white font-bold text-sm" 
					style="background-color: ${markerColor}; border-color: ${borderColor}">
					${stop.letter}
				</div>`,
				iconSize: [32, 32],
				iconAnchor: [16, 16]
			});

			const marker = L.marker([stop.lat, stop.lng], { icon: stopIcon })
				.bindPopup(
					`
					<div class="text-sm">
						<div class="font-bold">${stop.route}</div>
						<br/>
						<div class="text-gray-600">
							${
								stop.done
									? `
										<div class="font-semibold text-green-700">Completata</div>
										<div>Durata: ${formatDuration(stop.duration)}</div>
										<div>${formatTime(stop.startTime)} - ${formatTime(stop.endTime)}</div>
									`
									: stop.skipped
										? `
											<div class="font-semibold text-orange-700">Saltata</div>
										`
										: stop.startTime
											? `In corso...`
											: stop.isOngoing
												? `Prossima fermata`
												: 'In attesa'
							}
						</div>
					</div>
				`
				)
				.addTo(map);

			stopMarkers.set(stop.id, marker);

			// Add detection circle (only show for current/next stop)
			if (stop.isOngoing || (stop.startTime && !stop.endTime)) {
				const circle = L.circle([stop.lat, stop.lng], {
					radius: stop.radius || 50,
					color: stop.startTime ? '#f59e0b' : '#3b82f6',
					fillColor: stop.startTime ? '#fbbf24' : '#60a5fa',
					fillOpacity: 0.1,
					weight: 2,
					opacity: 0.5
				}).addTo(map);

				stopCircles.set(stop.id, circle);
			}
		});
	}

	function handleReconnect() {
		websocketStore.reconnect();
	}

	function handleRefresh() {
		waypointStore.loadWaypoints();
	}

	const connectionStatusText = derived(connectionStatus, ($status) => {
		switch ($status) {
			case 'loading':
				return 'Caricamento...';
			case 'connected':
				return 'Online';
			case 'disconnected':
				return 'Disconnesso';
			case 'error':
				return 'Errore';
			default:
				return 'Sconosciuto';
		}
	});

	const connectionStatusColor = derived(connectionStatus, ($status) => {
		switch ($status) {
			case 'loading':
				return 'text-yellow-600';
			case 'connected':
				return 'text-green-600';
			case 'disconnected':
				return 'text-gray-600';
			case 'error':
				return 'text-red-600';
			default:
				return 'text-gray-600';
		}
	});

	const lastUpdate = derived(waypointStats, ($waypointStats) => {
		if ($waypointStats.currentPosition) {
			const lastUpdate = new Date($waypointStats.currentPosition.created_at);
			const now = new Date();
			const diffMinutes = Math.floor((now.getTime() - lastUpdate.getTime()) / 60000);

			if (diffMinutes < 1) return 'Ora';
			if (diffMinutes === 1) return '1 min. fa';
			return `${diffMinutes} min. fa`;
		}
		return 'N/A';
	});

	function formatDuration(seconds: number): string {
		if (seconds < 60) return `${seconds}s`;
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes}m ${remainingSeconds}s`;
	}

	function formatTime(date: Date | null): string {
		if (!date) return 'N/A';
		return date.toLocaleTimeString('it-IT', {
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function handleStopClick(stop: Stop): void {
		if (map && L) {
			map.setView([stop.lat, stop.lng], 20);
			const marker = stopMarkers.get(stop.id);
			if (marker) {
				marker.openPopup();
			}

			// On mobile, scroll to map container to show the result
			if (isMobile && currentContainer && scrollContainer) {
				// Small delay to ensure map has updated
				setTimeout(() => {
					const mapRect = currentContainer!.getBoundingClientRect();
					const scrollTop = scrollContainer.scrollTop;
					const containerTop = scrollContainer.getBoundingClientRect().top;

					// Calculate the position of map container relative to scroll container
					const targetScrollTop = scrollTop + mapRect.top - containerTop - 20; // 20px offset for better visibility

					scrollContainer.scrollTo({
						top: targetScrollTop,
						behavior: 'smooth'
					});
				}, 100);
			}
		}
	}
</script>

<svelte:head>
	<title>Saint Tracker</title>
</svelte:head>

<!-- Mobile/Desktop Responsive Container -->
<div bind:this={scrollContainer} class="h-full overflow-y-auto md:overflow-hidden">
	<div class="flex flex-col md:h-full md:flex-row">
		<!-- Left Panel - Mobile: Stacked layout, Desktop: Left column -->
		<div class="w-full flex-shrink-0 bg-gray-50 p-4 md:mr-4 md:flex md:h-full md:w-80 md:flex-col">
			<!-- Header Card -->
			<div class="mb-4 rounded-xl bg-white p-4 shadow-sm">
				<h1 class="text-lg font-semibold text-gray-900">{deviceInfo.saint}</h1>
				<h2 class="text-base text-gray-900">{deviceInfo.saintSub}</h2>
			</div>

			<!-- Device Information Card -->
			<div class="mb-4 rounded-xl bg-white p-4 shadow-sm">
				<h2 class="mb-3 text-lg font-semibold text-gray-900">Informazioni</h2>
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<span class="text-sm font-medium text-gray-600">Luogo:</span>
						<span class="text-sm text-gray-900">{deviceInfo.location}</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-sm font-medium text-gray-600">Stato:</span>
						<span class="flex items-center text-sm font-medium {$connectionStatusColor}">
							<div class="mr-2 h-2 w-2 rounded-full bg-current"></div>
							{$connectionStatusText}
						</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-sm font-medium text-gray-600">Ultimo aggiornamento:</span>
						<span class="text-sm text-gray-900">{$lastUpdate}</span>
					</div>
				</div>
			</div>

			<!-- Connection Controls Card -->
			{#if $connectionStatus === 'error' || $connectionStatus === 'disconnected'}
				<div class="mb-4 rounded-xl bg-white p-4 shadow-sm">
					<div class="space-y-2">
						<button
							class="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
							on:click={handleReconnect}
						>
							Riconnetti
						</button>
						<button
							class="w-full rounded-lg bg-gray-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
							on:click={handleRefresh}
						>
							Aggiorna Dati
						</button>
					</div>
				</div>
			{/if}

			<!-- Error Display Card -->
			{#if $waypointStore.error || wsState.error}
				<div class="mb-4 rounded-xl bg-white p-4 shadow-sm">
					<div class="rounded-lg bg-red-50 p-3">
						<div class="text-sm font-medium text-red-800">Errore:</div>
						<div class="mt-1 text-xs text-red-600">
							{$waypointStore.error || wsState.error}
						</div>
					</div>
				</div>
			{/if}

			<!-- Mobile Map Card - Only visible on mobile, positioned after Informazioni -->
			<div class="mb-4 block rounded-xl bg-white p-4 shadow-sm md:hidden">
				<div class="relative min-h-[400px]">
					<div
						bind:this={mobileMapContainer}
						class="z-9 h-[400px] w-full overflow-hidden rounded-lg"
					></div>

					<!-- Map Controls Overlay -->
					<div class="absolute right-2 top-2 z-10 space-y-2">
						<!-- WebSocket Status Indicator -->
						<div class="rounded-lg bg-white px-3 py-2 shadow-lg">
							<div class="flex items-center space-x-2">
								<div
									class="h-2 w-2 rounded-full {$connectionStatus === 'connected'
										? 'bg-green-500'
										: $connectionStatus === 'loading'
											? 'bg-yellow-500'
											: 'bg-red-500'}"
								></div>
								<span class="text-xs font-medium text-gray-700">
									{$connectionStatus === 'connected'
										? 'Live'
										: $connectionStatus === 'loading'
											? 'Caricamento'
											: 'Offline'}
								</span>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Stops Progress Card -->
			<div class="mb-4 rounded-xl bg-white p-4 shadow-sm md:mb-4">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-lg font-semibold text-gray-900">Progresso</h2>
				</div>

				<div class="space-y-3">
					<!-- Progress Bar -->
					<div class="h-2 w-full rounded-full bg-gray-200">
						<div
							class="h-2 rounded-full bg-green-600 transition-all duration-300"
							style="width: {stopsStats.progress}%"
						></div>
					</div>

					<div class="flex justify-between text-sm">
						<span class="text-gray-600">{stopsStats.completed}/{stopsStats.total} fermate</span>
						<span class="text-gray-600">{Math.round(stopsStats.progress)}%</span>
					</div>

					<!-- Skip/Visit Progress -->
					{#if stopsStats.skipped > 0}
						<div class="h-1 w-full rounded-full bg-gray-200">
							<div
								class="h-1 rounded-full bg-orange-400 transition-all duration-300"
								style="width: {stopsStats.visitedProgress}%"
							></div>
						</div>
						<div class="flex justify-between text-xs text-gray-500">
							<span
								>{stopsStats.completed + stopsStats.skipped}/{stopsStats.total} visitate/saltate</span
							>
							<span>{stopsStats.skipped} saltate</span>
						</div>
					{/if}

					<!-- Current Stop Info -->
					{#if currentStopData}
						<div
							class="rounded-lg border border-yellow-200 bg-yellow-50 p-3"
							on:click={() => handleStopClick(currentStopData)}
							on:keydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									handleStopClick(currentStopData);
								}
							}}
							role="button"
							tabindex="0"
						>
							<div class="text-sm font-medium text-yellow-800">
								Fermata {currentStopData.letter} in corso
							</div>
							<div class="mt-1 text-xs text-yellow-600">
								{currentStopData.route} • Iniziata: {formatTime(currentStopData.startTime)}
							</div>
						</div>
					{:else if nextStopData}
						<div
							on:click={() => handleStopClick(nextStopData)}
							on:keydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									handleStopClick(nextStopData);
								}
							}}
							role="button"
							tabindex="0"
							class="rounded-lg border p-3 shadow-sm {nextStopData.done
								? 'border-green-200 bg-green-50'
								: nextStopData.skipped
									? 'border-orange-200 bg-orange-50'
									: nextStopData.startTime
										? 'border-yellow-200 bg-yellow-50'
										: nextStopData.isOngoing
											? 'border-blue-200 bg-blue-50'
											: 'border-gray-200 bg-white'}"
						>
							<div class="mb-2 flex items-center justify-between">
								<div class="flex items-center space-x-2">
									<span class="text-sm font-medium text-gray-900">
										{nextStopData.route}
									</span>
								</div>
								<span
									class="flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-white {nextStopData.done
										? 'bg-green-500'
										: nextStopData.skipped
											? 'bg-orange-500'
											: nextStopData.startTime
												? 'bg-yellow-500'
												: nextStopData.isOngoing
													? 'bg-blue-500'
													: 'bg-gray-400'}"
								>
									{nextStopData.letter}
								</span>
							</div>
							<div class="space-y-1 text-xs">
								{#if nextStopData.done}
									<div class="text-green-700">
										<div class="font-semibold">Completata</div>
										<div>Durata: {formatDuration(nextStopData.duration)}</div>
										<div>
											{formatTime(nextStopData.startTime)} - {formatTime(nextStopData.endTime)}
										</div>
									</div>
								{:else if nextStopData.skipped}
									<div class="text-orange-700">
										<div class="font-semibold">Saltata</div>
									</div>
								{:else if nextStopData.startTime}
									<div class="text-yellow-700">
										<div>In corso...</div>
										<div>Iniziata: {formatTime(nextStopData.startTime)}</div>
									</div>
								{:else if nextStopData.isOngoing}
									<div class="text-blue-700">
										<div>Prossima fermata</div>
									</div>
								{:else}
									<div class="text-gray-600">
										<div>In attesa</div>
									</div>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Mobile Stops Section - Only visible on mobile -->
			<div class="my-4 flex min-h-0 flex-1 flex-col rounded-xl bg-white p-4 shadow-sm md:hidden">
				<h2 class="mb-4 flex-shrink-0 text-lg font-semibold text-gray-900">Fermate</h2>
				<div class="max-h-80 flex-1 overflow-y-auto pr-2">
					{#if stops.length === 0}
						<div class="text-sm text-gray-500">Nessuna fermata configurata</div>
					{:else}
						<div class="space-y-3">
							{#each stops as stop (stop.id)}
								<div
									class="rounded-lg border p-3 shadow-sm transition-all duration-200 {stop.done
										? 'border-green-200 bg-green-50'
										: stop.skipped
											? 'border-orange-200 bg-orange-50'
											: stop.startTime
												? 'border-yellow-200 bg-yellow-50'
												: stop.isOngoing
													? 'border-blue-200 bg-blue-50'
													: 'border-gray-200 bg-white'}"
								>
									<!-- Stop Header -->
									<div class="mb-2 flex items-center justify-between">
										<div
											class="flex flex-1 cursor-pointer items-center space-x-2"
											on:click={() => handleStopClick(stop)}
											on:keydown={(e) => {
												if (e.key === 'Enter' || e.key === ' ') {
													handleStopClick(stop);
												}
											}}
											role="button"
											tabindex="0"
										>
											<span class="text-sm font-medium text-gray-900">
												{stop.route}
											</span>
										</div>
										<div class="flex items-center space-x-2">
											<!-- Stop letter badge -->
											<span
												class="flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm {stop.done
													? 'bg-green-500'
													: stop.skipped
														? 'bg-orange-500'
														: stop.startTime
															? 'bg-yellow-500'
															: stop.isOngoing
																? 'bg-blue-500'
																: 'bg-gray-400'}"
											>
												{stop.letter}
											</span>
										</div>
									</div>

									<!-- Stop Details -->
									<div class="space-y-1 text-xs">
										{#if stop.done}
											<div class="text-green-700">
												<div class="font-semibold">Completata</div>
												<div>Durata: {formatDuration(stop.duration)}</div>
												<div>{formatTime(stop.startTime)} - {formatTime(stop.endTime)}</div>
											</div>
										{:else if stop.skipped}
											<div class="text-orange-700">
												<div class="font-semibold">Saltata</div>
											</div>
										{:else if stop.startTime}
											<div class="text-yellow-700">
												<div class="font-semibold">In corso...</div>
												<div>Iniziata: {formatTime(stop.startTime)}</div>
											</div>
										{:else if stop.isOngoing}
											<div class="text-blue-700">
												<div class="font-semibold">Prossima fermata</div>
											</div>
										{:else}
											<div class="text-gray-600">
												<div>In attesa</div>
											</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- Mobile Trip Statistics Card - Moved to last position on mobile -->
			<div class="mb-4 rounded-xl bg-white p-4 shadow-sm md:mt-auto">
				<h2 class="mb-4 text-lg font-semibold text-gray-900">Statistiche</h2>
				<div class="flex flex-col gap-4">
					<div class="flex items-center justify-between">
						<span class="text-sm font-medium text-gray-600">Distanza totale:</span>
						<span class="text-sm text-gray-900">{(totalDistance / 1000).toFixed(1)} km</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-sm font-medium text-gray-600">Velocità massima:</span>
						<span class="text-sm text-gray-900">{stats.maxSpeed.toFixed(1)} km/h</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-sm font-medium text-gray-600">Velocità media:</span>
						<span class="text-sm text-gray-900">{stats.avgSpeed.toFixed(1)} km/h</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-sm font-medium text-gray-600">Durata:</span>
						<span class="text-sm text-gray-900">{stats.duration} minuti</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Desktop Map Container Card - Center column on desktop, hidden on mobile -->
		<div class="relative hidden min-h-[500px] flex-1 md:mr-4 md:block md:h-[70vh]">
			<div class="h-full rounded-xl bg-white shadow-sm">
				<div
					bind:this={desktopMapContainer}
					class="z-9 h-full min-h-[450px] w-full overflow-hidden rounded-lg md:min-h-[calc(100vh-8rem)]"
				></div>
			</div>

			<!-- Map Controls Overlay -->
			<div class="absolute right-2 top-2 z-10 space-y-2 md:right-4 md:top-4">
				<!-- WebSocket Status Indicator -->
				<div class="rounded-lg bg-white px-3 py-2 shadow-lg">
					<div class="flex items-center space-x-2">
						<div
							class="h-2 w-2 rounded-full {$connectionStatus === 'connected'
								? 'bg-green-500'
								: $connectionStatus === 'loading'
									? 'bg-yellow-500'
									: 'bg-red-500'}"
						></div>
						<span class="text-xs font-medium text-gray-700">
							{$connectionStatus === 'connected'
								? 'Live'
								: $connectionStatus === 'loading'
									? 'Caricamento'
									: 'Offline'}
						</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Desktop Stops Section - Right column, only visible on desktop -->
		<div class="hidden w-80 flex-shrink-0 bg-gray-50 p-4 md:flex md:h-[70vh] md:flex-col">
			<div class="flex min-h-0 flex-1 flex-col rounded-xl bg-white p-4 shadow-sm">
				<h2 class="mb-4 flex-shrink-0 text-lg font-semibold text-gray-900">Fermate</h2>
				<div class="flex-1 overflow-y-auto pr-2">
					{#if stops.length === 0}
						<div class="text-sm text-gray-500">Nessuna fermata configurata</div>
					{:else}
						<div class="space-y-3">
							{#each stops as stop (stop.id)}
								<div
									class="rounded-lg border p-3 shadow-sm transition-all duration-200 hover:shadow-md {stop.done
										? 'border-green-200 bg-green-50'
										: stop.skipped
											? 'border-orange-200 bg-orange-50'
											: stop.startTime
												? 'border-yellow-200 bg-yellow-50'
												: stop.isOngoing
													? 'border-blue-200 bg-blue-50'
													: 'border-gray-200 bg-white'}"
								>
									<!-- Stop Header -->
									<div class="mb-2 flex items-center justify-between">
										<div
											class="flex flex-1 cursor-pointer items-center space-x-2"
											on:click={() => handleStopClick(stop)}
											on:keydown={(e) => {
												if (e.key === 'Enter' || e.key === ' ') {
													handleStopClick(stop);
												}
											}}
											role="button"
											tabindex="0"
										>
											<span class="text-sm font-medium text-gray-900">
												{stop.route}
											</span>
										</div>
										<div class="flex items-center space-x-2">
											<!-- Stop letter badge -->
											<span
												class="flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm {stop.done
													? 'bg-green-500'
													: stop.skipped
														? 'bg-orange-500'
														: stop.startTime
															? 'bg-yellow-500'
															: stop.isOngoing
																? 'bg-blue-500'
																: 'bg-gray-400'}"
											>
												{stop.letter}
											</span>
										</div>
									</div>

									<!-- Stop Details -->
									<div class="space-y-1 text-xs">
										{#if stop.done}
											<div class="text-green-700">
												<div class="font-semibold">Completata</div>
												<div>Durata: {formatDuration(stop.duration)}</div>
												<div>{formatTime(stop.startTime)} - {formatTime(stop.endTime)}</div>
											</div>
										{:else if stop.skipped}
											<div class="text-orange-700">
												<div class="font-semibold">Saltata</div>
											</div>
										{:else if stop.startTime}
											<div class="text-yellow-700">
												<div class="font-semibold">In corso...</div>
												<div>Iniziata: {formatTime(stop.startTime)}</div>
											</div>
										{:else if stop.isOngoing}
											<div class="text-blue-700">
												<div class="font-semibold">Prossima fermata</div>
											</div>
										{:else}
											<div class="text-gray-600">
												<div>In attesa</div>
											</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- Scroll to Top Button - Mobile Only -->
	{#if showScrollToTop}
		<button
			on:click={scrollToTop}
			class="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-colors hover:bg-blue-700 md:hidden"
			aria-label="Scroll to top"
		>
			<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M5 10l7-7m0 0l7 7m-7-7v18"
				/>
			</svg>
		</button>
	{/if}
</div>
