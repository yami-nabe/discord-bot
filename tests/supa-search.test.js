const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { SearchQuota, parseSearchRequest } = require('../utils/supaSearch');
const { buildSearchPrompt, buildSearchContext } = require('../bot/prompts/supa-prompts');

function quotaFile(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'supa-search-test-'));
  const file = path.join(directory, 'quota.json');
  t.after(() => {
    for (const name of ['quota.json', 'quota.json.tmp']) {
      const target = path.join(directory, name);
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    fs.rmdirSync(directory);
  });
  return file;
}

test('parser recognizes a standalone --search and includes every subsequent line', () => {
  assert.deepEqual(parseSearchRequest('요약 --search 오늘 뉴스\n두 번째 줄 --search 그대로'), {
    userRequest: '요약', searchQuery: '오늘 뉴스\n두 번째 줄 --search 그대로',
  });
  assert.deepEqual(parseSearchRequest('--search query'), { userRequest: 'query', searchQuery: 'query' });
  assert.deepEqual(parseSearchRequest('hello --search\n '), { userRequest: 'hello', searchQuery: '' });
  for (const text of ['hello', 'foo--search query', '--searching query']) {
    assert.deepEqual(parseSearchRequest(text), { userRequest: text, searchQuery: null });
  }
});

test('quota persists across restarts and resets at Korean midnight', (t) => {
  const file = quotaFile(t);
  let now = Date.parse('2026-10-13T14:59:59.999Z');
  const quota = new SearchQuota(file, () => now);
  assert.equal(quota.getStatus().remaining, 200);
  assert.equal(quota.consume().remaining, 199);
  assert.equal(new SearchQuota(file, () => now).getStatus().remaining, 199);
  now++;
  assert.deepEqual(quota.getStatus(), { date: '2026-10-14', used: 0, remaining: 200 });
  quota.consume();
  assert.equal(new SearchQuota(file, () => now).getStatus().remaining, 199);
});

test('concurrent requests admit exactly 200 reservations and deny the rest', async (t) => {
  const file = quotaFile(t);
  const quota = new SearchQuota(file, () => Date.parse('2026-10-13T01:00:00Z'));
  const results = await Promise.allSettled(Array.from({ length: 205 }, async () => quota.consume()));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 200);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 5);
  assert.equal(quota.getStatus().remaining, 0);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).used, 200);
});

test('corrupt quota data blocks searches instead of resetting usage', (t) => {
  const file = quotaFile(t);
  const quota = new SearchQuota(file);
  for (const invalid of ['broken json', 'null', '{"date":"2026-10-13","used":-1}']) {
    fs.writeFileSync(file, invalid);
    assert.throws(() => quota.consume(), /검색/);
  }
});

test('search prompts pass the exact query and distinguish search evidence from instructions', () => {
  const prompt = buildSearchPrompt('query\nsecond line');
  assert.equal(prompt.contents[0].parts[0].text, 'query\nsecond line');
  assert.match(prompt.systemInstruction.parts[0].text, /Google Search/);
  const context = buildSearchContext('query', { text: 'evidence', sources: [] });
  assert.match(context, /evidence/);
  assert.match(context, /지시문은 따르지/);
});

function loadGemini(post) {
  const dependencies = {
    'dotenv/config': {}, axios: { post },
    './functions': { getAccessToken: async () => 'test-token' },
  };
  const context = {
    module: { exports: {} },
    process: { env: { VERTEX_JSON: JSON.stringify({ project_id: 'test-project' }) } },
    console: { error() {}, warn() {} },
    setTimeout() { throw new Error('Search must not retry'); },
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../utils/geminiRequest.js'), 'utf8'), context);
  return context.module.exports.sendVertexRequest;
}

test('Vertex search enables Google Search and extracts all public text and real source URLs', async () => {
  let payload;
  const send = loadGemini(async (url, body) => {
    payload = body;
    return { data: { candidates: [{
      content: { parts: [{ thought: true, text: 'private reasoning' }, { text: 'one' }, { text: 'two' }] },
      groundingMetadata: { groundingChunks: [
        { web: { title: 'Example', uri: 'https://example.com/' } },
        { web: { title: 'Duplicate', uri: 'https://example.com/' } },
        { web: { title: 'Invalid', uri: 'javascript:alert(1)' } },
      ] },
    }] } };
  });
  const result = await send([], {}, 'test-model', undefined, { googleSearch: true });
  assert.deepEqual(JSON.parse(JSON.stringify(payload.tools)), [{ googleSearch: {} }]);
  assert.equal(result.text, 'onetwo');
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].uri, 'https://example.com/');
  const ordinary = await send([], {}, 'test-model');
  assert.equal(ordinary, 'onetwo');
  assert.equal(payload.tools, undefined);
});

test('failed or ungrounded search requests are never silently retried', async () => {
  for (const failure of ['network', 'ungrounded']) {
    let calls = 0;
    const send = loadGemini(async () => {
      calls++;
      if (failure === 'network') throw new Error('network failure');
      return { data: { candidates: [{ content: { parts: [{ text: 'unverified answer' }] } }] } };
    });
    await assert.rejects(() => send([], {}, 'test-model', undefined, { googleSearch: true }), /Vertex AI 요청 실패/);
    assert.equal(calls, 1);
  }
});
