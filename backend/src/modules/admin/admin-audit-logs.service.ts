import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

@Injectable()
export class AdminAuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAuditLogsQueryDto) {
    const where: Record<string, unknown> = {};
    if (query.targetType) where.targetType = query.targetType;
    if (query.targetId) where.targetId = query.targetId;
    if (query.adminUserId) where.adminUserId = query.adminUserId;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.adminAuditLog.findMany({
        where: where as any,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        include: { adminUser: { select: { id: true, phone: true, role: true } } },
      }),
      this.prisma.adminAuditLog.count({ where: where as any }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
