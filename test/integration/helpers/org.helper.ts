import { PrismaClient } from '@prisma/client';
import { resolveOrgIds } from '../../../prisma/seed/hr-org.seed';

export async function employeeOrgIds(
  prisma: PrismaClient,
  departmentCode:
    | 'school'
    | 'therapy'
    | 'administration'
    | 'support' = 'school',
  designationName = 'Special Education Teacher',
) {
  return resolveOrgIds(prisma, departmentCode, designationName);
}
