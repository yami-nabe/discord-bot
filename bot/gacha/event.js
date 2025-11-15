const { updateUser } = require('./gacha-user');
// 이벤트 가챠 확률을 설정/반환하는 공간입니다.
// setEventGachaRate, getEventGachaRate 함수만 틀로 제공합니다.
// 실제 이벤트 확률은 아래의 eventGachaRates 객체를 직접 수정해서 사용하세요.

// 2025년 10월 6일 ~ 10월 14일 5성 확률 2배 이벤트
// 5성: 0.6% → 1.2% (2배), 4성: 5.1%, 3성: 93.65%
let eventGachaRates = {
    6: 0.0005,  // 6성 0.05%
    5: 0.018,  // 5성 1.8% (기본 0.6%의 3배)
    4: 0.051,  // 4성 5.1%
    3: 0.9315   // 3성 93.15%
};

// 이벤트 기간 (2025년 10월 6일 ~ 2025년 10월 14일)
const EVENT_START_DATE = '2025-10-06';
const EVENT_END_DATE = '2025-10-14';

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

// 이벤트가 진행 중인지 확인
function isEventActive() {
    const currentDate = getCurrentKRDate();
    return currentDate >= EVENT_START_DATE && currentDate <= EVENT_END_DATE;
}

// 이벤트 확률을 직접 설정 (이 파일을 직접 수정)
function setEventGachaRate(rates) {
    // rates: { 5: number, 4: number, 3: number }
    eventGachaRates = rates;
}

// 현재 적용 중인 이벤트 확률 반환 (없으면 null)
function getEventGachaRate() {
    // 이벤트가 종료되었으면 null 반환
    if (!isEventActive()) {
        eventGachaRates = null;
        return null;
    }
    return eventGachaRates;
}

// 이벤트 추가 가챠권(specialGachaCount) 관리 공간
// 2025년 10월 14일까지 매일 가챠권 1장 추가 지급
let eventSpecialGachaCount = 1; // 이벤트로 1장 지급

// 이벤트 추가 가챠권 설정 (매일 1장 지급)
async function setEventSpecialGachaCount(userId) {
    // 이벤트가 진행 중이면 가챠권 지급
    if (isEventActive()) {
        await updateUser(userId, user => {
            if (user.todaySpecialGachaCount === undefined) user.todaySpecialGachaCount = 0;
            user.todaySpecialGachaCount += eventSpecialGachaCount;
        });
    }
}

// 현재 적용 중인 이벤트 추가 가챠권 반환 (없으면 null)
function getEventSpecialGachaCount() {
    // 이벤트가 종료되었으면 null 반환
    if (!isEventActive()) {
        eventSpecialGachaCount = null;
        return null;
    }
    return eventSpecialGachaCount;
}

module.exports = {
    setEventGachaRate,
    getEventGachaRate,
    setEventSpecialGachaCount,
    getEventSpecialGachaCount,
    isEventActive
};
