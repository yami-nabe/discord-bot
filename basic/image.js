require('dotenv/config');
const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { sendImagenRequest } = require('../utils/imagenRequest');
const { sendGPTImageRequest, sendGPTI2IFromAttachments, getImageSize, getQualityByChannel } = require('../utils/gptImageRequest2');
const ImageRequestQueue = require('../utils/imageQueue');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ],
});

let messages = [];
const CHANNELS = ['1386548798607589406', '1389918297562026026'];

client.once('ready', () => {
    console.log('Discord 이미지 봇이 준비되었습니다. (GPT + Imagen)');
});

// gpt와 imagen 두 가지 명령어 지원
const gptPromptRegex = /^\s?gpt\s{0,3}```([pls])?\s?([\s\S]+)```/i;
const imagenPromptRegex = /^\s?imagen\s{0,3}```([pls])?\s?([\s\S]+)```/i;

// 이미지 메시지 ID를 추적하기 위한 맵
const imageMessageMap = new Map(); // key: 이미지 메시지 ID, value: { originMessageId, imageBuffer }

/**
 * Discord 메시지에 base64 이미지를 첨부하여 전송
 * @param {object} message - Discord 메시지 객체
 * @param {string} b64Json - base64 인코딩된 이미지 데이터
 * @returns {Promise<void>}
 */
async function sendImageMessage(message, b64Json) {
    const imageBuffer = Buffer.from(b64Json, 'base64');
    const attachment = new AttachmentBuilder(imageBuffer, {
        name: 'image.png',
    });
    const lastReply = await message.reply({ files: [attachment] });
    return lastReply;
}

/**
 * 이미지 생성 요청을 처리하는 함수
 * @param {object} request - 큐에서 전달받은 요청 객체
 */
async function processImageRequest(request) {
    try {
        let response;
        
        if (request.type === 'imagen') {
            // Imagen 요청 처리
            response = await sendImagenRequest(request.userMessage, request.aspectRatio);
            
            if (request.cancelled) {
                // 타임아웃 등으로 이미 취소된 요청이면 응답 무시
                return;
            }
            
            if (!response || !response.generatedImages || response.generatedImages.length === 0) {
                await request.message.reply('이미지 생성에 실패했습니다.');
                return;
            }
            
            // 첫 번째 이미지만 사용 (4개 중 1개)
            const generatedImage = response.generatedImages[0];
            const imageBytes = generatedImage.image.imageBytes;
            
            let imageMsg = null;
            if (request.message.channelId === '1389918297562026026') {
                imageMsg = await sendImageMessage(request.message, imageBytes);
                // 💾 이모지 추가
                try { await imageMsg.react('💾'); } catch (e) { console.warn('💾 이모지 추가 실패:', e); }
                // 이미지 메시지 맵에 저장 (버퍼도 저장)
                imageMessageMap.set(imageMsg.id, { originMessageId: request.message.id, imageBuffer: Buffer.from(imageBytes, 'base64') });
            } else {
                await sendImageMessage(request.message, imageBytes);
            }
        } else {
            // GPT 요청 처리
            const quality = getQualityByChannel(request.message.channelId);
            
            if (request.isI2I && request.attachments && request.attachments.length > 0) {
                // i2i 요청 처리
                response = await sendGPTI2IFromAttachments(request.attachments, request.userMessage, request.size, quality);
            } else {
                // t2i 요청 처리
                response = await sendGPTImageRequest(request.userMessage, request.size, quality);
            }
            
            if (request.cancelled) {
                // 타임아웃 등으로 이미 취소된 요청이면 응답 무시
                return;
            }
            if (!response.data || !response.data[0] || !response.data[0].b64_json) {
                await request.message.reply('이미지가 검열되어 생성되지 않았습니다.');
                return;
            }
            const b64Json = response.data[0].b64_json;
            let imageMsg = null;
            if (request.message.channelId === '1389918297562026026') {
                imageMsg = await sendImageMessage(request.message, b64Json);
                // 💾 이모지 추가
                try { await imageMsg.react('💾'); } catch (e) { console.warn('💾 이모지 추가 실패:', e); }
                // 이미지 메시지 맵에 저장 (버퍼도 저장)
                imageMessageMap.set(imageMsg.id, { originMessageId: request.message.id, imageBuffer: Buffer.from(b64Json, 'base64') });
            } else {
                await sendImageMessage(request.message, b64Json);
            }
        }
    } catch (error) {
        console.error('API Error:', error);
        try {
            if (error && error.message === 'timeout') {
                // 이미 타임아웃 메시지 전송됨
            } else if (error && error.response && error.response.status === 429) {
                await request.message.reply('429 에러: 너무 많은 요청이 감지되었습니다. 잠시 후 다시 시도해주세요.');
            } else if (error && error.message === 'API 요청 실패') {
                await request.message.reply('이미지 생성 중 서버 오류가 발생했습니다.');
            } else if (error && error.message === 'too_many_images') {
                await request.message.reply('최대 8개까지의 이미지만 첨부할 수 있습니다.');
            } else if (error && error.message === 'unsupported_type') {
                await request.message.reply('지원되지 않는 이미지 타입입니다.\n\n지원되는 이미지 타입: `jpg, png, webp`');
            } else if (error && error.message === 'file_too_large') {
                await request.message.reply('이미지 파일 크기가 50MB를 초과합니다.');
            } else {
                await request.message.reply('기타 에러가 발생했습니다.');
            }
        } catch (replyError) {
            console.error('에러 메시지 전송 실패:', replyError);
        }
        throw error; // 큐에서 에러를 처리할 수 있도록 다시 던짐
    }
}

// 큐 인스턴스 생성
const imageQueue = new ImageRequestQueue(150); // 150초 타임아웃

client.on('messageCreate', async message => {
    // 관리자 큐 조회 명령 처리
    if (
        message.author.id === '309989582240219137' &&
        /!queue/i.test(message.content)
    ) {
        const queueList = imageQueue.getQueueStatus();
        let reply = `현재 대기열이 비어 있습니다.`;
        if (queueList.length > 0) {
            reply = `[현재 대기열] - 총 ${queueList.length}명\n`;
            queueList.forEach((item, idx) => {
                const secAgo = Math.floor((Date.now() - item.timestamp) / 1000);
                reply += `${idx + 1}. [${item.type.toUpperCase()}] (${item.userMessage}) - ${secAgo}초 전${item.inProgress ? ' (진행중)' : ''}\n`;
            });
        }
        // 1000자 제한
        if (reply.length > 1000) {
            reply = reply.slice(0, 990) + '\n...\n(이하 생략)';
        }
        await message.reply(reply.trim());
        return;
    }
    if (!CHANNELS.includes(message.channelId)) return;
    if (message.author.bot) return;

    let requestType = null;
    let userMessage = '';
    let size = null;
    let aspectRatio = null;
    let hasAttachments = false;

    // gpt 명령어 확인
    if (gptPromptRegex.test(message.content)) {
        requestType = 'gpt';
        const matches = message.content.match(gptPromptRegex);
        const [, sizeModifier, prompt] = matches;
        userMessage = prompt.trim();
        size = getImageSize(sizeModifier);
        hasAttachments = message.attachments && message.attachments.size > 0;
    }
    // imagen 명령어 확인
    else if (imagenPromptRegex.test(message.content)) {
        requestType = 'imagen';
        const matches = message.content.match(imagenPromptRegex);
        const [, aspectModifier, prompt] = matches;
        userMessage = prompt.trim();
        
        // aspect ratio 결정 (1:1, 4:3, 3:4)
        aspectRatio = '1:1'; // 기본값
        if (aspectModifier === 'p') aspectRatio = '4:3';
        else if (aspectModifier === 'l') aspectRatio = '3:4';
    }
    // 둘 다 해당하지 않으면 무시
    else {
        return;
    }

    try {
        await message.react('✅');
    } catch (error) {
        console.warn('메시지 반응 추가에 실패했습니다:', error);
    }

    try {
        if (requestType === 'gpt') {
            await imageQueue.addRequest({
                message,
                type: 'gpt',
                size,
                userMessage,
                isI2I: hasAttachments,
                attachments: hasAttachments ? Array.from(message.attachments.values()) : null
            }, processImageRequest);
        } else if (requestType === 'imagen') {
            await imageQueue.addRequest({
                message,
                type: 'imagen',
                aspectRatio,
                userMessage,
            }, processImageRequest);
        }
    } catch (error) {
        console.error('Queue Error:', error);
    }
});

// messageReactionAdd 이벤트 핸들러 추가
client.on('messageReactionAdd', async (reaction, user) => {
    // 봇이 추가한 리액션은 무시
    if (user.bot) return;
    // 💾 이모지, 1389918297562026026 채널에서만 동작
    if (reaction.emoji.name !== '💾') return;
    if (reaction.message.channelId !== '1389918297562026026') return;
    // 이미지 메시지 맵에 있는지 확인
    const imageInfo = imageMessageMap.get(reaction.message.id);
    if (!imageInfo) return;
    // 이미지를 1390269708837851176 채널에 전송
    const targetChannel = await client.channels.fetch('1390269708837851176').catch(() => null);
    if (!targetChannel || !targetChannel.send) return;
    try {
        await targetChannel.send({ files: [{ attachment: imageInfo.imageBuffer, name: 'image.png' }] });
    } catch (e) {
        console.warn('타겟 채널 이미지 전송 실패:', e);
    }
});

client.login(process.env.IMGTOKEN);
