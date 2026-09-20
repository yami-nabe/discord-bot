const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function loadModule(filename, dependencies) {
    const context = {
        module: { exports: {} },
        console,
        Date,
        Math: Object.assign(Object.create(Math), { random: () => 1 }),
        require(name) {
            if (Object.hasOwn(dependencies, name)) return dependencies[name];
            throw new Error(`Unexpected dependency: ${name}`);
        }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../bot/gacha', filename), 'utf8'), context);
    return context.module.exports;
}

async function draw({ five = {}, six = {}, pulls = [], rarePack = false, ticket = 'normal' }) {
    let user;
    let globalStatsUpdates = 0;
    const stats = { updateGachaStats: () => globalStatsUpdates++ };
    const formatter = loadModule('gacha-format.js', {
        './gacha-stats': stats,
        'discord.js': require('discord.js')
    });
    const results = [...pulls];
    while (results.length < 10) results.push({ rarity: 3, name: 'Common' });
    const functions = loadModule('gacha-function.js', {
        './gacha-dictionary': {},
        './gacha-user': {
            getUser: async () => structuredClone(user),
            updateUser: async (_, update) => {
                const updated = structuredClone(user);
                update(updated);
                user = updated;
                return structuredClone(user);
            }
        },
        './gacha-core': { performGacha: () => ({
            results: results.map(pull => pull.rarity),
            characters: results.map(pull => ({ name: pull.name, emoji: '⭐' })),
            newNoFiveStarCount: 0,
            isRarePack: rarePack
        }) },
        './gacha-format': formatter,
        './gacha-stats': stats,
        './event': {},
        path,
        fs: {}
    });
    user = {
        lastGachaDate: functions.getCurrentKRDate(), consecutiveDays: 1,
        todayGachaCount: 1, todaySpecialGachaCount: 0,
        todayGuaranteedFiveStarCount: ticket === 'guaranteed5' ? 1 : 0,
        todayGuaranteedSixStarCount: ticket === 'guaranteed6' ? 1 : 0,
        fiveStarStats: { ...five }, sixStarStats: { ...six }, lemonDust: 123
    };
    const result = await functions.handleGachaCommand('test-user', 'test-channel');
    assert.equal(globalStatsUpdates, 1);
    const dustField = result.embed.toJSON().fields.find(field => field.name === '✨ 레몬빛 가루');
    assert.equal(dustField.value, result.meta.lemonDustMessage);
    assert.ok(result.plainText.includes(dustField.value));
    return { user, result };
}

test('seventh copy completes full breakthrough without duplicate reward', async () => {
    const { user, result } = await draw({ five: { A: 6 }, pulls: [{ rarity: 5, name: 'A' }] });
    assert.equal(user.fiveStarStats.A, 7);
    assert.equal(user.lemonDust, 123 + 50 + 9);
    assert.doesNotMatch(result.meta.lemonDustMessage, /풀 돌파 중복 보상/);
});

test('eighth and later copies each grant 1000 dust in addition to rarity rewards', async () => {
    for (const count of [7, 12]) {
        const { user, result } = await draw({ five: { A: count }, pulls: [{ rarity: 5, name: 'A' }] });
        assert.equal(user.fiveStarStats.A, count + 1);
        assert.equal(user.lemonDust, 123 + 1000 + 50 + 9);
        assert.match(result.meta.lemonDustMessage, /총 \*\*1,000개\*\* 추가 지급/);
    }
});

test('multiple copies in one draw only reward copies after full breakthrough', async () => {
    const { user, result } = await draw({
        five: { A: 6 }, pulls: Array.from({ length: 3 }, () => ({ rarity: 5, name: 'A' }))
    });
    assert.equal(user.fiveStarStats.A, 9);
    assert.equal(user.lemonDust, 123 + 2000 + 150 + 7);
    assert.match(result.meta.lemonDustMessage, /\*\*A\*\* ×2/);
});

test('rare packs count new characters and both rarities independently', async () => {
    const { user, result } = await draw({
        six: { A: 7 }, rarePack: true,
        pulls: [
            ...Array.from({ length: 8 }, () => ({ rarity: 5, name: 'A' })),
            { rarity: 6, name: 'A' }, { rarity: 6, name: 'A' }
        ]
    });
    assert.equal(user.fiveStarStats.A, 8);
    assert.equal(user.sixStarStats.A, 9);
    assert.equal(user.lemonDust, 123 + 3000 + 400 + 300);
    assert.match(result.meta.lemonDustMessage, /총 \*\*3,000개\*\* 추가 지급/);
});

test('guaranteed tickets award duplicate dust for both rarities', async () => {
    for (const rarity of [5, 6]) {
        const { user, result } = await draw({
            five: { A: 7 }, six: { A: 7 }, ticket: `guaranteed${rarity}`,
            pulls: [{ rarity, name: 'A' }]
        });
        assert.equal(user.lemonDust, 123 + 1000 + (rarity === 5 ? 50 : 150) + 9);
        assert.equal(result.meta.usedTicketType, `guaranteed${rarity}`);
    }
});

test('ordinary draws retain base dust rewards without duplicate messages', async () => {
    const { user, result } = await draw({ pulls: [{ rarity: 4, name: 'Common' }] });
    assert.equal(user.lemonDust, 123 + 10 + 9);
    assert.equal(Object.keys(user.fiveStarStats).length, 0);
    assert.doesNotMatch(result.meta.lemonDustMessage, /풀 돌파 중복 보상/);
});
