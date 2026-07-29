import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser, AuthUser, Roles } from '../../../shared/decorators';
import { SessionService } from '../services/session.service';
import { RecurrenceService } from '../services/recurrence.service';

@Controller('therapy/sessions')
@Roles('admin', 'therapy_coordinator', 'therapist')
export class SessionController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly recurrenceService: RecurrenceService,
  ) {}

  @Post()
  schedule(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.sessionService.schedule(body, user.id);
  }

  @Post('check-conflicts')
  checkConflicts(@Body() body: any) {
    return this.sessionService.checkConflicts(body);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.sessionService.findById(id);
  }

  @Put(':id/reschedule')
  reschedule(
    @Param('id') sessionId: string,
    @Body() body: any,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sessionService.reschedule({ sessionId, ...body }, user.id);
  }

  @Put(':id/complete')
  complete(
    @Param('id') sessionId: string,
    @Body() body: any,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sessionService.complete({ sessionId, ...body }, user.id);
  }

  @Put(':id/cancel')
  cancel(
    @Param('id') sessionId: string,
    @Body() body: { cancellationReason: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.sessionService.cancel(sessionId, body.cancellationReason, user.id);
  }

  @Put(':id/no-show')
  noShow(@Param('id') sessionId: string, @CurrentUser() user: AuthUser) {
    return this.sessionService.markNoShow(sessionId, user.id);
  }

  @Post(':id/notes')
  addNote(
    @Param('id') sessionId: string,
    @Body() body: any,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sessionService.addNote({ sessionId, ...body }, user.id);
  }

  @Put(':id/notes/:patientId/finalize')
  finalizeNote(
    @Param('id') sessionId: string,
    @Param('patientId') patientId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sessionService.finalizeNote(sessionId, patientId, user.id);
  }

  @Put(':id/notes/:patientId/co-sign')
  coSignNote(
    @Param('id') sessionId: string,
    @Param('patientId') patientId: string,
    @Body() body: { comment?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.sessionService.coSignNote(sessionId, patientId, user.id, body.comment);
  }

  // Recurrence endpoints
  @Post('recurrences')
  createRecurrence(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.recurrenceService.create(body, user.id);
  }

  @Put('recurrences/:id/cancel-from')
  cancelRecurrenceFrom(
    @Param('id') recurrenceId: string,
    @Body() body: { fromDate: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.recurrenceService.cancelFrom(recurrenceId, new Date(body.fromDate), user.id);
  }

  @Put('recurrences/:id/cancel-all')
  cancelRecurrenceAll(@Param('id') recurrenceId: string, @CurrentUser() user: AuthUser) {
    return this.recurrenceService.cancelAll(recurrenceId, user.id);
  }

  @Put('recurrences/:id/edit-from')
  editRecurrenceFrom(
    @Param('id') recurrenceId: string,
    @Body() body: any,
    @CurrentUser() user: AuthUser,
  ) {
    return this.recurrenceService.editFromDate(recurrenceId, new Date(body.fromDate), body.changes, user.id);
  }

  @Get('schedule/feed')
  scheduleFeed(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('therapistId') therapistId?: string,
  ) {
    if (!therapistId) {
      return [];
    }
    return this.sessionService.listByTherapist(therapistId, new Date(from), new Date(to));
  }
}
