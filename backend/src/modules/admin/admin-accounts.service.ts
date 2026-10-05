import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Role } from '../../common/enums/role.enum';

@Injectable()
export class AdminAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new ADMIN or SUPER_ADMIN account. There is no public
   * self-registration path for these roles — the OTP registration
   * endpoint only ever creates PASSENGER or DRIVER accounts. The created
   * admin logs in the same way as anyone else (phone + OTP); no password
   * is set here.
   */
  async createAdmin(phone: string, role: Role.ADMIN | Role.SUPER_ADMIN) {
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) {
      throw new ConflictException('An account with this phone number already exists.');
    }

    return this.prisma.user.create({
      data: { phone, role: role as any },
      select: { id: true, phone: true, role: true, createdAt: true },
    });
  }

  async listAdmins() {
    return this.prisma.user.findMany({
      where: { role: { in: [Role.ADMIN, Role.SUPER_ADMIN] as any } },
      select: { id: true, phone: true, role: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
