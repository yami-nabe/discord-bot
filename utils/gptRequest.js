const axios = require('axios');
require('dotenv/config');

/**
 * GPT 요청을 프록시 서버로 보내는 함수
 * @param {Array} prompt - GPT API 형식의 메시지 배열
 * @param {string} model - 사용할 모델명 (기본값: gpt-5-chat-latest)
 * @returns {Promise} - API 응답
 */
async function sendGPTRequest(prompt, model = 'gpt-5.1-2025-11-23') {
  try {
    const response = await axios.post(
      `${process.env.TAIYAKI_URL}/openai/v1/chat/completions`,
      {
        model: model,
        messages: prompt,
        max_completion_tokens: 2000,
        temperature: 0.7,
        stream: false
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TAIYAKI_KEY}`,
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
