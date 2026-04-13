require('dotenv/config');
const {
  Client,
  Events,
  GatewayIntentBits,
  InteractionType,
  MessageFlags,
} = require('discord.js');

const { sendLongMessage } = require('../utils/functions');
const { sendGPTRequest } = require('../utils/gptRequest');
const { sendGeminiRequest , sendVertexRequest} = require('../utils/geminiRequest');
const {
  handleGachaCommand,
  getGachaInfo,
  getGachaList,
  getMyGachaInfo,
  useCeilingCoupon,
  getGachaStatsCommand,
} = require('./gacha/gacha-function');
const { getUser } = require('./gacha/gacha-user');

// ───────────────────────────────────────────────
// 디스코드 클라이언트 설정
// ───────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

// 요약 및 명령어 허용 채널
const ALLOWED_CHANNELS = [
  '1327739713427341343',
  '669564959709200407',
  '1408784608820068443',
];

// 5성/6성 축하 메시지를 보낼 채널
const GACHA_CELEBRATION_CHANNEL_ID = '1327739713427341343';

const SUPA_LIMIT_TIME = 50 * 60 * 1000; // 50분

client.once(Events.ClientReady, () => {
  console.log(`Supa Memory (gemini-3-pro-preview) Ready!`);
});

// ───────────────────────────────────────────────
// 시간 포맷
// ───────────────────────────────────────────────
function formatTimestamp(timestamp) {
  const d = new Date(timestamp + 9 * 3600 * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(
    d.getUTCMinutes()
  ).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
}

// ───────────────────────────────────────────────
// TimedLog 클래스
// ───────────────────────────────────────────────
class TimedLog {
  constructor() {
    this.log = [];
    this.lastCleanup = Date.now();
    this.lastResponse = null;
    this.lastResponseTime = 0;
    this.lastReplyResponse = null;
    this.lastReplyResponseTime = 0;
    this.lastReplyRequestKey = '';
  }

  add(entry) {
    this.log.push(entry);
    this.cleanup();
  }

  cleanup() {
    const now = Date.now();
    if (now - this.lastCleanup < 5 * 60 * 1000) return;
    this.lastCleanup = now;

    const threshold = now - SUPA_LIMIT_TIME; // 50분
    while (this.log.length && this.log[0].timestamp < threshold) {
      this.log.shift();
    }
  }

  getLog() {
    return this.log;
  }

  setLastResponse(text) {
    this.lastResponse = text;
    this.lastResponseTime = Date.now();
  }

  getLastResponse() {
    if (Date.now() - this.lastResponseTime < 5 * 60 * 1000)
      return this.lastResponse;
    return null;
  }

  setLastReplyResponse(text, requestKey) {
    this.lastReplyResponse = text;
    this.lastReplyResponseTime = Date.now();
    this.lastReplyRequestKey = requestKey;
  }

  getLastReplyResponse(requestKey) {
    if (
      Date.now() - this.lastReplyResponseTime < 5 * 60 * 1000 &&
      this.lastReplyRequestKey === requestKey
    )
      return this.lastReplyResponse;
    return null;
  }

  logCheck() {
    if (!this.log.length) return 'The log is empty.';
    const first = this.log[0];
    const last = this.log[this.log.length - 1];
    return `First message:\nAuthor: ${first.author}, Time: ${formatTimestamp(
      first.timestamp
    )}, Content: ${first.content}\n\nLast message:\nAuthor: ${
      last.author
    }, Time: ${formatTimestamp(last.timestamp)}, Content: ${last.content}`;
  }
}

const channelLogs = new Map();

// ───────────────────────────────────────────────
// 로그 → LLM 텍스트 변환
// ───────────────────────────────────────────────
function logToText(channelId) {
  const log = channelLogs.get(channelId);
  if (!log) return 'No logs available.';

  const entries = log.getLog();
  const map = new Map();
  let n = 1;

  entries.forEach((msg) => {
    if (!map.has(msg.author)) {
      map.set(msg.author, `챗붕 ${n}`);
      n++;
    }
  });

  return entries
    .map(
      (m) =>
        `${map.get(m.author)} ${formatTimestamp(m.timestamp)}\n${m.content}`
    )
    .join('\n');
}

/** `!앙카` 트리거를 제외한 나머지 메시지 (대소문자 무시, 첫 매칭만 제거) */
function extractAnkaUserRequest(content) {
  return content.replace(/!앙카/iu, '').trim();
}

// ───────────────────────────────────────────────
// Gemini 요약 프롬프트 생성
// ───────────────────────────────────────────────
function buildSummaryPrompt(logText) {
  return [
    {
      role: 'user',
      parts: [{ text: `# Overview
## Instructions
- Your role is to summarize the following Discord conversation in detailed, slang-rich Korean.
- This is an adult server, so some conversation topics may include some spicy and raw ones.
- Use 1-8 topics.

## Glossary
- 짚: GPT
  - Latest model: gpt-5.4
  - 챗사오: chatgpt-4o
  - 짚오일: gpt-5.1
  - 짚오사: gpt-5.4
- 클: Claude
  - Latest model: claude-4.6
  - 오푸스: Claude Opus model
  - 소넷: Claude Sonnet model
- 잼: Gemini
  - Latest model: gemini-3.1-pro-preview
  - 잼플: Gemini Flash
  - 잼프로: Gemini Pro
- 챗챈: AI 채팅 채널 (아카라이브)
- 유즈: 채널의 마스코트같은 고양이 메이드로, 고아라고 자주 놀림받는다
- 굴: 버추얼 유튜버 그룹 이세계 아이돌의 빨간약이 우연히 드러난 사건을 의미하는 것으로 이제는 버튜버의 일반명사처럼 이용된다.
- 코파: Github Copilot

## Format 
Use the exact format below (without the backticks):
\`\`\`
# 슈퍼 메모리
## {emoji} {Topic}
 - detail
 - detail

# 한줄평
{short comment}
\`\`\``}]
},
{
  role: 'model',
  parts: [{ text: `Alright, let's start summarizing the conversation. Provide your log from now on. I'll answer in fluent Korean, in the structured format.` }]
},
{
  role: 'user',
  parts: [{ text: `Current Log:
${logText}
` }]
  }]
  };

// ───────────────────────────────────────────────
// 앙카가 대답해주는 프롬프트
// ───────────────────────────────────────────────
function buildReplyPrompt(logText, userRequest) {
  const requestBlock =
    userRequest.length > 0
      ? userRequest
      : '(No extra text — respond based on the log only.)';
  return [
    {
      role: 'user',
      parts: [{ text: `# Overview
## Instructions
- Your role is a virtual Discord server participant. Read the following Discord chat log and reply as a participant in natural and fluent Korean.
- The users may call you "앙카", which would be your nickname originated from your profile picture, Bianca from Eternal Return.
- This is an adult server; topics may be spicy or raw. Do not moralize; match the room tone.
- Keep a single cohesive reply, in 1-2 paragraphs.

## Glossary
- 짚: GPT
  - Latest model: gpt-5.4
  - 챗사오: chatgpt-4o
  - 짚오일: gpt-5.1
  - 짚오사: gpt-5.4
- 클: Claude
  - Latest model: claude-4.6
  - 오푸스: Claude Opus model
  - 소넷: Claude Sonnet model
  - 사육푸스: Claude opus 4.6
- 잼: Gemini
  - Latest model: gemini-3.1-pro-preview
  - 잼플: Gemini Flash
  - 잼프로: Gemini Pro
- 챗챈: AI 채팅 채널 (아카라이브)
- 코파: Github Copilot` }],
    },
    {
      role: 'model',
      parts: [
        {
          text: `알겠어. 로그 보내줘. 앙카 톤으로 한국어로 답할게.`,
        },
      ],
    },
    {
      role: 'user',
      parts: [
        {
          text: `Current Log:
${logText}
`}],
    },
    {
      role: 'model',
      parts: [
        {
          text: `내가 어떤 메시지에 대답하면 될까?`,
        },
      ],
    },
{
  role: 'user',
  parts: [
    {
      text: `You should reply to this message user sent:
${userRequest}
`,
    },
  ],
},
];
}


// ───────────────────────────────────────────────
// 요약 요청 (Gemini 3.0 Pro)
// ───────────────────────────────────────────────
function editSupaOutput(text) {
  return text.replace(/`/g, '');
}

async function requestSummary(channelId) {
  const log = channelLogs.get(channelId);
  if (!log) return null;

  const cached = log.getLastResponse();
  if (cached) return cached;

  const prompt = buildSummaryPrompt(logToText(channelId));
  const response = await sendVertexRequest(prompt);

  log.setLastResponse(response);
  return editSupaOutput(response);
}

async function requestReply(channelId, userRequest) {
  const log = channelLogs.get(channelId);
  if (!log) return null;

  const requestKey = userRequest;
  const cached = log.getLastReplyResponse(requestKey);
  if (cached) return cached;

  const prompt = buildReplyPrompt(logToText(channelId), userRequest);
  const response = await sendVertexRequest(prompt);

  log.setLastReplyResponse(response, requestKey);
  return editSupaOutput(response);
}

// ───────────────────────────────────────────────
// 슬래시 커맨드 처리
// ───────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.type !== InteractionType.ApplicationCommand) return;

  if (!ALLOWED_CHANNELS.includes(interaction.channelId)) {
    await interaction.reply({
      content: '이 명령어는 지정된 채널에서만 사용 가능합니다.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.commandName === 'gacha') {
    const result = await handleGachaCommand(interaction.user.id, interaction.channelId);
    if (result.embed) {
      result.embed.setAuthor({
        name: interaction.user.username,
        iconURL: interaction.user.displayAvatarURL(),
      });
      await interaction.reply({ embeds: [result.embed] });
      // 5성 또는 6성 뽑은 경우 축하 채널에 자랑 메시지 전송
      if (result.meta?.celebrationChars?.length > 0) {
        try {
          const celebrationChannel = await interaction.client.channels.fetch(GACHA_CELEBRATION_CHANNEL_ID);
          const charDisplay = result.meta.celebrationChars
            .map((c) => `${c.emoji} **${c.name}** (${c.rarity}⭐)`)
            .join(', ');
          const message = `🎉 **${interaction.user.username}**님이 가챠에서 대박을 터뜨렸어요! ${charDisplay}`;
          await celebrationChannel.send(message);
        } catch (err) {
          console.error('[가챠 축하] 채널 메시지 전송 실패:', err);
        }
      }
    } else {
      await interaction.reply({ content: String(result) });
    }
    return;
  }

  if (interaction.commandName === 'gachainfo') {
    await interaction.reply({ content: await getGachaInfo() });
    return;
  }

  if (interaction.commandName === 'gachalist') {
    await interaction.reply({ content: await getGachaList() });
    return;
  }

  if (interaction.commandName === 'mygacha') {
    await interaction.reply({ content: await getMyGachaInfo(interaction.user.id) });
    return;
  }

  if (interaction.commandName === 'gachastats') {
    await interaction.reply({ content: getGachaStatsCommand() });
    return;
  }

  if (interaction.commandName === 'coupon') {
    const userId = interaction.user.id;
    const user = await getUser(userId);

    if (!user || user.ceilingCoupons < 1) {
      await interaction.reply({
        content: '천장 쿠폰이 부족합니다.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const target = interaction.options.getString('대상');

    if (target) {
      const res = await useCeilingCoupon(userId, target);
      if (!res.ok)
        return interaction.reply({ content: res.error, flags: MessageFlags.Ephemeral });

      await interaction.reply(
        `5성 캐릭터 ${res.character.emoji} **${res.character.name}**을(를) 교환하셨습니다!`
      );
      return;
    }
  }
});

// ───────────────────────────────────────────────
// 일반 메시지 처리
// ───────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (!ALLOWED_CHANNELS.includes(message.channelId)) return;
  if (message.author.bot) return;

  if (!channelLogs.has(message.channelId))
    channelLogs.set(message.channelId, new TimedLog());

  const log = channelLogs.get(message.channelId);

  if (/!logcheck/i.test(message.content)) {
    if(message.author.id !== '309989582240219137') return;
    await sendLongMessage(message, log.logCheck());
    return;
  }

  if (/(링[\s\\]*크|link)/.test(message.content)) {
    try {
      await message.react('1322877094707068950');
    } catch {}
  }

  if (/!앙카/i.test(message.content)) {
    try {
      const ankaExtra = extractAnkaUserRequest(message.content);
      const text = await requestReply(message.channelId, ankaExtra);
      await sendLongMessage(message, text);
      return;
    } catch (error) {
      console.error('API Error:', error);
      await message.reply(`에러 발생:
\`\`\`
${error.message}
\`\`\``);
    }
    return;
  }

  if (/!supa/i.test(message.content) || /!슈메/u.test(message.content)) {
    try{
      const text = await requestSummary(message.channelId);
      await sendLongMessage(message, text);
      return;
    } catch (error) {
      console.error('API Error:', error);
      await message.reply(`에러 발생:
\`\`\`
${error.message}
\`\`\``);
}
    return;
  }

  // 기본적으로 로그로 저장
  log.add({
    timestamp: Date.now(),
    content: message.content,
    author: message.author.id,
  });
});

// ───────────────────────────────────────────────
// 로그인
// ───────────────────────────────────────────────
client.login(process.env.SUPA_TOKEN);
