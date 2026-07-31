const axios = require('axios');
require('dotenv/config');

//const PROXY_URL = process.env.BLACKMARKET_URL;
//const PROXY_KEY = process.env.BLACKMARKET_KEY;
const PROXY_URL = 'https://api.llmgateway.io/v1/chat/completions';
const PROXY_KEY = process.env.GPT_KEY;


/**
 * GPT 요청을 프록시 서버로 보내는 함수
 * @param {Array} prompt - GPT API 형식의 메시지 배열
 * @param {string} model - 사용할 모델명 (기본값: gpt-5-chat-latest)
 * @returns {Promise} - API 응답
 */
async function sendGPTRequest(prompt, model = 'gpt-5.6-terra') {
  try {
    const response = await axios.post(
      `${PROXY_URL}/proxy/openai/v1/chat/completions`,
      {
        model: model,
        messages: prompt,
        max_completion_tokens: 3000,
        temperature: 0.7,
        stream: false
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PROXY_KEY}`,
          'User-Agent': 'Discord-Bot/1.0'
        },
        timeout: 30000 // 30초 타임아웃
      }
    );

    return response;
  } catch (error) {
    console.error('GPT 요청 에러:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  sendGPTRequest
};
