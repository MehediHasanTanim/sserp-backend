import { Global, Module } from '@nestjs/common';
import { OrgClockService } from './org-clock.service';

/** Global so any feature module can read the org timezone without re-registering it. */
@Global()
@Module({
  providers: [OrgClockService],
  exports: [OrgClockService],
})
export class OrgClockModule {}
