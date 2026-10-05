const EARTH_RADIUS_KM = 6371;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two points, in kilometres. */
export function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_KM * c;
}

/**
 * A conservative lat/lng bounding box around a point for a given radius,
 * used as a cheap pre-filter in the DB query before the precise haversine
 * check is applied in application code (no PostGIS extension in this
 * phase). Slightly generous on purpose — false positives are filtered out
 * afterward; false negatives (missing an eligible driver) are not
 * acceptable.
 */
export function boundingBox(center: GeoPoint, radiusKm: number) {
  const latDelta = radiusKm / 110.574; // ~km per degree of latitude
  const lngDelta = radiusKm / (111.320 * Math.cos(toRadians(center.latitude)) || 1);

  return {
    minLat: center.latitude - latDelta,
    maxLat: center.latitude + latDelta,
    minLng: center.longitude - lngDelta,
    maxLng: center.longitude + lngDelta,
  };
}
