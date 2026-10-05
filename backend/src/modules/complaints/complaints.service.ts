import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';

@Injectable()
export class ComplaintsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(raisedByUserId: string, dto: CreateComplaintDto) {
    let againstUserId: string | undefined;

    if (dto.rideId) {
      const ride = await this.prisma.ride.findUnique({ where: { id: dto.rideId } });
      if (!ride) {
        throw new NotFoundException('Ride not found.');
      }
      if (ride.passengerUserId !== raisedByUserId && ride.driverUserId !== raisedByUserId) {
        throw new ForbiddenException('You were not a party to this ride.');
      }
      // Best-effort default: the other party on the ride. Left undefined
      // (not guessed) when the complaint isn't about the counterpart —
      // e.g. the rider was alone in the car and driverUserId is null.
      againstUserId =
        ride.passengerUserId === raisedByUserId ? (ride.driverUserId ?? undefined) : ride.passengerUserId;
    }

    return this.prisma.complaint.create({
      data: {
        rideId: dto.rideId,
        raisedByUserId,
        againstUserId,
        category: dto.category as any,
        description: dto.description,
      },
    });
  }

  async listMine(userId: string) {
    return this.prisma.complaint.findMany({
      where: { raisedByUserId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMine(userId: string, complaintId: string) {
    const complaint = await this.prisma.complaint.findUnique({ where: { id: complaintId } });
    if (!complaint) {
      throw new NotFoundException('Complaint not found.');
    }
    if (complaint.raisedByUserId !== userId) {
      throw new ForbiddenException('This complaint does not belong to you.');
    }
    return complaint;
  }
}
