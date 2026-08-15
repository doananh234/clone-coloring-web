import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";

import { HealthController } from "./common/health.controller";
import { JwtAuthGuard } from "./common/jwt-auth.guard";
import { LoggingInterceptor } from "./common/logging.interceptor";
import { AuthModule } from "./modules/auth/auth.module";
import { MeModule } from "./modules/me/me.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, MeModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
