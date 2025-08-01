require('dotenv/config');
const axios = require('axios');
const {GoogleGenerativeAI, HarmCategory, HarmBlockThreshold} = require("@google/generative-ai");
const {getAccessToken} = require("./botFunction");

const API_KEY = process.env.GEMINI_API;
const VERTEX_JSON = JSON.parse(process.env.VERTEX_JSON);

// 기본 안전 설정
const defaultSafetySettings = [
    {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
];

// 기본 생성 설정
const defaultGenerationConfig = {
    maxOutputTokens: 9000,
    temperature: 0.7,
};

/**
 * Vertex AI에 요청을 보내는 범용 함수
 * @param {Array} chatHistory - 채팅 히스토리 배열 (role과 parts를 포함한 객체들)
 * @param {Object} generationConfig - 생성 설정 (maxOutputTokens, temperature 등)
 * @returns {Promise<string>} AI 응답 텍스트
 */
async function sendVertexRequest(chatHistory, generationConfig = {}) {
    try {
        // 액세스 토큰 가져오기
        const token = await getAccessToken(VERTEX_JSON.client_email, VERTEX_JSON.private_key);

        // 기본 설정과 사용자 설정 병합
        const config = { ...defaultGenerationConfig, ...generationConfig };

        // Vertex AI에 POST 리퀘스트 보내기
        const result = await axios.post(
            `https://aiplatform.googleapis.com/v1/projects/sigma-task-466213-d0/locations/global/publishers/google/models/gemini-2.5-pro:generateContent`,
            {
                contents: chatHistory,
                generationConfig: config,
                safetySettings: defaultSafetySettings,
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            }
        );

        // 응답 데이터 구조에 맞게 텍스트 추출
        const reply = result.data;
        return reply?.candidates?.[0]?.content?.parts?.[0]?.text || "응답을 받지 못했습니다.";

    } catch (error) {
        console.error("Vertex AI 요청 중 오류 발생:", error.response ? error.response.data : error.message);
        throw new Error(`Vertex AI 요청 실패: ${error.message}`);
    }
}

/**
 * Gemini AI에 요청을 보내는 범용 함수
 * @param {Array} chatHistory - 채팅 히스토리 배열 (role과 parts를 포함한 객체들)
 * @param {Object} generationConfig - 생성 설정 (maxOutputTokens, temperature 등)
 * @returns {Promise<string>} AI 응답 텍스트
 */
async function sendGeminiRequest(chatHistory, generationConfig = {}) {
    try {
        const genAI = new GoogleGenerativeAI(API_KEY);
        
        // 기본 설정과 사용자 설정 병합
        const config = { ...defaultGenerationConfig, ...generationConfig };

        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-pro',
            safetySettings: defaultSafetySettings,
        });

        const chat = model.startChat({
            history: chatHistory,
            generationConfig: config
        });

        // 마지막 메시지 전송
        const lastMessage = chatHistory[chatHistory.length - 1];
        const result = await chat.sendMessage(lastMessage.parts[0].text);
        const reply = await result.response;

        return reply.text();

    } catch (error) {
        console.error('Gemini AI 요청 중 오류 발생:', error);
        throw new Error(`Gemini AI 요청 실패: ${error.message}`);
    }
}

/**
 * 자동으로 Vertex AI 또는 Gemini AI를 선택하여 요청을 보내는 함수
 * @param {Array} chatHistory - 채팅 히스토리 배열
 * @param {Object} generationConfig - 생성 설정
 * @param {string} preferredAPI - 선호하는 API ('vertex' 또는 'gemini'), 기본값은 'vertex'
 * @returns {Promise<string>} AI 응답 텍스트
 */
async function sendAIRequest(chatHistory, generationConfig = {}, preferredAPI = 'vertex') {
    try {
        if (preferredAPI === 'vertex') {
            return await sendVertexRequest(chatHistory, generationConfig);
        } else if (preferredAPI === 'gemini') {
            return await sendGeminiRequest(chatHistory, generationConfig);
        } else {
            throw new Error('지원하지 않는 API입니다. "vertex" 또는 "gemini"를 사용해주세요.');
        }
    } catch (error) {
        console.error('AI 요청 실패:', error);
        throw error;
    }
}

module.exports = {
    sendVertexRequest,
    sendGeminiRequest,
    sendAIRequest,
    defaultSafetySettings,
    defaultGenerationConfig
}; 