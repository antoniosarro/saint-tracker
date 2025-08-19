import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const FETCH_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second

interface CachedRoute {
  waypoints: [number, number][];
  route: any;
  timestamp: number;
}

interface RouteSegment {
  from: [number, number];
  to: [number, number];
  route: any;
  timestamp: number;
}

interface PendingRequest {
  promise: Promise<any>;
  timestamp: number;
}

// In-memory cache - in production, consider using Redis or similar
const routeCache = new Map<string, CachedRoute>();
const segmentCache = new Map<string, RouteSegment>();

// Pending request tracking for deduplication
const pendingFullRoutes = new Map<string, PendingRequest>();
const pendingSegments = new Map<string, PendingRequest>();
const pendingStreams = new Map<string, PendingRequest>();

// Cache TTL in milliseconds (24 hours)
const CACHE_TTL = 24 * 60 * 60 * 1000;
// Pending request timeout (5 minutes)
const PENDING_REQUEST_TTL = 5 * 60 * 1000;

// Maximum number of waypoints per OSRM request
const MAX_WAYPOINTS_PER_REQUEST = 20;

function generateWaypointKey(waypoints: [number, number][]): string {
  return waypoints
    .map(([lat, lng]) => `${lat.toFixed(6)},${lng.toFixed(6)}`)
    .join('|');
}

function generateSegmentKey(from: [number, number], to: [number, number]): string {
  return `${from[0].toFixed(6)},${from[1].toFixed(6)}-${to[0].toFixed(6)},${to[1].toFixed(6)}`;
}

function isValidWaypoint(waypoint: [number, number]): boolean {
  const [lat, lng] = waypoint;
  return !isNaN(lat) && !isNaN(lng) && 
         Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
         lat !== 0 && lng !== 0;
}

function isCacheValid(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_TTL;
}

function isPendingRequestValid(timestamp: number): boolean {
  return Date.now() - timestamp < PENDING_REQUEST_TTL;
}

// Clean up expired pending requests
function cleanupExpiredPendingRequests() {
  const now = Date.now();
  
  // Clean up expired pending full routes
  for (const [key, pending] of pendingFullRoutes.entries()) {
    if (!isPendingRequestValid(pending.timestamp)) {
      pendingFullRoutes.delete(key);
    }
  }
  
  // Clean up expired pending segments
  for (const [key, pending] of pendingSegments.entries()) {
    if (!isPendingRequestValid(pending.timestamp)) {
      pendingSegments.delete(key);
    }
  }
  
  // Clean up expired pending streams
  for (const [key, pending] of pendingStreams.entries()) {
    if (!isPendingRequestValid(pending.timestamp)) {
      pendingStreams.delete(key);
    }
  }
}

// Atomic OSRM fetch with deduplication
async function fetchRouteFromOSRMAtomic(waypoints: [number, number][]): Promise<any> {
  const key = generateWaypointKey(waypoints);
  
  // Check if there's already a pending request for these waypoints
  const existingPending = pendingSegments.get(key);
  if (existingPending && isPendingRequestValid(existingPending.timestamp)) {
    console.log(`Reusing pending OSRM request for key: ${key}`);
    return existingPending.promise;
  }
  
  // Create new request with retry logic
  const coordinates = waypoints
    .map(([lat, lng]) => `${lng},${lat}`)
    .join(';');
  
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`;
  
  console.log(`Creating new OSRM request for: ${waypoints.length} waypoints`);
  
  const promise = fetchWithRetry(url, MAX_RETRIES).finally(() => {
    // Clean up pending request when done
    pendingSegments.delete(key);
  });
  
  // Store the pending request
  pendingSegments.set(key, {
    promise,
    timestamp: Date.now()
  });
  
  return promise;
}

async function fetchWithRetry(url: string, retries: number): Promise<any> {
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      console.log(`Attempt ${attempt} for URL: ${url.substring(0, 100)}...`);
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Saint-Tracker/1.0'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`OSRM API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.code !== 'Ok') {
        throw new Error(`OSRM routing error: ${data.code} - ${data.message || 'Unknown error'}`);
      }

      console.log(`Successfully fetched route on attempt ${attempt}`);
      return data;
      
    } catch (error) {
      console.warn(`Fetch attempt ${attempt} failed:`, error instanceof Error ? error.message : error);
      
      // If this was the last attempt, throw the error
      if (attempt === retries + 1) {
        console.error(`All ${retries + 1} attempts failed for segment`);
        throw error;
      }
      
      // Wait before retrying
      if (attempt <= retries) {
        console.log(`Waiting ${RETRY_DELAY}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }
}

// Helper function to create streaming response
function createStreamingResponse() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let isClosed = false;
  let isClosing = false;

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl;
    },
    cancel() {
      // Called when the client disconnects
      isClosed = true;
      isClosing = true;
      console.log('Stream cancelled by client');
    }
  });

  const writeData = (data: any) => {
    if (isClosed || isClosing) {
      console.log('Attempted to write to closed stream, ignoring');
      return false;
    }

    try {
      const json = JSON.stringify(data) + '\n';
      controller.enqueue(encoder.encode(json));
      return true;
    } catch (error) {
      console.error('Error writing to stream:', error);
      isClosed = true;
      return false;
    }
  };

  const close = () => {
    if (!isClosed && !isClosing) {
      try {
        isClosing = true;
        controller.close();
        isClosed = true;
      } catch (error) {
        console.error('Error closing stream:', error);
        isClosed = true;
      }
    }
  };

  const isStreamClosed = () => isClosed || isClosing;

  return { stream, writeData, close, isStreamClosed };
}

// Atomic streaming with deduplication
async function streamIncrementalRouteAtomic(
  waypoints: [number, number][], 
  writeData: (data: any) => boolean,
  isStreamClosed: () => boolean
): Promise<void> {
  const key = generateWaypointKey(waypoints);
  
  // Check if there's already a pending stream for these waypoints
  const existingPendingStream = pendingStreams.get(key);
  if (existingPendingStream && isPendingRequestValid(existingPendingStream.timestamp)) {
    console.log(`Concurrent stream request detected for key: ${key}, waiting for existing request`);
    try {
      await existingPendingStream.promise;
      // The result should be in cache now, so we can return it
      const cachedFullRoute = routeCache.get(key);
      if (cachedFullRoute && isCacheValid(cachedFullRoute.timestamp)) {
        writeData({
          type: 'complete_route',
          route: cachedFullRoute.route,
          cached: true
        });
        return;
      }
    } catch (error) {
      console.log('Existing stream failed, proceeding with new request');
    }
  }
  
  // Create new streaming request
  const streamPromise = performStreamIncrementalRoute(waypoints, writeData, isStreamClosed);
  
  // Store the pending stream request
  pendingStreams.set(key, {
    promise: streamPromise,
    timestamp: Date.now()
  });
  
  try {
    await streamPromise;
  } finally {
    // Clean up pending request when done
    pendingStreams.delete(key);
  }
}

async function performStreamIncrementalRoute(
  waypoints: [number, number][], 
  writeData: (data: any) => boolean,
  isStreamClosed: () => boolean
): Promise<void> {
  // Check if we have the complete route cached
  const fullRouteKey = generateWaypointKey(waypoints);
  const cachedFullRoute = routeCache.get(fullRouteKey);
  
  if (cachedFullRoute && isCacheValid(cachedFullRoute.timestamp)) {
    console.log('Returning cached full route');
    writeData({
      type: 'complete_route',
      route: cachedFullRoute.route,
      cached: true
    });
    return;
  }

  // Send initial status
  if (!writeData({
    type: 'status',
    message: 'Starting route calculation',
    totalSegments: waypoints.length - 1
  })) return;

  const segments: any[] = [];
  const missingSegments: { from: [number, number]; to: [number, number]; index: number }[] = [];

  // Check which segments we have cached
  for (let i = 0; i < waypoints.length - 1; i++) {
    if (isStreamClosed()) {
      console.log('Stream closed, stopping segment check');
      return;
    }

    const from = waypoints[i];
    const to = waypoints[i + 1];
    const segmentKey = generateSegmentKey(from, to);
    const cachedSegment = segmentCache.get(segmentKey);

    if (cachedSegment && isCacheValid(cachedSegment.timestamp)) {
      segments[i] = cachedSegment.route;
      
      // Send cached segment immediately
      if (!writeData({
        type: 'segment',
        index: i,
        route: cachedSegment.route,
        cached: true,
        progress: {
          current: i + 1,
          total: waypoints.length - 1
        }
      })) return;
    } else {
      missingSegments.push({ from, to, index: i });
    }
  }

  // Send update about missing segments
  if (missingSegments.length > 0) {
    if (!writeData({
      type: 'status',
      message: `Fetching ${missingSegments.length} missing segments`,
      missingSegments: missingSegments.length,
      cachedSegments: segments.filter(s => s !== undefined).length
    })) return;
  }

  const failedSegments: number[] = [];
  
  // Fetch missing segments and stream them as they arrive
  for (const missingSegment of missingSegments) {
    if (isStreamClosed()) {
      console.log('Stream closed, stopping segment fetch');
      return;
    }

    try {
      if (!writeData({
        type: 'status',
        message: `Fetching segment ${missingSegment.index + 1}`,
        currentSegment: missingSegment.index + 1
      })) return;

      // Use atomic fetch with improved error handling
      const segmentRoute = await fetchRouteFromOSRMAtomic([missingSegment.from, missingSegment.to]);
      
      if (isStreamClosed()) {
        console.log('Stream closed after fetch, stopping');
        return;
      }

      // Cache the segment
      const segmentKey = generateSegmentKey(missingSegment.from, missingSegment.to);
      segmentCache.set(segmentKey, {
        from: missingSegment.from,
        to: missingSegment.to,
        route: segmentRoute,
        timestamp: Date.now()
      });

      segments[missingSegment.index] = segmentRoute;

      // Stream the segment immediately
      if (!writeData({
        type: 'segment',
        index: missingSegment.index,
        route: segmentRoute,
        cached: false,
        progress: {
          current: missingSegment.index + 1,
          total: waypoints.length - 1
        }
      })) return;
      
      // Small delay to avoid overwhelming OSRM
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`Failed to fetch segment ${missingSegment.index}:`, error);
      failedSegments.push(missingSegment.index);
      
      // Send error information but continue with other segments
      writeData({
        type: 'segment_error',
        message: `Failed to fetch segment ${missingSegment.index + 1}`,
        error: error instanceof Error ? error.message : 'Unknown error',
        segmentIndex: missingSegment.index,
        willContinue: true
      });
      
      // Continue processing other segments instead of stopping
      continue;
    }
  }

  if (isStreamClosed()) {
    console.log('Stream closed, not sending final result');
    return;
  }

  // Filter out undefined segments
  const validSegments = segments.filter(segment => segment !== undefined);

  if (validSegments.length === 0) {
    writeData({
      type: 'error',
      message: 'No valid route segments available - all segments failed to fetch'
    });
    return;
  }

  // If we have some segments but some failed, create a partial route
  if (failedSegments.length > 0) {
    writeData({
      type: 'warning',
      message: `Route created with ${failedSegments.length} missing segments`,
      failedSegments: failedSegments,
      successfulSegments: validSegments.length
    });
  }

  // Combine all valid segments and send final result
  const combinedRoute = combineRoutes(validSegments);

  // Cache the full route even if partial
  if (combinedRoute) {
    routeCache.set(fullRouteKey, {
      waypoints: [...waypoints],
      route: combinedRoute,
      timestamp: Date.now()
    });
  }

  writeData({
    type: 'complete_route',
    route: combinedRoute,
    cached: false,
    stats: {
      totalSegments: waypoints.length - 1,
      validSegments: validSegments.length,
      fetchedSegments: missingSegments.length - failedSegments.length,
      cachedSegments: validSegments.length - (missingSegments.length - failedSegments.length),
      failedSegments: failedSegments.length
    }
  });

  console.log(`Built route from ${validSegments.length} segments (${missingSegments.length - failedSegments.length} fetched, ${validSegments.length - (missingSegments.length - failedSegments.length)} cached, ${failedSegments.length} failed)`);
}

function combineRoutes(routes: any[]): any {
  if (routes.length === 0) return null;
  if (routes.length === 1) return routes[0];

  // Combine geometry coordinates
  const allCoordinates: [number, number][] = [];
  let totalDistance = 0;
  let totalDuration = 0;

  routes.forEach((route, index) => {
    if (route.routes && route.routes[0]) {
      const routeData = route.routes[0];
      const geometry = routeData.geometry;
      
      if (geometry && geometry.coordinates) {
        // Skip first coordinate of subsequent routes to avoid duplication
        const coordinates = index === 0 ? geometry.coordinates : geometry.coordinates.slice(1);
        allCoordinates.push(...coordinates);
      }

      totalDistance += routeData.distance || 0;
      totalDuration += routeData.duration || 0;
    }
  });

  // Create combined route response
  return {
    code: 'Ok',
    routes: [{
      distance: totalDistance,
      duration: totalDuration,
      geometry: {
        type: 'LineString',
        coordinates: allCoordinates
      }
    }]
  };
}

// Atomic non-streaming version with deduplication
async function getIncrementalRouteAtomic(waypoints: [number, number][]): Promise<any> {
  const key = generateWaypointKey(waypoints);
  
  // Check if there's already a pending request for these waypoints
  const existingPending = pendingFullRoutes.get(key);
  if (existingPending && isPendingRequestValid(existingPending.timestamp)) {
    console.log(`Reusing pending full route request for key: ${key}`);
    return existingPending.promise;
  }
  
  // Create new request
  const routePromise = performGetIncrementalRoute(waypoints);
  
  // Store the pending request
  pendingFullRoutes.set(key, {
    promise: routePromise,
    timestamp: Date.now()
  });
  
  try {
    const result = await routePromise;
    return result;
  } finally {
    // Clean up pending request when done
    pendingFullRoutes.delete(key);
  }
}

async function performGetIncrementalRoute(waypoints: [number, number][]): Promise<any> {
  // Check if we have the complete route cached
  const fullRouteKey = generateWaypointKey(waypoints);
  const cachedFullRoute = routeCache.get(fullRouteKey);
  
  if (cachedFullRoute && isCacheValid(cachedFullRoute.timestamp)) {
    console.log('Returning cached full route');
    return cachedFullRoute.route;
  }

  // Try to build route from segments
  const segments: any[] = [];
  const missingSegments: { from: [number, number]; to: [number, number]; index: number }[] = [];

  // Check which segments we have cached
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    const segmentKey = generateSegmentKey(from, to);
    const cachedSegment = segmentCache.get(segmentKey);

    if (cachedSegment && isCacheValid(cachedSegment.timestamp)) {
      segments[i] = cachedSegment.route;
    } else {
      missingSegments.push({ from, to, index: i });
    }
  }

  // Fetch missing segments in batches using atomic fetching with improved error handling
  const failedSegments: number[] = [];
  
  for (const missingSegment of missingSegments) {
    try {
      // Use atomic fetch with retry logic
      const segmentRoute = await fetchRouteFromOSRMAtomic([missingSegment.from, missingSegment.to]);
      
      // Cache the segment
      const segmentKey = generateSegmentKey(missingSegment.from, missingSegment.to);
      segmentCache.set(segmentKey, {
        from: missingSegment.from,
        to: missingSegment.to,
        route: segmentRoute,
        timestamp: Date.now()
      });

      segments[missingSegment.index] = segmentRoute;
      
      // Small delay to avoid overwhelming OSRM
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Failed to fetch segment ${missingSegment.index}:`, error);
      failedSegments.push(missingSegment.index);
      // Continue with other segments instead of throwing
    }
  }

  // Filter out undefined segments
  const validSegments = segments.filter(segment => segment !== undefined);

  if (validSegments.length === 0) {
    throw new Error('No valid route segments available - all segments failed to fetch');
  }

  // Log if we have partial results
  if (failedSegments.length > 0) {
    console.warn(`Created partial route: ${validSegments.length} successful segments, ${failedSegments.length} failed segments`);
  }

  // Combine all valid segments
  const combinedRoute = combineRoutes(validSegments);

  // Cache the full route even if partial
  if (combinedRoute) {
    routeCache.set(fullRouteKey, {
      waypoints: [...waypoints],
      route: combinedRoute,
      timestamp: Date.now()
    });
  }

  console.log(`Built route from ${validSegments.length} segments (${missingSegments.length - failedSegments.length} fetched, ${validSegments.length - (missingSegments.length - failedSegments.length)} cached, ${failedSegments.length} failed)`);
  
  return combinedRoute;
}

export const POST: RequestHandler = async ({ request, url }) => {
  try {
    // Clean up expired pending requests periodically
    cleanupExpiredPendingRequests();
    
    const body = await request.json();
    const { waypoints, stream = false } = body;

    if (!waypoints || !Array.isArray(waypoints)) {
      return json({ error: 'Invalid waypoints provided' }, { status: 400 });
    }

    // Validate and filter waypoints
    const validWaypoints = waypoints
      .filter((wp: any) => Array.isArray(wp) && wp.length === 2)
      .map((wp: any) => [parseFloat(wp[0]), parseFloat(wp[1])] as [number, number])
      .filter(isValidWaypoint);

    if (validWaypoints.length < 2) {
      return json({ error: 'At least 2 valid waypoints required' }, { status: 400 });
    }

    // Limit waypoints to prevent abuse
    if (validWaypoints.length > 100) {
      return json({ error: 'Too many waypoints (max 100)' }, { status: 400 });
    }

    // Check if streaming is requested
    if (stream) {
      const { stream: readableStream, writeData, close, isStreamClosed } = createStreamingResponse();

      // Start atomic streaming in the background
      streamIncrementalRouteAtomic(validWaypoints, writeData, isStreamClosed)
        .finally(() => {
          // Always try to close the stream when done
          if (!isStreamClosed()) {
            close();
          }
        })
        .catch(error => {
          console.error('Streaming error:', error);
          // Only try to write error if stream is still open
          if (!isStreamClosed()) {
            const success = writeData({
              type: 'error',
              message: error instanceof Error ? error.message : 'Internal server error'
            });
            if (success) {
              close();
            }
          }
        });

      return new Response(readableStream, {
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no' // Disable nginx buffering for immediate streaming
        }
      });
    } else {
      // Non-streaming mode - use atomic version
      const route = await getIncrementalRouteAtomic(validWaypoints);

      if (!route) {
        return json({ error: 'Failed to generate route' }, { status: 500 });
      }

      return json({
        success: true,
        route,
        cached: true,
        waypoints: validWaypoints.length
      });
    }

  } catch (error) {
    console.error('Routing API error:', error);
    return json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 });
  }
};

export const GET: RequestHandler = async () => {
  // Clean up expired pending requests
  cleanupExpiredPendingRequests();
  
  // Return cache statistics including pending requests
  const now = Date.now();
  const validRouteCache = Array.from(routeCache.entries()).filter(([_, cache]) => 
    isCacheValid(cache.timestamp)
  ).length;
  
  const validSegmentCache = Array.from(segmentCache.entries()).filter(([_, cache]) => 
    isCacheValid(cache.timestamp)
  ).length;

  return json({
    stats: {
      totalRoutesInCache: routeCache.size,
      validRoutesInCache: validRouteCache,
      totalSegmentsInCache: segmentCache.size,
      validSegmentsInCache: validSegmentCache,
      pendingFullRoutes: pendingFullRoutes.size,
      pendingSegments: pendingSegments.size,
      pendingStreams: pendingStreams.size,
      cacheTTL: CACHE_TTL,
      pendingRequestTTL: PENDING_REQUEST_TTL
    }
  });
};

// Optional: Cache cleanup endpoint
export const DELETE: RequestHandler = async () => {
  const now = Date.now();
  let deletedRoutes = 0;
  let deletedSegments = 0;

  // Clean expired route cache
  for (const [key, cache] of routeCache.entries()) {
    if (!isCacheValid(cache.timestamp)) {
      routeCache.delete(key);
      deletedRoutes++;
    }
  }

  // Clean expired segment cache
  for (const [key, cache] of segmentCache.entries()) {
    if (!isCacheValid(cache.timestamp)) {
      segmentCache.delete(key);
      deletedSegments++;
    }
  }

  // Clean up all pending requests
  const pendingRoutesCleared = pendingFullRoutes.size;
  const pendingSegmentsCleared = pendingSegments.size;
  const pendingStreamsCleared = pendingStreams.size;
  
  pendingFullRoutes.clear();
  pendingSegments.clear();
  pendingStreams.clear();

  return json({
    message: 'Cache cleanup completed',
    deletedRoutes,
    deletedSegments,
    pendingRoutesCleared,
    pendingSegmentsCleared,
    pendingStreamsCleared
  });
};