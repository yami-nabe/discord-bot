const path = require('path');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');

// 해당 봇의 글로벌 및 참여 중인 모든 서버의 명령을 삭제합니다.
// 슬래시 명령뿐 아니라 사용자/메시지 우클릭 명령도 포함합니다.
async function deleteAllCommands(rest, applicationId) {
    const application = await rest.get(Routes.oauth2CurrentApplication());
    if (application.id !== applicationId) {
        throw new Error('토큰의 애플리케이션 ID와 SUPA_CLIENT_ID가 일치하지 않습니다.');
    }

    // 서버가 200개 이상인 경우에도 전체 목록을 가져옵니다.
    const guilds = [];
    let after;
    while (true) {
        const query = new URLSearchParams({ limit: '200' });
        if (after) query.set('after', after);
        const page = await rest.get(Routes.userGuilds(), { query });
        guilds.push(...page);
        if (page.length < 200) break;
        after = page[page.length - 1].id;
    }

    const targets = [
        { name: '글로벌', route: Routes.applicationCommands(applicationId) },
        ...guilds.map((guild) => ({
            name: `${guild.name} (${guild.id})`,
            route: Routes.applicationGuildCommands(applicationId, guild.id),
        })),
    ];

    let failedCount = 0;
    for (const target of targets) {
        try {
            await rest.put(target.route, { body: [] });
            console.log(`${target.name}: 모든 명령 삭제 완료`);
        } catch (error) {
            failedCount++;
            console.error(`${target.name}: 삭제 실패 - ${error.message}`);
        }
    }

    console.log(`처리 완료: 성공 ${targets.length - failedCount}곳, 실패 ${failedCount}곳`);
    if (failedCount > 0) {
        throw new Error(`${failedCount}곳의 명령을 삭제하지 못했습니다. 위 오류를 확인해주세요.`);
    }
}

async function main() {
    require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
    const token = process.env.SUPA_TOKEN || process.env.SUPATOKEN;
    const applicationId = process.env.SUPA_CLIENT_ID;
    if (!token || !applicationId) {
        throw new Error('.env에 SUPA_TOKEN(또는 SUPATOKEN)과 SUPA_CLIENT_ID를 설정해주세요.');
    }

    const rest = new REST({ version: '10' }).setToken(token);
    await deleteAllCommands(rest, applicationId);
}

// 다른 파일에서 불러오는 것만으로는 삭제하지 않습니다.
if (require.main === module) {
    main().catch((error) => {
        console.error('명령 삭제 실패:', error.message);
        process.exitCode = 1;
    });
}

module.exports = { deleteAllCommands };
