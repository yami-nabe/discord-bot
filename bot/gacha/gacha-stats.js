const fs = require('fs');
const path = require('path');

const STATS_FILE_PATH = path.join(__dirname, 'stats.json');

// 통계 데이터 구조
const defaultStats = {
    totalGachaCount: 0,
    totalRarePackCount: 0, // 레어팩 횟수 추가
    totalThreeStar: 0,
    totalFourStar: 0,
    totalFiveStar: 0,
    totalSixStar: 0, // 6성 통계 추가
    totalRarePacks: 0, // 레어팩 통계 추가
    rarityRates: {
        threeStar: 0,
        fourStar: 0,
        fiveStar: 0,
        sixStar: 0 // 6성 확률 추가
    },
    rarePackRates: { // 레어팩 전용 확률
        sixStar: 0,
        fiveStar: 0
    },
    lastUpdated: null
};

// 통계 데이터 로드
function loadStats() {
    try {
        if (fs.existsSync(STATS_FILE_PATH)) {
            const data = fs.readFileSync(STATS_FILE_PATH, 'utf8');
            const stats = JSON.parse(data);
            
            // 기존 파일에 누락된 필드들을 기본값으로 채우기
            if (stats.totalSixStar === undefined) stats.totalSixStar = 0;
            if (stats.totalRarePacks === undefined) stats.totalRarePacks = 0;
            if (stats.totalRarePackCount === undefined) stats.totalRarePackCount = 0;
            if (!stats.rarityRates) stats.rarityRates = {};
            if (stats.rarityRates.sixStar === undefined) stats.rarityRates.sixStar = 0;
            if (!stats.rarePackRates) stats.rarePackRates = {};
            if (stats.rarePackRates.sixStar === undefined) stats.rarePackRates.sixStar = 0;
            if (stats.rarePackRates.fiveStar === undefined) stats.rarePackRates.fiveStar = 0;
            
            return stats;
        } else {
            return { ...defaultStats };
        }
    } catch (error) {
        console.error('통계 파일 로드 오류:', error);
        return { ...defaultStats };
    }
}

// 통계 데이터 저장
function saveStats(stats) {
    try {
        stats.lastUpdated = new Date().toISOString();
        fs.writeFileSync(STATS_FILE_PATH, JSON.stringify(stats, null, 2), 'utf8');
    } catch (error) {
        console.error('통계 파일 저장 오류:', error);
    }
}

// 가챠 결과 통계 업데이트
function updateGachaStats(results, isRarePack = false) {
    const stats = loadStats();
    
    if (isRarePack) {
        // 레어팩 통계만 업데이트
        stats.totalRarePackCount++;
        
        // 레어팩 내 등급별 개수 집계
        let rarePackSixStar = 0;
        let rarePackFiveStar = 0;
        
        results.forEach(rarity => {
            switch (rarity) {
                case 6:
                    rarePackSixStar++;
                    break;
                case 5:
                    rarePackFiveStar++;
                    break;
            }
        });
        
        // 레어팩 전용 확률 계산
        if (stats.totalRarePackCount > 0) {
            stats.rarePackRates.sixStar = ((rarePackSixStar / (stats.totalRarePackCount * 10)) * 100).toFixed(2);
            stats.rarePackRates.fiveStar = ((rarePackFiveStar / (stats.totalRarePackCount * 10)) * 100).toFixed(2);
        }
        
        saveStats(stats);
        return stats;
    } else {
        // 일반 가챠 통계 업데이트
        stats.totalGachaCount += results.length;
        
        // 각 등급별 개수 집계
        results.forEach(rarity => {
            switch (rarity) {
                case 3:
                    stats.totalThreeStar++;
                    break;
                case 4:
                    stats.totalFourStar++;
                    break;
                case 5:
                    stats.totalFiveStar++;
                    break;
                case 6:
                    stats.totalSixStar++;
                    break;
            }
        });
        
        // 등급별 확률 계산
        if (stats.totalGachaCount > 0) {
            stats.rarityRates.threeStar = ((stats.totalThreeStar / stats.totalGachaCount) * 100).toFixed(2);
            stats.rarityRates.fourStar = ((stats.totalFourStar / stats.totalGachaCount) * 100).toFixed(2);
            stats.rarityRates.fiveStar = ((stats.totalFiveStar / stats.totalGachaCount) * 100).toFixed(2);
            stats.rarityRates.sixStar = ((stats.totalSixStar / stats.totalGachaCount) * 100).toFixed(2);
        }
        
        saveStats(stats);
        return stats;
    }
}

// 통계 정보 반환
function getGachaStats() {
    const stats = loadStats();
    
    if (stats.totalGachaCount === 0 && stats.totalRarePackCount === 0) {
        return '아직 가챠 통계가 없습니다. `/gacha` 명령어로 첫 가챠를 돌려보세요!';
    }
    
    let result = '## 📊 전체 가챠 통계\n\n';
    
    // 일반 가챠 통계
    if (stats.totalGachaCount > 0) {
        result += `**🎲 총 가챠 횟수:** ${stats.totalGachaCount.toLocaleString()}회\n`;
        result += '\n### 등급별 획득 현황:\n';
        result += `⭐⭐⭐ **3성:** ${stats.totalThreeStar.toLocaleString()}개 (${stats.rarityRates.threeStar || '0.00'}%)\n`;
        result += `⭐⭐⭐⭐ **4성:** ${stats.totalFourStar.toLocaleString()}개 (${stats.rarityRates.fourStar || '0.00'}%)\n`;
        result += `⭐⭐⭐⭐⭐ **5성:** ${stats.totalFiveStar.toLocaleString()}개 (${stats.rarityRates.fiveStar || '0.00'}%)\n`;
        result += `⭐⭐⭐⭐⭐⭐ **6성:** ${stats.totalSixStar.toLocaleString()}개 (${stats.rarityRates.sixStar || '0.00'}%)\n\n`;
    }
    
    // 레어팩 통계
    if (stats.totalRarePackCount > 0) {
        result += `**🎁 레어팩 발동:** ${stats.totalRarePackCount.toLocaleString()}회\n`;
        result += '\n### 레어팩 등급별 확률:\n';
        result += `⭐⭐⭐⭐⭐⭐ **6성:** ${stats.rarePackRates.sixStar || '0.00'}%\n`;
        result += `⭐⭐⭐⭐⭐ **5성:** ${stats.rarePackRates.fiveStar || '0.00'}%\n\n`;
    }
    
    // 마지막 업데이트 시간
    if (stats.lastUpdated) {
        const lastUpdated = new Date(stats.lastUpdated);
        const koreanTime = new Date(lastUpdated.getTime() + (9 * 60 * 60 * 1000)); // UTC+9
        result += `**🕐 마지막 업데이트:** ${koreanTime.toLocaleString('ko-KR')}`;
    }
    
    return result;
}

module.exports = {
    updateGachaStats,
    getGachaStats,
    loadStats,
    saveStats
}; 