import { Module } from "@nestjs/common";
import { ConfigService as AppConfigService } from "./config.service";
import { ConfigModule as NestConfigModule } from "@nestjs/config";

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
      load: [],
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class ConfigModule {}
