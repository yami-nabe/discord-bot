const axios = require('axios');
require('dotenv/config');

const DEEPSEEK_API_URL = 'https://wellspring.encrypt.gay/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-v4-pro';

/**
 * DeepSeek 요청을 OpenAI 호환 Chat Completions 포맷으로 보내는 함수
 * @param {Array} prompt - OpenAI Chat Completions API 형식의 메시지 배열
 * @returns {Promise} - API 응답
 */
async function sendDeepSeekRequest(prompt) {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Discord-Bot/1.0'
    };

    if (process.env.DEEPSEEK_KEY) {
      headers.Authorization = `Bearer ${process.env.DEEPSEEK_KEY}`;
    }

    const response = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: DEEPSEEK_MODEL,
        messages: prompt,
        max_tokens: 3000,
        temperature: 0.7,
        stream: false
      },
      {
        headers,
        timeout: 30000
      }
    );

    return response;
  } catch (error) {
    console.error('DeepSeek 요청 에러:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  sendDeepSeekRequest
};
