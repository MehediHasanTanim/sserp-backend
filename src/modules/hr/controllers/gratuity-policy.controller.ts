import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, Permissions, Audit } from '../../../shared/decorators';
import { GratuityPolicyService } from '../services/gratuity-policy.service';

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr/gratuity/policies')
export class GratuityPolicyController {
  constructor(private readonly policies: GratuityPolicyService) {}

  @Get()
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:read')
  list() {
    return this.policies.list();
  }

  @Post()
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:create')
  @Audit({ module: 'hr', entity: 'gratuity_policy', action: 'create' })
  create(@Body() body: never) {
    return this.policies.create(body);
  }

  @Patch(':id')
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:update')
  update(@Param('id') id: string, @Body() body: never) {
    return this.policies.update(id, body);
  }

  @Post(':id/activate')
  @Roles('principal', 'super_admin')
  @Permissions('hr:approve')
  @Audit({ module: 'hr', entity: 'gratuity_policy', action: 'activate' })
  activate(@Param('id') id: string) {
    return this.policies.activate(id);
  }
}
