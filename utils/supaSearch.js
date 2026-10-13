const fs = require('node:fs');
const path = require('node:path');

const DAILY_SEARCH_LIMIT = 200;

function parseSearchRequest(text) {
  const match = /(?:^|\s)--search(?=\s|$)/.exec(text);
  if (!match) return { userRequest: text, searchQuery: null };
  const searchQuery = text.slice(match.index + match[0].length).trim();
  return { userRequest: text.slice(0, match.index).trim() || searchQuery, searchQuery };
}

function getKoreanDate(timestamp) {
  return new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 단일 봇 프로세스에서 모든 채널이 공유합니다. 동기 저장으로 동시 요청도 순서대로 차감합니다.
// 검색 API 호출 직전에 차감하며, 실패/취소도 복구하지 않아 중복 요청으로 상한을 넘지 않습니다.
class SearchQuota {
  constructor(filePath, now = Date.now) {
    this.filePath = filePath;
    this.now = now;
  }

  getStatus() {
    const date = getKoreanDate(this.now());
    let saved;
    try {
      saved = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('검색 횟수 파일을 읽을 수 없습니다. 검색을 중단합니다.');
      saved = { date, used: 0 };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(saved?.date) || !Number.isInteger(saved.used) || saved.used < 0) {
      throw new Error('검색 횟수 파일이 올바르지 않습니다. 검색을 중단합니다.');
    }
    const used = saved.date === date ? saved.used : 0;
    return { date, used, remaining: Math.max(0, DAILY_SEARCH_LIMIT - used) };
  }

  consume() {
    const status = this.getStatus();
    if (status.remaining === 0) {
      throw new Error('오늘의 검색 한도 200회를 모두 사용했습니다. 한국 시간 0시에 초기화됩니다.');
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({ date: status.date, used: status.used + 1 }), 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
    return { ...status, used: status.used + 1, remaining: status.remaining - 1 };
  }
}

function formatSearchSources(sources) {
  return '\n\n검색 출처:\n' + sources.map((source, index) => {
    const title = (source.title || `출처 ${index + 1}`).replace(/[\[\]<>\r\n]/g, ' ');
    const uri = source.uri.replace(/[()<>\s]/g, (char) =>
      char === '(' ? '%28' : char === ')' ? '%29' : encodeURIComponent(char));
    return `${index + 1}. [${title}](${uri})`;
  }).join('\n');
}

const searchQuota = new SearchQuota(path.join(__dirname, '../data/supa-search-quota.json'));

module.exports = { DAILY_SEARCH_LIMIT, SearchQuota, searchQuota, parseSearchRequest, formatSearchSources };
