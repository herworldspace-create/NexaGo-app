import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ComplaintStatus } from '../../common/enums/complaint.enum';
import { ListComplaintsQueryDto } from './dto/list-complaints-query.dto';

const TERMINAL_STATUSES = new Set([ComplaintStatus.RESOLVED, ComplaintStatus.DISMISSED]);

@Injectable()
export class AdminComplaintsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListComplaintsQueryDto) {
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.complaint.findMany({
        where: where as any,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          raisedBy: { select: { id: true, phone: true } },
          against: { select: { id: true, phone: true } },
        },
      }),
      this.prisma.complaint.count({ where: where as any }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getDetail(complaintId: string) {
    const complaint = await this.prisma.complaint.findUnique({
      where: { id: complaintId },
      include: {
        raisedBy: { select: { id: true, phone: true } },
        against: { select: { id: true, phone: true } },
        ride: true,
      },
    });
    if (!complaint) {
      throw new NotFoundException('Complaint not found.');
    }
    return complaint;
  }

  async markInReview(complaintId: string) {
    const complaint = await this.getRequired(complaintId);
    this.assertNotResolved(complaint.status as ComplaintStatus);
    return this.prisma.complaint.update({
      where: { id: complaintId },
      data: { status: ComplaintStatus.IN_REVIEW as any },
    });
  }

  async resolve(complaintId: string, adminUserId: string, resolutionNote: string) {
    const complaint = await this.getRequired(complaintId);
    this.assertNotResolved(complaint.status as ComplaintStatus);
    return this.prisma.complaint.update({
      where: { id: complaintId },
      data: {
        status: ComplaintStatus.RESOLVED as any,
        resolutionNote,
        resolvedByAdminId: adminUserId,
        resolvedAt: new Date(),
      },
    });
  }

  async dismiss(complaintId: string, adminUserId: string, resolutionNote: string) {
    const complaint = await this.getRequired(complaintId);
    this.assertNotResolved(complaint.status as ComplaintStatus);
    return this.prisma.complaint.update({
      where: { id: complaintId },
      data: {
        status: ComplaintStatus.DISMISSED as any,
        resolutionNote,
        resolvedByAdminId: adminUserId,
        resolvedAt: new Date(),
      },
    });
  }

  private async getRequired(complaintId: string) {
    const complaint = await this.prisma.complaint.findUnique({ where: { id: complaintId } });
    if (!complaint) {
      throw new NotFoundException('Complaint not found.');
    }
    return complaint;
  }

  private assertNotResolved(status: ComplaintStatus): void {
    if (TERMINAL_STATUSES.has(status)) {
      throw new BadRequestException('This complaint has already been resolved or dismissed.');
    }
  }
}
