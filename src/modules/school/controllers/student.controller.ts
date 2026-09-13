import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StudentStatus } from '@prisma/client';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { StudentService } from '../services/student.service';
import { StudentStatusService } from '../services/student-status.service';
import { SchoolAttendanceService } from '../services/school-attendance.service';
import { StudentPolicy } from '../policies/student.policy';
import {
  ChangeStudentStatusDto,
  CreateStudentDocumentDto,
  CreateStudentDto,
  ReEnrollStudentDto,
  UpdateStudentDto,
} from '../dto/student.dto';

@ApiTags('school')
@ApiBearerAuth()
@Controller('school/students')
export class StudentController {
  constructor(
    private readonly students: StudentService,
    private readonly statuses: StudentStatusService,
    private readonly attendance: SchoolAttendanceService,
    private readonly policy: StudentPolicy,
  ) {}

  @Get()
  @Roles(
    'coordinator',
    'receptionist',
    'super_admin',
    'principal',
    'teacher',
    'accountant',
  )
  @Permissions('school:read')
  async list(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: StudentStatus,
    @Query('shiftId') shiftId?: string,
    @Query('academicYearId') academicYearId?: string,
    @Query('disabilityCategory') disabilityCategory?: string,
    @Query('search') search?: string,
  ) {
    const scoped = await this.policy.scopedStudentIds(user);
    const result = await this.students.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status,
      shiftId,
      academicYearId,
      disabilityCategory,
      search,
    });
    if (scoped === null) return result;
    return {
      ...result,
      items: result.items.filter((s) => scoped.includes(s.id)),
    };
  }

  @Post()
  @Roles('coordinator', 'receptionist', 'super_admin')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'student', action: 'enroll' })
  @ApiOperation({
    summary:
      'Enroll a student; generates the student code and admission fee invoice',
  })
  enroll(@Body() dto: CreateStudentDto, @CurrentUser() user: AuthUser) {
    return this.students.enroll(dto, user.id);
  }

  @Get(':id')
  @Permissions('school:read')
  async get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.policy.assertCanView(user, id);
    return this.students.get(id);
  }

  @Patch(':id')
  @Roles('coordinator', 'receptionist', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'student', action: 'update' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.students.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('principal', 'super_admin')
  @Permissions('school:delete')
  @Audit({ module: 'school', entity: 'student', action: 'delete' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.students.softDelete(id, user.id);
  }

  @Post(':id/status')
  @Roles('principal', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'student', action: 'status_override' })
  @ApiOperation({ summary: 'Manual status override with mandatory reason' })
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeStudentStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.statuses.changeStatus({
      studentId: id,
      toStatus: dto.status,
      reason: dto.reason,
      changedBy: user.id,
      isManualOverride: true,
    });
  }

  @Get(':id/status-history')
  @Roles('coordinator', 'principal', 'super_admin')
  @Permissions('school:read')
  statusHistory(@Param('id') id: string) {
    return this.statuses.history(id);
  }

  @Post(':id/re-enroll')
  @Roles('coordinator', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'student', action: 're_enroll' })
  @ApiOperation({ summary: 'Carry a student into a new academic year' })
  reEnroll(@Param('id') id: string, @Body() dto: ReEnrollStudentDto) {
    return this.students.reEnroll(id, dto);
  }

  @Get(':id/documents')
  @Roles('coordinator', 'receptionist', 'super_admin')
  @Permissions('school:read')
  listDocuments(@Param('id') id: string) {
    return this.students.listDocuments(id);
  }

  @Post(':id/documents')
  @Roles('coordinator', 'receptionist', 'super_admin')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'student_document', action: 'create' })
  addDocument(@Param('id') id: string, @Body() dto: CreateStudentDocumentDto) {
    return this.students.addDocument(id, dto);
  }

  @Delete(':id/documents/:documentId')
  @Roles('coordinator', 'receptionist', 'super_admin')
  @Permissions('school:delete')
  @Audit({ module: 'school', entity: 'student_document', action: 'delete' })
  removeDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.students.removeDocument(id, documentId);
  }

  @Get(':id/attendance')
  @Permissions('school:read')
  async attendanceHistory(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.policy.assertCanView(user, id);
    return this.attendance.history(id);
  }
}
