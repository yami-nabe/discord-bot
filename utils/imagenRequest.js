require('dotenv/config');
const axios = require('axios');

const IMAGEN_KEY = process.env.IMAGEN_KEY;

/**
 * Taiyaki AI 프록시를 통해 Google Imagen에 이미지 생성 요청을 보내는 함수
 * @param {string} prompt - 이미지 생성 프롬프트
 * @param {string} aspectRatio - 이미지 비율 ('1:1', '4:3', '3:4')
 * @returns {Promise<Object>} 생성된 이미지 응답
 */
async function sendImagenRequest(prompt, aspectRatio = '1:1') {
    try {
        // Taiyaki AI 프록시에 POST 요청 보내기
        const result = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-ultra-generate-001:generateImages?key=${IMAGEN_KEY}`,
            {
                prompt: prompt,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/jpeg',
                    personGeneration: 'ALLOW_ALL',
                    aspectRatio: aspectRatio,
                    imageSize: '1K',
                }
            },
            {
                headers: {
                    "Content-Type": "application/json"
                },
                timeout: 60000 // 60초 타임아웃 (이미지 생성은 시간이 오래 걸림)
            }
        );

        // 응답 데이터 반환
        return result.data;

    } catch (error) {
        console.error('Imagen 요청 중 오류 발생:', error.message);
        throw new Error(`Imagen 요청 실패: ${error.message}`);
    }
}

module.exports = {
    sendImagenRequest
};
