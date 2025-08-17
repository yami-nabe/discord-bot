require('dotenv/config');
const axios = require('axios');

const IMAGEN_KEY = process.env.IMAGEN_KEY;

/**
 * Google AI Studio 공식 API를 통해 Imagen에 이미지 생성 요청을 보내는 함수
 * @param {string} prompt - 이미지 생성 프롬프트
 * @param {string} aspectRatio - 이미지 비율 ('1:1', '4:3', '3:4')
 * @returns {Promise<Object>} 생성된 이미지 응답
 */
async function sendImagenRequest(prompt, aspectRatio = '1:1') {
    try {
        // API 키 디버깅 로그
        console.log('=== Imagen API 디버깅 정보 ===');
        console.log('API 키 존재 여부:', !!IMAGEN_KEY);
        console.log('API 키 길이:', IMAGEN_KEY ? IMAGEN_KEY.length : 0);
        console.log('API 키 시작 부분:', IMAGEN_KEY ? IMAGEN_KEY.substring(0, 10) + '...' : 'undefined');
        console.log('환경 변수 로드 상태:', process.env.IMAGEN_KEY ? '로드됨' : '로드되지 않음');
        console.log('프롬프트:', prompt);
        console.log('이미지 비율:', aspectRatio);
        console.log('==============================');

        // API 키 유효성 검사
        if (!IMAGEN_KEY) {
            throw new Error('IMAGEN_KEY 환경 변수가 설정되지 않았습니다.');
        }

        if (IMAGEN_KEY.length < 10) {
            throw new Error('API 키가 너무 짧습니다. 올바른 API 키인지 확인해주세요.');
        }

        // Google AI Studio REST API 직접 호출
        console.log('Google AI Studio REST API 직접 호출 중...');
        console.log('사용 모델:', 'models/imagen-4.0-generate-001');
        
        const requestBody = {
            prompt: prompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                personGeneration: 'ALLOW_ALL',
                aspectRatio: aspectRatio,
                imageSize: '1K',
            }
        };
        
        console.log('요청 본문:', JSON.stringify(requestBody, null, 2));
        
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:generateImages?key=${IMAGEN_KEY}`,
            requestBody,
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 120000 // 2분 타임아웃 (이미지 생성은 시간이 오래 걸림)
            }
        );

        console.log('API 응답 수신 완료');
        console.log('HTTP 상태 코드:', response.status);
        console.log('응답 헤더:', response.headers);
        console.log('응답 구조:', Object.keys(response.data || {}));
        
        if (response.data?.generatedImages) {
            console.log('생성된 이미지 수:', response.data.generatedImages.length);
        }

        // 응답 데이터 반환 (axios 응답에서 data 부분만)
        return response.data;

    } catch (error) {
        console.error('=== Imagen API 오류 상세 정보 ===');
        console.error('오류 메시지:', error.message);
        console.error('오류 타입:', error.constructor.name);
        console.error('오류 스택:', error.stack);
        
        // Axios 오류 정보 (Google AI Studio API 응답)
        if (error.response) {
            console.error('HTTP 상태 코드:', error.response.status);
            console.error('응답 헤더:', error.response.headers);
            console.error('응답 데이터:', error.response.data);
        } else if (error.request) {
            console.error('요청이 전송되었지만 응답을 받지 못함:', error.request);
        } else {
            console.error('요청 설정 중 오류 발생:', error.message);
        }
        
        if (error.code) {
            console.error('오류 코드:', error.code);
        }
        
        if (error.status) {
            console.error('상태:', error.status);
        }
        
        console.error('==============================');
        
        throw new Error(`Imagen 공식 API 요청 실패: ${error.message}`);
    }
}

module.exports = {
    sendImagenRequest
};
