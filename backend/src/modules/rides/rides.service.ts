import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../config/prisma.service';
import { FareService } from '../fare/fare.service';
import { DriverVerificationService } from '../driver-verification/driver-verification.service';
import { Role } from '../../common/enums/role.enum';
import { PassengerVerificationStatus, DriverVerificationStatus } from '../../common/enums/verification-status.enum';
import { ACTIVE_RIDE_STATUSES, TERMINAL_RIDE_STATUSES, RideCancelledBy, RideStatus } from '../../common/enums/ride-status.enum';
import { assertValidRideTransition } from './ride-status.state-machine';
import { boundingBox, haversineDistanceKm } from './geo.util';
import { MAX_AVAILABLE_RIDES_RETURNED, MAX_MATCHING_RADIUS_KM } from './matching.const';
import { CreateRideDto } from './dto/create-ride.dto';
import { UpdateRideDestinationDto } from './dto/update-ride-destination.dto';

@Injectable()
export class RidesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fareService: FareService,
    private readonly driverVerificationService: DriverVerificationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // --- Passenger side ------------------------------------------------------

  async createRide(passengerUserId: string, dto: CreateRideDto) {
    const passengerProfile = await this.prisma.passengerProfile.findUnique({
      where: { userId: passengerUserId },
    });
    if (
      !passengerProfile ||
      passengerProfile.verificationStatus !== (PassengerVerificationStatus.IDENTITY_VERIFIED as any)
    ) {
      throw new BadRequestException('Identity verification must be completed before requesting a ride.');
    }

    const existingActive = await this.prisma.ride.findFirst({
      where: {
        passengerUserId,
        status: { in: [RideStatus.REQUESTED, ...Array.from(ACTIVE_RIDE_STATUSES)] as any },
      },
    });
    if (existingActive) {
      throw new BadRequestException('You already have an active ride request or ride in progress.');
    }

    // Validates the area/category pair and resolves the current active
    // fare configuration + surge — throws NotFoundException if none exists.
    const fareEstimate = await this.fareService.estimate({
      operatingAreaId: dto.operatingAreaId,
      vehicleCategoryId: dto.vehicleCategoryId,
      distanceKm: dto.estimatedDistanceKm,
      durationMinutes: dto.estimatedDurationMinutes,
    });

    const ride = await this.prisma.ride.create({
      data: {
        passengerUserId,
        operatingAreaId: dto.operatingAreaId,
        vehicleCategoryId: dto.vehicleCategoryId,
        status: RideStatus.REQUESTED as any,
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        pickupAddress: dto.pickupAddress,
        destinationLat: dto.destinationLat,
        destinationLng: dto.destinationLng,
        destinationAddress: dto.destinationAddress,
        estimatedDistanceKm: dto.estimatedDistanceKm,
        estimatedDurationMinutes: dto.estimatedDurationMinutes,
        currency: fareEstimate.currency,
        estimatedFareKobo: fareEstimate.totalKobo,
        estimatedFareBreakdown: fareEstimate as any,
        platformCommissionBasisPoints: fareEstimate.platformCommissionBasisPoints,
      },
    });

    await this.recordHistory(ride.id, RideStatus.REQUESTED, passengerUserId);
    return ride;
  }

  async getCurrentForPassenger(passengerUserId: string) {
    return this.prisma.ride.findFirst({
      where: {
        passengerUserId,
        status: { in: [RideStatus.REQUESTED, ...Array.from(ACTIVE_RIDE_STATUSES)] as any },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async cancelByPassenger(rideId: string, passengerUserId: string, reason?: string) {
    const ride = await this.getRequiredRide(rideId);
    if (ride.passengerUserId !== passengerUserId) {
      throw new ForbiddenException('This ride does not belong to you.');
    }
    return this.cancel(ride, RideCancelledBy.PASSENGER, passengerUserId, reason);
  }

  /**
   * The ONLY path by which a locked-in fare is allowed to change post
   * request — an explicit passenger-initiated destination/route update.
   * Nothing else (surge drift, a config change, driver detour) may alter
   * `estimatedFareKobo` once a ride exists; that fixed-price guarantee is
   * what makes the upfront quote meaningful. Every change is versioned
   * into RideFareRevision (never overwritten silently) for transparency.
   */
  async updateDestination(rideId: string, passengerUserId: string, dto: UpdateRideDestinationDto) {
    const ride = await this.getRequiredRide(rideId);
    if (ride.passengerUserId !== passengerUserId) {
      throw new ForbiddenException('This ride does not belong to you.');
    }
    if (TERMINAL_RIDE_STATUSES.has(ride.status as unknown as RideStatus)) {
      throw new BadRequestException('This ride has already ended and its destination can no longer be changed.');
    }

    const newFareEstimate = await this.fareService.estimate({
      operatingAreaId: ride.operatingAreaId,
      vehicleCategoryId: ride.vehicleCategoryId,
      distanceKm: dto.estimatedDistanceKm,
      durationMinutes: dto.estimatedDurationMinutes,
    });

    await this.prisma.rideFareRevision.create({
      data: {
        rideId,
        previousDestinationLat: ride.destinationLat,
        previousDestinationLng: ride.destinationLng,
        newDestinationLat: dto.destinationLat,
        newDestinationLng: dto.destinationLng,
        previousEstimatedFareKobo: ride.estimatedFareKobo,
        newEstimatedFareKobo: newFareEstimate.totalKobo,
        newEstimatedFareBreakdown: newFareEstimate as any,
        reason: dto.reason,
        revisedByUserId: passengerUserId,
      },
    });

    const updated = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        destinationLat: dto.destinationLat,
        destinationLng: dto.destinationLng,
        destinationAddress: dto.destinationAddress,
        estimatedDistanceKm: dto.estimatedDistanceKm,
        estimatedDurationMinutes: dto.estimatedDurationMinutes,
        estimatedFareKobo: newFareEstimate.totalKobo,
        estimatedFareBreakdown: newFareEstimate as any,
        platformCommissionBasisPoints: newFareEstimate.platformCommissionBasisPoints,
      },
    });

    this.eventEmitter.emit('ride.fare_updated', {
      rideId,
      passengerUserId: ride.passengerUserId,
      driverUserId: ride.driverUserId,
      newEstimatedFareKobo: newFareEstimate.totalKobo,
    });

    return updated;
  }

  async getFareRevisions(rideId: string, requestingUserId: string, requestingRole: Role) {
    await this.getRide(rideId, requestingUserId, requestingRole); // reuses the same authorization rule
    return this.prisma.rideFareRevision.findMany({ where: { rideId }, orderBy: { createdAt: 'desc' } });
  }

  // --- Driver side -----------------------------------------------------------

  async listAvailableForDriver(driverUserId: string) {
    await this.driverVerificationService.assertCanAcceptRides(driverUserId);

    const driverProfile = await this.prisma.driverProfile.findUnique({
      where: { userId: driverUserId },
      include: { location: true, vehicles: true },
    });
    if (!driverProfile) {
      throw new NotFoundException('Driver profile not found.');
    }
    if (!driverProfile.location || !driverProfile.location.isOnline) {
      throw new BadRequestException('Go online to view nearby ride requests.');
    }

    const alreadyBusy = await this.prisma.ride.findFirst({
      where: { driverUserId, status: { in: Array.from(ACTIVE_RIDE_STATUSES) as any } },
    });
    if (alreadyBusy) {
      return [];
    }

    const eligibleCategoryIds = Array.from(
      new Set(
        driverProfile.vehicles
          .filter((v) => v.isActive && v.vehicleCategoryId)
          .map((v) => v.vehicleCategoryId as string),
      ),
    );
    if (eligibleCategoryIds.length === 0) {
      return [];
    }

    const driverPoint = { latitude: driverProfile.location.latitude, longitude: driverProfile.location.longitude };
    const box = boundingBox(driverPoint, MAX_MATCHING_RADIUS_KM);

    const candidates = await this.prisma.ride.findMany({
      where: {
        status: RideStatus.REQUESTED as any,
        vehicleCategoryId: { in: eligibleCategoryIds },
        pickupLat: { gte: box.minLat, lte: box.maxLat },
        pickupLng: { gte: box.minLng, lte: box.maxLng },
      },
      orderBy: { requestedAt: 'asc' },
    });

    return candidates
      .map((ride) => ({
        ...ride,
        distanceKm: haversineDistanceKm(driverPoint, { latitude: ride.pickupLat, longitude: ride.pickupLng }),
      }))
      .filter((ride) => ride.distanceKm <= MAX_MATCHING_RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, MAX_AVAILABLE_RIDES_RETURNED);
  }

  /**
   * Atomically accepts a ride: the conditional `WHERE status = REQUESTED`
   * update ensures that if two drivers accept concurrently, only the
   * first succeeds — the second gets affected-row-count 0 and a
   * ConflictException, never a corrupted double-assignment.
   */
  async acceptRide(rideId: string, driverUserId: string) {
    await this.driverVerificationService.assertCanAcceptRides(driverUserId);

    const driverProfile = await this.prisma.driverProfile.findUnique({
      where: { userId: driverUserId },
      include: { location: true, vehicles: true },
    });
    if (!driverProfile) {
      throw new NotFoundException('Driver profile not found.');
    }
    if (!driverProfile.location?.isOnline) {
      throw new BadRequestException('You must be online to accept a ride.');
    }

    const alreadyBusy = await this.prisma.ride.findFirst({
      where: { driverUserId, status: { in: Array.from(ACTIVE_RIDE_STATUSES) as any } },
    });
    if (alreadyBusy) {
      throw new BadRequestException('You already have an active ride.');
    }

    const ride = await this.getRequiredRide(rideId);

    const matchingVehicle = driverProfile.vehicles.find(
      (v) => v.isActive && v.vehicleCategoryId === ride.vehicleCategoryId,
    );
    if (!matchingVehicle) {
      throw new BadRequestException('You do not have an active vehicle registered for this ride category.');
    }

    const result = await this.prisma.ride.updateMany({
      where: { id: rideId, status: RideStatus.REQUESTED as any },
      data: {
        status: RideStatus.ACCEPTED as any,
        driverUserId,
        vehicleId: matchingVehicle.id,
        acceptedAt: new Date(),
      },
    });

    if (result.count === 0) {
      throw new ConflictException('This ride is no longer available — another driver may have accepted it.');
    }

    await this.recordHistory(rideId, RideStatus.ACCEPTED, driverUserId);
    return this.getRequiredRide(rideId);
  }

  async markArrived(rideId: string, driverUserId: string) {
    const ride = await this.getOwnedByDriver(rideId, driverUserId);
    assertValidRideTransition(ride.status as unknown as RideStatus, RideStatus.DRIVER_ARRIVED);

    await this.prisma.ride.update({
      where: { id: rideId },
      data: { status: RideStatus.DRIVER_ARRIVED as any, driverArrivedAt: new Date() },
    });
    await this.recordHistory(rideId, RideStatus.DRIVER_ARRIVED, driverUserId);
    return this.getRequiredRide(rideId);
  }

  async startRide(rideId: string, driverUserId: string) {
    const ride = await this.getOwnedByDriver(rideId, driverUserId);
    assertValidRideTransition(ride.status as unknown as RideStatus, RideStatus.IN_PROGRESS);

    await this.prisma.ride.update({
      where: { id: rideId },
      data: { status: RideStatus.IN_PROGRESS as any, startedAt: new Date() },
    });
    await this.recordHistory(rideId, RideStatus.IN_PROGRESS, driverUserId);
    return this.getRequiredRide(rideId);
  }

  /**
   * The final fare is set equal to the estimate for now — there is no
   * live GPS-metered distance/time in this phase (that requires the
   * real-time tracking phase). Revisit once actual trip telemetry exists.
   */
  async completeRide(rideId: string, driverUserId: string) {
    const ride = await this.getOwnedByDriver(rideId, driverUserId);
    assertValidRideTransition(ride.status as unknown as RideStatus, RideStatus.COMPLETED);

    await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        status: RideStatus.COMPLETED as any,
        completedAt: new Date(),
        finalFareKobo: ride.estimatedFareKobo,
      },
    });
    await this.recordHistory(rideId, RideStatus.COMPLETED, driverUserId);
    return this.getRequiredRide(rideId);
  }

  async cancelByDriver(rideId: string, driverUserId: string, reason?: string) {
    const ride = await this.getOwnedByDriver(rideId, driverUserId);
    return this.cancel(ride, RideCancelledBy.DRIVER, driverUserId, reason);
  }

  /** Admin/support cancellation. Unlike passenger/driver cancellation, this is allowed even mid-trip (see state machine: IN_PROGRESS -> CANCELLED_SYSTEM). */
  async cancelBySystem(rideId: string, adminUserId: string, reason?: string) {
    const ride = await this.getRequiredRide(rideId);
    return this.cancel(ride, RideCancelledBy.SYSTEM, adminUserId, reason);
  }

  async getCurrentForDriver(driverUserId: string) {
    return this.prisma.ride.findFirst({
      where: { driverUserId, status: { in: Array.from(ACTIVE_RIDE_STATUSES) as any } },
      orderBy: { acceptedAt: 'desc' },
    });
  }

  /**
   * Best-effort candidate list for push-notification dispatch (used by
   * NotificationsModule), NOT the authoritative eligibility check —
   * that remains `acceptRide`'s job. Deliberately lighter-weight than
   * `DriverVerificationService.assertCanAcceptRides` (skips the
   * per-document expiry check, which would mean one extra query per
   * candidate) since this only decides who gets pinged; a driver whose
   * eligibility lapsed in the interim will simply fail validation if
   * they try to accept, with a clear error, same as any other race.
   */
  async findEligibleDriverUserIdsForDispatch(rideId: string): Promise<string[]> {
    const ride = await this.getRequiredRide(rideId);
    const pickupPoint = { latitude: ride.pickupLat, longitude: ride.pickupLng };
    const box = boundingBox(pickupPoint, MAX_MATCHING_RADIUS_KM);

    const candidateLocations = await this.prisma.driverLocation.findMany({
      where: {
        isOnline: true,
        latitude: { gte: box.minLat, lte: box.maxLat },
        longitude: { gte: box.minLng, lte: box.maxLng },
      },
      include: { driverProfile: { include: { vehicles: true } } },
    });

    const busyRides = await this.prisma.ride.findMany({
      where: { status: { in: Array.from(ACTIVE_RIDE_STATUSES) as any } },
      select: { driverUserId: true },
    });
    const busyDriverUserIds = new Set(busyRides.map((r) => r.driverUserId).filter((id): id is string => Boolean(id)));

    const eligible: string[] = [];
    for (const location of candidateLocations) {
      const driverProfile = location.driverProfile;
      if (!driverProfile) continue;
      if (driverProfile.verificationStatus !== (DriverVerificationStatus.ACTIVE as any)) continue;
      if (busyDriverUserIds.has(driverProfile.userId)) continue;

      const hasMatchingVehicle = driverProfile.vehicles.some(
        (v) => v.isActive && v.vehicleCategoryId === ride.vehicleCategoryId,
      );
      if (!hasMatchingVehicle) continue;

      const distanceKm = haversineDistanceKm(pickupPoint, {
        latitude: location.latitude,
        longitude: location.longitude,
      });
      if (distanceKm > MAX_MATCHING_RADIUS_KM) continue;

      eligible.push(driverProfile.userId);
    }
    return eligible;
  }

  // --- Shared ----------------------------------------------------------------

  async getRide(rideId: string, requestingUserId: string, requestingRole: Role) {
    const ride = await this.getRequiredRide(rideId);
    const isParty = ride.passengerUserId === requestingUserId || ride.driverUserId === requestingUserId;
    const isAdmin = requestingRole === Role.ADMIN || requestingRole === Role.SUPER_ADMIN;
    if (!isParty && !isAdmin) {
      throw new ForbiddenException('You do not have access to this ride.');
    }
    return ride;
  }

  private async cancel(ride: { id: string; status: string }, by: RideCancelledBy, actorUserId: string, reason?: string) {
    const targetStatusByActor: Record<RideCancelledBy, RideStatus> = {
      [RideCancelledBy.PASSENGER]: RideStatus.CANCELLED_BY_PASSENGER,
      [RideCancelledBy.DRIVER]: RideStatus.CANCELLED_BY_DRIVER,
      [RideCancelledBy.SYSTEM]: RideStatus.CANCELLED_SYSTEM,
    };
    const targetStatus = targetStatusByActor[by];
    assertValidRideTransition(ride.status as unknown as RideStatus, targetStatus);

    await this.prisma.ride.update({
      where: { id: ride.id },
      data: {
        status: targetStatus as any,
        cancelledAt: new Date(),
        cancelledBy: by as any,
        cancellationReason: reason,
      },
    });
    await this.recordHistory(ride.id, targetStatus, actorUserId, reason);
    return this.getRequiredRide(ride.id);
  }

  private async getOwnedByDriver(rideId: string, driverUserId: string) {
    const ride = await this.getRequiredRide(rideId);
    if (ride.driverUserId !== driverUserId) {
      throw new ForbiddenException('This ride is not assigned to you.');
    }
    return ride;
  }

  private async getRequiredRide(rideId: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) {
      throw new NotFoundException('Ride not found.');
    }
    return ride;
  }

  private async recordHistory(rideId: string, status: RideStatus, changedByUserId?: string, reason?: string) {
    await this.prisma.rideStatusHistory.create({
      data: { rideId, status: status as any, changedByUserId, reason },
    });

    // Decoupled from any transport concern — RealtimeModule's gateway (if
    // present) listens for this and pushes to the relevant WebSocket
    // rooms. RidesService has no knowledge of sockets/rooms/broadcasting.
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      select: { passengerUserId: true, driverUserId: true },
    });
    this.eventEmitter.emit('ride.status_changed', {
      rideId,
      status,
      passengerUserId: ride?.passengerUserId,
      driverUserId: ride?.driverUserId,
      reason,
    });
  }
}
