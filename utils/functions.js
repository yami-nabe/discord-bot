const { emojiDict } = require('./mapping');

/**
 * 텍스트에서 이모지 단축어를 긴 형태의 Discord 이모지로 변환합니다.
 * @param {string} text - 변환할 텍스트
 * @returns {string} 이모지가 긴 형태로 변환된 텍스트
 */
function toLongEmoji(text) {
    // 정규표현식으로 :emoji_name: 형태의 텍스트를 찾아서 emojiDict에서 치환
    const emojiPattern = /:([a-zA-Z0-9_]+):/g;
    
    return text.replace(emojiPattern, (match, emojiName) => {
        const fullMatch = `:${emojiName}:`;
        return emojiDict[fullMatch] || match; // emojiDict에 없으면 원본 반환
    });
}

/**
 * Discord의 긴 형태 이모지를 짧은 형태로 변환합니다.
 * @param {string} text - 변환할 텍스트
 * @returns {string} 이모지가 짧은 형태(:emoji_name:)로 변환된 텍스트
 */
function toShortEmoji(text) {
    // Regular expression to match full-name emojis, both static and animated
    const emojiPattern = /<a?:([a-zA-Z0-9_]+):\d+>/g;

    // Replace full-name emojis with their shorter form
    return text.replace(emojiPattern, (match, p1) => {
        // Return emoji name with underscores preserved
        return `:${p1}:`;
    });
}

/**
 * 긴 메시지를 여러 개의 작은 메시지로 나누어 전송합니다.
 * @param {Object} message - Discord 메시지 객체
 * @param {string} content - 전송할 내용
 * @returns {Promise<void>}
 */
async function sendLongMessage(message, content) {
    const MAX_LENGTH = 2000;
    let startIndex = 0;
    let lastReply;

    while (startIndex < content.length) {
        const endIndex = Math.min(startIndex + MAX_LENGTH, content.length);
        const messagePart = content.slice(startIndex, endIndex);
        lastReply = await message.reply(messagePart);
        startIndex = endIndex;
    }

    if(lastReply&&!(content.startsWith('Current log:'))){
        await lastReply.react('🔄');
        await lastReply.react('❌');
    }
}

/**
 * 긴 메시지를 여러 개의 작은 메시지로 나누어 채널에 전송합니다.
 * @param {Object} channel - Discord 채널 객체
 * @param {string} content - 전송할 내용
 * @returns {Promise<void>}
 */
async function sendLongNormalMessage(channel, content) {
    const MAX_LENGTH = 2000;
    let startIndex = 0;

    while (startIndex < content.length) {
        const endIndex = Math.min(startIndex + MAX_LENGTH, content.length);
        const messagePart = content.slice(startIndex, endIndex);
        await channel.send(messagePart);
        startIndex = endIndex;
    }
}

/**
 * 스트리밍 응답에서 텍스트를 추출합니다.
 * @param {string} response - 스트리밍 응답 데이터
 * @returns {string} 추출된 텍스트
 */
function extractTextFromResponse(response) {
    // Split the response into individual lines
    const lines = response.split('\n');
    let collectedText = '';

    // Loop through each line and look for "content_block_delta" events
    lines.forEach(line => {
        if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'content_block_delta' && data.delta.type === 'text_delta') {
                collectedText += data.delta.text;
            }
        }
    });

    return collectedText;
}

/**
 * 대화 로그를 포맷팅하여 메시지로 전송합니다.
 * @param {Object} message - Discord 메시지 객체
 * @param {Array} messages - 대화 메시지 배열
 * @returns {Promise<void>}
 */
async function sendLog(message, messages){
    const logOutput = messages.map((msg, index) => {
        const rolePrefix = msg.role === 'user' ? 'U' : 'A';
        return `${index + 1}. ${rolePrefix}: ${msg.content.split(' ').slice(0, 5).join(' ')}...`;
    }).join('\n');
    await sendLongMessage(message, `Current log:\n\`\`\`\n${logOutput}\n\`\`\``);
}

/**
 * Gemini 대화 로그를 포맷팅하여 메시지로 전송합니다.
 * @param {Object} message - Discord 메시지 객체
 * @param {Array} messages - Gemini 대화 메시지 배열
 * @returns {Promise<void>}
 */
async function sendGeminiLog(message, messages){
    // Generate the log output by mapping over the messages array
    const logOutput = messages.map((msg, index) => {
        // Determine the role prefix (U for user, A for assistant)
        const rolePrefix = msg.role === 'user' ? 'U' : 'A';
        // Extract the text from the parts array
        const messageText = msg.parts.map(part => part.text).join(' ');
        // Take the first 5 words of the message content and join them with spaces
        const truncatedContent = messageText.split(' ').slice(0, 5).join(' ') + '...';
        // Return the formatted string for this message
        return `${index + 1}. ${rolePrefix}: ${truncatedContent}`;
    }).join('\n'); // Join all messages with newlines

    // Send the formatted log output as a long message in a code block
    await sendLongMessage(message, `Current log:\`\`\`\n${logOutput}\n\`\`\``);
}

/**
 * Google OAuth2 액세스 토큰을 가져옵니다.
 * @param {string} clientEmail - Google 서비스 계정 이메일
 * @param {string} privateKey - Google 서비스 계정 개인 키
 * @returns {Promise<string>} 액세스 토큰
 * @throws {Error} 토큰 가져오기 실패 시 에러
 */
async function getAccessToken(clientEmail, privateKey) {
    const jwt = await generateJWT(clientEmail, privateKey);
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });
    if (!response.ok) {
        let errorText;
        try {
            errorText = JSON.stringify(await response.json());
        }
        catch {
            errorText = response.status;
        }
        throw new Error(`Failed to refresh google access token: ${errorText}`);
    }
    const data = await response.json();
    const accessToken = data.access_token;
    if (!accessToken) {
        throw new Error("No google access token in the response");
    }
    return accessToken;
}

/**
 * Google 서비스 계정을 위한 JWT 토큰을 생성합니다.
 * @param {string} clientEmail - Google 서비스 계정 이메일
 * @param {string} privateKey - Google 서비스 계정 개인 키
 * @returns {Promise<string>} JWT 토큰
 * @throws {Error} 유효하지 않은 이메일이나 개인 키일 경우 에러
 */
async function generateJWT(clientEmail, privateKey) {
    if (!clientEmail.includes("gserviceaccount.com")) {
        throw new Error("Invalid Vertex project id. Must include gserviceaccount.com");
    }
    if (!privateKey.includes("-----BEGIN PRIVATE KEY-----") ||
        !privateKey.includes("-----END PRIVATE KEY-----")) {
        throw new Error("Invalid Vertex private key. Must include proper key markers.");
    }
    const header = {
        alg: "RS256",
        typ: "JWT",
    };
    const now = Math.floor(Date.now() / 1000);
    const claimSet = {
        iss: clientEmail,
        scope: "https://www.googleapis.com/auth/cloud-platform",
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now,
    };
    const encodedHeader = base64url(new TextEncoder().encode(JSON.stringify(header)));
    const encodedClaimSet = base64url(new TextEncoder().encode(JSON.stringify(claimSet)));
    const key = await crypto.subtle.importKey("pkcs8", str2ab(privateKey), {
        name: "RSASSA-PKCS1-v1_5",
        hash: { name: "SHA-256" },
    }, false, ["sign"]);
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${encodedHeader}.${encodedClaimSet}`));
    return `${encodedHeader}.${encodedClaimSet}.${base64url(new Uint8Array(signature))}`;
}

/**
 * PEM 형식의 개인 키를 ArrayBuffer로 변환합니다.
 * @param {string} privateKey - PEM 형식의 개인 키
 * @returns {ArrayBuffer} 변환된 ArrayBuffer
 */
function str2ab(privateKey) {
    const binaryString = atob(privateKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\\n/g, ""));
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * 데이터를 base64url 형식으로 인코딩합니다.
 * @param {Uint8Array} source - 인코딩할 데이터
 * @returns {string} base64url로 인코딩된 문자열
 */
function base64url(source) {
    return btoa(String.fromCharCode.apply(null, [...source]))
        .replace(/=+$/, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}

module.exports = {toShortEmoji,toLongEmoji, sendLongMessage, sendLongNormalMessage, extractTextFromResponse,sendLog, sendGeminiLog,generateJWT,getAccessToken};