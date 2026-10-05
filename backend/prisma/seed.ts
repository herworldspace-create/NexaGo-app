/**
 * Bootstraps the first SUPER_ADMIN account so the system has an initial
 * admin able to create further admin accounts through the API.
 *
 * Run with: npx prisma db seed
 * Requires SEED_SUPER_ADMIN_PHONE to be set (e.g. in .env).
 *
 * This is idempotent — running it again when the account already exists
 * is a no-op.
 */
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const phone = process.env.SEED_SUPER_ADMIN_PHONE;
  if (!phone) {
    console.warn(
      'SEED_SUPER_ADMIN_PHONE is not set — skipping super admin seed. ' +
        'Set it in .env and re-run `npx prisma db seed` to create the first admin.',
    );
    return;
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    console.log(`Super admin with phone ${phone} already exists (id: ${existing.id}). Skipping.`);
    return;
  }

  const user = await prisma.user.create({
    data: { phone, role: Role.SUPER_ADMIN },
  });

  console.log(`Created initial SUPER_ADMIN: ${user.id} (${user.phone})`);
  console.log('They can now log in via POST /api/v1/auth/otp/request and /auth/otp/verify.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
