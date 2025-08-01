const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
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
        console.log('🔍 i2i 요청 시작:', {
            imageFiles: imageFiles.length + '개 파일',
            prompt: prompt,
            size: size,
            quality: quality,
            model: model,
            n: n
        });

        // FormData 생성
        const form = new FormData();
        
        // 이미지 파일들 추가
        imageFiles.forEach((filePath, idx) => {
            if (fs.existsSync(filePath)) {
                console.log(`📁 이미지 파일 ${idx + 1} 추가:`, filePath);
                form.append('image', fs.createReadStream(filePath), {
                    filename: `image${idx + 1}${path.extname(filePath)}`
                });
            } else {
                console.error(`❌ 파일이 존재하지 않음:`, filePath);
            }
        });
        
        // 기타 파라미터 추가
        form.append('model', model);
        form.append('prompt', prompt);
        form.append('n', n);
        form.append('quality', quality);
        form.append('size', size);
        
        console.log('📤 FormData 파라미터 추가 완료');
        
        // 헤더
        const headers = {
            ...form.getHeaders(),
            'Content-Type': 'multipart/form-data',
            Authorization: `Bearer ${IMG_KEY}`,
        };
        
        console.log('📋 요청 헤더:', {
            'Content-Type': headers['Content-Type'],
            'Authorization': headers.Authorization ? 'Bearer [HIDDEN]' : '없음',
            'Content-Length': headers['Content-Length'] || '자동 설정'
        });
        
        console.log('🚀 API 요청 전송 중...');
        
        // 요청
        const response = await axios.post(
            `${IMG_URL}/v1/images/edits`,
            form,
            { 
                headers,
                timeout: 180000 // 3분 타임아웃
            }
        );
        
        console.log('✅ i2i API 응답 성공:', {
            status: response.status,
            statusText: response.statusText,
            dataKeys: Object.keys(response.data || {}),
            hasData: !!response.data
        });
        
        // 응답 데이터에서 base64 문자열을 [b64 string]으로 대체
        const logData = JSON.stringify(response.data, (key, value) => {
            if (typeof value === 'string' && value.length > 100 && /^[A-Za-z0-9+/=]+$/.test(value)) {
                return '[b64 string]';
            }
            return value;
        }, 2);
        
        console.log('📄 응답 데이터 (base64 축약):', logData);
        
        return response.data;
    } catch (error) {
        console.error('❌ i2i 이미지 생성 API 에러:');
        console.error('에러 타입:', error.constructor.name);
        console.error('에러 메시지:', error.message);
        
        if (error.response) {
            console.error('응답 상태:', error.response.status);
            console.error('응답 헤더:', error.response.headers);
            
            // 에러 응답 데이터에서 base64 문자열 축약
            const errorData = JSON.stringify(error.response.data, (key, value) => {
                if (typeof value === 'string' && value.length > 100 && /^[A-Za-z0-9+/=]+$/.test(value)) {
                    return '[b64 string]';
                }
                return value;
            }, 2);
            
            console.error('에러 응답 데이터 (base64 축약):', errorData);
        } else if (error.request) {
            console.error('요청은 전송되었지만 응답이 없음');
        } else {
            console.error('요청 설정 중 에러:', error.message);
        }
        
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
    console.log('🔍 Discord 첨부파일 i2i 요청 시작:', {
        attachmentsCount: attachments.length,
        prompt: prompt,
        size: size,
        quality: quality,
        model: model,
        n: n
    });

    // 지원 확장자
    const allowedExt = ['.jpg', '.jpeg', '.png', '.webp'];
    
    // 임시 저장 경로
    const tempDir = path.join(__dirname, 'temp_i2i');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
        console.log('📁 임시 디렉토리 생성:', tempDir);
    }
    const tempFiles = [];
    
    try {
        // 파일 저장 및 검증
        for (let i = 0; i < attachments.length; i++) {
            const att = attachments[i];
            const ext = path.extname(att.name).toLowerCase();
            
            console.log(`📎 첨부파일 ${i + 1} 검증:`, {
                name: att.name,
                size: att.size,
                ext: ext,
                url: att.url
            });
            
            if (!allowedExt.includes(ext)) {
                console.error(`❌ 지원하지 않는 파일 형식: ${ext}`);
                throw new Error('unsupported_type');
            }
            
            if (att.size >= 50 * 1024 * 1024) {
                console.error(`❌ 파일이 너무 큼: ${att.size} bytes`);
                throw new Error('file_too_large');
            }
            
            // 파일 다운로드
            const tempPath = path.join(tempDir, `image${i + 1}${ext}`);
            console.log(`⬇️ 파일 다운로드 중: ${att.name} -> ${tempPath}`);
            
            const response = await axios.get(att.url, { responseType: 'stream' });
            await new Promise((resolve, reject) => {
                const stream = fs.createWriteStream(tempPath);
                response.data.pipe(stream);
                stream.on('finish', () => {
                    console.log(`✅ 파일 다운로드 완료: ${tempPath}`);
                    resolve();
                });
                stream.on('error', (err) => {
                    console.error(`❌ 파일 다운로드 실패: ${err.message}`);
                    reject(err);
                });
            });
            tempFiles.push(tempPath);
        }
        
        console.log('🚀 i2i API 요청 전송...');
        
        // i2i 요청 보내기
        const result = await sendGPTI2IRequest(tempFiles, prompt, size, quality, model, n);
        
        console.log('✅ Discord 첨부파일 i2i 요청 완료');
        return result;
        
    } catch (err) {
        console.error('❌ Discord 첨부파일 i2i 요청 실패:', err.message);
        throw err;
    } finally {
        console.log('🧹 임시 파일 정리 중...');
        // 임시 파일 정리
        for (const file of tempFiles) {
            try { 
                fs.unlinkSync(file);
                console.log(`🗑️ 임시 파일 삭제: ${file}`);
            } catch (e) {
                console.error(`❌ 임시 파일 삭제 실패: ${file}`, e.message);
            }
        }
        // 폴더 비우기(남은 파일 없으면 삭제)
        try {
            if (fs.existsSync(tempDir) && fs.readdirSync(tempDir).length === 0) {
                fs.rmdirSync(tempDir);
                console.log('🗑️ 임시 디렉토리 삭제:', tempDir);
            }
        } catch (e) {
            console.error('❌ 임시 디렉토리 삭제 실패:', e.message);
        }
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

module.exports = {
    sendGPTImageRequest,
    sendGPTI2IRequest,
    sendGPTI2IFromAttachments,
    getImageSize,
    getQualityByChannel
}; 