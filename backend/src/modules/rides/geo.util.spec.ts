import { haversineDistanceKm, boundingBox } from './geo.util';

describe('haversineDistanceKm', () => {
  it('returns 0 for identical points', () => {
    const point = { latitude: 11.8333, longitude: 13.15 }; // Maiduguri
    expect(haversineDistanceKm(point, point)).toBeCloseTo(0, 6);
  });

  it('computes a known distance (Lagos to Abuja) within a reasonable tolerance', () => {
    const lagos = { latitude: 6.5244, longitude: 3.3792 };
    const abuja = { latitude: 9.0765, longitude: 7.3986 };
    const distance = haversineDistanceKm(lagos, abuja);
    // Real-world distance is ~530km; allow a wide tolerance for a straight-line check.
    expect(distance).toBeGreaterThan(480);
    expect(distance).toBeLessThan(580);
  });

  it('is symmetric', () => {
    const a = { latitude: 11.85, longitude: 13.16 };
    const b = { latitude: 11.90, longitude: 13.20 };
    expect(haversineDistanceKm(a, b)).toBeCloseTo(haversineDistanceKm(b, a), 9);
  });

  it('increases monotonically with increasing lat/lng offset', () => {
    const origin = { latitude: 11.85, longitude: 13.16 };
    const near = { latitude: 11.86, longitude: 13.16 };
    const far = { latitude: 12.5, longitude: 13.16 };
    expect(haversineDistanceKm(origin, near)).toBeLessThan(haversineDistanceKm(origin, far));
  });
});

describe('boundingBox', () => {
  it('produces a box that contains the center point', () => {
    const center = { latitude: 11.85, longitude: 13.16 };
    const box = boundingBox(center, 5);
    expect(center.latitude).toBeGreaterThanOrEqual(box.minLat);
    expect(center.latitude).toBeLessThanOrEqual(box.maxLat);
    expect(center.longitude).toBeGreaterThanOrEqual(box.minLng);
    expect(center.longitude).toBeLessThanOrEqual(box.maxLng);
  });

  it('grows with a larger radius', () => {
    const center = { latitude: 11.85, longitude: 13.16 };
    const small = boundingBox(center, 2);
    const large = boundingBox(center, 20);
    expect(large.maxLat - large.minLat).toBeGreaterThan(small.maxLat - small.minLat);
  });

  it('does not divide by zero at the poles', () => {
    const center = { latitude: 90, longitude: 0 };
    expect(() => boundingBox(center, 5)).not.toThrow();
    const box = boundingBox(center, 5);
    expect(Number.isFinite(box.minLng)).toBe(true);
    expect(Number.isFinite(box.maxLng)).toBe(true);
  });
});
