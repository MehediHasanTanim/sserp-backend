import { Injectable } from '@nestjs/common';
import { AuthUser, PortalScopeClaim } from '../../../shared/decorators';

@Injectable()
export class RoomResolverService {
  roomsForUser(user: AuthUser): string[] {
    const rooms = [`user:${user.id}`];
    for (const role of user.roles) {
      rooms.push(`role:${role}`);
    }
    const scope = user.portalScope ?? this.asPortalScope(user.scope);
    if (scope?.studentIds?.length) {
      for (const studentId of scope.studentIds) {
        rooms.push(`student:${studentId}`);
      }
    }
    return rooms;
  }

  threadRoom(threadId: string): string {
    return `thread:${threadId}`;
  }

  deptRoom(department: string): string {
    return `dept:${department}`;
  }

  private asPortalScope(
    scope: AuthUser['scope'],
  ): PortalScopeClaim | undefined {
    if (scope && typeof scope === 'object' && 'studentIds' in scope) {
      return scope as PortalScopeClaim;
    }
    return undefined;
  }
}
