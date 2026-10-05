import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminComplaintsService } from './admin-complaints.service';
import { PrismaService } from '../../config/prisma.service';
import { ComplaintStatus } from '../../common/enums/complaint.enum';

function buildPrismaMock() {
  return {
    complaint: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  };
}

describe('AdminComplaintsService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: AdminComplaintsService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new AdminComplaintsService(prisma as unknown as PrismaService);
  });

  it('throws for a nonexistent complaint', async () => {
    prisma.complaint.findUnique.mockResolvedValue(null);
    await expect(service.resolve('missing', 'admin-1', 'reason')).rejects.toThrow(NotFoundException);
  });

  it('allows moving OPEN -> IN_REVIEW', async () => {
    prisma.complaint.findUnique.mockResolvedValue({ id: 'c1', status: ComplaintStatus.OPEN });
    prisma.complaint.update.mockResolvedValue({ id: 'c1', status: ComplaintStatus.IN_REVIEW });

    const result = await service.markInReview('c1');
    expect(result.status).toBe(ComplaintStatus.IN_REVIEW);
  });

  it('allows resolving directly from OPEN (in-review is not mandatory)', async () => {
    prisma.complaint.findUnique.mockResolvedValue({ id: 'c1', status: ComplaintStatus.OPEN });
    prisma.complaint.update.mockResolvedValue({ id: 'c1', status: ComplaintStatus.RESOLVED });

    await service.resolve('c1', 'admin-1', 'Refunded the passenger.');

    expect(prisma.complaint.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ComplaintStatus.RESOLVED,
          resolvedByAdminId: 'admin-1',
          resolutionNote: 'Refunded the passenger.',
        }),
      }),
    );
  });

  it('rejects resolving an already-resolved complaint', async () => {
    prisma.complaint.findUnique.mockResolvedValue({ id: 'c1', status: ComplaintStatus.RESOLVED });
    await expect(service.resolve('c1', 'admin-1', 'reason')).rejects.toThrow(BadRequestException);
  });

  it('rejects dismissing an already-dismissed complaint', async () => {
    prisma.complaint.findUnique.mockResolvedValue({ id: 'c1', status: ComplaintStatus.DISMISSED });
    await expect(service.dismiss('c1', 'admin-1', 'reason')).rejects.toThrow(BadRequestException);
  });

  it('rejects marking a resolved complaint back to in-review', async () => {
    prisma.complaint.findUnique.mockResolvedValue({ id: 'c1', status: ComplaintStatus.RESOLVED });
    await expect(service.markInReview('c1')).rejects.toThrow(BadRequestException);
  });
});
