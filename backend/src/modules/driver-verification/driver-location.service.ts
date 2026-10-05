import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

interface UpdateLocationParams {
  userId: string;
  latitude: number;
  longitude: number;
  heading?: number;
  isOnline: boolean;
}

@Injectable()
export class DriverLocationService {
  constructor(private readonly prisma: PrismaService) {}

  async update(params: UpdateLocationParams) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId: params.userId } });
    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }

    return this.prisma.driverLocation.upsert({
      where: { driverProfileId: profile.id },
      create: {
        driverProfileId: profile.id,
        latitude: params.latitude,
        longitude: params.longitude,
        heading: params.heading,
        isOnline: params.isOnline,
      },
      update: {
        latitude: params.latitude,
        longitude: params.longitude,
        heading: params.heading,
        isOnline: params.isOnline,
      },
    });
  }

  /** Going offline is also forced whenever a driver goes inactive (e.g. suspended) elsewhere in the app. */
  async setOffline(driverProfileId: string): Promise<void> {
    await this.prisma.driverLocation.updateMany({
      where: { driverProfileId },
      data: { isOnline: false },
    });
  }

  /**
   * Updates only lat/lng/heading, leaving isOnline untouched. Used for
   * frequent in-trip WebSocket location pings, where online/offline is
   * deliberately not part of the payload — that's only ever set via the
   * explicit REST `update()` above, so a stray/late WS ping can never
   * silently flip a driver online or offline.
   *
   * Requires an existing DriverLocation row (i.e. the driver must have
   * gone online via REST at least once) — a driver cannot have an active
   * ride to ping location for without having done so.
   */
  async updatePositionOnly(userId: string, latitude: number, longitude: number, heading?: number) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }

    const result = await this.prisma.driverLocation.updateMany({
      where: { driverProfileId: profile.id },
      data: { latitude, longitude, heading },
    });

    if (result.count === 0) {
      throw new NotFoundException('Driver has no location record yet — go online via REST first.');
    }
  }
}
