import { Module } from "@nestjs/common";
import { ConfigService } from "./config.service";
import { ConfigModule as NestConfigModule } from "@nestjs/config";

@Module({
  providers: [ConfigService],
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
      load: [],
    }),
  ],
})
export class ConfigModule {}
