import { PrismaClient } from '@prisma/client';

export async function seedPhase3(prisma: PrismaClient) {
  console.log('Seeding Phase 3: Therapy fee structures...');

  const effectiveFrom = new Date('2026-01-01');

  const feeStructures = [
    // OT
    { therapyType: 'ot', sessionMode: 'individual', durationMinutes: 30, amount: 3000 },
    { therapyType: 'ot', sessionMode: 'individual', durationMinutes: 45, amount: 4500 },
    { therapyType: 'ot', sessionMode: 'individual', durationMinutes: 60, amount: 6000 },
    { therapyType: 'ot', sessionMode: 'group', durationMinutes: 60, amount: 2500 },
    // Speech
    { therapyType: 'speech', sessionMode: 'individual', durationMinutes: 30, amount: 3000 },
    { therapyType: 'speech', sessionMode: 'individual', durationMinutes: 45, amount: 4500 },
    { therapyType: 'speech', sessionMode: 'individual', durationMinutes: 60, amount: 6000 },
    { therapyType: 'speech', sessionMode: 'group', durationMinutes: 60, amount: 2500 },
    // ABA
    { therapyType: 'aba', sessionMode: 'individual', durationMinutes: 60, amount: 8000 },
    { therapyType: 'aba', sessionMode: 'individual', durationMinutes: 90, amount: 12000 },
    // Music/Dance (group)
    { therapyType: 'music', sessionMode: 'group', durationMinutes: 60, amount: 2000 },
    { therapyType: 'dance', sessionMode: 'group', durationMinutes: 60, amount: 2000 },
    // Assessment
    { therapyType: 'assessment', sessionMode: 'individual', durationMinutes: 90, amount: 15000 },
    // Psychology
    { therapyType: 'psychology', sessionMode: 'individual', durationMinutes: 50, amount: 7000 },
    // Physiotherapy
    { therapyType: 'physiotherapy', sessionMode: 'individual', durationMinutes: 45, amount: 5000 },
  ];

  for (const fee of feeStructures as any[]) {
    await (prisma as any).therapyFeeStructure.upsert({
      where: { id: '00000000-0000-0000-0000-000000000000' }, // will not match
      create: { ...fee, effectiveFrom },
      update: {},
    }).catch(async () => {
      // Use createMany fallback
      await (prisma as any).therapyFeeStructure.create({
        data: { ...fee, effectiveFrom },
      }).catch(() => {}); // Skip if already exists
    });
  }

  console.log('Phase 3 seed complete.');
}
