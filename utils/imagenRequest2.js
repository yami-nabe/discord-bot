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
        // Google AI Studio 인스턴스 생성
        const ai = new GoogleGenAI({
            apiKey: IMAGEN_KEY,
        });

        // Imagen 모델을 사용하여 이미지 생성 요청
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

        // 응답 데이터 반환
        return response;

    } catch (error) {
        console.error('Imagen 공식 API 요청 중 오류 발생:', error.message);
        throw new Error(`Imagen 공식 API 요청 실패: ${error.message}`);
    }
}

module.exports = {
    sendImagenRequest
};
