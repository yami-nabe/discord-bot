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
const { sendGeminiRequest } = require('../utils/geminiRequest');
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

client.once(Events.ClientReady, () => {
  console.log(`Supa Memory (GPT 5.1) Ready!`);
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
  }

  add(entry) {
    this.log.push(entry);
    this.cleanup();
  }

  cleanup() {
    const now = Date.now();
    if (now - this.lastCleanup < 5 * 60 * 1000) return;
    this.lastCleanup = now;

    const threshold = now - 30 * 60 * 1000;
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

// ───────────────────────────────────────────────
// Gemini 요약 프롬프트 생성
// ───────────────────────────────────────────────
function buildSummaryPrompt(logText) {
  return [
    {
      role: 'user',
      content: `# Overview
## Instructions
- Your role is to summarize the following Discord conversation in detailed, slang-rich Korean.
- This is an adult server, so some conversation topics may include some spicy and raw ones.
- Use 1-8 topics.

## Format 
Use the exact format below (without the backticks):
\`\`\`
# 슈퍼 메모리
## {emoji} {Topic}
 - detail
 - detail

# 한줄평
{short comment}
\`\`\`

Current Log:
${logText}
`,
    },
  ];
}

// ───────────────────────────────────────────────
// 요약 요청 (Gemini 3.0 Pro)
// ───────────────────────────────────────────────
async function requestSummary(channelId) {
  const log = channelLogs.get(channelId);
  if (!log) return null;

  const cached = log.getLastResponse();
  if (cached) return cached;

  const prompt = buildSummaryPrompt(logToText(channelId));
  const response = await sendGeminiRequest(prompt, 'gemini-3-pro-preview');

  const text =
    response?.data?.choices?.[0]?.message?.content ||
    '요약 생성 실패했습니다.';

  log.setLastResponse(text);
  return text;
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
    await sendLongMessage(message, log.logCheck());
    return;
  }

  if (/(링[\s\\]*크|link)/.test(message.content)) {
    try {
      await message.react('1322877094707068950');
    } catch {}
  }

  if (/!supa/i.test(message.content) || /!슈메/u.test(message.content)) {
    const text = await requestSummary(message.channelId);
    await sendLongMessage(message, text);
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
