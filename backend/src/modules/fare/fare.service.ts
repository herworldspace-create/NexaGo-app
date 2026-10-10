
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { computeFare, FareBreakdown } from './fare-calculation.util';

@Injectable()
export class FareService {
  constructor(private readonly prisma: PrismaService) {}

  async estimate(params: {
    operatingAreaId: string;
    vehicleCategoryId: string;
    distanceKm: number;
    durationMinutes: number;
  }): Promise<
    FareBreakdown & {
      operatingAreaId: string;
      vehicleCategoryId: string;
    }
  > {
    const config = await this.prisma.fareConfiguration.findFirst({
      where: {
        operatingAreaId: params.operatingAreaId,
        vehicleCategoryId: params.vehicleCategoryId,
        isActive: true,
      },
    });

    if (!config) {
      throw new NotFoundException(
        'No active fare configuration exists for this area and vehicle category yet.',
      );
    }

    if (params.distanceKm < 0 || params.durationMinutes < 0) {
      throw new BadRequestException(
        'Distance and duration must not be negative.',
      );
    }

    const surge = await this.resolveSurgeMultiplier(
      params.operatingAreaId,
      params.vehicleCategoryId,
    );

    const breakdown = computeFare({
      config: {
        currency: config.currency,
        baseFareKobo: config.baseFareKobo,
        perKmRateKobo: config.perKmRateKobo,
        perMinuteRateKobo: config.perMinuteRateKobo,
        serviceFeeFlatKobo: config.serviceFeeFlatKobo,
        serviceFeePercentBasisPoints:
          config.serviceFeePercentBasisPoints,
        minimumFareKobo: config.minimumFareKobo,
        platformCommissionBasisPoints:
          config.platformCommissionBasisPoints,
      },
      distanceKm: params.distanceKm,
      durationMinutes: params.durationMinutes,
      surgeMultiplierBasisPoints: surge,
    });

    return {
      ...breakdown,
      operatingAreaId: params.operatingAreaId,
      vehicleCategoryId: params.vehicleCategoryId,
    };
  }

  /**
   * Returns active operating areas for authenticated users.
   */
  async listActiveOperatingAreas() {
    return this.prisma.operatingArea.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        state: true,
        isActive: true,
      },
    });
  }

  /**
   * Returns active passenger vehicle categories only.
   * Delivery categories are excluded.
   */
  async listActivePassengerCategories() {
    return this.prisma.vehicleCategory.findMany({
      where: {
        isActive: true,
        type: 'PASSENGER',
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        type: true,
        isActive: true,
      },
    });
  }

  /**
   * A category-specific active surge setting takes precedence
   * over an area-wide setting. Defaults to 1.00x.
   */
  private async resolveSurgeMultiplier(
    operatingAreaId: string,
    vehicleCategoryId: string,
  ): Promise<number> {
    const categorySpecific =
      await this.prisma.surgeSetting.findFirst({
        where: {
          operatingAreaId,
          vehicleCategoryId,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      });

    if (categorySpecific) {
      return categorySpecific.multiplierBasisPoints;
    }

    const areaWide = await this.prisma.surgeSetting.findFirst({
      where: {
        operatingAreaId,
        vehicleCategoryId: null,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (areaWide) {
      return areaWide.multiplierBasisPoints;
    }

    return 10_000;
  }
}
