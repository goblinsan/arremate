/**
 * Arremate – Database Seed Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Idempotent seed script that bootstraps the minimum data required to launch
 * the platform in a new environment.
 *
 * Run with:
 *   pnpm --filter @arremate/database db:seed
 *
 * The script is safe to re-run; all upserts use unique fields so no duplicate
 * records are created.
 *
 * What is seeded
 * ──────────────
 * 1. Platform admin user – The first ops-team member who needs ADMIN access.
 *    Set SEED_ADMIN_EMAIL / SEED_ADMIN_COGNITO_SUB env vars before running.
 *    Falls back to safe placeholder values that should be replaced.
 *
 * 2. Seed sellers (optional) – Two demo seller accounts for QA / staging.
 *    Only created when NODE_ENV !== 'production'.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function env(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

// ─── Seed functions ───────────────────────────────────────────────────────────

async function seedAdminUser(): Promise<void> {
  const email = env('SEED_ADMIN_EMAIL', 'admin@arremate.com.br');
  const cognitoSub = env('SEED_ADMIN_COGNITO_SUB', 'placeholder-admin-cognito-sub');
  const name = env('SEED_ADMIN_NAME', 'Admin Arremate');

  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: 'ADMIN', name },
    create: {
      email,
      cognitoSub,
      name,
      role: 'ADMIN',
    },
  });

  console.log(`✅ Admin user: ${admin.email} (id: ${admin.id})`);
}

async function seedDemoSellers(): Promise<void> {
  const sellers = [
    {
      email: 'vendedor.demo1@arremate.com.br',
      name: 'Loja Demo Eletrônicos',
      cognitoSub: 'demo-seller-1-cognito-sub',
    },
    {
      email: 'vendedor.demo2@arremate.com.br',
      name: 'Loja Demo Moda',
      cognitoSub: 'demo-seller-2-cognito-sub',
    },
  ];

  for (const seller of sellers) {
    const user = await prisma.user.upsert({
      where: { email: seller.email },
      update: { name: seller.name },
      create: {
        ...seller,
        role: 'SELLER',
      },
    });

    // Create a basic SellerAccount so they can list shows.
    const application = await prisma.sellerApplication.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        status: 'APPROVED',
        businessName: seller.name,
        businessType: 'individual',
        submittedAt: new Date(),
        reviewedAt: new Date(),
      },
    });

    await prisma.sellerAccount.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        applicationId: application.id,
        isActive: true,
      },
    });

    console.log(`✅ Demo seller: ${user.email} (id: ${user.id})`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🌱 Starting database seed…\n');

  await seedAdminUser();

  if (process.env.NODE_ENV !== 'production') {
    console.log('\n⚠️  Non-production environment detected – seeding demo sellers.\n');
    await seedDemoSellers();
  }

  console.log('\n✅ Seed complete.');
}

main()
  .catch((err: unknown) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
