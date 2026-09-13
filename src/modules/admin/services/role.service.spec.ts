import { RoleService } from './user.service';
import { DomainException } from '../../../shared/errors/domain-exception';

describe('RoleService', () => {
  function build(roleOverrides: Record<string, unknown> = {}) {
    const role = {
      id: 'role-1',
      name: 'custom_role',
      description: 'Custom',
      isSystem: false,
      permissions: [{ module: 'school', action: 'read' }],
      _count: { users: 0, permissions: 1 },
      ...roleOverrides,
    };
    const prisma: any = {
      role: {
        findUnique: jest.fn().mockResolvedValue(role),
        findMany: jest.fn(),
        create: jest.fn().mockResolvedValue(role),
        update: jest.fn().mockResolvedValue(role),
        delete: jest.fn().mockResolvedValue(role),
      },
      rolePermission: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };
    prisma.$transaction = jest.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: any) => Promise<unknown>)(prisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    });
    return { service: new RoleService(prisma), prisma, role };
  }

  it('creates a custom role with permissions', async () => {
    const { service, prisma } = build();
    prisma.role.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'role-1',
        name: 'custom_role',
        description: 'Custom',
        isSystem: false,
        permissions: [{ module: 'school', action: 'read' }],
        _count: { users: 0 },
      });
    prisma.role.create.mockResolvedValue({
      id: 'role-1',
      name: 'custom_role',
      description: 'Custom',
      isSystem: false,
    });

    const result = await service.create({
      name: 'Custom Role',
      description: 'Custom',
      permissions: [{ module: 'school', action: 'read' }],
    });

    expect(prisma.role.create).toHaveBeenCalledWith({
      data: {
        name: 'custom_role',
        description: 'Custom',
        isSystem: false,
      },
    });
    expect(prisma.rolePermission.createMany).toHaveBeenCalled();
    expect(result.name).toBe('custom_role');
    expect(result.isSystem).toBe(false);
  });

  it('rejects create when role name already exists', async () => {
    const { service } = build();
    await expect(
      service.create({ name: 'custom_role', description: 'dup' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('updates name, description, and permissions', async () => {
    const { service, prisma } = build();
    prisma.role.findUnique
      .mockResolvedValueOnce({
        id: 'role-1',
        name: 'custom_role',
        description: 'Custom',
        isSystem: false,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'role-1',
        name: 'custom_v2',
        description: 'Updated',
        isSystem: false,
        permissions: [{ module: 'hr', action: 'read' }],
        _count: { users: 0 },
      });

    const result = await service.update('role-1', {
      name: 'custom_v2',
      description: 'Updated',
      permissions: [{ module: 'hr', action: 'read' }],
    });

    expect(prisma.role.update).toHaveBeenCalled();
    expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({
      where: { roleId: 'role-1' },
    });
    expect(prisma.rolePermission.createMany).toHaveBeenCalled();
    expect(result.name).toBe('custom_v2');
    expect(result.description).toBe('Updated');
  });

  it('rejects delete when users are assigned', async () => {
    const { service } = build({
      name: 'teacher',
      _count: { users: 3, permissions: 2 },
    });
    await expect(service.remove('role-1')).rejects.toBeInstanceOf(
      DomainException,
    );
    await expect(service.remove('role-1')).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('deletes role when no users are assigned', async () => {
    const { service, prisma } = build();
    const result = await service.remove('role-1');
    expect(result).toEqual({
      deleted: true,
      id: 'role-1',
      name: 'custom_role',
    });
    expect(prisma.role.delete).toHaveBeenCalledWith({ where: { id: 'role-1' } });
  });
});
