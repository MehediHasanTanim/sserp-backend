import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { FeeStructureService } from '../services/fee-structure.service';
import {
  CreateDiscountDto,
  CreateFeeCategoryDto,
  CreateFeeHeadDto,
  CreateFeeStructureDto,
  CreateScholarshipDto,
  SetStudentFeeCategoryDto,
  UpdateFeeCategoryDto,
  UpdateFeeHeadDto,
  UpdateFeeStructureDto,
} from '../dto/fee-structure.dto';

const ADMIN_ROLES = ['super_admin', 'accountant', 'principal'];

@ApiTags('school')
@ApiBearerAuth()
@Controller('school')
export class FeeStructureController {
  constructor(private readonly feeStructures: FeeStructureService) {}

  @Get('fee-categories')
  @Permissions('school:read')
  listCategories() {
    return this.feeStructures.listCategories();
  }

  @Post('fee-categories')
  @Roles(...ADMIN_ROLES)
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'fee_category', action: 'create' })
  createCategory(@Body() dto: CreateFeeCategoryDto) {
    return this.feeStructures.createCategory(dto);
  }

  @Patch('fee-categories/:id')
  @Roles(...ADMIN_ROLES)
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'fee_category', action: 'update' })
  updateCategory(@Param('id') id: string, @Body() dto: UpdateFeeCategoryDto) {
    return this.feeStructures.updateCategory(id, dto);
  }

  @Get('fee-heads')
  @Permissions('school:read')
  listHeads() {
    return this.feeStructures.listHeads();
  }

  @Post('fee-heads')
  @Roles(...ADMIN_ROLES)
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'fee_head', action: 'create' })
  createHead(@Body() dto: CreateFeeHeadDto) {
    return this.feeStructures.createHead(dto);
  }

  @Patch('fee-heads/:id')
  @Roles(...ADMIN_ROLES)
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'fee_head', action: 'update' })
  updateHead(@Param('id') id: string, @Body() dto: UpdateFeeHeadDto) {
    return this.feeStructures.updateHead(id, dto);
  }

  @Get('fee-structures')
  @Permissions('school:read')
  listStructures(
    @Query('academicYearId') academicYearId?: string,
    @Query('feeCategoryId') feeCategoryId?: string,
  ) {
    return this.feeStructures.listStructures(academicYearId, feeCategoryId);
  }

  @Post('fee-structures')
  @Roles(...ADMIN_ROLES)
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'fee_structure', action: 'create' })
  createStructure(@Body() dto: CreateFeeStructureDto) {
    return this.feeStructures.createStructure(dto);
  }

  @Patch('fee-structures/:id')
  @Roles(...ADMIN_ROLES)
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'fee_structure', action: 'update' })
  updateStructure(@Param('id') id: string, @Body() dto: UpdateFeeStructureDto) {
    return this.feeStructures.updateStructure(id, dto);
  }

  @Put('students/:id/fee-category')
  @Roles('accountant', 'coordinator', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'student_fee_assignment', action: 'set' })
  setStudentFeeCategory(
    @Param('id') studentId: string,
    @Body() dto: SetStudentFeeCategoryDto,
  ) {
    return this.feeStructures.setStudentFeeCategory(studentId, dto);
  }

  @Get('students/:id/discounts')
  @Roles('accountant', 'coordinator', 'principal', 'super_admin')
  @Permissions('school:read')
  listDiscounts(@Param('id') studentId: string) {
    return this.feeStructures.listDiscounts(studentId);
  }

  @Post('students/:id/discounts')
  @Roles('accountant', 'coordinator')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'student_discount', action: 'create' })
  createDiscount(
    @Param('id') studentId: string,
    @Body() dto: CreateDiscountDto,
  ) {
    return this.feeStructures.createDiscount(studentId, dto);
  }

  @Post('discounts/:id/approve')
  @Roles('principal', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'student_discount', action: 'approve' })
  approveDiscount(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.feeStructures.approveDiscount(id, user.id, user.roles);
  }

  @Get('students/:id/scholarships')
  @Roles('accountant', 'principal', 'super_admin')
  @Permissions('school:read')
  listScholarships(@Param('id') studentId: string) {
    return this.feeStructures.listScholarships(studentId);
  }

  @Post('students/:id/scholarships')
  @Roles('accountant', 'principal', 'super_admin')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'scholarship', action: 'create' })
  createScholarship(
    @Param('id') studentId: string,
    @Body() dto: CreateScholarshipDto,
  ) {
    return this.feeStructures.createScholarship(studentId, dto);
  }
}
