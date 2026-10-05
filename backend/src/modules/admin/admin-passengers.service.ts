import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ListPassengersQueryDto } from './dto/list-passengers-query.dto';

@Injectable()
export class AdminPassengersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListPassengersQueryDto) {
    const where: Record<string, unknown> = {};
    if (query.status) {
      where.verificationStatus = query.status;
    }
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { user: { phone: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.passengerProfile.findMany({
        where: where as any,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          fullName: true,
          verificationStatus: true,
          createdAt: true,
          user: { select: { phone: true, status: true } },
        },
      }),
      this.prisma.passengerProfile.count({ where: where as any }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getDetail(passengerProfileId: string) {
    const profile = await this.prisma.passengerProfile.findUnique({
      where: { id: passengerProfileId },
      include: {
        user: { select: { id: true, phone: true, status: true, createdAt: true } },
      },
    });
    if (!profile) {
      throw new NotFoundException('Passenger not found.');
    }
    return profile;
  }

  async suspend(passengerProfileId: string) {
    const profile = await this.getDetail(passengerProfileId);
    await this.prisma.user.update({ where: { id: profile.userId }, data: { status: 'SUSPENDED' as any } });
    return this.prisma.passengerProfile.update({
      where: { id: passengerProfileId },
      data: { verificationStatus: 'SUSPENDED' as any },
    });
  }

  async activate(passengerProfileId: string) {
    const profile = await this.getDetail(passengerProfileId);
    await this.prisma.user.update({ where: { id: profile.userId }, data: { status: 'ACTIVE' as any } });
    // Restore to IDENTITY_VERIFIED if they had completed identity
    // verification before suspension, otherwise fall back to PHONE_VERIFIED.
    const verification = await this.prisma.identityVerification.findFirst({
      where: { userId: profile.userId, status: 'VERIFIED' as any },
    });
    return this.prisma.passengerProfile.update({
      where: { id: passengerProfileId },
      data: { verificationStatus: (verification ? 'IDENTITY_VERIFIED' : 'PHONE_VERIFIED') as any },
    });
  }
}
