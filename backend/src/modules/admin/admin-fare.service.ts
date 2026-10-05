import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateOperatingAreaDto, UpdateOperatingAreaDto } from './dto/operating-area.dto';
import { CreateVehicleCategoryDto, UpdateVehicleCategoryDto } from './dto/vehicle-category.dto';
import { CreateFareConfigurationDto } from './dto/create-fare-configuration.dto';
import { SetSurgeDto } from './dto/set-surge.dto';

@Injectable()
export class AdminFareService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Operating areas -------------------------------------------------

  async listOperatingAreas() {
    return this.prisma.operatingArea.findMany({ orderBy: { name: 'asc' } });
  }

  async createOperatingArea(dto: CreateOperatingAreaDto) {
    return this.prisma.operatingArea.create({ data: dto });
  }

  async updateOperatingArea(id: string, dto: UpdateOperatingAreaDto) {
    await this.getRequiredOperatingArea(id);
    return this.prisma.operatingArea.update({ where: { id }, data: dto });
  }

  private async getRequiredOperatingArea(id: string) {
    const area = await this.prisma.operatingArea.findUnique({ where: { id } });
    if (!area) throw new NotFoundException('Operating area not found.');
    return area;
  }

  // --- Vehicle categories ------------------------------------------------

  async listVehicleCategories() {
    return this.prisma.vehicleCategory.findMany({ orderBy: { name: 'asc' } });
  }

  async createVehicleCategory(dto: CreateVehicleCategoryDto) {
    return this.prisma.vehicleCategory.create({ data: dto });
  }

  async updateVehicleCategory(id: string, dto: UpdateVehicleCategoryDto) {
    await this.getRequiredVehicleCategory(id);
    return this.prisma.vehicleCategory.update({ where: { id }, data: dto });
  }

  private async getRequiredVehicleCategory(id: string) {
    const category = await this.prisma.vehicleCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Vehicle category not found.');
    return category;
  }

  // --- Fare configurations (versioned) -----------------------------------

  async listFareConfigurations(operatingAreaId?: string, vehicleCategoryId?: string) {
    return this.prisma.fareConfiguration.findMany({
      where: {
        ...(operatingAreaId ? { operatingAreaId } : {}),
        ...(vehicleCategoryId ? { vehicleCategoryId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { operatingArea: true, vehicleCategory: true },
    });
  }

  /**
   * Creates a new fare configuration for an (area, category) pair and
   * atomically deactivates any previously active configuration for the
   * same pair, so there is never more than one active price sheet at a
   * time and full pricing history is preserved (nothing is overwritten
   * or deleted).
   */
  async createFareConfiguration(dto: CreateFareConfigurationDto, adminUserId: string) {
    await this.getRequiredOperatingArea(dto.operatingAreaId);
    await this.getRequiredVehicleCategory(dto.vehicleCategoryId);

    return this.prisma.$transaction(async (tx) => {
      await tx.fareConfiguration.updateMany({
        where: {
          operatingAreaId: dto.operatingAreaId,
          vehicleCategoryId: dto.vehicleCategoryId,
          isActive: true,
        },
        data: { isActive: false },
      });

      return tx.fareConfiguration.create({
        data: {
          operatingAreaId: dto.operatingAreaId,
          vehicleCategoryId: dto.vehicleCategoryId,
          currency: dto.currency ?? 'NGN',
          baseFareKobo: dto.baseFareKobo,
          perKmRateKobo: dto.perKmRateKobo,
          perMinuteRateKobo: dto.perMinuteRateKobo,
          serviceFeeFlatKobo: dto.serviceFeeFlatKobo ?? 0,
          serviceFeePercentBasisPoints: dto.serviceFeePercentBasisPoints ?? 0,
          minimumFareKobo: dto.minimumFareKobo,
          cancellationFeeKobo: dto.cancellationFeeKobo ?? 0,
          platformCommissionBasisPoints: dto.platformCommissionBasisPoints ?? 0,
          isActive: true,
          createdByAdminId: adminUserId,
        },
      });
    });
  }

  async deactivateFareConfiguration(id: string) {
    const config = await this.prisma.fareConfiguration.findUnique({ where: { id } });
    if (!config) throw new NotFoundException('Fare configuration not found.');
    return this.prisma.fareConfiguration.update({ where: { id }, data: { isActive: false } });
  }

  // --- Surge --------------------------------------------------------------

  async listSurgeSettings(operatingAreaId?: string) {
    return this.prisma.surgeSetting.findMany({
      where: operatingAreaId ? { operatingAreaId } : {},
      orderBy: { createdAt: 'desc' },
      include: { operatingArea: true, vehicleCategory: true },
    });
  }

  /**
   * Sets (replaces) the active surge multiplier for an area, optionally
   * scoped to a single vehicle category. Deactivates any prior active
   * setting for the same (area, category) scope first, same
   * versioning pattern as fare configurations.
   */
  async setSurge(dto: SetSurgeDto, adminUserId: string) {
    await this.getRequiredOperatingArea(dto.operatingAreaId);
    if (dto.vehicleCategoryId) {
      await this.getRequiredVehicleCategory(dto.vehicleCategoryId);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.surgeSetting.updateMany({
        where: {
          operatingAreaId: dto.operatingAreaId,
          vehicleCategoryId: dto.vehicleCategoryId ?? null,
          isActive: true,
        },
        data: { isActive: false },
      });

      return tx.surgeSetting.create({
        data: {
          operatingAreaId: dto.operatingAreaId,
          vehicleCategoryId: dto.vehicleCategoryId,
          multiplierBasisPoints: dto.multiplierBasisPoints,
          reason: dto.reason,
          isActive: true,
          setByAdminId: adminUserId,
        },
      });
    });
  }

  async clearSurge(operatingAreaId: string, vehicleCategoryId?: string) {
    await this.getRequiredOperatingArea(operatingAreaId);
    return this.prisma.surgeSetting.updateMany({
      where: { operatingAreaId, vehicleCategoryId: vehicleCategoryId ?? null, isActive: true },
      data: { isActive: false },
    });
  }
}
