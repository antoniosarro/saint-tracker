// src/routes/api/routing/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

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

// In-memory cache - in production, consider using Redis or similar
const routeCache = new Map<string, CachedRoute>();
const segmentCache = new Map<string, RouteSegment>();

// Cache TTL in milliseconds (24 hours)
const CACHE_TTL = 24 * 60 * 60 * 1000;

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

async function fetchRouteFromOSRM(waypoints: [number, number][]): Promise<any> {
  const coordinates = waypoints
    .map(([lat, lng]) => `${lng},${lat}`)
    .join(';');
  
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`;
  
  console.log(`Fetching route from OSRM: ${waypoints.length} waypoints`);
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Saint-Tracker/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`OSRM API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  if (data.code !== 'Ok') {
    throw new Error(`OSRM routing error: ${data.code} - ${data.message || 'Unknown error'}`);
  }

  return data;
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

async function getIncrementalRoute(waypoints: [number, number][]): Promise<any> {
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

  // Fetch missing segments in batches
  for (const missingSegment of missingSegments) {
    try {
      const segmentRoute = await fetchRouteFromOSRM([missingSegment.from, missingSegment.to]);
      
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
      // Continue with other segments
    }
  }

  // Filter out undefined segments
  const validSegments = segments.filter(segment => segment !== undefined);

  if (validSegments.length === 0) {
    throw new Error('No valid route segments available');
  }

  // Combine all segments
  const combinedRoute = combineRoutes(validSegments);

  // Cache the full route
  if (combinedRoute) {
    routeCache.set(fullRouteKey, {
      waypoints: [...waypoints],
      route: combinedRoute,
      timestamp: Date.now()
    });
  }

  console.log(`Built route from ${validSegments.length} segments (${missingSegments.length} fetched, ${validSegments.length - missingSegments.length} cached)`);
  
  return combinedRoute;
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { waypoints } = body;

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

    // Get route using incremental caching
    const route = await getIncrementalRoute(validWaypoints);

    if (!route) {
      return json({ error: 'Failed to generate route' }, { status: 500 });
    }

    return json({
      success: true,
      route,
      cached: true, // Always true since we use caching
      waypoints: validWaypoints.length
    });

  } catch (error) {
    console.error('Routing API error:', error);
    return json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 });
  }
};

export const GET: RequestHandler = async () => {
  // Return cache statistics
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
      cacheTTL: CACHE_TTL
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

  return json({
    message: 'Cache cleanup completed',
    deletedRoutes,
    deletedSegments
  });
};