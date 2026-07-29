import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles, Permissions, Audit } from '../../../shared/decorators';
import { EmployeeLifecycleService } from '../services/employee-lifecycle.service';
import {
  CreateEmployeeContractDto,
  CreateEmployeeDocumentDto,
  UpdateEmployeeContractDto,
  UpdateEmployeeDocumentDto,
} from '../dto/employee-document.dto';

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr/employees/:employeeId')
export class EmployeeDocumentController {
  constructor(private readonly lifecycle: EmployeeLifecycleService) {}

  @Get('documents')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:read')
  @ApiOperation({ summary: 'List an employee document vault' })
  listDocuments(@Param('employeeId') employeeId: string) {
    return this.lifecycle.listDocuments(employeeId);
  }

  @Post('documents')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  @Audit({ module: 'hr', entity: 'employee_document', action: 'create' })
  addDocument(
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateEmployeeDocumentDto,
  ) {
    return this.lifecycle.addDocument(employeeId, dto);
  }

  @Patch('documents/:documentId')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:update')
  @Audit({ module: 'hr', entity: 'employee_document', action: 'update' })
  updateDocument(
    @Param('employeeId') employeeId: string,
    @Param('documentId') documentId: string,
    @Body() dto: UpdateEmployeeDocumentDto,
  ) {
    return this.lifecycle.updateDocument(employeeId, documentId, dto);
  }

  @Delete('documents/:documentId')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:delete')
  @Audit({ module: 'hr', entity: 'employee_document', action: 'delete' })
  removeDocument(
    @Param('employeeId') employeeId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.lifecycle.removeDocument(employeeId, documentId);
  }

  @Get('contracts')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:read')
  @ApiOperation({ summary: 'List an employee contract history' })
  listContracts(@Param('employeeId') employeeId: string) {
    return this.lifecycle.listContracts(employeeId);
  }

  @Post('contracts')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  @Audit({ module: 'hr', entity: 'employee_contract', action: 'create' })
  addContract(
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateEmployeeContractDto,
  ) {
    return this.lifecycle.addContract(employeeId, dto);
  }

  @Patch('contracts/:contractId')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:update')
  @Audit({ module: 'hr', entity: 'employee_contract', action: 'update' })
  updateContract(
    @Param('employeeId') employeeId: string,
    @Param('contractId') contractId: string,
    @Body() dto: UpdateEmployeeContractDto,
  ) {
    return this.lifecycle.updateContract(employeeId, contractId, dto);
  }

  @Delete('contracts/:contractId')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:delete')
  @Audit({ module: 'hr', entity: 'employee_contract', action: 'delete' })
  removeContract(
    @Param('employeeId') employeeId: string,
    @Param('contractId') contractId: string,
  ) {
    return this.lifecycle.removeContract(employeeId, contractId);
  }
}
