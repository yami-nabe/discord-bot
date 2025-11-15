const fs = require('fs');
const path = require('path');

const GACHA_DICTIONARY_FILE = path.join(__dirname, 'gachaDictionary.json');

function loadGachaDictionary() {
    try {
        if (fs.existsSync(GACHA_DICTIONARY_FILE)) {
            const data = fs.readFileSync(GACHA_DICTIONARY_FILE, 'utf8');
            return JSON.parse(data);
        }
        return null;
    } catch (error) {
        console.error('gachaDictionary.json 파일 읽기 오류:', error);
        return null;
    }
}

function getFiveStarList() {
    const dict = loadGachaDictionary();
    return dict ? dict['5성'] : [];
}

function getSixStarList() {
    const dict = loadGachaDictionary();
    return dict ? dict['6성'] : [];
}

function getPickupCharacter() {
    const dict = loadGachaDictionary();
    return dict ? dict['현재픽업'] : [];
}

function getOthersList() {
    const dict = loadGachaDictionary();
    return dict ? dict['others'] : [];
}

// 5성과 픽업을 병합한 배열 반환 (교환 및 가챠용 - others 제외)
function getFiveStarWithPickup() {
    const dict = loadGachaDictionary();
    if (!dict) return [];
    
    const fiveStar = dict['5성'] || [];
    const pickup = dict['현재픽업'] || [];
    
    // 5성과 픽업을 병합 (중복되지 않도록)
    const combined = [...fiveStar];
    
    pickup.forEach(pickupChar => {
        const exists = combined.some(char => char.name === pickupChar.name);
        if (!exists) {
            combined.push(pickupChar);
        }
    });
    
    return combined;
}

// 5성, 픽업, others를 모두 포함한 배열 반환 (컬렉션 표시용)
function getAllCharactersForCollection() {
    const dict = loadGachaDictionary();
    if (!dict) return [];
    
    const fiveStar = dict['5성'] || [];
    const pickup = dict['현재픽업'] || [];
    const others = dict['others'] || [];
    
    // 모든 캐릭터를 병합 (중복되지 않도록)
    const combined = [...fiveStar];
    
    pickup.forEach(pickupChar => {
        const exists = combined.some(char => char.name === pickupChar.name);
        if (!exists) {
            combined.push(pickupChar);
        }
    });
    
    others.forEach(otherChar => {
        const exists = combined.some(char => char.name === otherChar.name);
        if (!exists) {
            combined.push(otherChar);
        }
    });
    
    return combined;
}

module.exports = {
    loadGachaDictionary,
    getFiveStarList,
    getSixStarList,
    getPickupCharacter,
    getOthersList,
    getFiveStarWithPickup,
    getAllCharactersForCollection
}; 