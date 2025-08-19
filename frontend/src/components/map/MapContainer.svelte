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
	import { filterWaypoints } from '$utils/filter';

	export let waypoints: Waypoint[] = [];
	export let stops: Stop[] = [];
	export let currentPosition: Waypoint | null = null;

	let mapContainer: HTMLDivElement;
	let map: LeafMap;
	let L: typeof import('leaflet');
	let currentPositionMarker: Marker;

	// OPTIMIZED: Multiple route rendering strategies
	let routePolylines: Polyline[] = []; // Array of incremental polyline segments
	let osrmRoutePolyline: Polyline | null = null; // Single OSRM-generated route
	let useOSRMRouting = false; // Toggle between OSRM and incremental rendering
	let processedWaypointCount = 0; // Track processed waypoints for incremental rendering
	let lastProcessedWaypoint: Waypoint | null = null;

	let stopMarkers: Map<number, Marker> = new Map();
	let stopCircles: Map<number, Circle> = new Map();

	// Route streaming variables for OSRM
	let routeSegments: Map<number, any> = new Map();
	let combinedRouteCoordinates: [number, number][] = [];
	let routingProgress = { current: 0, total: 0 };

	// Track processed data to prevent infinite loops
	let lastProcessedWaypointsLength = 0;
	let lastProcessedStopsLength = 0;
	let lastProcessedStopsState = '';
	let isUpdating = false;

	// User interaction tracking
	let userHasInteracted = false;
	let isFirstLoad = true;
	let mapInitialized = false;

	let filteredCache: Map<string, Waypoint> = new Map();
	let lastProcessedCount = 0;

	const mfCenter = [40.9610384, 14.8822149];

	onMount(async () => {
		if (!browser) return;

		// Load Leaflet
		L = await import('leaflet');
		await import('leaflet/dist/leaflet.css');

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
		if (!browser || !map || !currentPosition) return;
		if (userHasInteracted && !isFirstLoad) return;

		try {
			map.setView([currentPosition.latitude, currentPosition.longitude], 18, {
				animate: true,
				duration: 1
			});
			isFirstLoad = false;
		} catch (error) {
			console.warn('Error centering map on current position:', error);
		}
	}

	function addCurrentPositionMarker() {
		if (!browser || !currentPosition || !map || !L) return;

		try {
			if (currentPositionMarker) {
				map.removeLayer(currentPositionMarker);
			}

			const currentIcon: DivIcon = L.divIcon({
				className: 'current-position-marker',
				html: `<div class="w-5 h-5 z-20 bg-red-500 border-2 border-white rounded-full shadow-lg animate-pulse"></div>`,
				iconSize: [20, 20],
				iconAnchor: [10, 10]
			});

			currentPositionMarker = L.marker([currentPosition.latitude, currentPosition.longitude], {
				icon: currentIcon
			}).addTo(map);
		} catch (error) {
			console.error('Error in addCurrentPositionMarker:', error);
		}
	}

	// OPTIMIZED: Clear all route visualizations
	function clearAllRoutes() {
		console.log('Clearing all route visualizations');

		// Clear incremental polylines
		routePolylines.forEach((polyline) => {
			if (map) map.removeLayer(polyline);
		});
		routePolylines = [];
		processedWaypointCount = 0;
		lastProcessedWaypoint = null;

		// Clear OSRM route
		if (osrmRoutePolyline) {
			map.removeLayer(osrmRoutePolyline);
			osrmRoutePolyline = null;
		}

		// Clear OSRM streaming state
		routeSegments.clear();
		combinedRouteCoordinates = [];
		routingProgress = { current: 0, total: 0 };
	}

	// OPTIMIZED: Incremental route rendering for simple polylines
	function updateRouteIncremental(sortedData: Waypoint[]) {
		console.log('updateRouteIncremental called with', sortedData.length, 'waypoints');

		if (!map || !L || sortedData.length < 2) return;

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

		if (validData.length < 2) return;

		// Check if we need to rebuild the entire route
		const needsFullRebuild =
			processedWaypointCount === 0 ||
			validData.length < processedWaypointCount ||
			(processedWaypointCount > 0 &&
				processedWaypointCount <= validData.length &&
				(validData[processedWaypointCount - 1].latitude !== lastProcessedWaypoint?.latitude ||
					validData[processedWaypointCount - 1].longitude !== lastProcessedWaypoint?.longitude));

		if (needsFullRebuild) {
			console.log('Full incremental route rebuild needed');
			clearIncrementalRoute();
			buildFullIncrementalRoute(validData);
		} else if (validData.length > processedWaypointCount) {
			console.log('Adding incremental route segments');
			addNewIncrementalSegments(validData);
		}
	}

	function clearIncrementalRoute() {
		routePolylines.forEach((polyline) => {
			if (map) map.removeLayer(polyline);
		});
		routePolylines = [];
		processedWaypointCount = 0;
		lastProcessedWaypoint = null;
	}

	function buildFullIncrementalRoute(validData: Waypoint[]) {
		console.log('Building full incremental route for', validData.length, 'waypoints');

		const batchSize = 50;
		let currentIndex = 0;

		function processBatch() {
			const endIndex = Math.min(currentIndex + batchSize, validData.length - 1);

			for (let i = currentIndex; i < endIndex; i++) {
				createIncrementalSegment(validData[i], validData[i + 1], false);
			}

			currentIndex = endIndex;
			processedWaypointCount = endIndex + 1;

			if (currentIndex < validData.length - 1) {
				setTimeout(processBatch, 10);
			} else {
				lastProcessedWaypoint = validData[validData.length - 1];
				console.log('Full incremental route build completed');
			}
		}

		processBatch();
	}

	function addNewIncrementalSegments(validData: Waypoint[]) {
		console.log(
			'Adding new incremental segments from',
			processedWaypointCount,
			'to',
			validData.length
		);

		for (let i = processedWaypointCount; i < validData.length; i++) {
			if (i > 0) {
				createIncrementalSegment(validData[i - 1], validData[i], true);
			}
		}

		processedWaypointCount = validData.length;
		lastProcessedWaypoint = validData[validData.length - 1];
	}

	function createIncrementalSegment(from: Waypoint, to: Waypoint, animate: boolean = false) {
		if (!map || !L) return;

		try {
			const coordinates: LatLngExpression[] = [
				[from.latitude, from.longitude],
				[to.latitude, to.longitude]
			];

			const polylineOptions: any = {
				color: '#10b981', // Green for incremental route
				weight: 3,
				opacity: 0.7,
				interactive: false
			};

			const polyline = L.polyline(coordinates, polylineOptions);

			if (animate) {
				polyline.setStyle({ opacity: 0 });
				polyline.addTo(map);

				let opacity = 0;
				const animateStep = () => {
					opacity += 0.1;
					if (opacity <= 0.7) {
						polyline.setStyle({ opacity });
						requestAnimationFrame(animateStep);
					}
				};
				requestAnimationFrame(animateStep);
			} else {
				polyline.addTo(map);
			}

			routePolylines.push(polyline);
		} catch (error) {
			console.error('Error creating incremental segment:', error);
		}
	}

	// OPTIMIZED: OSRM route rendering with incremental updates
	function updateRoutePolyline() {
		if (!map || !L || combinedRouteCoordinates.length < 2) return;

		// Remove existing OSRM route polyline
		if (osrmRoutePolyline) {
			map.removeLayer(osrmRoutePolyline);
		}

		// Create new OSRM polyline
		osrmRoutePolyline = L.polyline(combinedRouteCoordinates, {
			color: '#3b82f6', // Blue for OSRM route
			weight: 4,
			opacity: 0.8
		}).addTo(map);
	}

	function createSimplePolyline(sortedData: Waypoint[]) {
		console.log('createSimplePolyline called with', sortedData.length, 'waypoints');

		if (!L) return;

		try {
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
				console.warn('createSimplePolyline: Not enough valid points for polyline');
				return;
			}

			// Use incremental rendering for simple polyline
			if (useOSRMRouting) {
				// Clear incremental route when using OSRM
				clearIncrementalRoute();

				const routeCoords = validData.map((point) => [
					point.latitude,
					point.longitude
				]) as LatLngExpression[];

				if (osrmRoutePolyline) {
					map.removeLayer(osrmRoutePolyline);
				}

				osrmRoutePolyline = L.polyline(routeCoords, {
					color: '#f59e0b', // Orange for fallback simple route
					weight: 4,
					opacity: 0.8
				}).addTo(map);

				combinedRouteCoordinates = routeCoords as [number, number][];
			} else {
				// Use incremental rendering
				clearAllRoutes();
				updateRouteIncremental(validData);
			}

			console.log('createSimplePolyline: Completed successfully');
		} catch (error) {
			console.error('Error in createSimplePolyline:', error);
		}
	}

	// OSRM Routing Functions (preserved from original)
	async function createRoutingPathWithProxy(sortedData: Waypoint[]) {
		console.log('createRoutingPathWithProxy called with', sortedData.length, 'waypoints');

		if (!browser || !map || !L) {
			console.log('Prerequisites not met, falling back to simple polyline');
			createSimplePolyline(sortedData);
			return;
		}

		if (!useOSRMRouting) {
			console.log('OSRM routing disabled, using incremental rendering');
			clearAllRoutes();
			updateRouteIncremental(sortedData);
			return;
		}

		try {
			// Clear incremental route when using OSRM
			clearIncrementalRoute();

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
				console.log('Not enough valid waypoints, using simple polyline');
				if (validData.length > 0) {
					createSimplePolyline(validData);
				}
				return;
			}

			clearOSRMRouting();

			const maxWaypoints = Math.max(2, Math.min(Math.round(validData.length / 3), 25));
			let waypointsForRouting: [number, number][] = [];

			if (validData.length <= maxWaypoints) {
				waypointsForRouting = validData.map((point) => [point.latitude, point.longitude]);
			} else {
				waypointsForRouting.push([validData[0].latitude, validData[0].longitude]);

				const remainingSlots = maxWaypoints - 2;
				const step = Math.max(1, Math.floor((validData.length - 1) / (remainingSlots + 1)));

				for (
					let i = step;
					i < validData.length - 1 && waypointsForRouting.length < maxWaypoints - 1;
					i += step
				) {
					waypointsForRouting.push([validData[i].latitude, validData[i].longitude]);
				}

				const lastPoint = validData[validData.length - 1];
				waypointsForRouting.push([lastPoint.latitude, lastPoint.longitude]);
			}

			console.log(`Using ${waypointsForRouting.length} waypoints for OSRM routing`);

			await createStreamingRoute(waypointsForRouting);
		} catch (error) {
			console.warn('OSRM routing failed, falling back to simple polyline:', error);
			createSimplePolyline(sortedData);
		}
	}

	function clearOSRMRouting() {
		if (osrmRoutePolyline) {
			map.removeLayer(osrmRoutePolyline);
			osrmRoutePolyline = null;
		}
		routeSegments.clear();
		combinedRouteCoordinates = [];
		routingProgress = { current: 0, total: 0 };
	}

	// OSRM Streaming Functions (preserved from original)
	async function createStreamingRoute(waypoints: [number, number][]) {
		console.log('createStreamingRoute called with', waypoints.length, 'waypoints');
		let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

		try {
			const response = await fetch('/api/routing', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					waypoints,
					stream: true
				})
			});

			if (!response.ok) {
				throw new Error(`Streaming API error: ${response.status}`);
			}

			if (!response.body) {
				throw new Error('Response body not readable');
			}

			reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			try {
				while (true) {
					const { done, value } = await reader.read();

					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split('\n');
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

			await composeCompleteRoute();
		} catch (error) {
			console.error('Streaming route error:', error);
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
		switch (data.type) {
			case 'status':
				if (data.totalSegments) {
					routingProgress.total = data.totalSegments;
				}
				console.log('Routing status:', data.message);
				break;

			case 'segment':
				await handleSegmentData(data);
				break;

			case 'segment_error':
				console.warn(`Segment ${data.segmentIndex} failed:`, data.error);
				break;

			case 'warning':
				console.warn('Route warning:', data.message);
				break;

			case 'complete_route':
				await handleCompleteRoute(data);
				break;

			case 'error':
				console.error('Streaming error:', data.message, data.error);
				if (!osrmRoutePolyline && waypoints.length >= 2) {
					console.log('Falling back to simple polyline due to complete routing failure');
					const sortedData = [...waypoints].sort(
						(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
					);
					createSimplePolyline(sortedData);
				}
				break;
		}
	}

	async function handleCompleteRoute(data: any) {
		const { route, cached, stats } = data;

		if (stats) {
			console.log(
				`Route completed: ${stats.validSegments}/${stats.totalSegments} segments successful`
			);
		}

		if (osrmRoutePolyline) {
			map.removeLayer(osrmRoutePolyline);
		}

		if (route?.routes?.[0]?.geometry?.coordinates) {
			const geometry = route.routes[0].geometry;
			const routeCoords = geometry.coordinates.map((coord: [number, number]) => [
				coord[1], // lat
				coord[0] // lng
			]);

			osrmRoutePolyline = L.polyline(routeCoords, {
				color: stats?.failedSegments > 0 ? '#f59e0b' : '#3b82f6',
				weight: 4,
				opacity: 0.8
			}).addTo(map);

			combinedRouteCoordinates = [...routeCoords];
			console.log(
				`OSRM route loaded successfully (${stats?.failedSegments > 0 ? 'partial' : 'complete'})`
			);
		} else {
			console.warn('No route coordinates received in complete_route');
			if (routeSegments.size > 0) {
				await composeCompleteRoute();
			}
		}
	}

	async function handleSegmentData(data: any) {
		const { index, route, cached, progress } = data;

		routeSegments.set(index, route);

		if (progress) {
			routingProgress = progress;
		}

		if (route?.routes?.[0]?.geometry?.coordinates) {
			const geometry = route.routes[0].geometry;
			const segmentCoords = geometry.coordinates.map((coord: [number, number]) => [
				coord[1], // lat
				coord[0] // lng
			]);

			const coordsToAdd = index === 0 ? segmentCoords : segmentCoords.slice(1);
			combinedRouteCoordinates.push(...coordsToAdd);

			updateRoutePolyline();
		}
	}

	async function composeCompleteRoute() {
		if (!osrmRoutePolyline && routeSegments.size > 0) {
			console.log('Composing complete route from segments');

			const sortedSegments = Array.from(routeSegments.entries()).sort(([a], [b]) => a - b);
			const allCoordinates: [number, number][] = [];

			sortedSegments.forEach(([index, route]) => {
				if (route?.routes?.[0]?.geometry?.coordinates) {
					const coordinates = route.routes[0].geometry.coordinates;
					const segmentCoords = index === 0 ? coordinates : coordinates.slice(1);
					const leafletCoords = segmentCoords.map((coord: [number, number]) => [
						coord[1],
						coord[0]
					]);
					allCoordinates.push(...leafletCoords);
				}
			});

			if (allCoordinates.length > 0) {
				osrmRoutePolyline = L.polyline(allCoordinates, {
					color: '#3b82f6',
					weight: 4,
					opacity: 0.8
				}).addTo(map);

				combinedRouteCoordinates = [...allCoordinates];
			}
		}
	}

	// Stop Markers (preserved from original)
	function updateStopMarkers() {
		if (!map || !L || stops.length === 0) return;

		try {
			stopMarkers.forEach((marker) => map.removeLayer(marker));
			stopCircles.forEach((circle) => map.removeLayer(circle));
			stopMarkers.clear();
			stopCircles.clear();

			stops.forEach((stop) => {
				try {
					let markerColor, borderColor;

					if (stop.done) {
						markerColor = '#10b981';
						borderColor = '#059669';
					} else if (stop.skipped) {
						markerColor = '#f97316';
						borderColor = '#ea580c';
					} else if (stop.startTime && !stop.endTime) {
						markerColor = '#f59e0b';
						borderColor = '#d97706';
					} else if (stop.isOngoing) {
						markerColor = '#3b82f6';
						borderColor = '#2563eb';
					} else {
						markerColor = '#6b7280';
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
								? `<div class="font-semibold text-orange-700">Saltata</div>`
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

	// Public methods
	export function focusOnStop(stop: Stop) {
		if (map && L) {
			userHasInteracted = true;
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
		console.log('updateMap (public) called');
		if (!isUpdating) {
			updateMapSafe().catch((error) => {
				console.error('Error in public updateMap:', error);
			});
		}
	}

	export function toggleRoutingMode() {
		useOSRMRouting = !useOSRMRouting;
		console.log('Routing mode toggled to:', useOSRMRouting ? 'OSRM' : 'Incremental');

		// Trigger a map update to apply the new routing mode
		if (waypoints.length > 0) {
			updateMapSafe();
		}
	}

	export function resetRoute() {
		clearAllRoutes();
	}

	async function updateMapSafe() {
		console.log('updateMapSafe called with', waypoints.length, 'waypoints');

		if (!browser || !mapInitialized || !map || waypoints.length === 0 || !L) {
			return;
		}

		try {
			clearAllRoutes();

			const sortedData = [...waypoints].sort(
				(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
			);

			const filteredData = filterWaypoints(sortedData, {
				minDistance: 20,
				minTimeInterval: 15,
				douglasPeuckerEpsilon: 8,
				maxPoints: 500
			});

			console.log(`Filtered data: ${filteredData.length} from ${sortedData.length} waypoints`);

			if (filteredData.length < 2) {
				if (sortedData.length >= 1) {
					currentPosition = sortedData[sortedData.length - 1];
					addCurrentPositionMarker();
					centerMapOnCurrentPosition();
				}
				return;
			}

			// Choose routing strategy
			if (useOSRMRouting && filteredData.length >= 2) {
				console.log('Using OSRM routing');
				createRoutingPathWithProxy(filteredData);
			} else {
				console.log('Using incremental rendering');
				updateRouteIncremental(filteredData);
			}

			currentPosition = sortedData[sortedData.length - 1];
			addCurrentPositionMarker();

			if (isFirstLoad || !userHasInteracted) {
				centerMapOnCurrentPosition();
			}
		} catch (error) {
			console.error('Error in updateMapSafe:', error);
			throw error;
		}
	}

	// Reactive updates (preserved from original)
	$: if (
		browser &&
		mapInitialized &&
		waypoints.length !== lastProcessedWaypointsLength &&
		!isUpdating
	) {
		lastProcessedWaypointsLength = waypoints.length;
		if (waypoints.length > 0) {
			isUpdating = true;

			const forceResetTimeout = setTimeout(() => {
				console.error('FORCE RESET: updateMap hung for too long, resetting...');
				isUpdating = false;
			}, 10000);

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
			}, 100);
		}
	}

	$: if (browser && map && L && mapInitialized) {
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

<div bind:this={mapContainer} class="z-9 h-full w-full overflow-hidden rounded-lg">
	<!-- Optional: Add toggle button for routing mode -->
</div>
<!-- {#if mapInitialized}
	<div class="absolute bottom-4 left-4 z-20">
		<button
			on:click={toggleRoutingMode}
			class="rounded bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-lg hover:bg-gray-50"
			title="Toggle between OSRM routing and incremental rendering"
		>
			{useOSRMRouting ? 'OSRM' : 'Simple'}
		</button>
	</div>
{/if} -->

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
