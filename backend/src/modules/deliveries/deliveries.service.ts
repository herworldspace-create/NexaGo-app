import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../config/prisma.service';
import { FareService } from '../fare/fare.service';
import { DriverVerificationService } from '../driver-verification/driver-verification.service';
import { SMS_PROVIDER, SmsProvider } from '../sms/sms-provider.interface';
import { Role } from '../../common/enums/role.enum';
import { VehicleCategoryType } from '../../common/enums/vehicle-category.enum';
import {
  ACTIVE_DELIVERY_STATUSES,
  DeliveryCancelledBy,
  DeliveryStatus,
} from '../../common/enums/delivery-status.enum';
import { DriverVerificationStatus } from '../../common/enums/verification-status.enum';
import { assertValidDeliveryTransition } from './delivery-status.state-machine';
import { boundingBox, haversineDistanceKm } from '../rides/geo.util';
import { MAX_AVAILABLE_RIDES_RETURNED, MAX_MATCHING_RADIUS_KM } from '../rides/matching.const';
import { hmacHash, constantTimeEquals } from '../../common/utils/hash.util';
import { AppConfigService } from '../../config/app-config.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';

const CONFIRMATION_PIN_LENGTH = 4;

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fareService: FareService,
    private readonly driverVerificationService: DriverVerificationService,
    private readonly config: AppConfigService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
  ) {}

  // --- Sender side -----------------------------------------------------------

  async createDelivery(senderUserId: string, dto: CreateDeliveryDto) {
    const category = await this.prisma.vehicleCategory.findUnique({ where: { id: dto.vehicleCategoryId } });
    if (!category || category.type !== (VehicleCategoryType.DELIVERY as any)) {
      throw new BadRequestException('Selected vehicle category is not a delivery category.');
    }

    const existingActive = await this.prisma.delivery.findFirst({
      where: {
        senderUserId,
        status: { in: [DeliveryStatus.REQUESTED, ...Array.from(ACTIVE_DELIVERY_STATUSES)] as any },
      },
    });
    if (existingActive) {
      throw new BadRequestException('You already have an active delivery request or delivery in progress.');
    }

    // Reuses the exact same fixed-price fare engine as rides — one
    // pricing/surge/commission system for the whole platform, not a
    // parallel one for deliveries.
    const fareEstimate = await this.fareService.estimate({
      operatingAreaId: dto.operatingAreaId,
      vehicleCategoryId: dto.vehicleCategoryId,
      distanceKm: dto.estimatedDistanceKm,
      durationMinutes: dto.estimatedDurationMinutes,
    });

    const pin = this.generatePin();
    const pinHash = hmacHash(pin, this.config.jwt.accessSecret);

    const delivery = await this.prisma.delivery.create({
      data: {
        senderUserId,
        operatingAreaId: dto.operatingAreaId,
        vehicleCategoryId: dto.vehicleCategoryId,
        status: DeliveryStatus.REQUESTED as any,
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        pickupAddress: dto.pickupAddress,
        dropoffLat: dto.dropoffLat,
        dropoffLng: dto.dropoffLng,
        dropoffAddress: dto.dropoffAddress,
        estimatedDistanceKm: dto.estimatedDistanceKm,
        estimatedDurationMinutes: dto.estimatedDurationMinutes,
        currency: fareEstimate.currency,
        estimatedFareKobo: fareEstimate.totalKobo,
        estimatedFareBreakdown: fareEstimate as any,
        platformCommissionBasisPoints: fareEstimate.platformCommissionBasisPoints,
        parcel: {
          create: {
            category: dto.package.category as any,
            weightTier: dto.package.weightTier as any,
            recipientName: dto.package.recipientName,
            recipientPhone: dto.package.recipientPhone,
            deliveryNotes: dto.package.deliveryNotes,
            confirmationPinHash: pinHash,
          },
        },
      },
      include: { parcel: true },
    });

    // Best-effort — the recipient may not have a NEXA account at all, so
    // this always goes over SMS, never through the in-app notification
    // system (which requires a userId).
    await this.smsProvider.send(
      dto.package.recipientPhone,
      `NEXA Deliver: your confirmation PIN is ${pin}. Give this to the courier only when your package arrives.`,
    );

    await this.recordHistory(delivery.id, DeliveryStatus.REQUESTED, senderUserId);
    return delivery;
  }

  async getCurrentForSender(senderUserId: string) {
    return this.prisma.delivery.findFirst({
      where: {
        senderUserId,
        status: { in: [DeliveryStatus.REQUESTED, ...Array.from(ACTIVE_DELIVERY_STATUSES)] as any },
      },
      orderBy: { requestedAt: 'desc' },
      include: {
        parcel: {
          select: { category: true, weightTier: true, recipientName: true, recipientPhone: true, deliveryNotes: true },
        },
      },
    });
  }

  async cancelBySender(deliveryId: string, senderUserId: string, reason?: string) {
    const delivery = await this.getRequiredDelivery(deliveryId);
    if (delivery.senderUserId !== senderUserId) {
      throw new ForbiddenException('This delivery does not belong to you.');
    }
    return this.cancel(delivery, DeliveryCancelledBy.SENDER, senderUserId, reason);
  }

  // --- Driver side -------------------------------------------------------------

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
      throw new BadRequestException('Go online to view nearby delivery requests.');
    }

    const alreadyBusy = await this.prisma.delivery.findFirst({
      where: { driverUserId, status: { in: Array.from(ACTIVE_DELIVERY_STATUSES) as any } },
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

    const candidates = await this.prisma.delivery.findMany({
      where: {
        status: DeliveryStatus.REQUESTED as any,
        vehicleCategoryId: { in: eligibleCategoryIds },
        pickupLat: { gte: box.minLat, lte: box.maxLat },
        pickupLng: { gte: box.minLng, lte: box.maxLng },
      },
      orderBy: { requestedAt: 'asc' },
      include: { parcel: { select: { category: true, weightTier: true } } },
    });

    return candidates
      .map((delivery) => ({
        ...delivery,
        distanceKm: haversineDistanceKm(driverPoint, { latitude: delivery.pickupLat, longitude: delivery.pickupLng }),
      }))
      .filter((delivery) => delivery.distanceKm <= MAX_MATCHING_RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, MAX_AVAILABLE_RIDES_RETURNED);
  }

  /** Same atomic compare-and-swap pattern as RidesService.acceptRide — see that method's doc comment. */
  async acceptDelivery(deliveryId: string, driverUserId: string) {
    await this.driverVerificationService.assertCanAcceptRides(driverUserId);

    const driverProfile = await this.prisma.driverProfile.findUnique({
      where: { userId: driverUserId },
      include: { location: true, vehicles: true },
    });
    if (!driverProfile) {
      throw new NotFoundException('Driver profile not found.');
    }
    if (!driverProfile.location?.isOnline) {
      throw new BadRequestException('You must be online to accept a delivery.');
    }

    const alreadyBusy = await this.prisma.delivery.findFirst({
      where: { driverUserId, status: { in: Array.from(ACTIVE_DELIVERY_STATUSES) as any } },
    });
    if (alreadyBusy) {
      throw new BadRequestException('You already have an active delivery.');
    }

    const delivery = await this.getRequiredDelivery(deliveryId);

    const matchingVehicle = driverProfile.vehicles.find(
      (v) => v.isActive && v.vehicleCategoryId === delivery.vehicleCategoryId,
    );
    if (!matchingVehicle) {
      throw new BadRequestException('You do not have an active vehicle registered for this delivery category.');
    }

    const result = await this.prisma.delivery.updateMany({
      where: { id: deliveryId, status: DeliveryStatus.REQUESTED as any },
      data: {
        status: DeliveryStatus.PACKAGE_PICKUP_PENDING as any,
        driverUserId,
        vehicleId: matchingVehicle.id,
        pickupPendingAt: new Date(),
      },
    });

    if (result.count === 0) {
      throw new ConflictException('This delivery is no longer available — another courier may have accepted it.');
    }

    await this.recordHistory(deliveryId, DeliveryStatus.PACKAGE_PICKUP_PENDING, driverUserId);
    return this.getRequiredDelivery(deliveryId);
  }

  async markPickedUp(deliveryId: string, driverUserId: string) {
    const delivery = await this.getOwnedByDriver(deliveryId, driverUserId);
    assertValidDeliveryTransition(delivery.status as unknown as DeliveryStatus, DeliveryStatus.PACKAGE_PICKED_UP);

    await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: DeliveryStatus.PACKAGE_PICKED_UP as any, pickedUpAt: new Date() },
    });
    await this.recordHistory(deliveryId, DeliveryStatus.PACKAGE_PICKED_UP, driverUserId);
    return this.getRequiredDelivery(deliveryId);
  }

  async startTransit(deliveryId: string, driverUserId: string) {
    const delivery = await this.getOwnedByDriver(deliveryId, driverUserId);
    assertValidDeliveryTransition(delivery.status as unknown as DeliveryStatus, DeliveryStatus.IN_TRANSIT);

    await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: DeliveryStatus.IN_TRANSIT as any, inTransitAt: new Date() },
    });
    await this.recordHistory(deliveryId, DeliveryStatus.IN_TRANSIT, driverUserId);
    return this.getRequiredDelivery(deliveryId);
  }

  /**
   * Recipient verification: the courier enters the 4-digit PIN the
   * recipient was sent at request time. Compared via HMAC + constant-time
   * equality — same treatment as OTP codes — never stored or compared in
   * plaintext. Only after a correct PIN does the delivery complete.
   *
   * Wallet crediting no longer happens here — it happens through
   * PaymentsService once the sender actually pays (cash confirmation or
   * a settled card webhook), exactly the same as RidesService.completeRide
   * never credits the wallet directly. This closes the scope boundary
   * flagged when Nexa Deliver was first built (deliveries used to settle
   * by crediting the wallet directly at completion, bypassing the
   * signature-verified/idempotent payment flow rides use).
   */
  async completeDelivery(deliveryId: string, driverUserId: string, pin: string) {
    const delivery = await this.getOwnedByDriver(deliveryId, driverUserId);
    assertValidDeliveryTransition(delivery.status as unknown as DeliveryStatus, DeliveryStatus.DELIVERED);

    const parcel = await this.prisma.parcel.findUnique({ where: { deliveryId } });
    if (!parcel) {
      throw new NotFoundException('Package details not found for this delivery.');
    }

    const candidateHash = hmacHash(pin, this.config.jwt.accessSecret);
    if (!constantTimeEquals(candidateHash, parcel.confirmationPinHash)) {
      throw new BadRequestException('Incorrect confirmation PIN.');
    }

    await this.prisma.parcel.update({ where: { deliveryId }, data: { pinVerifiedAt: new Date() } });

    const finalFareKobo = delivery.estimatedFareKobo;
    await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: DeliveryStatus.DELIVERED as any, deliveredAt: new Date(), finalFareKobo },
    });
    await this.recordHistory(deliveryId, DeliveryStatus.DELIVERED, driverUserId);

    return this.getRequiredDelivery(deliveryId);
  }

  async cancelByDriver(deliveryId: string, driverUserId: string, reason?: string) {
    const delivery = await this.getOwnedByDriver(deliveryId, driverUserId);
    return this.cancel(delivery, DeliveryCancelledBy.DRIVER, driverUserId, reason);
  }

  async getCurrentForDriver(driverUserId: string) {
    return this.prisma.delivery.findFirst({
      where: { driverUserId, status: { in: Array.from(ACTIVE_DELIVERY_STATUSES) as any } },
      orderBy: { pickupPendingAt: 'desc' },
    });
  }

  /** Best-effort dispatch candidate list — mirrors RidesService.findEligibleDriverUserIdsForDispatch exactly. */
  async findEligibleDriverUserIdsForDispatch(deliveryId: string): Promise<string[]> {
    const delivery = await this.getRequiredDelivery(deliveryId);
    const pickupPoint = { latitude: delivery.pickupLat, longitude: delivery.pickupLng };
    const box = boundingBox(pickupPoint, MAX_MATCHING_RADIUS_KM);

    const candidateLocations = await this.prisma.driverLocation.findMany({
      where: {
        isOnline: true,
        latitude: { gte: box.minLat, lte: box.maxLat },
        longitude: { gte: box.minLng, lte: box.maxLng },
      },
      include: { driverProfile: { include: { vehicles: true } } },
    });

    const busyDeliveries = await this.prisma.delivery.findMany({
      where: { status: { in: Array.from(ACTIVE_DELIVERY_STATUSES) as any } },
      select: { driverUserId: true },
    });
    const busyDriverUserIds = new Set(busyDeliveries.map((d) => d.driverUserId).filter((id): id is string => Boolean(id)));

    const eligible: string[] = [];
    for (const location of candidateLocations) {
      const driverProfile = location.driverProfile;
      if (!driverProfile) continue;
      if (driverProfile.verificationStatus !== (DriverVerificationStatus.ACTIVE as any)) continue;
      if (busyDriverUserIds.has(driverProfile.userId)) continue;

      const hasMatchingVehicle = driverProfile.vehicles.some(
        (v) => v.isActive && v.vehicleCategoryId === delivery.vehicleCategoryId,
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

  // --- Shared ------------------------------------------------------------------

  async getDelivery(deliveryId: string, requestingUserId: string, requestingRole: Role) {
    const delivery = await this.getRequiredDelivery(deliveryId);
    const isParty = delivery.senderUserId === requestingUserId || delivery.driverUserId === requestingUserId;
    const isAdmin = requestingRole === Role.ADMIN || requestingRole === Role.SUPER_ADMIN;
    if (!isParty && !isAdmin) {
      throw new ForbiddenException('You do not have access to this delivery.');
    }
    return delivery;
  }

  private async cancel(
    delivery: { id: string; status: string },
    by: DeliveryCancelledBy,
    actorUserId: string,
    reason?: string,
  ) {
    const targetStatusByActor: Record<DeliveryCancelledBy, DeliveryStatus> = {
      [DeliveryCancelledBy.SENDER]: DeliveryStatus.CANCELLED_BY_SENDER,
      [DeliveryCancelledBy.DRIVER]: DeliveryStatus.CANCELLED_BY_DRIVER,
      [DeliveryCancelledBy.SYSTEM]: DeliveryStatus.CANCELLED_SYSTEM,
    };
    const targetStatus = targetStatusByActor[by];
    assertValidDeliveryTransition(delivery.status as unknown as DeliveryStatus, targetStatus);

    await this.prisma.delivery.update({
      where: { id: delivery.id },
      data: { status: targetStatus as any, cancelledAt: new Date(), cancelledBy: by as any, cancellationReason: reason },
    });
    await this.recordHistory(delivery.id, targetStatus, actorUserId, reason);
    return this.getRequiredDelivery(delivery.id);
  }

  private async getOwnedByDriver(deliveryId: string, driverUserId: string) {
    const delivery = await this.getRequiredDelivery(deliveryId);
    if (delivery.driverUserId !== driverUserId) {
      throw new ForbiddenException('This delivery is not assigned to you.');
    }
    return delivery;
  }

  private async getRequiredDelivery(deliveryId: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) {
      throw new NotFoundException('Delivery not found.');
    }
    return delivery;
  }

  private async recordHistory(deliveryId: string, status: DeliveryStatus, changedByUserId?: string, reason?: string) {
    await this.prisma.deliveryStatusHistory.create({
      data: { deliveryId, status: status as any, changedByUserId, reason },
    });

    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: { senderUserId: true, driverUserId: true },
    });
    this.eventEmitter.emit('delivery.status_changed', {
      deliveryId,
      status,
      senderUserId: delivery?.senderUserId,
      driverUserId: delivery?.driverUserId,
      reason,
    });
  }

  private generatePin(): string {
    const max = 10 ** CONFIRMATION_PIN_LENGTH;
    return randomInt(0, max).toString().padStart(CONFIRMATION_PIN_LENGTH, '0');
  }
}
