import { Injectable, Logger } from '@nestjs/common';
import { haversineDistanceKm } from '../../rides/geo.util';
import { RouteProvider, RoutePoint, RouteResult } from '../interfaces/route-provider.interface';

/** Rough city-driving speed assumption for the mock ETA, in km/h. */
const ASSUMED_AVERAGE_SPEED_KMH = 25;

/**
 * Development/testing stand-in. Returns a straight two-point "path"
 * (origin, destination) and a haversine-distance-based ETA — NOT a real
 * road route. Good enough to build and test the request/response shapes
 * without a live Mapbox/Google API key; switch to a real
 * MapboxRouteProvider before production, since straight-line distance
 * meaningfully understates real driving distance.
 */
@Injectable()
export class MockRouteProvider implements RouteProvider {
  private readonly logger = new Logger('MockRouteProvider [DEV ONLY]');

  async getRoute(origin: RoutePoint, destination: RoutePoint): Promise<RouteResult> {
    this.logger.warn('DEV MODE — returning a straight-line estimate, not a real road route.');

    const distanceKm = haversineDistanceKm(origin, destination);
    const durationMinutes = (distanceKm / ASSUMED_AVERAGE_SPEED_KMH) * 60;

    return {
      distanceKm,
      durationMinutes,
      path: [origin, destination],
    };
  }
}
