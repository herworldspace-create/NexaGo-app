import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';
import { RouteProvider, RoutePoint, RouteResult } from '../interfaces/route-provider.interface';

const MAPBOX_DIRECTIONS_BASE_URL = 'https://api.mapbox.com/directions/v5/mapbox/driving';

/**
 * Real integration against Mapbox's documented Directions API — Mapbox
 * is one of the two vendors explicitly named in the spec. NOT exercised
 * against a live Mapbox account in this sandbox (no network access, no
 * real access token) — verify with a real MAPBOX_ACCESS_TOKEN before
 * relying on this in production. Google Directions is the documented
 * alternative behind the same RouteProvider interface, for anyone who
 * prefers it (not implemented here — same interface, swap the binding).
 */
@Injectable()
export class MapboxRouteProvider implements RouteProvider {
  private readonly logger = new Logger(MapboxRouteProvider.name);

  constructor(private readonly config: AppConfigService) {}

  async getRoute(origin: RoutePoint, destination: RoutePoint): Promise<RouteResult> {
    const token = this.config.route.mapboxAccessToken;
    if (!token) {
      throw new Error('MAPBOX_ACCESS_TOKEN is not configured. Set it in .env before using ROUTE_PROVIDER=mapbox.');
    }

    // Mapbox expects "lng,lat" order (opposite of our lat/lng convention).
    const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
    const url = `${MAPBOX_DIRECTIONS_BASE_URL}/${coordinates}?geometries=geojson&overview=full&access_token=${token}`;

    const response = await fetch(url);
    const body = await response.json().catch(() => null);

    if (!response.ok || !body?.routes?.length) {
      this.logger.error(`Mapbox Directions request failed: ${response.status} ${JSON.stringify(body)}`);
      throw new Error(body?.message ?? 'Failed to fetch route from Mapbox.');
    }

    const route = body.routes[0];
    const coords: [number, number][] = route.geometry.coordinates; // [lng, lat] pairs

    return {
      distanceKm: route.distance / 1000,
      durationMinutes: route.duration / 60,
      path: coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
    };
  }
}
