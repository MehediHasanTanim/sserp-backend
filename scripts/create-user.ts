/**
 * Create a local user with a single role.
 *
 * Usage:
 *   npm run user:create -- \
 *     --role teacher \
 *     --username jdoe \
 *     --password 'ChangeMeNow1' \
 *     --full-name 'Jane Doe'
 *
 * Optional:
 *   --email jane@example.com   (default: <username>@sserp.local)
 *   --list-roles               print known roles and exit
 *
 * Requires DATABASE_URL and a seeded roles table (npm run prisma:seed).
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { resolveOrgIds } from '../prisma/seed/hr-org.seed';

const prisma = new PrismaClient();

const STAFF_ROLES = new Set([
  'super_admin',
  'principal',
  'coordinator',
  'teacher',
  'therapist',
  'hr_officer',
  'accountant',
  'receptionist',
]);

type Args = {
  role?: string;
  username?: string;
  password?: string;
  fullName?: string;
  email?: string;
  listRoles?: boolean;
};

function usage(exitCode = 1): never {
  console.error(`Create a user with a role.

Usage:
  npm run user:create -- --role <role> --username <user> --password <pass> --full-name <name>
  npm run user:create -- --list-roles

Options:
  --role <name>         Role to assign (required)
  --username <name>     Unique username (required)
  --password <pass>     Password ≥10 chars with upper, lower, digit (required)
  --full-name <name>    Display name; links Employee (staff) or GuardianProfile (parent)
  --email <email>       Email (default: <username>@sserp.local)
  --list-roles          List seeded roles and exit
`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v == null || v.startsWith('--')) {
        throw new Error(`Missing value for ${a}`);
      }
      return v;
    };
    switch (a) {
      case '--role':
        out.role = next();
        break;
      case '--username':
        out.username = next();
        break;
      case '--password':
        out.password = next();
        break;
      case '--full-name':
      case '--fullname':
        out.fullName = next();
        break;
      case '--email':
        out.email = next();
        break;
      case '--list-roles':
        out.listRoles = true;
        break;
      case '--help':
      case '-h':
        usage(0);
        break;
      default:
        if (a.startsWith('-')) throw new Error(`Unknown option: ${a}`);
    }
  }
  return out;
}

function validatePassword(password: string) {
  const errors: string[] = [];
  if (password.length < 10) errors.push('at least 10 characters');
  if (!/[A-Z]/.test(password)) errors.push('one uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('one lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('one digit');
  if (errors.length) {
    throw new Error(`Password must contain ${errors.join(', ')}`);
  }
}

function departmentForRole(role: string): {
  department: 'school' | 'therapy' | 'administration' | 'support';
  designation: string;
} {
  switch (role) {
    case 'super_admin':
      return { department: 'administration', designation: 'IT Administrator' };
    case 'principal':
      return { department: 'school', designation: 'Principal' };
    case 'coordinator':
      return { department: 'school', designation: 'Coordinator' };
    case 'teacher':
      return { department: 'school', designation: 'Teacher' };
    case 'therapist':
      return { department: 'therapy', designation: 'Therapist' };
    case 'hr_officer':
      return { department: 'administration', designation: 'HR Officer' };
    case 'accountant':
      return { department: 'administration', designation: 'Accountant' };
    case 'receptionist':
      return { department: 'support', designation: 'Receptionist' };
    default:
      return { department: 'administration', designation: role };
  }
}

function slugCode(username: string): string {
  const base = username
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
  return `USR-${base || 'USER'}`;
}

async function listRoles() {
  const roles = await prisma.role.findMany({ orderBy: { name: 'asc' } });
  if (!roles.length) {
    console.error('No roles found. Run: npm run prisma:seed');
    process.exit(1);
  }
  for (const r of roles) {
    console.log(`${r.name}\t${r.description ?? ''}`.trimEnd());
  }
}

async function createUser(args: Args) {
  const roleName = args.role?.trim();
  const username = args.username?.trim();
  const password = args.password;
  const fullName = args.fullName?.trim();

  if (!roleName || !username || !password || !fullName) {
    usage(1);
  }

  validatePassword(password);

  const email = (args.email?.trim() || `${username}@sserp.local`).toLowerCase();
  const cost = Number(process.env.BCRYPT_COST ?? 12);

  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) {
    const known = await prisma.role.findMany({
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    throw new Error(
      `Unknown role "${roleName}". Available: ${known.map((r) => r.name).join(', ') || '(none — run prisma:seed)'}`,
    );
  }

  const existing = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { username: { equals: username, mode: 'insensitive' } },
        { email: { equals: email, mode: 'insensitive' } },
      ],
    },
  });
  if (existing) {
    throw new Error(
      `User already exists (username or email): ${existing.username} <${existing.email}>`,
    );
  }

  const passwordHash = await bcrypt.hash(password, cost);

  const user = await prisma.$transaction(async (tx) => {
    let employeeId: string | undefined;
    let guardianId: string | undefined;

    if (roleName === 'parent') {
      const guardian = await tx.guardianProfile.create({
        data: {
          fullName,
          email,
        },
      });
      guardianId = guardian.id;
    } else if (STAFF_ROLES.has(roleName)) {
      const { department, designation } = departmentForRole(roleName);
      const { departmentId, designationId } = await resolveOrgIds(
        prisma,
        department,
        designation,
      );
      let code = slugCode(username);
      const clash = await tx.employee.findUnique({
        where: { employeeCode: code },
      });
      if (clash) {
        code = `${code}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
      }
      const employee = await tx.employee.create({
        data: {
          employeeCode: code,
          fullName,
          departmentId,
          designationId,
          employmentType: 'permanent',
          joiningDate: new Date(),
          basicSalary: 0,
          status: 'active',
          personalEmail: email,
        },
      });
      employeeId = employee.id;
    }

    const created = await tx.user.create({
      data: {
        username,
        email,
        passwordHash,
        employeeId,
        guardianId,
        mustChangePassword: true,
        isActive: true,
        roles: {
          create: [{ roleId: role.id }],
        },
      },
      include: {
        roles: { include: { role: true } },
        employee: { select: { id: true, employeeCode: true, fullName: true } },
        guardianProfile: { select: { id: true, fullName: true } },
      },
    });
    return created;
  });

  console.log(
    JSON.stringify(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName,
        roles: user.roles.map((r) => r.role.name),
        mustChangePassword: user.mustChangePassword,
        employee: user.employee,
        guardian: user.guardianProfile,
      },
      null,
      2,
    ),
  );
}

async function main() {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message);
    usage(1);
  }

  if (args.listRoles) {
    await listRoles();
    return;
  }

  await createUser(args);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
