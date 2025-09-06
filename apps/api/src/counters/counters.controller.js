"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CountersController = void 0;
const common_1 = require("@nestjs/common");
const counters_service_1 = require("./counters.service");
let CountersController = class CountersController {
    counters;
    constructor(counters) {
        this.counters = counters;
    }
    async today(req) {
        const deviceId = req.headers["x-device-id"];
        if (!deviceId)
            throw new common_1.BadRequestException("Missing X-Device-Id header");
        return this.counters.todayByDevice(deviceId);
    }
    async total(req) {
        const deviceId = req.headers["x-device-id"];
        if (!deviceId)
            throw new common_1.BadRequestException("Missing X-Device-Id header");
        return this.counters.totalByDevice(deviceId);
    }
};
exports.CountersController = CountersController;
__decorate([
    (0, common_1.Get)("today"),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CountersController.prototype, "today", null);
__decorate([
    (0, common_1.Get)("total"),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CountersController.prototype, "total", null);
exports.CountersController = CountersController = __decorate([
    (0, common_1.Controller)("v1/counters"),
    __metadata("design:paramtypes", [counters_service_1.CountersService])
], CountersController);
//# sourceMappingURL=counters.controller.js.map