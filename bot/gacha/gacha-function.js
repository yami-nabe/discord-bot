const { loadGachaDictionary, getFiveStarList, getSixStarList, getPickupCharacter, getOthersList, getFiveStarWithPickup, getAllCharactersForCollection } = require('./gacha-dictionary');
const { loadUsers, saveUsers, getUser, updateUser } = require('./gacha-user');
const { performGacha } = require('./gacha-core');
const { formatGachaResults, formatGachaResultsDetailed, breakthroughText, createGachaEmbed } = require('./gacha-format');
const { getGachaStats } = require('./gacha-stats');
const path = require('path');
const fs = require('fs');
const { getEventSpecialGachaCount } = require('./event');

// const ADMIN_USER_ID = '309989582240219137';

// 한국 표준 시간 기준으로 현재 날짜 가져오기
function getCurrentKRDate() {
    const now = new Date();
    const krTime = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 
        now.getUTCHours() + 9, now.getUTCMinutes(), now.getUTCSeconds());
    const year = krTime.getFullYear();
    const month = String(krTime.getMonth() + 1).padStart(2, '0');
    const day = String(krTime.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 5성 캐릭터 통계 업데이트
function updateFiveStarStats(userId, fiveStarCharacters) {
    updateUser(userId, user => {
        if (!user.fiveStarStats) user.fiveStarStats = {};
        fiveStarCharacters.forEach(character => {
            const characterName = character.name;
            if (!user.fiveStarStats[characterName]) user.fiveStarStats[characterName] = 0;
            user.fiveStarStats[characterName]++;
        });
    });
}

// 6성 캐릭터 통계 업데이트
function updateSixStarStats(userId, sixStarCharacters) {
    updateUser(userId, user => {
        if (!user.sixStarStats) user.sixStarStats = {};
        sixStarCharacters.forEach(character => {
            const characterName = character.name;
            if (!user.sixStarStats[characterName]) user.sixStarStats[characterName] = 0;
            user.sixStarStats[characterName]++;
        });
    });
}

// 날짜가 바뀔 때 유저의 일일 가챠권/특별 가챠권을 초기화 및 지급/폐기하는 함수
async function resetUserDailyGacha(userId, currentDate) {
    await updateUser(userId, user => {
        user.todayGachaCount = 1;
        user.lastGachaDate = currentDate;
    });
    // 이벤트 특별 가챠권 지급/폐기 (event.js에서 직접 처리)
    await require('./event').setEventSpecialGachaCount(userId);
}

// 유저 정보 및 출석/쿠폰/통계/가챠횟수 관리
async function updateUserGachaInfo(userId) {
    const currentDate = getCurrentKRDate();
    let couponMessage = '';
    let couponJustGiven = false;
    await updateUser(userId, user => {
        // if (userId === ADMIN_USER_ID) {
        //     user.consecutiveDays = 999;
        //     user.todayGachaCount = 999;
        //     user.todaySpecialGachaCount = 999;
        //     return;
        // }
        const prevLastGachaDate = user.lastGachaDate;
        if (!prevLastGachaDate) {
            user.consecutiveDays = 1;
        } else {
            const lastDateObj = new Date(prevLastGachaDate);
            const currentDateObj = new Date(currentDate);
            const diffTime = currentDateObj - lastDateObj;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays === 1) {
                user.consecutiveDays += 1;
                // 연속 출석 일수 증가 직후 10의 배수면 쿠폰 지급
                if (user.consecutiveDays % 10 === 0) {
                    if (user.ceilingCoupons === undefined) user.ceilingCoupons = 0;
                    user.ceilingCoupons += 1;
                    couponJustGiven = true;
                }
            } else if (diffDays > 1) {
                user.consecutiveDays = 1;
            }
        }
    });
    // 날짜가 바뀌었으면 별도 함수로 처리
    let user = await getUser(userId);
    if (user.lastGachaDate !== currentDate) {
        await resetUserDailyGacha(userId, currentDate);
        user = await getUser(userId); // 최신 정보로 갱신
    }
    // 가챠권이 모두 소진된 경우에만 가챠 불가
    if ((user.todayGachaCount <= 0) && (user.todaySpecialGachaCount <= 0)) {
        return {
            canGacha: false,
            message: '오늘의 가챠 기회를 모두 소진했습니다! 내일 다시 시도해주세요.'
        };
    }
    // if (userId === ADMIN_USER_ID) {
    //     return { canGacha: true, consecutiveDays: 999, message: '👑' };
    // }
    if (user.ceilingCoupons === undefined) user.ceilingCoupons = 0;
    // 쿠폰 지급 메시지는 10의 배수일 때만 출력
    if (couponJustGiven) {
        couponMessage = `\n🎫 **천장 쿠폰 1개 지급!** (총 ${user.ceilingCoupons}개 보유)`;
    }
    return {
        canGacha: true,
        consecutiveDays: user.consecutiveDays,
        message: `연속 참가 ${user.consecutiveDays}일차!${couponMessage}`
    };
}

// 가챠 명령어 처리 메인 함수
async function handleGachaCommand(userId, channelId) {
    const updateResult = await updateUserGachaInfo(userId);
    if (updateResult && !updateResult.canGacha) {
        return updateResult.message;
    }
    // 가챠 전 noFiveStarCount
    const userBefore = await getUser(userId);
    const beforeNoFive = userBefore.noFiveStarCount;
    await updateUser(userId, user => {
        // if (userId !== ADMIN_USER_ID) {
            // todaySpecialGachaCount가 1 이상이면 우선 차감, 아니면 todayGachaCount 차감
            if (user.todaySpecialGachaCount === undefined) user.todaySpecialGachaCount = 0;
            if (user.todaySpecialGachaCount > 0) {
                user.todaySpecialGachaCount = Math.max(0, user.todaySpecialGachaCount - 1);
            } else {
                user.todayGachaCount = Math.max(0, (user.todayGachaCount || 1) - 1);
            }
        // }
    });
    const user = await getUser(userId);
    const isTenDayGuarantee = user && user.consecutiveDays % 10 === 0 && user.consecutiveDays > 0;
    const gachaData = performGacha(user, isTenDayGuarantee, channelId);
    // 5성 천장 카운트 갱신
    await updateUser(userId, u => { u.noFiveStarCount = gachaData.newNoFiveStarCount; });
    const userAfter = await getUser(userId);
    
    // 디버깅 로그
    // console.log(`[가챠] userId=${userId}, todayGachaCount=${user.todayGachaCount}, todaySpecialGachaCount=${user.todaySpecialGachaCount}, noFiveStarCount(before)=${beforeNoFive}, newNoFiveStarCount=${gachaData.newNoFiveStarCount}, noFiveStarCount(after)=${userAfter.noFiveStarCount}`);

    const fiveStarChars = gachaData.characters.filter((char, idx) => gachaData.results[idx] === 5);
    const sixStarChars = gachaData.characters.filter((char, idx) => gachaData.results[idx] === 6);
    
    // 6성 통계 업데이트
    if (sixStarChars.length > 0) {
        updateSixStarStats(userId, sixStarChars);
    }
    
    // 레몬빛 가루 지급 (등급별 지급량: 3성=1, 4성=10, 5성=50, 6성=150)
    const lemonDustRewards = {
        3: 1,
        4: 10,
        5: 50,
        6: 150
    };
    let totalLemonDust = 0;
    gachaData.results.forEach(rarity => {
        totalLemonDust += lemonDustRewards[rarity] || 0;
    });
    if (totalLemonDust > 0) {
        await updateUser(userId, user => {
            if (user.lemonDust === undefined) user.lemonDust = 0;
            user.lemonDust += totalLemonDust;
        });
    }
    
    const formattedResults = formatGachaResults(gachaData, userId, updateFiveStarStats);
    const detailed = formatGachaResultsDetailed(gachaData, userId, updateFiveStarStats);
    
    // 레어팩 메시지 추가
    let rarePackMessage = '';
    if (gachaData.isRarePack) {
        rarePackMessage = '\n\n🎁 **🎉 레어팩 발동! 🎉** 🎁\n모든 캐릭터가 5성 이상으로 등장했습니다!';
    }
    
    return {
        plainText: `${updateResult.message}\n\n**<a:lemon_click:1122183344818495608> 오늘의 가챠 결과: <a:lemon_click:1122183344818495608>**${rarePackMessage}\n${formattedResults}`,
        meta: {
            updateMessage: updateResult.message,
            isRarePack: gachaData.isRarePack,
            gridText: detailed.gridText,
            emojiLines: detailed.emojiLines,
            summaryMap: detailed.summaryMap,
            congratulationText: detailed.congratulationText,
            hasSixStar: sixStarChars.length > 0,
            hasFiveStar: fiveStarChars.length > 0
        },
        embed: createGachaEmbed({
            updateMessage: updateResult.message,
            isRarePack: gachaData.isRarePack,
            gridText: detailed.gridText,
            emojiLines: detailed.emojiLines,
            summaryMap: detailed.summaryMap,
            congratulationText: detailed.congratulationText,
            hasSixStar: sixStarChars.length > 0,
            hasFiveStar: fiveStarChars.length > 0
        }, null, null) // username과 avatarURL은 supa.js에서 설정
    };
}

// 가챠 정보 반환 함수
async function getGachaInfo() {
    try {
        const gachaInfoPath = path.join(__dirname, 'gachaInfo.md');
        if (fs.existsSync(gachaInfoPath)) {
            const content = fs.readFileSync(gachaInfoPath, 'utf8');
            return content;
        } else {
            return '가챠 정보 파일을 찾을 수 없습니다.';
        }
    } catch (error) {
        console.error('가챠 정보 파일 읽기 오류:', error);
        return '가챠 정보를 불러오는 중 오류가 발생했습니다.';
    }
}

// 5성 캐릭터 목록 반환 함수
async function getGachaList() {
    try {
        const fiveStarCharacters = getFiveStarList();
        const sixStarCharacters = getSixStarList();
        const pickupCharacter = getPickupCharacter();
        const othersCharacters = getOthersList();
        
        let result = '## 🎯 가챠 캐릭터 목록\n\n';
        
        // 현재 픽업 정보
        if (pickupCharacter && pickupCharacter.length > 0) {
            result += '### 🎯 현재 픽업:\n';
            pickupCharacter.forEach(character => {
                result += `${character.emoji} **${character.name}**\n`;
            });
            result += '\n';
        }
        
        // 6성 캐릭터 목록
        if (sixStarCharacters && sixStarCharacters.length > 0) {
            result += '### ⭐⭐⭐⭐⭐⭐ 6성 캐릭터:\n';
            sixStarCharacters.forEach((character) => {
                result += `${character.emoji} **${character.name}**\n`;
            });
            result += '\n';
        }
        
        // 5성 캐릭터 목록
        if (fiveStarCharacters && fiveStarCharacters.length > 0) {
            result += '### ⭐⭐⭐⭐⭐ 5성 캐릭터:\n';
            fiveStarCharacters.forEach((character) => {
                const isPickup = pickupCharacter && character.name === pickupCharacter.name;
                const pickupMark = isPickup ? ' 🎯' : '';
                result += `${character.emoji} **${character.name}**${pickupMark}\n`;
            });
            result += '\n';
        } else {
            result += '### ⭐⭐⭐⭐⭐ 5성 캐릭터: 없음\n\n';
        }
        
        // Others 캐릭터 목록 (기간 지난 한정 캐릭터 등)
        if (othersCharacters && othersCharacters.length > 0) {
            result += '### ⏰ 기타 캐릭터 (기간 지난 한정 등):\n';
            othersCharacters.forEach((character) => {
                result += `${character.emoji} **${character.name}**\n`;
            });
        }
        
        return result;
    } catch (error) {
        console.error('가챠 목록 생성 중 오류:', error);
        return '가챠 목록을 불러오는 중 오류가 발생했습니다.';
    }
}

// 개인 가챠 정보 반환 함수
async function getMyGachaInfo(userId) {
    try {
        const user = await getUser(userId);
        if (!user) {
            return '가챠 기록이 없습니다. `/gacha` 명령어로 첫 가챠를 돌려보세요!';
        }
        let result = '## 내 가챠 정보\n\n';
        result += `**📅 연속 출석:** ${user.consecutiveDays}일차\n`;
        const coupons = user.ceilingCoupons || 0;
        result += `**🎫 천장 쿠폰:** ${coupons}개 보유\n`;
        const lemonDust = user.lemonDust || 0;
        result += `**✨ 레몬빛 가루:** ${lemonDust}개\n`;
        result += `**🌀 오늘의 가챠 가능 횟수:** ${user.todayGachaCount || 0}회\n`;
        result += `**✨ 추가 가챠권(이벤트):** ${user.todaySpecialGachaCount || 0}회\n`;
        const fiveStarStats = user.fiveStarStats || {};
        const sixStarStats = user.sixStarStats || {};
        const totalFiveStar = Object.values(fiveStarStats).reduce((sum, count) => sum + count, 0);
        const totalSixStar = Object.values(sixStarStats).reduce((sum, count) => sum + count, 0);
        result += `**⭐ 총 5성 획득:** ${totalFiveStar}개\n`;
        result += `**⭐⭐ 총 6성 획득:** ${totalSixStar}개\n\n`;
        
        if (totalSixStar > 0) {
            result += '## 보유한 6성 캐릭터:\n';
            for (const [characterName, count] of Object.entries(sixStarStats)) {
                // 6성 캐릭터 목록에서 이모지 찾기
                const sixStarCharacters = getSixStarList();
                const character = sixStarCharacters.find(char => char.name === characterName);
                const emoji = character ? character.emoji : '❓';
                result += `• ${emoji} **${characterName}**: ${breakthroughText(count)}\n`;
            }
            result += '\n';
        }
        
        if (totalFiveStar > 0) {
            result += '## 보유한 5성 캐릭터:\n';
            for (const [characterName, count] of Object.entries(fiveStarStats)) {
                // 5성, 픽업, others를 포함한 모든 캐릭터에서 이모지 찾기 (컬렉션용)
                const allCharacters = getAllCharactersForCollection();
                const character = allCharacters.find(char => char.name === characterName);
                const emoji = character ? character.emoji : '❓';
                result += `• ${emoji} **${characterName}**: ${breakthroughText(count)}\n`;
            }
        } else if (totalSixStar === 0) {
            result += '## 보유한 5성 캐릭터: 없음 <:yuzu_tearful:1130493296779739268>\n';
        }
        return result;
    } catch (error) {
        console.error('개인 가챠 정보 생성 중 오류:', error);
        return '개인 가챠 정보를 불러오는 중 오류가 발생했습니다.';
    }
}

// 천장 쿠폰 사용 함수 (이모지 또는 캐릭터 이름으로 검색 가능)
async function useCeilingCoupon(userId, target) {
    const user = await getUser(userId);
    if (!user) return { ok: false, error: '유저 정보를 찾을 수 없습니다.' };
    if (!user.ceilingCoupons || user.ceilingCoupons < 1) {
        return { ok: false, error: '천장 쿠폰이 부족합니다.' };
    }
    // 5성, 픽업, others를 병합한 배열에서 이모지 또는 이름으로 캐릭터 찾기
    const fiveStarWithPickup = getFiveStarWithPickup();
    let found = null;
    
    // 1. 먼저 이모지로 검색
    for (const char of fiveStarWithPickup) {
        if (char.emoji === target) {
            found = char;
            break;
        }
    }
    
    // 2. 이모지로 찾지 못했으면 캐릭터 이름으로 검색
    if (!found) {
        for (const char of fiveStarWithPickup) {
            if (char.name === target) {
                found = char;
                break;
            }
        }
    }
    
    if (!found) {
        return { ok: false, error: '해당 이모지나 캐릭터 이름은 교환 가능한 5성 캐릭터가 아닙니다. 기간이 지난 한정 캐릭터는 교환할 수 없습니다.' };
    }
    await updateUser(userId, user => {
        if (!user.fiveStarStats) user.fiveStarStats = {};
        if (!user.fiveStarStats[found.name]) user.fiveStarStats[found.name] = 0;
        user.fiveStarStats[found.name]++;
        user.ceilingCoupons--;
    });
    return { ok: true, character: found };
}

// 가챠 통계 조회 함수
function getGachaStatsCommand() {
    return getGachaStats();
}

module.exports = {
    handleGachaCommand,
    getGachaInfo,
    getGachaList,
    getMyGachaInfo,
    getCurrentKRDate,
    useCeilingCoupon,
    getGachaStatsCommand
};

