import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { ShareService } from '@sur/share-domain';
import {
  createShareRequestSchema,
  createShareResponseSchema,
  publicShareSchema,
  shareSlugSchema,
} from '@sur/shared-types';
import type { AuthenticatedRequest } from '../auth/identity.js';
import { IdentityGuard } from '../auth/identity.guard.js';
import { parseRequest } from '../http/zod.js';
import { SHARE_SERVICE } from './share.tokens.js';

@Controller()
export class SharesController {
  constructor(@Inject(SHARE_SERVICE) private readonly shares: ShareService) {}

  @Post('shares')
  @UseGuards(IdentityGuard)
  async create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseRequest(createShareRequestSchema, body);
    return createShareResponseSchema.parse(
      await this.shares.create(request.identity.userId, input),
    );
  }

  @Delete('shares/:slug')
  @UseGuards(IdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Req() request: AuthenticatedRequest,
    @Param('slug') slugValue: string,
  ): Promise<void> {
    const slug = parseRequest(shareSlugSchema, slugValue);
    await this.shares.revoke(request.identity.userId, slug);
  }

  @Get('public/shares/:slug')
  async resolve(@Param('slug') slugValue: string) {
    const slug = parseRequest(shareSlugSchema, slugValue);
    return publicShareSchema.parse(await this.shares.resolve(slug));
  }
}
