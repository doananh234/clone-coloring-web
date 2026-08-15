import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";

import { CurrentUser } from "../../common/current-user.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { MeService } from "./me.service";
import { updateProfileSchema } from "./dto";
import type { UpdateProfileDto } from "./dto";
import { createColoringSchema, updateColoringSchema } from "./colorings.dto";
import type { CreateColoringDto, UpdateColoringDto } from "./colorings.dto";

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

  @Get("colorings")
  listColorings(
    @CurrentUser() userId: string,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.me.listColorings(userId, { status, page, limit });
  }

  @Get("colorings/:id")
  getColoring(@CurrentUser() userId: string, @Param("id") id: string) {
    return this.me.getColoring(userId, id);
  }

  @Post("colorings")
  createColoring(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createColoringSchema)) dto: CreateColoringDto,
  ) {
    return this.me.createColoring(userId, dto);
  }

  @Patch("colorings/:id")
  updateColoring(
    @CurrentUser() userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateColoringSchema)) dto: UpdateColoringDto,
  ) {
    return this.me.updateColoring(userId, id, dto);
  }

  @Delete("colorings/:id")
  deleteColoring(@CurrentUser() userId: string, @Param("id") id: string) {
    return this.me.deleteColoring(userId, id);
  }
}
