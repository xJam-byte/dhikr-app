"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZikrModule = void 0;
const common_1 = require("@nestjs/common");
const zikr_service_1 = require("./zikr.service");
const zikr_controller_1 = require("./zikr.controller");
const prisma_module_1 = require("../prisma/prisma.module");
const zikr_variants_service_1 = require("../zikr-variants/zikr-variants.service");
const zikr_variants_controller_1 = require("../zikr-variants/zikr-variants.controller");
let ZikrModule = class ZikrModule {
};
exports.ZikrModule = ZikrModule;
exports.ZikrModule = ZikrModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule],
        providers: [zikr_service_1.ZikrService, zikr_variants_service_1.ZikrVariantsService],
        controllers: [zikr_controller_1.ZikrController, zikr_variants_controller_1.ZikrVariantsController],
        exports: [zikr_service_1.ZikrService, zikr_variants_service_1.ZikrVariantsService],
    })
], ZikrModule);
//# sourceMappingURL=zikr.module.js.map