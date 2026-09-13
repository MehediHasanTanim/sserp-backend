import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, Permissions, Audit } from '../../../shared/decorators';
import { StudentService } from '../services/student.service';
import { CreateGuardianDto, UpdateGuardianDto } from '../dto/student.dto';

@ApiTags('school')
@ApiBearerAuth()
@Controller('school/students/:studentId/guardians')
export class StudentGuardianController {
  constructor(private readonly students: StudentService) {}

  @Get()
  @Roles('coordinator', 'receptionist', 'super_admin', 'principal')
  @Permissions('school:read')
  list(@Param('studentId') studentId: string) {
    return this.students.listGuardians(studentId);
  }

  @Post()
  @Roles('coordinator', 'receptionist', 'super_admin', 'principal')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'student_guardian', action: 'create' })
  create(
    @Param('studentId') studentId: string,
    @Body() dto: CreateGuardianDto,
  ) {
    return this.students.addGuardian(studentId, dto);
  }

  @Patch(':guardianId')
  @Roles('coordinator', 'receptionist', 'super_admin', 'principal')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'student_guardian', action: 'update' })
  update(
    @Param('studentId') studentId: string,
    @Param('guardianId') guardianId: string,
    @Body() dto: UpdateGuardianDto,
  ) {
    return this.students.updateGuardian(studentId, guardianId, dto);
  }

  @Delete(':guardianId')
  @Roles('coordinator', 'receptionist', 'super_admin', 'principal')
  @Permissions('school:delete')
  @Audit({ module: 'school', entity: 'student_guardian', action: 'delete' })
  remove(
    @Param('studentId') studentId: string,
    @Param('guardianId') guardianId: string,
  ) {
    return this.students.removeGuardian(studentId, guardianId);
  }
}
