import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        phoneVerifiedAt: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        passengerProfile: {
          select: { fullName: true, profilePhotoUrl: true, verificationStatus: true },
        },
        driverProfile: {
          select: { fullName: true, verificationStatus: true, licenceExpiryDate: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    // NIN and document contents are intentionally never included here.
    return user;
  }
}
