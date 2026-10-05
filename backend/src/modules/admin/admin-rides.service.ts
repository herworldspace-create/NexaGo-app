import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { RidesService } from '../rides/rides.service';
import { RideStatus, ACTIVE_RIDE_STATUSES } from '../../common/enums/ride-status.enum';
import { ListRidesQueryDto } from './dto/list-rides-query.dto';

@Injectable()
export class AdminRidesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ridesService: RidesService,
  ) {}

  async list(query: ListRidesQueryDto) {
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.operatingAreaId) where.operatingAreaId = query.operatingAreaId;
    if (query.search) {
      where.OR = [
        { passenger: { phone: { contains: query.search, mode: 'insensitive' } } },
        { driver: { phone: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.ride.findMany({
        where: where as any,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { requestedAt: 'desc' },
        select: {
          id: true,
          status: true,
          pickupAddress: true,
          destinationAddress: true,
          estimatedFareKobo: true,
          finalFareKobo: true,
          currency: true,
          requestedAt: true,
          completedAt: true,
          passenger: { select: { phone: true } },
          driver: { select: { phone: true } },
        },
      }),
      this.prisma.ride.count({ where: where as any }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Convenience view: rides currently in flight (requested or actively being fulfilled). */
  async listLive() {
    return this.prisma.ride.findMany({
      where: { status: { in: [RideStatus.REQUESTED, ...Array.from(ACTIVE_RIDE_STATUSES)] as any } },
      orderBy: { requestedAt: 'desc' },
      select: {
        id: true,
        status: true,
        pickupLat: true,
        pickupLng: true,
        pickupAddress: true,
        destinationAddress: true,
        estimatedFareKobo: true,
        currency: true,
        requestedAt: true,
        passenger: { select: { phone: true } },
        driver: { select: { phone: true } },
      },
    });
  }

  async getDetail(rideId: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        passenger: { select: { id: true, phone: true } },
        driver: { select: { id: true, phone: true } },
        vehicle: true,
        operatingArea: true,
        vehicleCategory: true,
        payment: { include: { transactions: true } },
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!ride) {
      throw new NotFoundException('Ride not found.');
    }
    return ride;
  }

  async cancel(rideId: string, adminUserId: string, reason?: string) {
    return this.ridesService.cancelBySystem(rideId, adminUserId, reason);
  }
}
