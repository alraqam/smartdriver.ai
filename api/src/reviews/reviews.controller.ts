import { Controller, Get, Query } from '@nestjs/common';
import { Locale } from '@prisma/client';
import { ReviewsService } from './reviews.service';
import { AuthUser, CurrentUser } from '../auth/decorators';

@Controller('me/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /// The mistake bank. `filter` is one of open | due | mastered | all.
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('locale') locale?: string,
    @Query('filter') filter?: string,
  ) {
    const loc = locale === 'ru' ? Locale.ru : (user.locale ?? Locale.uz);
    const f = ['open', 'due', 'mastered', 'all'].includes(filter ?? '')
      ? (filter as 'open' | 'due' | 'mastered' | 'all')
      : 'open';
    return this.reviews.list(user.sub, loc, f);
  }
}
