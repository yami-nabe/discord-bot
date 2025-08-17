require('dotenv/config');
const { GoogleGenAI, PersonGeneration } = require('@google/genai');

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

        // Google AI Studio 인스턴스 생성
        console.log('Google AI Studio 인스턴스 생성 중...');
        const ai = new GoogleGenAI({
            apiKey: IMAGEN_KEY,
        });
        console.log('Google AI Studio 인스턴스 생성 완료');

        // Imagen 모델을 사용하여 이미지 생성 요청
        console.log('Imagen API 요청 전송 중...');
        console.log('사용 모델:', 'models/imagen-4.0-generate-001');
        
        const response = await ai.models.generateImages({
            model: 'models/imagen-4.0-generate-001',
            prompt: prompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                personGeneration: PersonGeneration.ALLOW_ALL,
                aspectRatio: aspectRatio,
                imageSize: '1K',
            },
        });

        console.log('API 응답 수신 완료');
        console.log('응답 구조:', Object.keys(response || {}));
        
        if (response?.generatedImages) {
            console.log('생성된 이미지 수:', response.generatedImages.length);
        }

        // 응답 데이터 반환
        return response;

    } catch (error) {
        console.error('=== Imagen API 오류 상세 정보 ===');
        console.error('오류 메시지:', error.message);
        console.error('오류 타입:', error.constructor.name);
        console.error('오류 스택:', error.stack);
        
        // Google AI Studio API 특정 오류 정보
        if (error.response) {
            console.error('HTTP 상태 코드:', error.response.status);
            console.error('응답 헤더:', error.response.headers);
            console.error('응답 데이터:', error.response.data);
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
