import { Body, Controller, Get, Patch } from "@nestjs/common";

import { CurrentUser } from "../../common/current-user.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { MeService } from "./me.service";
import { updateProfileSchema } from "./dto";
import type { UpdateProfileDto } from "./dto";

@Controller("me")
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  profile(@CurrentUser() userId: string) {
    return this.me.getProfile(userId);
  }

  @Patch()
  update(@CurrentUser() userId: string, @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileDto) {
    return this.me.updateProfile(userId, dto);
  }
}
