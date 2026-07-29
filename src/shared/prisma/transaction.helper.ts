import { Prisma, PrismaClient } from '@prisma/client';

export type TxClient = Prisma.TransactionClient;

export async function withTransaction<T>(
  prisma: PrismaClient,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(fn);
}
