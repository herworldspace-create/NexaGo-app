import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Role } from '../../common/enums/role.enum';
import { ACTIVE_RIDE_STATUSES, RideStatus } from '../../common/enums/ride-status.enum';
import { ROUTE_PROVIDER, RouteProvider, RoutePoint } from './interfaces/route-provider.interface';

@Injectable()
export class RouteService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ROUTE_PROVIDER) private readonly routeProvider: RouteProvider,
  ) {}

  async preview(origin: RoutePoint, destination: RoutePoint) {
    return this.routeProvider.getRoute(origin, destination);
  }

  /**
   * The relevant leg for a ride right now: driver → pickup while en
   * route, pickup → destination once the trip is under way. Falls back
   * to pickup → destination with no driver leg if no driver is assigned
   * yet or the driver hasn't reported a location.
   */
  async getRouteForRide(rideId: string, requestingUserId: string, requestingRole: Role) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) {
      throw new NotFoundException('Ride not found.');
    }
    const isParty = ride.passengerUserId === requestingUserId || ride.driverUserId === requestingUserId;
    const isAdmin = requestingRole === Role.ADMIN || requestingRole === Role.SUPER_ADMIN;
    if (!isParty && !isAdmin) {
      throw new ForbiddenException('You do not have access to this ride.');
    }

    const destination = { latitude: ride.destinationLat, longitude: ride.destinationLng };
    const pickup = { latitude: ride.pickupLat, longitude: ride.pickupLng };

    const tripUnderway = ride.status === (RideStatus.IN_PROGRESS as any);
    if (tripUnderway) {
      return { leg: 'to_destination' as const, ...(await this.routeProvider.getRoute(pickup, destination)) };
    }

    if (ride.driverUserId && ACTIVE_RIDE_STATUSES.has(ride.status as unknown as RideStatus)) {
      const driverProfile = await this.prisma.driverProfile.findUnique({
        where: { userId: ride.driverUserId },
        include: { location: true },
      });
      if (driverProfile?.location) {
        const driverPoint = { latitude: driverProfile.location.latitude, longitude: driverProfile.location.longitude };
        return { leg: 'driver_to_pickup' as const, ...(await this.routeProvider.getRoute(driverPoint, pickup)) };
      }
    }

    return { leg: 'pickup_to_destination' as const, ...(await this.routeProvider.getRoute(pickup, destination)) };
  }
}
