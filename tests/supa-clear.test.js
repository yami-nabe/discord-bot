const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const TARGET_CHANNEL = '1246070709789261924';
const OTHER_CHANNEL = '1327739713427341343';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// Discord 로그인, 외부 API, 실제 프롬프트 없이 메시지 처리 전체를 실행합니다.
function loadBot({ request = async () => 'answer', send, search, quota } = {}) {
  const handlers = new Map();
  const apiCalls = [];
  const searchCalls = [];
  quota ||= {
    used: 0,
    consume() {
      if (this.used >= 200) throw new Error('오늘의 검색 한도 200회를 모두 사용했습니다.');
      this.used++;
    },
    getStatus() { return { remaining: 200 - this.used }; },
  };
  const persona = { id: 'test', name: '테스트', emoji: '🤖' };
  const dependencies = {
    'dotenv/config': {},
    'discord.js': {
      Client: class {
        on(event, handler) { handlers.set(event, handler); }
        once() {}
        login() {}
      },
      Events: { ClientReady: 'ready', InteractionCreate: 'interactionCreate' },
      GatewayIntentBits: {},
      InteractionType: {},
      MessageFlags: {},
    },
    '../utils/functions': {
      sendLongMessage: send || (async (message, text) => message.reply(text)),
    },
    '../utils/geminiRequest': {
      sendVertexRequest: async (contents, config, model, systemInstruction, options) => {
        if (options?.googleSearch) {
          searchCalls.push(contents);
          return search ? search(contents) : {
            text: 'verified search findings', sources: [{ title: 'Example', uri: 'https://example.com/' }],
          };
        }
        apiCalls.push({ ...(Array.isArray(contents) ? contents[0] : contents), contents });
        return request(contents);
      },
    },
    '../utils/supaSearch': { ...require('../utils/supaSearch'), searchQuota: quota },
    './prompts/personas': {
      PERSONAS: [persona], DEFAULT_PERSONA: persona,
      matchPersonaRequest: (content) => content.startsWith('@테스트 ')
        ? { persona, userRequest: content.slice('@테스트 '.length) } : null,
    },
    './prompts/supa-prompts': {
      buildReplyPrompt: (log, userRequest) => ({ contents: [{ log, userRequest }] }),
      buildSummaryPrompt: (log) => ({ log, summary: true }),
      buildSearchPrompt: (query) => ({ contents: [{ role: 'user', parts: [{ text: query }] }] }),
      buildSearchContext: (query, result) => JSON.stringify({ query, result }),
    },
    './gacha/gacha-function': {},
    './gacha/gacha-user': {},
    './gacha/gacha-format': {},
  };
  const context = {
    module: { exports: {} }, console, process: { env: {} },
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../bot/supa.js'), 'utf8');
  vm.runInNewContext(source + '\nmodule.exports = { channelLogs, logToText };', context);
  return {
    ...context.module.exports, apiCalls, searchCalls, quota,
    handle: (message) => handlers.get('messageCreate')(message),
  };
}

function message(content, channelId = TARGET_CHANNEL, overrides = {}) {
  const replies = [];
  return {
    content, channelId, replies, author: { id: 'user', bot: false },
    react: async () => {},
    reply: async (text) => { replies.push(text); },
    ...overrides,
  };
}

test('clear preserves ordinary conversation and removes persona context and caches only in its own channel', async () => {
  const bot = loadBot();
  for (const channelId of [TARGET_CHANNEL, OTHER_CHANNEL]) {
    await bot.handle(message('ordinary conversation', channelId));
    await bot.handle(message('@테스트 question', channelId));
    await bot.handle(message('!supa', channelId));
  }
  const otherLog = bot.logToText(OTHER_CHANNEL);
  const otherReply = bot.channelLogs.get(OTHER_CHANNEL).lastReplyResponse;
  const otherSummary = bot.channelLogs.get(OTHER_CHANNEL).lastResponse;
  const ordinaryEntry = bot.channelLogs.get(TARGET_CHANNEL).getLog()[0];
  const clear = message(' \t!CLEAR\n');
  await bot.handle(clear);
  assert.match(clear.replies[0], /이 채널/);
  assert.equal(bot.channelLogs.get(TARGET_CHANNEL).getLog().length, 1);
  assert.equal(bot.channelLogs.get(TARGET_CHANNEL).getLog()[0], ordinaryEntry);
  const preservedLog = bot.logToText(TARGET_CHANNEL);
  assert.match(preservedLog, /ordinary conversation/);
  assert.doesNotMatch(preservedLog, /question|answer/);
  assert.equal(bot.channelLogs.get(TARGET_CHANNEL).lastReplyResponse, null);
  assert.equal(bot.channelLogs.get(TARGET_CHANNEL).lastResponse, null);
  assert.equal(bot.logToText(OTHER_CHANNEL), otherLog);
  assert.equal(bot.channelLogs.get(OTHER_CHANNEL).lastReplyResponse, otherReply);
  assert.equal(bot.channelLogs.get(OTHER_CHANNEL).lastResponse, otherSummary);

  const callsBefore = bot.apiCalls.length;
  await bot.handle(message('@테스트 question', OTHER_CHANNEL));
  assert.equal(bot.apiCalls.length, callsBefore, 'other channel retains its cache');
  await bot.handle(message('@테스트 question'));
  assert.equal(bot.apiCalls.length, callsBefore + 1, 'cleared channel makes a fresh request');
  assert.equal(bot.apiCalls.at(-1).log, preservedLog);
  await bot.handle(message('!clear'));
  await bot.handle(message('!supa'));
  assert.equal(bot.apiCalls.at(-1).log, preservedLog);
});

for (const command of ['@테스트 question', '!supa']) {
  test(`clear discards an in-flight ${command} without overwriting a newer response`, async () => {
    const started = deferred();
    const pending = deferred();
    let calls = 0;
    const bot = loadBot({ request: async () => {
      if (++calls === 1) {
        started.resolve();
        return pending.promise;
      }
      return 'new answer';
    } });
    await bot.handle(message('old context'));
    const oldMessage = message(command);
    const oldTask = bot.handle(oldMessage);
    await started.promise;
    await bot.handle(message('!clear'));
    await bot.handle(message('new context'));
    await bot.handle(message(command));
    const contextAfterClear = bot.logToText(TARGET_CHANNEL);
    pending.resolve('old answer');
    await oldTask;
    assert.equal(oldMessage.replies.length, 0);
    assert.equal(bot.logToText(TARGET_CHANNEL), contextAfterClear);
    const cache = command === '!supa' ? 'lastResponse' : 'lastReplyResponse';
    assert.equal(bot.channelLogs.get(TARGET_CHANNEL)[cache], 'new answer');
    assert.match(bot.apiCalls.at(-1).log, /old context/);
    assert.match(bot.apiCalls.at(-1).log, /new context/);
  });
}

test('clear while a reply is being sent prevents its question and answer from being restored', async () => {
  const started = deferred();
  const sending = deferred();
  const bot = loadBot({ send: async () => {
    started.resolve();
    await sending.promise;
  } });
  const task = bot.handle(message('@테스트 question'));
  await started.promise;
  await bot.handle(message('!clear'));
  sending.resolve();
  await task;
  assert.equal(bot.logToText(TARGET_CHANNEL), '');
  assert.equal(bot.channelLogs.get(TARGET_CHANNEL).lastReplyResponse, null);
});

for (const content of ['@테스트 question', '!supa', '@테스트 link', '!supa link']) {
  test(`clear during a delayed reaction does not revive the earlier message: ${content}`, async () => {
    const started = deferred();
    const reacting = deferred();
    const bot = loadBot();
    const task = bot.handle(message(content, TARGET_CHANNEL, {
      react: async () => { started.resolve(); await reacting.promise; },
    }));
    await started.promise;
    await bot.handle(message('!clear'));
    reacting.resolve();
    await task;
    assert.equal(bot.apiCalls.length, 0);
    assert.equal(bot.logToText(TARGET_CHANNEL), '');
  });
}

test('clear preserves an ordinary message whose reaction is still in progress', async () => {
  const started = deferred();
  const reacting = deferred();
  const bot = loadBot();
  const task = bot.handle(message('ordinary link', TARGET_CHANNEL, {
    react: async () => { started.resolve(); await reacting.promise; },
  }));
  await started.promise;
  await bot.handle(message('!clear'));
  reacting.resolve();
  await task;
  assert.equal(bot.apiCalls.length, 0);
  assert.match(bot.logToText(TARGET_CHANNEL), /ordinary link/);
});

test('clearing another channel does not cancel an in-flight reply', async () => {
  const started = deferred();
  const pending = deferred();
  const bot = loadBot({ request: async () => { started.resolve(); return pending.promise; } });
  const otherMessage = message('@테스트 question', OTHER_CHANNEL);
  const task = bot.handle(otherMessage);
  await started.promise;
  await bot.handle(message('!clear'));
  pending.resolve('other channel answer');
  await task;
  assert.match(otherMessage.replies[0], /other channel answer/);
  assert.match(bot.logToText(OTHER_CHANNEL), /other channel answer/);
  assert.equal(bot.logToText(TARGET_CHANNEL), '');
});

test('only a standalone human clear command resets an allowed channel', async () => {
  const bot = loadBot();
  for (const content of ['ordinary conversation', 'say !clear', '!clear extra']) {
    await bot.handle(message(content));
  }
  const saved = bot.logToText(TARGET_CHANNEL);
  await bot.handle(message('!clear', TARGET_CHANNEL, { author: { id: 'bot', bot: true } }));
  await bot.handle(message('!clear', 'not-allowed'));
  assert.equal(bot.logToText(TARGET_CHANNEL), saved);
  assert.equal(bot.channelLogs.has('not-allowed'), false);
});

test('search uses the complete suffix and fresh results, hides sources, and shows a final quota footer', async () => {
  const bot = loadBot();
  for (let attempt = 0; attempt < 2; attempt++) {
    const input = message('@테스트 요약해줘 --search 오늘 뉴스\n추가 검색어');
    await bot.handle(input);
    assert.equal(bot.searchCalls.at(-1)[0].parts[0].text, '오늘 뉴스\n추가 검색어');
    assert.equal(bot.apiCalls.at(-1).userRequest, '요약해줘');
    assert.match(bot.apiCalls.at(-1).contents.at(-1).parts[0].text, /verified search findings/);
    assert.doesNotMatch(input.replies[0], /검색 출처|example\.com/);
    assert.ok(input.replies[0].endsWith(`오늘 남은 검색: ${199 - attempt}/200회 · 매일 00:00 KST 초기화`));
  }
  assert.equal(bot.searchCalls.length, 2);
  assert.doesNotMatch(bot.logToText(TARGET_CHANNEL), /오늘 남은 검색/);
  await bot.handle(message('!clear'));
  assert.equal(bot.quota.used, 2, 'clear cannot restore the search quota');
  const normal = message('@테스트 요약해줘');
  await bot.handle(normal);
  assert.equal(bot.searchCalls.length, 2);
  assert.doesNotMatch(normal.replies[0], /오늘 남은 검색|검색 출처/);
});

test('the search limit is shared across channels and stops before any further API call', async () => {
  const bot = loadBot();
  bot.quota.used = 199;
  await bot.handle(message('@테스트 --search last search'));
  const blocked = message('@테스트 --search extra search', OTHER_CHANNEL);
  await bot.handle(blocked);
  assert.equal(bot.searchCalls.length, 1);
  assert.equal(bot.apiCalls.length, 1);
  assert.match(blocked.replies[0], /한도 200회/);
  assert.match(blocked.replies[0], /남은 검색: 0\/200회/);
});

test('empty search queries do not use quota or call either API', async () => {
  const bot = loadBot();
  const input = message('@테스트 설명 --search  \n');
  await bot.handle(input);
  assert.equal(bot.quota.used, 0);
  assert.equal(bot.searchCalls.length, 0);
  assert.equal(bot.apiCalls.length, 0);
  assert.match(input.replies[0], /검색할 내용/);
});

test('failed searches count once and do not generate an ungrounded answer', async () => {
  const bot = loadBot({ search: async () => { throw new Error('search failed'); } });
  const input = message('@테스트 --search query');
  await bot.handle(input);
  assert.equal(bot.quota.used, 1);
  assert.equal(bot.apiCalls.length, 0);
  assert.equal(bot.logToText(TARGET_CHANNEL), '');
  assert.match(input.replies[0], /남은 검색: 199\/200회/);
});

test('clear during search prevents the subsequent reply and preserves quota consumption', async () => {
  const started = deferred();
  const pending = deferred();
  const bot = loadBot({ search: async () => { started.resolve(); return pending.promise; } });
  const input = message('@테스트 --search query');
  const task = bot.handle(input);
  await started.promise;
  await bot.handle(message('!clear'));
  pending.resolve({ text: 'old result', sources: [] });
  await task;
  assert.equal(input.replies.length, 0);
  assert.equal(bot.apiCalls.length, 0);
  assert.equal(bot.quota.used, 1);
  assert.equal(bot.logToText(TARGET_CHANNEL), '');
});
