<script lang="ts">
	import type { Waypoint } from '$types/map';
	import type { Stop } from '$types/stop';
	import type {
		Map as LeafMap,
		Marker,
		Polyline,
		Circle,
		DivIcon,
		LatLngTuple,
		LatLngExpression
	} from 'leaflet';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { calculateDistance, smoothGpsPointsWeighted } from '$utils/map';

	export let waypoints: Waypoint[] = [];
	export let stops: Stop[] = [];
	export let currentPosition: Waypoint | null = null;

	let mapContainer: HTMLDivElement;
	let map: LeafMap;
	let L: typeof import('leaflet');
	let currentPositionMarker: Marker;
	let routePolyline: Polyline;
	let stopMarkers: Map<number, Marker> = new Map();
	let stopCircles: Map<number, Circle> = new Map();

	// Route streaming variables
	let routeSegments: Map<number, any> = new Map();
	let combinedRouteCoordinates: [number, number][] = [];
	let routingProgress = { current: 0, total: 0 };

	// Track processed data to prevent infinite loops
	let lastProcessedWaypointsLength = 0;
	let lastProcessedStopsLength = 0;
	let lastProcessedStopsState = '';
	let isUpdating = false; // Prevent concurrent updates

	// User interaction tracking
	let userHasInteracted = false;
	let isFirstLoad = true;
	let mapInitialized = false;

	const mfCenter = [40.9610384, 14.8822149];

	onMount(async () => {
		if (!browser) return;

		// Load Leaflet
		L = await import('leaflet');
		await import('leaflet/dist/leaflet.css');

		// Wait a bit for the container to be properly sized
		setTimeout(() => {
			initializeMap();
		}, 1000);
	});

	onDestroy(() => {
		if (browser && map) {
			map.remove();
		}
	});

	function initializeMap() {
		if (!browser || !L || !mapContainer) return;

		map = L.map(mapContainer, {
			center: mfCenter as LatLngTuple,
			zoom: 16,
			zoomControl: false,
			attributionControl: false
		});

		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '© OpenStreetMap contributors'
		}).addTo(map);

		// Track user interactions
		map.on('dragstart', () => {
			userHasInteracted = true;
		});

		map.on('zoomstart', () => {
			userHasInteracted = true;
		});

		mapInitialized = true;
		console.log('Map initialized successfully');
	}

	function centerMapOnCurrentPosition() {
		console.log('centerMapOnCurrentPosition called');
		if (!browser || !map || !currentPosition) {
			console.log('centerMapOnCurrentPosition: Prerequisites not met');
			return;
		}

		// Only auto-center if user hasn't interacted or it's the first load
		if (userHasInteracted && !isFirstLoad) {
			console.log('centerMapOnCurrentPosition: User has interacted, skipping auto-center');
			return;
		}

		try {
			console.log(
				'centerMapOnCurrentPosition: Setting view to',
				currentPosition.latitude,
				currentPosition.longitude
			);
			map.setView([currentPosition.latitude, currentPosition.longitude], 18, {
				animate: true,
				duration: 1
			});
			isFirstLoad = false;
			console.log('centerMapOnCurrentPosition: Completed');
		} catch (error) {
			console.warn('Error centering map on current position:', error);
		}
	}

	function addCurrentPositionMarker() {
		console.log('addCurrentPositionMarker called');
		if (!browser || !currentPosition || !map || !L) {
			console.log('addCurrentPositionMarker: Prerequisites not met');
			return;
		}

		try {
			// Remove existing marker
			if (currentPositionMarker) {
				console.log('addCurrentPositionMarker: Removing existing marker');
				map.removeLayer(currentPositionMarker);
			}

			console.log('addCurrentPositionMarker: Creating icon');
			const currentIcon: DivIcon = L.divIcon({
				className: 'current-position-marker',
				html: `<div class="w-5 h-5 z-20 bg-red-500 border-2 border-white rounded-full shadow-lg animate-pulse"></div>`,
				iconSize: [20, 20],
				iconAnchor: [10, 10]
			});

			console.log('addCurrentPositionMarker: Adding marker to map');
			currentPositionMarker = L.marker([currentPosition.latitude, currentPosition.longitude], {
				icon: currentIcon
			}).addTo(map);

			console.log('addCurrentPositionMarker: Completed');
		} catch (error) {
			console.error('Error in addCurrentPositionMarker:', error);
		}
	}

	function updateRoutePolyline() {
		if (!map || !L || combinedRouteCoordinates.length < 2) return;

		// Remove existing route polyline
		if (routePolyline) {
			map.removeLayer(routePolyline);
		}

		// Create new polyline with all combined coordinates
		routePolyline = L.polyline(combinedRouteCoordinates, {
			color: '#3b82f6',
			weight: 4,
			opacity: 0.8
		}).addTo(map);
	}

	function createSimplePolyline(sortedData: Waypoint[]) {
		console.log('createSimplePolyline called with', sortedData.length, 'waypoints');

		if (!L) {
			console.log('createSimplePolyline: Leaflet not available');
			return;
		}

		try {
			console.log('createSimplePolyline: Validating waypoints...');
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

			console.log('createSimplePolyline: Valid data length:', validData.length);

			if (validData.length < 2) {
				console.warn('createSimplePolyline: Not enough valid points for polyline');
				return;
			}

			console.log('createSimplePolyline: Creating route coordinates...');
			// Don't use smoothing for now to debug - it might be causing the freeze
			const routeCoords = validData.map((point) => [
				point.latitude,
				point.longitude
			]) as LatLngExpression[];

			console.log('createSimplePolyline: Route coords length:', routeCoords.length);

			// Remove existing polyline
			if (routePolyline) {
				console.log('createSimplePolyline: Removing existing polyline');
				map.removeLayer(routePolyline);
			}

			console.log('createSimplePolyline: Creating new polyline...');
			routePolyline = L.polyline(routeCoords, {
				color: '#3b82f6',
				weight: 4,
				opacity: 0.8
			}).addTo(map);

			// Update combined coordinates for consistency
			combinedRouteCoordinates = routeCoords as [number, number][];

			console.log('createSimplePolyline: Completed successfully');
		} catch (error) {
			console.error('Error in createSimplePolyline:', error);
		}
	}

	function updateStopMarkers() {
		console.log('MapContainer.updateStopMarkers called with', stops.length, 'stops');

		if (!map || !L || stops.length === 0) {
			console.log('updateStopMarkers: Prerequisites not met');
			return;
		}

		try {
			// Clear existing stop markers and circles
			stopMarkers.forEach((marker) => map.removeLayer(marker));
			stopCircles.forEach((circle) => map.removeLayer(circle));
			stopMarkers.clear();
			stopCircles.clear();

			// Add stop markers and detection circles
			stops.forEach((stop) => {
				try {
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
						.bindPopup(createStopPopupContent(stop))
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
				} catch (stopError) {
					console.error('Error processing stop', stop.id, ':', stopError);
				}
			});

			console.log('updateStopMarkers: Completed successfully');
		} catch (error) {
			console.error('Error in updateStopMarkers:', error);
		}
	}

	function createStopPopupContent(stop: Stop): string {
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

		return `
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
		`;
	}

	async function createRoutingPathWithProxy(sortedData: Waypoint[]) {
		console.log('createRoutingPathWithProxy called with', sortedData.length, 'waypoints');

		if (!browser || !map || !L) {
			console.log(
				'createRoutingPathWithProxy: Prerequisites not met, falling back to simple polyline'
			);
			createSimplePolyline(sortedData);
			return;
		}

		try {
			console.log('createRoutingPathWithProxy: Validating and filtering waypoints...');
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

			console.log('createRoutingPathWithProxy: Valid data length:', validData.length);

			if (validData.length < 2) {
				console.log(
					'createRoutingPathWithProxy: Not enough valid waypoints, using simple polyline'
				);
				if (validData.length > 0) {
					createSimplePolyline(validData);
				}
				return;
			}

			console.log('createRoutingPathWithProxy: Clearing existing routing...');
			// Clear existing routing elements
			clearRouting();

			console.log('createRoutingPathWithProxy: Preparing waypoints for routing...');
			// FIXED: Better waypoint sampling logic to prevent infinite loops
			const maxWaypoints = Math.max(2, Math.min(Math.round(validData.length / 3), 25)); // At least 2, max 25
			let waypointsForRouting: [number, number][] = [];

			if (validData.length <= maxWaypoints) {
				// Use all waypoints if we have few enough
				waypointsForRouting = validData.map((point) => [point.latitude, point.longitude]);
			} else {
				// Always include first point
				waypointsForRouting.push([validData[0].latitude, validData[0].longitude]);

				// Calculate step size safely
				const remainingSlots = maxWaypoints - 2; // Subtract first and last
				const step = Math.max(1, Math.floor((validData.length - 1) / (remainingSlots + 1)));

				console.log(
					`createRoutingPathWithProxy: Using step size ${step} for ${remainingSlots} intermediate points`
				);

				// Add intermediate points with safe step calculation
				for (
					let i = step;
					i < validData.length - 1 && waypointsForRouting.length < maxWaypoints - 1;
					i += step
				) {
					waypointsForRouting.push([validData[i].latitude, validData[i].longitude]);
				}

				// Always include last point
				const lastPoint = validData[validData.length - 1];
				waypointsForRouting.push([lastPoint.latitude, lastPoint.longitude]);
			}

			console.log(
				`createRoutingPathWithProxy: Using ${waypointsForRouting.length} waypoints for routing out of ${validData.length} total points`
			);

			// Try streaming first
			console.log('createRoutingPathWithProxy: Starting streaming route...');
			await createStreamingRoute(waypointsForRouting);
			console.log('createRoutingPathWithProxy: Streaming route completed');
		} catch (error) {
			console.warn(
				'createRoutingPathWithProxy: Streaming failed, falling back to simple polyline:',
				error
			);
			createSimplePolyline(sortedData);
		}
	}

	async function createStreamingRoute(waypoints: [number, number][]) {
		console.log('createStreamingRoute called with', waypoints.length, 'waypoints');
		let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

		try {
			console.log('createStreamingRoute: Making fetch request to /api/routing...');
			const response = await fetch('/api/routing', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					waypoints,
					stream: true // Enable streaming
				})
			});

			console.log('createStreamingRoute: Response received, status:', response.status);

			if (!response.ok) {
				throw new Error(`Streaming API error: ${response.status}`);
			}

			if (!response.body) {
				throw new Error('Response body not readable');
			}

			console.log('createStreamingRoute: Setting up stream reader...');
			reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			try {
				console.log('createStreamingRoute: Starting to read stream...');
				while (true) {
					const { done, value } = await reader.read();

					if (done) {
						console.log('createStreamingRoute: Stream reading completed');
						break;
					}

					// Decode the chunk and add to buffer
					buffer += decoder.decode(value, { stream: true });

					// Process complete lines
					const lines = buffer.split('\n');
					// Keep the last (potentially incomplete) line in buffer
					buffer = lines.pop() || '';

					for (const line of lines) {
						if (line.trim()) {
							try {
								const data = JSON.parse(line);
								await handleStreamingData(data);
							} catch (parseError) {
								console.warn('Failed to parse streaming data:', parseError, line);
							}
						}
					}
				}

				// Process any remaining data in buffer
				if (buffer.trim()) {
					try {
						const data = JSON.parse(buffer);
						await handleStreamingData(data);
					} catch (parseError) {
						console.warn('Failed to parse final streaming data:', parseError, buffer);
					}
				}
			} finally {
				if (reader) {
					try {
						reader.releaseLock();
					} catch (error) {
						console.warn('Error releasing reader lock:', error);
					}
				}
			}

			// Final route composition if we didn't get a complete route
			console.log('createStreamingRoute: Composing complete route...');
			await composeCompleteRoute();
			console.log('createStreamingRoute: All operations completed');
		} catch (error) {
			console.error('Streaming route error:', error);

			// Clean up reader if it exists
			if (reader) {
				try {
					reader.cancel();
				} catch (cancelError) {
					console.warn('Error cancelling reader:', cancelError);
				}
			}

			throw error;
		}
	}

	async function handleStreamingData(data: any) {
		console.log('handleStreamingData: Received data type:', data.type);

		switch (data.type) {
			case 'status':
				if (data.totalSegments) {
					routingProgress.total = data.totalSegments;
				}
				console.log('Routing status:', data.message);
				break;

			case 'segment':
				console.log('handleStreamingData: Processing segment', data.index);
				await handleSegmentData(data);
				break;

			case 'complete_route':
				console.log('handleStreamingData: Processing complete route');
				await handleCompleteRoute(data);
				break;

			case 'error':
				console.error('Streaming error:', data.message, data.error);
				break;

			default:
				console.log('Unknown streaming data type:', data.type);
		}
	}

	async function handleCompleteRoute(data: any) {
		const { route, cached, stats } = data;

		// Remove existing route polyline
		if (routePolyline) {
			map.removeLayer(routePolyline);
		}

		// Create the final route polyline
		if (route?.routes?.[0]?.geometry?.coordinates) {
			const geometry = route.routes[0].geometry;
			const routeCoords = geometry.coordinates.map((coord: [number, number]) => [
				coord[1], // lat
				coord[0] // lng
			]);

			routePolyline = L.polyline(routeCoords, {
				color: '#3b82f6',
				weight: 4,
				opacity: 0.8
			}).addTo(map);

			// Update combined coordinates for consistency
			combinedRouteCoordinates = [...routeCoords];

			console.log('Complete route loaded successfully');
		}
	}

	async function composeCompleteRoute() {
		// This is called at the end of streaming to ensure we have a complete route
		// even if the complete_route message was missed

		if (!routePolyline && routeSegments.size > 0) {
			console.log('Composing complete route from segments');

			// Sort segments by index
			const sortedSegments = Array.from(routeSegments.entries()).sort(([a], [b]) => a - b);

			// Combine all coordinates
			const allCoordinates: [number, number][] = [];

			sortedSegments.forEach(([index, route]) => {
				if (route?.routes?.[0]?.geometry?.coordinates) {
					const coordinates = route.routes[0].geometry.coordinates;
					// Skip first coordinate of subsequent routes to avoid duplication
					const segmentCoords = index === 0 ? coordinates : coordinates.slice(1);

					// Convert from [lng, lat] to [lat, lng]
					const leafletCoords = segmentCoords.map((coord: [number, number]) => [
						coord[1],
						coord[0]
					]);

					allCoordinates.push(...leafletCoords);
				}
			});

			if (allCoordinates.length > 0) {
				// Create final complete route
				routePolyline = L.polyline(allCoordinates, {
					color: '#3b82f6',
					weight: 4,
					opacity: 0.8
				}).addTo(map);

				// Update combined coordinates
				combinedRouteCoordinates = [...allCoordinates];
			}
		}
	}

	async function handleSegmentData(data: any) {
		const { index, route, cached, progress } = data;
		console.log(`handleSegmentData: Processing segment ${index} (${cached ? 'cached' : 'fresh'})`);

		// Store the segment
		routeSegments.set(index, route);

		// Update progress
		if (progress) {
			routingProgress = progress;
			console.log(`handleSegmentData: Progress ${progress.current}/${progress.total}`);
		}

		// Add segment coordinates to combined route to avoid flickering
		if (route?.routes?.[0]?.geometry?.coordinates) {
			console.log(`handleSegmentData: Adding coordinates for segment ${index}`);
			const geometry = route.routes[0].geometry;
			const segmentCoords = geometry.coordinates.map((coord: [number, number]) => [
				coord[1], // lat
				coord[0] // lng
			]);

			// If this is not the first segment, skip the first coordinate to avoid duplication
			const coordsToAdd = index === 0 ? segmentCoords : segmentCoords.slice(1);
			combinedRouteCoordinates.push(...coordsToAdd);

			console.log(
				`handleSegmentData: Combined route now has ${combinedRouteCoordinates.length} coordinates`
			);

			// Update the route polyline with combined coordinates
			updateRoutePolyline();

			console.log(
				`handleSegmentData: Added segment ${index + 1} to combined route (${cached ? 'cached' : 'fresh'})`
			);
		} else {
			console.warn(`handleSegmentData: No coordinates found for segment ${index}`);
		}
	}

	function clearRouting() {
		console.log('clearRouting called');
		try {
			// Clear existing routing
			if (routePolyline) {
				console.log('clearRouting: Removing route polyline');
				map.removeLayer(routePolyline);
			}

			// Clear streaming state
			console.log('clearRouting: Clearing route segments and coordinates');
			routeSegments.clear();
			combinedRouteCoordinates = [];
			routingProgress = { current: 0, total: 0 };

			console.log('clearRouting: Completed');
		} catch (error) {
			console.error('Error in clearRouting:', error);
		}
	}

	// Public methods
	export function focusOnStop(stop: Stop) {
		if (map && L) {
			userHasInteracted = true; // Mark as user interaction
			map.setView([stop.lat, stop.lng], 20);
			const marker = stopMarkers.get(stop.id);
			if (marker) {
				marker.openPopup();
			}
		}
	}

	export function invalidateSize() {
		if (map) {
			setTimeout(() => {
				map.invalidateSize();
			}, 100);
		}
	}

	export function updateMap() {
		// Public interface - delegate to safe internal method
		console.log('updateMap (public) called - delegating to updateMapSafe');
		if (!isUpdating) {
			updateMapSafe().catch((error) => {
				console.error('Error in public updateMap:', error);
			});
		} else {
			console.log('updateMap: Already updating, skipping...');
		}
	}

	async function updateMapSafe() {
		console.log('updateMapSafe called with', waypoints.length, 'waypoints');

		if (!browser || !mapInitialized || !map || waypoints.length === 0 || !L) {
			console.log('updateMapSafe: Prerequisites not met');
			return;
		}

		try {
			console.log('updateMapSafe: Clearing routing...');
			clearRouting();

			console.log('updateMapSafe: Starting to sort data...');
			// Sort data by timestamp
			const sortedData = [...waypoints].sort(
				(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
			);

			console.log('updateMapSafe: Sorted data length:', sortedData.length);

			if (sortedData.length < 2) {
				console.log('updateMapSafe: Less than 2 points, showing position marker only');
				// If less than 2 points, just show the position marker
				if (sortedData.length === 1) {
					currentPosition = sortedData[0];
					console.log('updateMapSafe: Adding current position marker...');
					addCurrentPositionMarker();
					console.log('updateMapSafe: Centering map on current position...');
					centerMapOnCurrentPosition();
				}
				console.log('updateMapSafe: Completed (single point)');
				return;
			}

			// Use OSRM routing for better paths (safely disabled for now)
			console.log('updateMapSafe: Starting OSRM routing (safe version)...');
			createRoutingPathWithProxy(sortedData);

			// Add current position marker
			console.log('updateMapSafe: Setting current position...');
			currentPosition = sortedData[sortedData.length - 1];
			console.log('updateMapSafe: Adding current position marker...');
			addCurrentPositionMarker();

			// Only center on first load or if user hasn't interacted
			if (isFirstLoad || !userHasInteracted) {
				console.log('updateMapSafe: Centering map on current position...');
				centerMapOnCurrentPosition();
			} else {
				console.log('updateMapSafe: Skipping auto-center due to user interaction');
			}

			console.log('updateMapSafe: Completed successfully');
		} catch (error) {
			console.error('Error in updateMapSafe:', error);
			throw error; // Re-throw to be caught by the caller
		}
	}

	// Reactive updates - only when data actually changes
	$: if (
		browser &&
		mapInitialized &&
		waypoints.length !== lastProcessedWaypointsLength &&
		!isUpdating
	) {
		lastProcessedWaypointsLength = waypoints.length;
		if (waypoints.length > 0) {
			// Set flag to prevent concurrent updates
			isUpdating = true;

			// Add a timeout to detect hanging operations and force reset
			const forceResetTimeout = setTimeout(() => {
				console.error('FORCE RESET: updateMap hung for too long, resetting...');
				isUpdating = false;
			}, 10000); // 10 second force reset

			setTimeout(() => {
				try {
					console.log('Starting updateMap with concurrency protection...');
					updateMapSafe().finally(() => {
						clearTimeout(forceResetTimeout);
						isUpdating = false;
						console.log('updateMap completed, concurrency lock released');
					});
				} catch (error) {
					clearTimeout(forceResetTimeout);
					isUpdating = false;
					console.error('Error in updateMap:', error);
				}
			}, 100); // Slightly longer delay to ensure stability
		}
	}

	$: if (browser && map && L && mapInitialized) {
		// Create a state string to detect actual changes in stops
		const stopsStateString = stops
			.map((s) => `${s.id}-${s.done}-${s.skipped}-${s.startTime}-${s.endTime}-${s.isOngoing}`)
			.join('|');

		if (stops.length !== lastProcessedStopsLength || stopsStateString !== lastProcessedStopsState) {
			lastProcessedStopsLength = stops.length;
			lastProcessedStopsState = stopsStateString;

			if (stops.length > 0) {
				setTimeout(() => {
					try {
						updateStopMarkers();
					} catch (error) {
						console.error('Error in updateStopMarkers:', error);
					}
				}, 0);
			}
		}
	}
</script>

<div bind:this={mapContainer} class="z-9 h-full w-full overflow-hidden rounded-lg"></div>

<style>
	:global(.current-position-marker) {
		background: transparent;
		border: none;
	}

	:global(.stop-marker) {
		background: transparent;
		border: none;
	}
</style>
