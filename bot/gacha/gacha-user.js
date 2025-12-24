const fs = require('fs');
const path = require('path');

const USERS_DIR = path.join(__dirname, 'users');

// 파일 접근 직렬화 큐
class UserFileQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
    }
    enqueue(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.processNext();
        });
    }
    async processNext() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;
        const { task, resolve, reject } = this.queue.shift();
        try {
            const result = await task();
            resolve(result);
        } catch (err) {
            reject(err);
        }
        this.processing = false;
        setImmediate(() => this.processNext());
    }
}

const userFileQueue = new UserFileQueue();

function getUserFilePath(userId) {
    return path.join(USERS_DIR, `${userId}.json`);
}

function ensureUsersDir() {
    if (!fs.existsSync(USERS_DIR)) {
        fs.mkdirSync(USERS_DIR);
    }
}

async function loadUsers() {
    ensureUsersDir();
    const files = fs.readdirSync(USERS_DIR).filter(f => f.endsWith('.json'));
    const users = {};
    for (const file of files) {
        const userId = path.basename(file, '.json');
        const data = fs.readFileSync(path.join(USERS_DIR, file), 'utf8');
        users[userId] = JSON.parse(data);
    }
    return users;
}

async function saveUsers(users) {
    ensureUsersDir();
    for (const userId in users) {
        const filePath = getUserFilePath(userId);
        fs.writeFileSync(filePath, JSON.stringify(users[userId], null, 2), 'utf8');
    }
}

async function getUser(userId) {
    ensureUsersDir();
    const filePath = getUserFilePath(userId);
    if (!fs.existsSync(filePath)) return null;
    const data = fs.readFileSync(filePath, 'utf8');
    const user = JSON.parse(data);
    if (user && user.todayGachaCount === undefined) user.todayGachaCount = 1;
    if (user && user.noFiveStarCount === undefined) user.noFiveStarCount = 0;
    if (user && user.todaySpecialGachaCount === undefined) user.todaySpecialGachaCount = 0;
    if (user.sixStarStats === undefined) user.sixStarStats = {}; // 6성 통계 초기화
    if (user && user.lemonDust === undefined) user.lemonDust = 0; // 레몬빛 가루 초기화
    return user;
}

async function updateUser(userId, updateFn) {
    ensureUsersDir();
    const filePath = getUserFilePath(userId);
    let user;
    if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        user = JSON.parse(data);
    } else {
        user = {
            userId,
            lastGachaDate: null,
            consecutiveDays: 0,
            fiveStarStats: {},
            sixStarStats: {}, // 6성 통계 추가
            ceilingCoupons: 0,
            todayGachaCount: 1,
            noFiveStarCount: 0,
            todaySpecialGachaCount: 0,
            lemonDust: 0 // 레몬빛 가루 초기화
        };
    }
    if (user.todayGachaCount === undefined) user.todayGachaCount = 1;
    if (user.noFiveStarCount === undefined) user.noFiveStarCount = 0;
    if (user.todaySpecialGachaCount === undefined) user.todaySpecialGachaCount = 0;
    if (user.sixStarStats === undefined) user.sixStarStats = {}; // 6성 통계 초기화
    if (user.lemonDust === undefined) user.lemonDust = 0; // 레몬빛 가루 초기화
    updateFn(user);
    fs.writeFileSync(filePath, JSON.stringify(user, null, 2), 'utf8');
    return user;
}

module.exports = {
    loadUsers,
    saveUsers,
    getUser,
    updateUser,
    userFileQueue // for debugging/inspection
}; 