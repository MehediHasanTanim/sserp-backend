import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './controllers/admin.controller';
import { UserService, RoleService } from './services/user.service';
import {
  OrganizationService,
  NumberingService,
  AuditQueryService,
} from './services/organization.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [
    UserService,
    RoleService,
    OrganizationService,
    NumberingService,
    AuditQueryService,
  ],
  exports: [NumberingService, OrganizationService],
})
export class AdminModule {}
