import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { TherapyType } from '@prisma/client';
import { CurrentUser } from '../../../shared/decorators';
import { AuthUser } from '../../../shared/decorators';
import { Roles } from '../../../shared/decorators';
import { TherapistService } from '../services/therapist.service';

@Controller('therapy/therapists')
@Roles('admin', 'therapy_coordinator', 'therapist')
export class TherapistController {
  constructor(private readonly therapistService: TherapistService) {}

  @Post()
  @Roles('admin', 'therapy_coordinator')
  create(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.therapistService.create(body, user.id);
  }

  @Get()
  list() {
    return this.therapistService.list();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.therapistService.findById(id);
  }

  @Post(':id/specializations')
  @Roles('admin', 'therapy_coordinator')
  addSpecialization(@Param('id') therapistId: string, @Body() body: { therapyType: TherapyType }) {
    return this.therapistService.addSpecialization({ therapistId, therapyType: body.therapyType });
  }

  @Delete(':id/specializations/:therapyType')
  @Roles('admin', 'therapy_coordinator')
  removeSpecialization(
    @Param('id') therapistId: string,
    @Param('therapyType') therapyType: TherapyType,
  ) {
    return this.therapistService.removeSpecialization(therapistId, therapyType);
  }

  @Post(':id/licenses')
  addLicense(@Param('id') therapistId: string, @Body() body: any) {
    return this.therapistService.addLicense({ ...body, therapistId });
  }

  @Put(':id/availability')
  setAvailability(@Param('id') therapistId: string, @Body() body: any) {
    return this.therapistService.setAvailability({ therapistId, slots: body.slots });
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.therapistService.softDelete(id);
  }
}
