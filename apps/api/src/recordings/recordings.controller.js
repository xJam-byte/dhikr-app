"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecordingsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const recordings_service_1 = require("./recordings.service");
const queues_service_1 = require("../queues/queues.service");
const prisma_service_1 = require("../prisma/prisma.service");
const fs = __importStar(require("node:fs"));
const fsp = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const uuid_1 = require("uuid");
const crypto = __importStar(require("node:crypto"));
const UPLOAD_DIR = path.resolve(__dirname, "..", "uploads");
function ensureUploadsDir() {
    if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
}
let RecordingsController = class RecordingsController {
    service;
    queues;
    prisma;
    constructor(service, queues, prisma) {
        this.service = service;
        this.queues = queues;
        this.prisma = prisma;
        ensureUploadsDir();
    }
    async upload(req, file, zikrId, durationMs) {
        const deviceId = req.headers["x-device-id"] || "unknown";
        console.log("[upload hit]", {
            hasFile: !!file,
            size: file?.size,
            type: file?.mimetype,
            zikrId,
            durationMs,
            deviceId,
        });
        if (!file)
            throw new common_1.BadRequestException("file required");
        if (!zikrId)
            throw new common_1.BadRequestException("zikrId required");
        if (file.size < 1024)
            throw new common_1.BadRequestException("empty audio");
        if (!file.mimetype?.startsWith("audio/")) {
            throw new common_1.BadRequestException("invalid mime");
        }
        const user = await this.prisma.user.upsert({
            where: { deviceId },
            update: {},
            create: { deviceId, language: "ru", level: "BEGINNER", timezone: "UTC" },
            select: { id: true },
        });
        const checksum = crypto
            .createHash("sha256")
            .update(file.buffer)
            .digest("hex");
        const ext = (file.originalname?.split(".").pop() || "m4a")
            .toLowerCase()
            .slice(0, 6) || "m4a";
        const diskName = `${(0, uuid_1.v4)()}.${ext}`;
        const filePath = path.join(UPLOAD_DIR, diskName);
        await fsp.writeFile(filePath, file.buffer);
        const rec = await this.service.createForUser(user.id, {
            checksum,
            zikrId,
            filename: diskName,
            sizeBytes: file.size,
            durationMs: durationMs ? Number(durationMs) : undefined,
        });
        await this.queues.enqueueProcessingJob({
            recordingId: rec.id,
            userId: user.id,
            zikrId,
            filePath,
            durationMs: durationMs ? Number(durationMs) : null,
        });
        return { id: rec.id, status: rec.status, message: "Queued for processing" };
    }
    get(id) {
        return this.service.get(id);
    }
    async remove(req, id) {
        const deviceId = req.headers["x-device-id"];
        if (!deviceId)
            throw new common_1.BadRequestException("Missing X-Device-Id header");
        return this.service.deleteByDevice(deviceId, id);
    }
};
exports.RecordingsController = RecordingsController;
__decorate([
    (0, common_1.Post)("upload"),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)("file", {
        storage: (0, multer_1.memoryStorage)(),
        limits: { fileSize: 5 * 1024 * 1024 },
    })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)("zikrId")),
    __param(3, (0, common_1.Body)("durationMs")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, String]),
    __metadata("design:returntype", Promise)
], RecordingsController.prototype, "upload", null);
__decorate([
    (0, common_1.Get)(":id"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RecordingsController.prototype, "get", null);
__decorate([
    (0, common_1.Delete)(":id"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], RecordingsController.prototype, "remove", null);
exports.RecordingsController = RecordingsController = __decorate([
    (0, common_1.Controller)("v1/recordings"),
    __metadata("design:paramtypes", [recordings_service_1.RecordingsService,
        queues_service_1.QueuesService,
        prisma_service_1.PrismaService])
], RecordingsController);
//# sourceMappingURL=recordings.controller.js.map