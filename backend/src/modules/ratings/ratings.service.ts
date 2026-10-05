import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { RideStatus } from '../../common/enums/ride-status.enum';
import { SubmitRatingDto } from './dto/submit-rating.dto';

const PRISMA_UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

@Injectable()
export class RatingsService {
  constructor(private readonly prisma: PrismaService) {}

  async submitRating(rideId: string, raterUserId: string, dto: SubmitRatingDto) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) {
      throw new NotFoundException('Ride not found.');
    }
    if (ride.status !== (RideStatus.COMPLETED as any)) {
      throw new BadRequestException('You can only rate a completed ride.');
    }

    let ratedUserId: string;
    if (ride.passengerUserId === raterUserId) {
      if (!ride.driverUserId) {
        throw new BadRequestException('This ride has no driver to rate.');
      }
      ratedUserId = ride.driverUserId;
    } else if (ride.driverUserId === raterUserId) {
      ratedUserId = ride.passengerUserId;
    } else {
      throw new ForbiddenException('You were not a party to this ride.');
    }

    let rating;
    try {
      rating = await this.prisma.rating.create({
        data: { rideId, raterUserId, ratedUserId, score: dto.score, comment: dto.comment },
      });
    } catch (error: any) {
      // The unique constraint on (rideId, raterUserId) is the real,
      // race-safe enforcement — this just turns a concurrent duplicate
      // submission into a clean error instead of a raw DB exception.
      if (error?.code === PRISMA_UNIQUE_CONSTRAINT_VIOLATION) {
        throw new BadRequestException('You have already rated this ride.');
      }
      throw error;
    }

    await this.applyRatingToProfile(ratedUserId, ride.driverUserId === ratedUserId, dto.score);
    return rating;
  }

  async getForRide(rideId: string, requestingUserId: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) {
      throw new NotFoundException('Ride not found.');
    }
    if (ride.passengerUserId !== requestingUserId && ride.driverUserId !== requestingUserId) {
      throw new ForbiddenException('You were not a party to this ride.');
    }
    return this.prisma.rating.findMany({ where: { rideId } });
  }

  async getProfileRatingSummary(userId: string, isDriver: boolean) {
    const profile = isDriver
      ? await this.prisma.driverProfile.findUnique({ where: { userId }, select: { ratingsSum: true, ratingsCount: true } })
      : await this.prisma.passengerProfile.findUnique({ where: { userId }, select: { ratingsSum: true, ratingsCount: true } });

    if (!profile || profile.ratingsCount === 0) {
      return { average: null, count: 0 };
    }
    return { average: profile.ratingsSum / profile.ratingsCount, count: profile.ratingsCount };
  }

  /**
   * Atomic increment on both sum and count — no read-then-write race
   * regardless of how many ratings land concurrently. The average is
   * always derived (sum / count) rather than stored, so it can never
   * drift out of sync with its inputs.
   */
  private async applyRatingToProfile(ratedUserId: string, ratedIsDriver: boolean, score: number): Promise<void> {
    if (ratedIsDriver) {
      await this.prisma.driverProfile.updateMany({
        where: { userId: ratedUserId },
        data: { ratingsSum: { increment: score }, ratingsCount: { increment: 1 } },
      });
    } else {
      await this.prisma.passengerProfile.updateMany({
        where: { userId: ratedUserId },
        data: { ratingsSum: { increment: score }, ratingsCount: { increment: 1 } },
      });
    }
  }
}
