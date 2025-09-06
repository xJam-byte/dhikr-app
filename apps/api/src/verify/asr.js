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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockAsr = exports.HttpAsr = void 0;
exports.createAsr = createAsr;
const fs = __importStar(require("node:fs/promises"));
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
class HttpAsr {
    url;
    constructor(url) {
        this.url = url;
    }
    async transcribe(filePath) {
        const buf = await fs.readFile(filePath);
        const form = new form_data_1.default();
        form.append("file", buf, {
            filename: "audio.m4a",
            contentType: "audio/m4a",
        });
        form.append("lang", "auto");
        const res = await axios_1.default.post(this.url, form, {
            headers: form.getHeaders(),
            timeout: 60000,
            maxBodyLength: Infinity,
        });
        return { text: res.data?.text || "", conf: Number(res.data?.conf || 0) };
    }
}
exports.HttpAsr = HttpAsr;
class MockAsr {
    async transcribe() {
        return { text: "", conf: 0.0 };
    }
}
exports.MockAsr = MockAsr;
function createAsr() {
    const provider = process.env.ASR_PROVIDER || "mock";
    if (provider === "http") {
        const url = process.env.ASR_HTTP_URL || "http://127.0.0.1:5005/transcribe";
        return new HttpAsr(url);
    }
    return new MockAsr();
}
//# sourceMappingURL=asr.js.map