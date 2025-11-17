const { loadGachaDictionary, getPickupCharacter } = require('./gacha-dictionary');
const { getEventGachaRate } = require('./event');

// 가챠 확률 설정 (기본값)
const BASE_GACHA_RATES = {
    6: 0.0005,  // 6성 0.05%
    5: 0.006,  // 5성 0.6%
    4: 0.051,  // 4성 5.1%
    3: 0.9425   // 3성 94.25%
};

// 레어팩 확률 (0.05%)
const RARE_PACK_RATE = 0.0005;

// 6성이 등장할 수 있는 채널 ID
const SIX_STAR_CHANNEL_ID = '1408784608820068443';

function canReceiveSixStar(channelId) {
    return channelId && String(channelId) === SIX_STAR_CHANNEL_ID;
}

function adjustRarityForChannel(rarity, channelId) {
    if (rarity === 6 && !canReceiveSixStar(channelId)) {
        return 5;
    }
    return rarity;
}

function getDynamicFiveStarRate(noFiveStarCount) {
    // 이벤트 확률이 있으면 5성 확률도 이벤트 확률 사용
    const eventRates = getEventGachaRate();
    if (eventRates && typeof eventRates[5] === 'number') {
        return eventRates[5];
    }
    if (noFiveStarCount < 94) return 0.006;
    // 94회 이후부터 0.05%씩 증가, 최대 1.0
    return Math.min(0.006 + (noFiveStarCount - 93) * 0.0005, 1.0);
}

function generateGachaResult(noFiveStarCount) {
    // 이벤트 확률이 있으면 그걸 사용, 아니면 기존 확률 사용
    const eventRates = getEventGachaRate();
    let sixStarRate, fiveStarRate, fourStarRate, threeStarRate;
    if (eventRates) {
        sixStarRate = eventRates[6] || 0.001;
        fiveStarRate = eventRates[5];
        fourStarRate = eventRates[4];
        threeStarRate = eventRates[3];
    } else {
        sixStarRate = BASE_GACHA_RATES[6];
        fiveStarRate = getDynamicFiveStarRate(noFiveStarCount);
        fourStarRate = BASE_GACHA_RATES[4];
        threeStarRate = 1.0 - sixStarRate - fiveStarRate - fourStarRate;
        if (threeStarRate < 0) threeStarRate = 0;
    }
    const rates = [
        { rarity: 6, rate: sixStarRate },
        { rarity: 5, rate: fiveStarRate },
        { rarity: 4, rate: fourStarRate },
        { rarity: 3, rate: threeStarRate }
    ];
    const random = Math.random();
    let cumulative = 0;
    for (const { rarity, rate } of rates) {
        cumulative += rate;
        if (random <= cumulative) return rarity;
    }
    return 3;
}

function generateRandomCharacter(rarity) {
    const dictionary = loadGachaDictionary();
    if (!dictionary) return { name: `${rarity}성`, emoji: '❓' };
    const rarityKey = `${rarity}성`;
    const characters = dictionary[rarityKey];
    if (!characters || characters.length === 0) return { name: `${rarity}성`, emoji: '❓' };
    
    if (rarity === 6) {
        // 6성은 모든 6성 캐릭터 중에서 랜덤 선택
        const randomIndex = Math.floor(Math.random() * characters.length);
        return characters[randomIndex];
    } else if (rarity === 5) {
        const pickupCharacters = dictionary.현재픽업;
        const fivestarRandom = Math.random();
        if (fivestarRandom <= 0.5 && pickupCharacters && pickupCharacters.length > 0) {
            // 픽업 캐릭터 중에서 랜덤 선택
            const randomPickupIndex = Math.floor(Math.random() * pickupCharacters.length);
            return pickupCharacters[randomPickupIndex];
        } else {
            const randomIndex = Math.floor(Math.random() * characters.length);
            return characters[randomIndex];
        }
    } else {
        const randomIndex = Math.floor(Math.random() * characters.length);
        return characters[randomIndex];
    }
}

// 레어팩 실행 함수
function generateRarePackResult(channelId) {
    const dictionary = loadGachaDictionary();
    if (!dictionary) return [];
    
    const characters = [];
    const results = [];
    
    for (let i = 0; i < 10; i++) {
        // 6성: 20%, 5성: 80% 확률로 설정
        const random = Math.random();
        let rarity = random <= 0.2 ? 6 : 5;
        rarity = adjustRarityForChannel(rarity, channelId);
        
        const rarityKey = `${rarity}성`;
        const rarityCharacters = dictionary[rarityKey];
        
        if (rarityCharacters && rarityCharacters.length > 0) {
            const randomIndex = Math.floor(Math.random() * rarityCharacters.length);
            characters.push(rarityCharacters[randomIndex]);
            results.push(rarity);
        } else {
            // 해당 등급 캐릭터가 없으면 기본값
            characters.push({ name: `${rarity}성`, emoji: '❓' });
            results.push(rarity);
        }
    }
    
    return { characters, results };
}

// user: 유저 객체, isTenDayGuarantee: 10일 보장 여부
// channelId: 가챠가 실행된 채널 ID
// 반환값: { results, characters, newNoFiveStarCount, isRarePack }
function performGacha(user, isTenDayGuarantee, channelId) {
    // 레어팩 체크
    const isRarePack = Math.random() <= RARE_PACK_RATE;
    
    if (isRarePack) {
        // 레어팩 실행
        const rarePackData = generateRarePackResult(channelId);
        
        return { 
            results: rarePackData.results, 
            characters: rarePackData.characters, 
            newNoFiveStarCount: 0, // 레어팩은 5성 미출현 카운트 리셋
            isRarePack: true 
        };
    }
    
    // 일반 가챠 실행
    const results = [];
    const characters = [];
    let noFiveStarCount = user.noFiveStarCount || 0;
    let fiveStarHit = false;
    
    // 처음 9개 뽑기
    for (let i = 0; i < 9; i++) {
        let rarity = generateGachaResult(noFiveStarCount);
        rarity = adjustRarityForChannel(rarity, channelId);
        if (rarity >= 5) { // 5성 이상이면 카운트 리셋
            noFiveStarCount = 0;
            fiveStarHit = true;
        } else {
            noFiveStarCount++;
        }
        const character = generateRandomCharacter(rarity);
        results.push(rarity);
        characters.push(character);
    }
    
    // 9개 모두 3성인지 확인
    const allThreeStar = results.every(rarity => rarity === 3);
    
    // 마지막 10번째 뽑기
    let finalRarity;
    if (allThreeStar) {
        const random = Math.random();
        if (random <= 0.006) {
            finalRarity = 5;
        } else {
            finalRarity = 4;
        }
    } else {
        finalRarity = generateGachaResult(noFiveStarCount);
    }
    
    finalRarity = adjustRarityForChannel(finalRarity, channelId);
    if (finalRarity >= 5) { // 5성 이상이면 카운트 리셋
        noFiveStarCount = 0;
        fiveStarHit = true;
    } else {
        noFiveStarCount++;
    }
    
    const finalCharacter = generateRandomCharacter(finalRarity);
    results.push(finalRarity);
    characters.push(finalCharacter);
    
    return { 
        results, 
        characters, 
        newNoFiveStarCount: noFiveStarCount, 
        isRarePack: false 
    };
}

module.exports = {
    BASE_GACHA_RATES,
    RARE_PACK_RATE,
    getDynamicFiveStarRate,
    generateGachaResult,
    generateRandomCharacter,
    generateRarePackResult,
    performGacha
}; 