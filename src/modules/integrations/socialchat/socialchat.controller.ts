import { Controller } from '@nestjs/common';
import { SocialchatService } from './socialchat.service';

@Controller('socialchat')
export class SocialchatController {
  constructor(private readonly socialchatService: SocialchatService) {}

  // TODO: implementasi endpoint
}
