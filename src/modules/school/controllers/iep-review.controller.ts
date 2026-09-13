import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { IepReviewService } from '../services/iep-review.service';
import { CompleteIepReviewDto, CreateIepReviewDto } from '../dto/iep.dto';

@ApiTags('school')
@ApiBearerAuth()
@Controller('school/iep')
export class IepReviewController {
  constructor(private readonly reviews: IepReviewService) {}

  @Get(':id/reviews')
  @Roles('coordinator', 'super_admin')
  @Permissions('school:read')
  list(@Param('id') iepId: string) {
    return this.reviews.list(iepId);
  }

  @Post(':id/reviews')
  @Roles('coordinator', 'super_admin')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'iep_review', action: 'schedule' })
  schedule(@Param('id') iepId: string, @Body() dto: CreateIepReviewDto) {
    return this.reviews.schedule(iepId, dto);
  }

  @Patch('reviews/:reviewId/complete')
  @Roles('coordinator', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'iep_review', action: 'complete' })
  complete(
    @Param('reviewId') reviewId: string,
    @Body() dto: CompleteIepReviewDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reviews.complete(reviewId, dto, user.id);
  }
}
