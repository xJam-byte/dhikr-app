"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_module_1 = require("./config/config.module");
const prisma_module_1 = require("./prisma/prisma.module");
const redis_module_1 = require("./redis/redis.module");
const queues_module_1 = require("./queues/queues.module");
const users_module_1 = require("./users/users.module");
const zikr_module_1 = require("./zikr/zikr.module");
const recordings_module_1 = require("./recordings/recordings.module");
const counters_module_1 = require("./counters/counters.module");
const health_controller_1 = require("./health/health.controller");
const zikr_variants_controller_1 = require("./zikr-variants/zikr-variants.controller");
const zikr_variants_service_1 = require("./zikr-variants/zikr-variants.service");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_module_1.ConfigModule,
            prisma_module_1.PrismaModule,
            redis_module_1.RedisModule,
            queues_module_1.QueuesModule,
            users_module_1.UsersModule,
            zikr_module_1.ZikrModule,
            recordings_module_1.RecordingsModule,
            counters_module_1.CountersModule,
        ],
        controllers: [health_controller_1.HealthController, zikr_variants_controller_1.ZikrVariantsController],
        providers: [zikr_variants_service_1.ZikrVariantsService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map