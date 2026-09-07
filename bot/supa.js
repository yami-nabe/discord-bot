require('dotenv/config');

const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

const {
  Client,
  Events,
  GatewayIntentBits,
  InteractionType,
  MessageFlags,
} = require('discord.js');

const { sendLongMessage } = require('../utils/functions');
const { sendVertexRequest } = require('../utils/geminiRequest');
const { DEFAULT_PERSONA, matchPersonaRequest } = require('./prompts/personas');
const {
  handleGachaCommand,
  getGachaInfo,
  getGachaList,
  getMyGachaInfo,
  useCeilingCoupon,
  getGachaStatsCommand,
} = require('./gacha/gacha-function');
const { getUser } = require('./gacha/gacha-user');
const {
  buildSummaryPrompt,
  buildReplyPrompt,
} = require('./prompts/supa-prompts');

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
  console.log(`Supa Memory (gemini) Ready!`);
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
    this.lastResponseModel = '';
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

  setLastResponse(text, model) {
    this.lastResponse = text;
    this.lastResponseTime = Date.now();
    this.lastResponseModel = model;
  }

  getLastResponse(model) {
    if (
      Date.now() - this.lastResponseTime < 5 * 60 * 1000 &&
      this.lastResponseModel === model
    )
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

  clearPersonaLogs() {
    this.log = this.log.filter(
      (entry) => entry.source !== 'persona'
    );
    this.lastResponse = null;
    this.lastResponseTime = 0;
    this.lastResponseModel = '';
    this.lastReplyResponse = null;
    this.lastReplyResponseTime = 0;
    this.lastReplyRequestKey = '';
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
    if (msg.personaName) return;
    if (!map.has(msg.author)) {
      map.set(msg.author, `챗붕 ${n}`);
      n++;
    }
  });

  return entries
    .map(
      (m) =>
        `${m.personaName || map.get(m.author)} ${formatTimestamp(m.timestamp)}\n${m.content}`
    )
    .join('\n');
}

// ───────────────────────────────────────────────
// 요약 요청
// ───────────────────────────────────────────────
function editSupaOutput(text) {
  return text.replace(/`/g, '');
}

async function requestSummary(channelId, model = DEFAULT_GEMINI_MODEL) {
  const log = channelLogs.get(channelId);
  if (!log) return null;

  const cached = log.getLastResponse(model);
  if (cached) return cached;

  const prompt = buildSummaryPrompt(logToText(channelId));
  const response = await sendVertexRequest(prompt, {}, model);

  log.setLastResponse(response, model);
  return editSupaOutput(response);
}

async function requestReply(
  channelId,
  userRequest,
  {
    persona = DEFAULT_PERSONA,
    model = DEFAULT_GEMINI_MODEL,
    contextLogText = logToText(channelId),
  } = {}
) {
  const log = channelLogs.get(channelId);
  if (!log) return null;

  const requestKey = JSON.stringify([persona.id, model, userRequest]);
  const cached = log.getLastReplyResponse(requestKey);
  if (cached) return cached;

  const prompt = buildReplyPrompt(contextLogText, userRequest, persona);
  const response = editSupaOutput(await sendVertexRequest(prompt, {}, model));

  log.setLastReplyResponse(response, requestKey);
  return response;
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
    if (result && result.meta?.isNoTicket) {
      await interaction.reply({
        content: result.plainText,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
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
      if (result.meta?.bonusTicketGranted) {
        try {
          await interaction.followUp({
            content: `🎉 **${interaction.user.username}**님이 보너스를 터뜨렸어요! 추가 가챠권 1회 지급!`,
          });
        } catch (err) {
          console.error('[가챠 보너스] 채널 메시지 전송 실패:', err);
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

  if (/^!clear\s*$/i.test(message.content)) {
    log.clearPersonaLogs();
    await message.reply('모든 페르소나의 질답 기록이 초기화되었습니다.');
    return;
  }

  if (/(링[\s\\]*크|link)/.test(message.content)) {
    try {
      await message.react('1322877094707068950');
    } catch {}
  }

  const personaRequest = matchPersonaRequest(message.content);
  if (personaRequest) {
    try {
      await message.react('✅');
      const { persona, userRequest } = personaRequest;
      // 질문을 로그에 추가하기 전 문맥을 보존해 기존 프롬프트 동작을 유지한다.
      const contextLogText = logToText(message.channelId);
      log.add({
        timestamp: Date.now(),
        content: message.content,
        author: message.author.id,
        source: 'persona',
        personaId: persona.id,
      });

      const text = await requestReply(
        message.channelId,
        userRequest,
        { persona, contextLogText }
      );
      log.add({
        timestamp: Date.now(),
        content: text,
        author: `__persona:${persona.id}__`,
        source: 'persona',
        personaId: persona.id,
        personaName: persona.name,
      });
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
