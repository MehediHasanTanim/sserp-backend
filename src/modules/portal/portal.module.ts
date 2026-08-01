import { Module, forwardRef } from '@nestjs/common';
import { SchoolModule } from '../school/school.module';
import { TherapyModule } from '../therapy/therapy.module';
import { HardeningModule } from '../hardening/hardening.module';
import { PortalController } from './controllers/portal.controller';
import { PortalScopeService } from './services/portal-scope.service';
import { PortalScopeGuard } from './guards/portal-scope.guard';

@Module({
  imports: [
    SchoolModule,
    forwardRef(() => TherapyModule),
    forwardRef(() => HardeningModule),
  ],
  controllers: [PortalController],
  providers: [PortalScopeService, PortalScopeGuard],
  exports: [PortalScopeService],
})
export class PortalModule {}
