import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';

@Injectable()
export class DriverVehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateVehicleDto) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }

    const category = await this.prisma.vehicleCategory.findUnique({ where: { id: dto.vehicleCategoryId } });
    if (!category || !category.isActive) {
      throw new BadRequestException('Selected vehicle category is not available.');
    }

    const existingPlate = await this.prisma.vehicle.findUnique({ where: { plateNumber: dto.plateNumber } });
    if (existingPlate) {
      throw new ConflictException('A vehicle with this plate number is already registered.');
    }

    return this.prisma.vehicle.create({
      data: {
        driverProfileId: profile.id,
        vehicleCategoryId: dto.vehicleCategoryId,
        make: dto.make,
        model: dto.model,
        year: dto.year,
        colour: dto.colour,
        plateNumber: dto.plateNumber,
      },
    });
  }

  async list(userId: string) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }
    return this.prisma.vehicle.findMany({
      where: { driverProfileId: profile.id },
      include: { vehicleCategory: true, documents: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
