const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv/config');

const IMG_URL = process.env.IMG_URL;
const IMG_KEY = process.env.IMG_KEY;

/**
 * GPT 이미지 생성 API 요청 함수 (t2i)
 * @param {string} prompt - 이미지 생성 프롬프트
 * @param {string} size - 이미지 크기 (예: '1024x1024', '1024x1536', '1536x1024')
 * @param {string} quality - 품질 (예: 'high', 'medium')
 * @param {string} model - 사용할 모델명 (기본값: 'gpt-image-1')
 * @param {number} n - 생성할 이미지 개수 (기본값: 1)
 * @returns {Promise<object>} - API 응답
 */
async function sendGPTImageRequest(prompt, size = '1024x1024', quality = 'medium', model = 'gpt-image-1', n = 1) {
    try {
        const response = await axios.post(
            `${IMG_URL}/v1/images/generations`,
            {
                model: model,
                prompt: prompt,
                n: n,
                quality: quality,
                size: size,
            },
            {
                headers: {
                    Authorization: `Bearer ${IMG_KEY}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'Discord-Bot/1.0'
                },
                timeout: 180000 // 3분 타임아웃
            }
        );
        return response.data;
    } catch (error) {
        console.error('이미지 생성 API 에러:', error.response?.data || error.message);
        throw error;
    }
}

/**
 * i2i 이미지 생성 요청 함수
 * @param {Array} imageFiles - 이미지 파일 경로 배열
 * @param {string} prompt - 이미지 생성 프롬프트
 * @param {string} size - 이미지 사이즈
 * @param {string} quality - 품질
 * @param {string} model - 사용할 모델명 (기본값: 'gpt-image-1')
 * @param {number} n - 생성할 이미지 개수 (기본값: 1)
 * @returns {Promise<object>} - API 응답
 */
async function sendGPTI2IRequest(imageFiles, prompt, size = '1024x1024', quality = 'medium', model = 'gpt-image-1', n = 1) {
    try {
        // 이미지 파일들을 base64로 변환
        const base64Images = [];
        
        for (const filePath of imageFiles) {
            if (fs.existsSync(filePath)) {
                const imageBuffer = fs.readFileSync(filePath);
                const base64String = imageBuffer.toString('base64');
                const mimeType = getMimeType(path.extname(filePath));
                base64Images.push(`data:${mimeType};base64,${base64String}`);
            }
        }
        
        // 요청 데이터 구성
        const requestData = {
            model: model,
            prompt: prompt,
            n: n,
            quality: quality,
            size: size,
            images: base64Images
        };
        
        // 요청
        const response = await axios.post(
            `${IMG_URL}/v1/images/edits`,
            requestData,
            { 
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${IMG_KEY}`,
                    'User-Agent': 'Discord-Bot/1.0'
                },
                timeout: 180000 // 3분 타임아웃
            }
        );
        return response.data;
    } catch (error) {
        console.error('i2i 이미지 생성 API 에러:', error.response?.data || error.message);
        throw error;
    }
}

/**
 * Discord 첨부파일을 임시 파일로 저장하고 i2i 요청을 보내는 함수
 * @param {Array} attachments - Discord 메시지의 첨부파일 배열
 * @param {string} prompt - 이미지 생성 프롬프트
 * @param {string} size - 이미지 사이즈
 * @param {string} quality - 품질
 * @param {string} model - 사용할 모델명
 * @param {number} n - 생성할 이미지 개수
 * @returns {Promise<object>} - API 응답
 */
async function sendGPTI2IFromAttachments(attachments, prompt, size = '1024x1024', quality = 'medium', model = 'gpt-image-1', n = 1) {
    // 지원 확장자
    const allowedExt = ['.jpg', '.jpeg', '.png', '.webp'];
    
    // 임시 저장 경로
    const tempDir = path.join(__dirname, 'temp_i2i');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
    const tempFiles = [];
    
    try {
        // 파일 저장 및 검증
        for (let i = 0; i < attachments.length; i++) {
            const att = attachments[i];
            const ext = path.extname(att.name).toLowerCase();
            
            if (!allowedExt.includes(ext)) {
                throw new Error('unsupported_type');
            }
            
            if (att.size >= 50 * 1024 * 1024) {
                throw new Error('file_too_large');
            }
            
            // 파일 다운로드
            const tempPath = path.join(tempDir, `image${i + 1}${ext}`);
            const response = await axios.get(att.url, { responseType: 'stream' });
            await new Promise((resolve, reject) => {
                const stream = fs.createWriteStream(tempPath);
                response.data.pipe(stream);
                stream.on('finish', resolve);
                stream.on('error', reject);
            });
            tempFiles.push(tempPath);
        }
        
        // i2i 요청 보내기
        const result = await sendGPTI2IRequest(tempFiles, prompt, size, quality, model, n);
        return result;
        
    } catch (err) {
        throw err;
    } finally {
        // 임시 파일 정리
        for (const file of tempFiles) {
            try { fs.unlinkSync(file); } catch {}
        }
        // 폴더 비우기(남은 파일 없으면 삭제)
        try {
            if (fs.existsSync(tempDir) && fs.readdirSync(tempDir).length === 0) {
                fs.rmdirSync(tempDir);
            }
        } catch {}
    }
}

/**
 * 이미지 크기 옵션을 문자열로 변환하는 헬퍼 함수
 * @param {string} sizeOption - 크기 옵션 ('l', 's', 'p' 또는 기본값)
 * @returns {string} - 실제 이미지 크기 문자열
 */
function getImageSize(sizeOption) {
    switch ((sizeOption || '').toLowerCase()) {
        case 'l':
            return "1536x1024";
        case 's':
            return "1024x1024";
        case 'p':
        default:
            return "1024x1536";
    }
}

/**
 * 채널 ID에 따른 품질 설정을 반환하는 헬퍼 함수
 * @param {string} channelId - Discord 채널 ID
 * @returns {string} - 품질 설정 ('high' 또는 'medium')
 */
function getQualityByChannel(channelId) {
    // 특정 채널에서는 고품질 사용
    const highQualityChannels = ['1389918297562026026'];
    return highQualityChannels.includes(channelId) ? 'high' : 'medium';
}

/**
 * 파일 확장자에 따른 MIME 타입을 반환하는 헬퍼 함수
 * @param {string} ext - 파일 확장자
 * @returns {string} - MIME 타입
 */
function getMimeType(ext) {
    const extLower = ext.toLowerCase();
    switch (extLower) {
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.png':
            return 'image/png';
        case '.webp':
            return 'image/webp';
        default:
            return 'image/jpeg'; // 기본값
    }
}

module.exports = {
    sendGPTImageRequest,
    sendGPTI2IRequest,
    sendGPTI2IFromAttachments,
    getImageSize,
    getQualityByChannel
}; 