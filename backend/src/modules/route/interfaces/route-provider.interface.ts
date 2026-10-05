export interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface RouteResult {
  distanceKm: number;
  durationMinutes: number;
  /**
   * An ordered list of lat/lng points describing the route path, for
   * drawing a polyline on the frontend map. Real providers (Mapbox,
   * Google) return an encoded polyline string in production — the
   * frontend SDK for whichever provider you use can decode it directly.
   * We normalize to a plain point array here so the API response isn't
   * tied to one vendor's encoding format.
   */
  path: RoutePoint[];
}

export interface RouteProvider {
  getRoute(origin: RoutePoint, destination: RoutePoint): Promise<RouteResult>;
}

export const ROUTE_PROVIDER = Symbol('ROUTE_PROVIDER');
