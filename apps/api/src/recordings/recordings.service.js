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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecordingsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let RecordingsService = class RecordingsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createForUser(userId, dto) {
        if (!userId)
            throw new common_1.BadRequestException("Missing userId");
        if (!dto?.checksum)
            throw new common_1.BadRequestException("Missing checksum");
        if (!dto?.zikrId)
            throw new common_1.BadRequestException("Missing zikrId");
        const dup = await this.prisma.recording.findFirst({
            where: { checksum: dto.checksum, userId },
            select: { id: true, status: true },
        });
        if (dup)
            return dup;
        const rec = await this.prisma.recording.create({
            data: {
                userId,
                zikrId: dto.zikrId,
                checksum: dto.checksum,
                filename: dto.filename,
                sizeBytes: dto.sizeBytes,
                durationMs: dto.durationMs ? Number(dto.durationMs) : undefined,
                status: "QUEUED",
                text: "",
                score: 0.0,
            },
            select: { id: true, status: true },
        });
        return rec;
    }
    async get(id) {
        return this.prisma.recording.findUnique({ where: { id } });
    }
    async deleteByDevice(deviceId, recId) {
        const user = await this.prisma.user.findUnique({ where: { deviceId } });
        if (!user)
            return { deleted: 0 };
        const res = await this.prisma.recording.deleteMany({
            where: { id: recId, userId: user.id },
        });
        return { deleted: res.count };
    }
};
exports.RecordingsService = RecordingsService;
exports.RecordingsService = RecordingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], RecordingsService);
//# sourceMappingURL=recordings.service.js.map