require('dotenv/config');
const axios = require('axios');

const TAIYAKI_KEY = process.env.TAIYAKI_KEY;

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
            `https://taiyakiai.xyz/proxy/google/v1beta/models/imagen-4.0-ultra-generate-001:generateImages?key=${TAIYAKI_KEY}`,
            {
                prompt: prompt,
                config: {
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

        // 응답 데이터 구조에 맞게 텍스트 추출
        const reply = result.data;
        console.log('Imagen 응답:', JSON.stringify(reply, null, 2));
        
        return reply;

    } catch (error) {
        console.error('Imagen 요청 중 오류 발생:');
        if (error.response) {
            console.error('응답 상태:', error.response.status);
            console.error('응답 헤더:', error.response.headers);
            console.error('응답 데이터:', error.response.data);
        } else if (error.request) {
            console.error('요청 오류:', error.request);
        } else {
            console.error('오류 메시지:', error.message);
        }
        throw new Error(`Imagen 요청 실패: ${error.message}`);
    }
}

module.exports = {
    sendImagenRequest
};
