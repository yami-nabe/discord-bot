const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
require('dotenv/config');

const client = new OpenAI({
    apiKey: process.env.OPENAI_KEY
});

/**
 * GPT 이미지 생성 API 요청 함수 (t2i) - OpenAI 라이브러리 사용
 * @param {string} prompt - 이미지 생성 프롬프트
 * @param {string} size - 이미지 크기 (예: '1024x1024', '1024x1536', '1536x1024')
 * @param {string} quality - 품질 (예: 'high', 'medium')
 * @param {string} model - 사용할 모델명 (기본값: 'gpt-image-1')
 * @param {number} n - 생성할 이미지 개수 (기본값: 1)
 * @returns {Promise<object>} - API 응답
 */
async function sendGPTImageRequest(prompt, size = '1024x1024', quality = 'medium', model = 'gpt-image-1', n = 1) {
    try {
        console.log('🔍 t2i 요청 시작:', {
            prompt: prompt,
            size: size,
            quality: quality,
            model: model,
            n: n
        });

        const response = await client.images.generate({
            model: model,
            prompt: prompt,
            n: n,
            quality: quality,
            size: size,
        });

        console.log('✅ t2i API 응답 성공:', {
            dataLength: response.data.length,
            hasData: !!response.data
        });

        return response;
    } catch (error) {
        console.error('❌ 이미지 생성 API 에러:', error.message);
        
        // OpenAI 에러 타입별 처리
        if (error.type === 'insufficient_quota') {
            console.error('   상세: API 할당량 초과');
        } else if (error.type === 'invalid_request_error') {
            console.error('   상세: 잘못된 요청 - 파라미터 확인 필요');
        } else if (error.type === 'authentication_error') {
            console.error('   상세: 인증 실패 - API 키 확인 필요');
        } else if (error.type === 'rate_limit_error') {
            console.error('   상세: 요청 한도 초과');
        } else {
            console.error('   상세:', error.message);
        }
        
        throw error;
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
 * i2i 이미지 생성 요청 함수 - OpenAI 라이브러리 사용
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

        // 이미지 파일들을 OpenAI 형식으로 변환
        const images = await Promise.all(
            imageFiles.map(async (filePath) => {
                if (fs.existsSync(filePath)) {
                    console.log(`📁 이미지 파일 추가:`, filePath);
                    return await client.images.toFile(fs.createReadStream(filePath), null, {
                        type: "image/png",
                    });
                } else {
                    console.error(`❌ 파일이 존재하지 않음:`, filePath);
                    throw new Error(`File not found: ${filePath}`);
                }
            })
        );
        
        console.log('📤 이미지 파일 변환 완료');
        
        console.log('🚀 API 요청 전송 중...');
        
        // i2i 요청
        const response = await client.images.edit({
            model: model,
            image: images,
            prompt: prompt,
            n: n,
            quality: quality,
            size: size,
        });
        
        console.log('✅ i2i API 응답 성공:', {
            dataLength: response.data.length,
            hasData: !!response.data
        });
        
        return response;
    } catch (error) {
        console.error('❌ i2i API 에러:', error.message);
        
        // OpenAI 에러 타입별 처리
        if (error.type === 'insufficient_quota') {
            console.error('   상세: API 할당량 초과');
        } else if (error.type === 'invalid_request_error') {
            console.error('   상세: 잘못된 요청 - 파라미터 확인 필요');
        } else if (error.type === 'authentication_error') {
            console.error('   상세: 인증 실패 - API 키 확인 필요');
        } else if (error.type === 'rate_limit_error') {
            console.error('   상세: 요청 한도 초과');
        } else {
            console.error('   상세:', error.message);
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
            
            const response = await fetch(att.url);
            const buffer = await response.arrayBuffer();
            fs.writeFileSync(tempPath, Buffer.from(buffer));
            console.log(`✅ 파일 다운로드 완료: ${tempPath}`);
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
        // 임시 파일 정리 (조용히)
        for (const file of tempFiles) {
            try { 
                fs.unlinkSync(file);
            } catch (e) {
                // 파일 삭제 실패는 조용히 무시
            }
        }
        // 폴더 비우기
        try {
            if (fs.existsSync(tempDir) && fs.readdirSync(tempDir).length === 0) {
                fs.rmdirSync(tempDir);
            }
        } catch (e) {
            // 디렉토리 삭제 실패는 조용히 무시
        }
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
