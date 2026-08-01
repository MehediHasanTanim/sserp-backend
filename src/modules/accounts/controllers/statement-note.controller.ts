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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../../../shared/decorators';
import {
  CreateStatementNoteDto,
  StatementNoteService,
} from '../services/statement-note.service';

class StatementNoteBodyDto implements CreateStatementNoteDto {
  @IsString() @MinLength(1) fiscalYear!: string;
  @IsString() @MinLength(1) statementType!: string;
  @IsInt() @Min(1) noteNumber!: number;
  @IsString() @MinLength(1) title!: string;
  @IsString() @MinLength(1) body!: string;
}

class UpdateStatementNoteBodyDto {
  @IsOptional() @IsString() fiscalYear?: string;
  @IsOptional() @IsString() statementType?: string;
  @IsOptional() @IsInt() @Min(1) noteNumber?: number;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() body?: string;
}

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts/statement-notes')
export class StatementNoteController {
  constructor(private readonly notes: StatementNoteService) {}

  @Get()
  @Roles('accountant', 'principal', 'super_admin')
  list(
    @Query('fiscalYear') fiscalYear?: string,
    @Query('statementType') statementType?: string,
  ) {
    return this.notes.list(fiscalYear, statementType);
  }

  @Get(':id')
  @Roles('accountant', 'principal', 'super_admin')
  get(@Param('id') id: string) {
    return this.notes.findById(id);
  }

  @Post()
  @Roles('accountant', 'principal', 'super_admin')
  create(@Body() dto: StatementNoteBodyDto, @CurrentUser() user: AuthUser) {
    return this.notes.create(dto, user.id);
  }

  @Patch(':id')
  @Roles('accountant', 'principal', 'super_admin')
  update(@Param('id') id: string, @Body() dto: UpdateStatementNoteBodyDto) {
    return this.notes.update(id, dto);
  }

  @Delete(':id')
  @Roles('accountant', 'principal', 'super_admin')
  remove(@Param('id') id: string) {
    return this.notes.remove(id);
  }
}
