require('dotenv/config');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { defaultSafetySettings, defaultGenerationConfig } = require('./geminiRequest');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Gemini Native Image (AI Studio REST) 요청 공통 함수
 * @param {string} prompt
 * @param {Array<{ mimeType: string, data: string }>} inlineImages - base64 데이터 최대 2개
 * @param {object} generationConfigOverrides
 * @param {string} model
 * @returns {Promise<{ data: Array<{ b64_json: string }>, mimeType: string }>} 
 */
async function sendGeminiNativeImage(prompt, inlineImages = [], generationConfigOverrides = {}, model = 'gemini-2.5-flash-image-preview') {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.');
    }

    const parts = [{ text: prompt }];
    const limitedImages = Array.isArray(inlineImages) ? inlineImages.slice(0, 2) : [];
    for (const img of limitedImages) {
        if (!img || !img.mimeType || !img.data) continue;
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }

    const body = {
        contents: [
            {
                role: 'user',
                parts: parts,
            }
        ],
        generationConfig: { ...defaultGenerationConfig, ...generationConfigOverrides },
        safetySettings: defaultSafetySettings,
    };

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const response = await axios.post(url, body, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 180000,
        });

        const candidates = response.data && response.data.candidates ? response.data.candidates : [];
        const first = candidates[0] || {};
        const partsResp = (first.content && first.content.parts) ? first.content.parts : [];
        const imagePart = partsResp.find(p => p.inlineData);
        if (!imagePart || !imagePart.inlineData || !imagePart.inlineData.data) {
            throw new Error('이미지 응답을 받지 못했습니다.');
        }
        return {
            data: [{ b64_json: imagePart.inlineData.data }],
            mimeType: imagePart.inlineData.mimeType || 'image/png',
        };
    } catch (error) {
        if (error.response) {
            const status = error.response.status;
            const statusText = error.response.statusText;
            const errData = error.response.data;
            let msg = `${status} ${statusText}`;
            if (status === 401) msg = '인증 실패 - GEMINI_API_KEY 확인 필요';
            else if (status === 403) msg = '권한 없음 - 키 권한 또는 모델 접근 권한 확인';
            else if (status === 429) msg = '요청 한도 초과';
            console.error('❌ Gemini Native Image API 에러:', msg);
            if (errData) console.error('   상세:', JSON.stringify(errData));
        } else if (error.request) {
            console.error('❌ 네트워크 에러: 서버 응답 없음');
        } else {
            console.error('❌ 요청 에러:', error.message);
        }
        throw error;
    }
}

/**
 * 파일 경로 배열을 받아 최대 2개 이미지를 inlineData로 보내는 i2i 도우미
 * @param {string[]} imageFiles - 이미지 파일 경로 배열 (최대 2개)
 * @param {string} prompt
 * @param {object} generationConfigOverrides
 * @param {string} model
 * @returns {Promise<{ data: Array<{ b64_json: string }>, mimeType: string }>}
 */
async function sendGeminiI2IFromFiles(imageFiles, prompt, generationConfigOverrides = {}, model = 'gemini-2.5-flash-image-preview') {
    const allowedExt = ['.jpg', '.jpeg', '.png', '.webp'];
    const images = [];
    const limited = Array.isArray(imageFiles) ? imageFiles.slice(0, 2) : [];
    for (const filePath of limited) {
        if (!filePath) continue;
        const ext = path.extname(filePath).toLowerCase();
        if (!allowedExt.includes(ext)) {
            throw new Error('unsupported_type');
        }
        if (!fs.existsSync(filePath)) {
            throw new Error(`파일이 존재하지 않습니다: ${filePath}`);
        }
        const buf = fs.readFileSync(filePath);
        let mime = 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
        else if (ext === '.png') mime = 'image/png';
        else if (ext === '.webp') mime = 'image/webp';
        images.push({ mimeType: mime, data: buf.toString('base64') });
    }
    return await sendGeminiNativeImage(prompt, images, generationConfigOverrides, model);
}

/**
 * Discord 첨부파일을 받아 최대 2개 이미지를 inlineData로 보내는 i2i 도우미
 * @param {Array} attachments - Discord 메시지의 첨부파일 배열
 * @param {string} prompt
 * @param {object} generationConfigOverrides
 * @param {string} model
 * @returns {Promise<{ data: Array<{ b64_json: string }>, mimeType: string }>}
 */
async function sendGeminiI2IFromAttachments(attachments, prompt, generationConfigOverrides = {}, model = 'gemini-2.5-flash-image-preview') {
    const axiosLib = axios.create();
    const allowedExt = ['.jpg', '.jpeg', '.png', '.webp'];
    const MAX_FILES = 2;
    if (!attachments || attachments.length === 0) {
        return await sendGeminiNativeImage(prompt, [], generationConfigOverrides, model);
    }
    if (attachments.length > MAX_FILES) {
        throw new Error('too_many_images');
    }

    const tempDir = path.join(__dirname, 'temp_gemini_i2i');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
    const tempFiles = [];

    try {
        for (let i = 0; i < attachments.length; i++) {
            const att = attachments[i];
            const ext = path.extname(att.name || '').toLowerCase();
            if (!allowedExt.includes(ext)) {
                throw new Error('unsupported_type');
            }
            if (att.size >= 50 * 1024 * 1024) {
                throw new Error('file_too_large');
            }
            const tempPath = path.join(tempDir, `image${i + 1}${ext}`);
            const response = await axiosLib.get(att.url, { responseType: 'arraybuffer' });
            fs.writeFileSync(tempPath, Buffer.from(response.data));
            tempFiles.push(tempPath);
        }

        const result = await sendGeminiI2IFromFiles(tempFiles, prompt, generationConfigOverrides, model);
        return result;
    } finally {
        for (const f of tempFiles) {
            try { fs.unlinkSync(f); } catch (e) {}
        }
        try {
            if (fs.existsSync(tempDir) && fs.readdirSync(tempDir).length === 0) {
                fs.rmdirSync(tempDir);
            }
        } catch (e) {}
    }
}

/**
 * 텍스트 프롬프트만으로 이미지 생성 (t2i)
 * @param {string} prompt
 * @param {object} generationConfigOverrides
 * @param {string} model
 * @returns {Promise<{ data: Array<{ b64_json: string }>, mimeType: string }>}
 */
async function sendGeminiT2IRequest(prompt, generationConfigOverrides = {}, model = 'gemini-2.5-flash-image-preview') {
    return await sendGeminiNativeImage(prompt, [], generationConfigOverrides, model);
}

module.exports = {
    sendGeminiNativeImage,
    sendGeminiI2IFromFiles,
    sendGeminiI2IFromAttachments,
    sendGeminiT2IRequest,
};


