<script lang="ts">
	import type { Waypoint } from '$types/map';
	import { waypointStore, mapWaypoints, waypointStats } from '$lib/stores/waypoints';
	import { websocketStore, newWaypoints } from '$lib/stores/websocket';
	import { stopsStore, sortedStops, stopStats, currentStop, nextStop } from '$lib/stores/stop';
	import { onDestroy, onMount } from 'svelte';
	import { derived } from 'svelte/store';
	import { browser } from '$app/environment';
	import type { Stop } from '$types/stop';

	// Import components
	import MapContainer from '$components/map/MapContainer.svelte';
	import MapStatusOverlay from '$components/map/MapStatusOverlay.svelte';
	import DeviceInfo from '$components/device/DeviceInfo.svelte';
	import StopsProgress from '$components/stops/StopsProgress.svelte';
	import StopsList from '$components/stops/StopsList.svelte';
	import TripStatistics from '$components/statistics/TripStatistics.svelte';

	export let deviceInfo = {
		id: 'ESP32-Alpha',
		saint: "Sant\'Antonio per le campagne",
		saintSub: 'Giorno 4',
		location: 'Montefalcione',
		status: 'Online',
		lastUpdate: '2 min. fa'
	};

	// Component references
	let mobileMapComponent: MapContainer;
	let desktopMapComponent: MapContainer;

	// Track current container and screen size
	let isMobile = false;

	// Mobile scroll state
	let showScrollToTop = false;
	let scrollContainer: HTMLDivElement;

	// Data processing
	let cachedTotalDistance = 0;
	let cachedSortedData: Waypoint[] = [];
	let isFirstWaypoint = true;
	let lastProcessedDataLength = 0;

	// Reactive variables from stores
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
		if ($waypoints.loading) return 'loading';
		if ($ws.connecting) return 'loading';
		if ($ws.connected) return 'connected';
		if ($ws.error || $waypoints.error) return 'error';
		return 'disconnected';
	});

	const connectionStatusText = derived(connectionStatus, ($status) => {
		switch ($status) {
			case 'loading': return 'Caricamento...';
			case 'connected': return 'Online';
			case 'disconnected': return 'Disconnesso';
			case 'error': return 'Errore';
			default: return 'Sconosciuto';
		}
	});

	const connectionStatusColor = derived(connectionStatus, ($status) => {
		switch ($status) {
			case 'loading': return 'text-yellow-600';
			case 'connected': return 'text-green-600';
			case 'disconnected': return 'text-gray-600';
			case 'error': return 'text-red-600';
			default: return 'text-gray-600';
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

	onMount(async () => {
		if (!browser) return;

		checkScreenSize();
		window.addEventListener('resize', handleResize);

		try {
			await waypointStore.loadWaypoints();
		} catch (error) {
			console.error('Failed to load initial waypoints:', error);
		}

		websocketStore.connect();

		if (scrollContainer) {
			scrollContainer.addEventListener('scroll', handleScroll);
		}
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('resize', handleResize);
		}
		websocketStore.disconnect();
	});

	function checkScreenSize() {
		if (browser) {
			isMobile = window.innerWidth < 768;
		}
	}

	function handleResize() {
		if (!browser) return;
		checkScreenSize();
		
		// Invalidate map size after resize
		setTimeout(() => {
			if (isMobile && mobileMapComponent) {
				mobileMapComponent.invalidateSize();
			} else if (!isMobile && desktopMapComponent) {
				desktopMapComponent.invalidateSize();
			}
		}, 300);
	}

	function handleScroll() {
		if (scrollContainer) {
			showScrollToTop = scrollContainer.scrollTop > 300;
		}
	}

	function scrollToTop() {
		if (scrollContainer) {
			scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}

	// React to GPS data changes - only when the actual data length changes
	$: if (browser && gpsData.length !== lastProcessedDataLength) {
		lastProcessedDataLength = gpsData.length;
		if (gpsData.length > 0) {
			// Use setTimeout to prevent blocking the main thread
			setTimeout(() => {
				try {
					processGpsData();
				} catch (error) {
					console.error('Error in processGpsData timeout:', error);
				}
			}, 0);
		}
	}

	// React to new waypoints from WebSocket
	$: if (newWaypointData.length > 0) {
		waypointStore.addWaypoints(newWaypointData);
	}

	function processGpsData() {
		console.log('processGpsData called with', gpsData.length, 'waypoints');
		
		if (gpsData.length === 0) {
			console.log('No GPS data, resetting...');
			cachedTotalDistance = 0;
			cachedSortedData = [];
			totalDistance = 0;
			currentPosition = null;
			isFirstWaypoint = true;
			lastProcessedDataLength = 0;
			return;
		}

		try {
			console.log('Sorting GPS data...');
			const sortedData = [...gpsData].sort(
				(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
			);
			console.log('Sorted data length:', sortedData.length);

			// Validate sorted data
			const validData = sortedData.filter(point => {
				return point && 
					   typeof point.latitude === 'number' && 
					   typeof point.longitude === 'number' &&
					   !isNaN(point.latitude) && 
					   !isNaN(point.longitude) &&
					   point.latitude !== 0 && 
					   point.longitude !== 0;
			});

			console.log('Valid data length:', validData.length);

			if (validData.length === 0) {
				console.warn('No valid GPS data after filtering');
				return;
			}

			const needsFullRecalculation =
				cachedSortedData.length === 0 ||
				validData.length < cachedSortedData.length ||
				validData
					.slice(0, Math.min(cachedSortedData.length, 10))
					.some(
						(point, index) =>
							index < cachedSortedData.length &&
							(point.created_at !== cachedSortedData[index].created_at ||
								Math.abs(point.latitude - cachedSortedData[index].latitude) > 0.00001 ||
								Math.abs(point.longitude - cachedSortedData[index].longitude) > 0.00001)
					);

			if (needsFullRecalculation) {
				console.log('Full GPS data recalculation needed');
				
				if (validData.length === 0) {
					console.warn('No valid sorted data available, skipping recalculation');
					return;
				}

				try {
					console.log('Calculating total distance for', validData.length, 'points...');
					
					// For single point, distance is 0
					if (validData.length === 1) {
						console.log('Single waypoint, distance = 0');
						cachedTotalDistance = 0;
					} else {
						// Calculate distance safely
						let totalDist = 0;
						for (let i = 1; i < validData.length; i++) {
							try {
								const dist = calculateDistance(
									validData[i - 1].latitude,
									validData[i - 1].longitude,
									validData[i].latitude,
									validData[i].longitude
								);
								if (!isNaN(dist) && dist > 0) {
									totalDist += dist;
								}
							} catch (distError) {
								console.warn('Error calculating distance for segment', i, distError);
							}
						}
						cachedTotalDistance = totalDist;
						console.log('Calculated total distance:', cachedTotalDistance);
					}

					cachedSortedData = [...validData];

					console.log('Processing waypoints for stops...');
					// Process waypoints for stops one by one with error handling
					validData.forEach((waypoint, index) => {
						try {
							stopsStore.processWaypoint(waypoint);
						} catch (stopError) {
							console.warn('Error processing waypoint', index, 'for stops:', stopError);
						}
					});

					isFirstWaypoint = cachedSortedData.length === 1;
					console.log('Full recalculation completed');
				} catch (error) {
					console.error('Error during full recalculation:', error);
					cachedTotalDistance = 0;
					cachedSortedData = [];
					return;
				}
			} else if (validData.length > cachedSortedData.length) {
				console.log(`Incremental GPS processing: ${validData.length - cachedSortedData.length} new points`);

				const newPoints = validData.slice(cachedSortedData.length);
				let additionalDistance = 0;

				try {
					if (cachedSortedData.length > 0 && newPoints.length > 0) {
						const lastCachedPoint = cachedSortedData[cachedSortedData.length - 1];
						const firstNewPoint = newPoints[0];
						const dist = calculateDistance(
							lastCachedPoint.latitude,
							lastCachedPoint.longitude,
							firstNewPoint.latitude,
							firstNewPoint.longitude
						);
						if (!isNaN(dist)) {
							additionalDistance += dist;
						}
					}

					for (let i = 1; i < newPoints.length; i++) {
						const dist = calculateDistance(
							newPoints[i - 1].latitude,
							newPoints[i - 1].longitude,
							newPoints[i].latitude,
							newPoints[i].longitude
						);
						if (!isNaN(dist)) {
							additionalDistance += dist;
						}
					}

					cachedTotalDistance += additionalDistance;
					cachedSortedData = [...validData];

					newPoints.forEach((waypoint) => {
						try {
							stopsStore.processWaypoint(waypoint);
						} catch (stopError) {
							console.warn('Error processing new waypoint for stops:', stopError);
						}
					});

					isFirstWaypoint = false;
					console.log('Incremental processing completed');
				} catch (error) {
					console.error('Error during incremental calculation:', error);
					return;
				}
			}

			// Update component state - these assignments should not trigger reactive statements
			totalDistance = cachedTotalDistance;
			currentPosition = validData[validData.length - 1];
			console.log('processGpsData completed successfully');
		} catch (error) {
			console.error('Fatal error in processGpsData:', error);
			// Reset state on any error
			cachedTotalDistance = 0;
			cachedSortedData = [];
			totalDistance = 0;
			currentPosition = null;
			isFirstWaypoint = true;
		}
	}

	function handleReconnect() {
		websocketStore.reconnect();
	}

	function handleRefresh() {
		waypointStore.loadWaypoints();
	}

	function handleStopClick(stop: Stop): void {
		const mapComponent = isMobile ? mobileMapComponent : desktopMapComponent;
		if (mapComponent) {
			mapComponent.focusOnStop(stop);
		}

		// On mobile, scroll to map container to show the result
		if (isMobile && scrollContainer) {
			setTimeout(() => {
				const mapCard = document.querySelector('.mobile-map-card');
				if (mapCard) {
					mapCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
				}
			}, 100);
		}
	}

	// Helper function for missing calculateDistance
	function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
		const R = 6371000; // Earth's radius in meters
		const dLat = (lat2 - lat1) * Math.PI / 180;
		const dLng = (lng2 - lng1) * Math.PI / 180;
		const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
			Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
			Math.sin(dLng/2) * Math.sin(dLng/2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
		return R * c;
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
			<!-- Device Information -->
			<DeviceInfo 
				{deviceInfo}
				connectionStatus={$connectionStatus}
				connectionStatusColor={$connectionStatusColor}
				connectionStatusText={$connectionStatusText}
				lastUpdate={$lastUpdate}
				onReconnect={handleReconnect}
				onRefresh={handleRefresh}
				error={$waypointStore.error || wsState.error}
			/>

			<!-- Mobile Map Card - Only visible on mobile -->
			<div class="mobile-map-card mb-4 block rounded-xl bg-white p-4 shadow-sm md:hidden">
				<div class="relative h-[450px] w-full">
					<MapContainer 
						bind:this={mobileMapComponent}
						waypoints={gpsData}
						{stops}
						{currentPosition}
					/>
					<MapStatusOverlay connectionStatus={$connectionStatus} />
				</div>
			</div>

			<!-- Stops Progress -->
			<StopsProgress 
				{stopsStats}
				{currentStopData}
				{nextStopData}
				onStopClick={handleStopClick}
			/>

			<!-- Mobile Stops Section - Only visible on mobile -->
			<div class="my-4 md:hidden">
				<StopsList 
					{stops}
					onStopClick={handleStopClick}
					maxHeight="max-h-80"
				/>
			</div>

			<!-- Trip Statistics -->
			<TripStatistics {totalDistance} {stats} />
		</div>

		<!-- Desktop Map Container - Center column on desktop, hidden on mobile -->
		<div class="relative hidden min-h-[500px] flex-1 md:mr-4 md:block md:h-[70vh]">
			<div class="h-full rounded-xl bg-white shadow-sm">
				<MapContainer 
					bind:this={desktopMapComponent}
					waypoints={gpsData}
					{stops}
					{currentPosition}
				/>
				<MapStatusOverlay connectionStatus={$connectionStatus} />
			</div>
		</div>

		<!-- Desktop Stops Section - Right column, only visible on desktop -->
		<div class="hidden w-80 flex-shrink-0 bg-gray-50 p-4 md:flex md:h-[70vh] md:flex-col">
			<StopsList 
				{stops}
				onStopClick={handleStopClick}
				maxHeight="flex-1 overflow-y-auto"
			/>
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