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
        // 요청 URL과 데이터 로깅
        const requestUrl = `https://taiyakiai.xyz/proxy/google/v1beta/models/imagen-4.0-ultra-generate-001:generateImages?key=${TAIYAKI_KEY}`;
        const requestData = {
            prompt: prompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                personGeneration: 'ALLOW_ALL',
                aspectRatio: aspectRatio,
                imageSize: '1K',
            }
        };
        const requestHeaders = {
            "Content-Type": "application/json"
        };

        console.log('=== Imagen 요청 디버깅 ===');
        console.log('요청 URL:', requestUrl);
        console.log('TAIYAKI_KEY:', TAIYAKI_KEY ? `${TAIYAKI_KEY.substring(0, 10)}...` : 'undefined');
        console.log('요청 헤더:', JSON.stringify(requestHeaders, null, 2));
        console.log('요청 데이터:', JSON.stringify(requestData, null, 2));
        console.log('========================');

        // Taiyaki AI 프록시에 POST 요청 보내기
        const result = await axios.post(
            requestUrl,
            requestData,
            {
                headers: requestHeaders,
                timeout: 60000 // 60초 타임아웃 (이미지 생성은 시간이 오래 걸림)
            }
        );

        // 응답 데이터 구조에 맞게 텍스트 추출
        const reply = result.data;
        console.log('=== Imagen 응답 성공 ===');
        console.log('응답 상태:', result.status);
        console.log('응답 헤더:', JSON.stringify(result.headers, null, 2));
        console.log('응답 데이터:', JSON.stringify(reply, null, 2));
        console.log('========================');
        
        return reply;

    } catch (error) {
        console.error('=== Imagen 요청 중 오류 발생 ===');
        console.error('오류 타입:', error.constructor.name);
        console.error('오류 메시지:', error.message);
        
        if (error.response) {
            console.error('응답 상태:', error.response.status);
            console.error('응답 상태 텍스트:', error.response.statusText);
            console.error('응답 헤더:', JSON.stringify(error.response.headers, null, 2));
            console.error('응답 데이터:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error('요청 오류:', error.request);
            console.error('요청 설정:', JSON.stringify(error.config, null, 2));
        } else {
            console.error('기타 오류:', error);
        }
        
        console.error('전체 오류 객체:', JSON.stringify(error, null, 2));
        console.error('==============================');
        
        throw new Error(`Imagen 요청 실패: ${error.message}`);
    }
}

module.exports = {
    sendImagenRequest
};
