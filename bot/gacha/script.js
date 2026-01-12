const fs = require('fs');
const path = require('path');
const { updateUser } = require('./gacha-user');

// 모든 유저에게 스페셜 가챠권 2개를 즉시 지급하는 함수
async function giveSpecialGachaToAllUsers() {
    const usersDir = path.join(__dirname, 'users');
    
    // users 디렉토리가 존재하는지 확인
    if (!fs.existsSync(usersDir)) {
        console.log('users 디렉토리가 존재하지 않습니다.');
        return;
    }
    
    // 모든 유저 파일 읽기
    const userFiles = fs.readdirSync(usersDir).filter(file => file.endsWith('.json'));
    
    if (userFiles.length === 0) {
        console.log('유저 파일이 없습니다.');
        return;
    }
    
    console.log(`총 ${userFiles.length}명의 유저의 스페셜 가챠권을 10개 지급합니다...`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const userFile of userFiles) {
        try {
            const userId = userFile.replace('.json', '');
            
            // updateUser 함수를 사용하여 todaySpecialGachaCount에 10 추가
            await updateUser(userId, user => {
                if (user.todaySpecialGachaCount === undefined) user.todaySpecialGachaCount = 0;
                user.todaySpecialGachaCount += 10;
                console.log(`유저 ${userId}: 스페셜 가챠권 10개 지급 완료 (총 ${user.todaySpecialGachaCount}개)`);
            });

            // 스페셜 가챠권 초기화
            /*await updateUser(userId, user => {
                user.todaySpecialGachaCount = 0;
                console.log(`유저 ${userId}: 초기화 완료`);
            });*/
            
            successCount++;
        } catch (error) {
            console.error(`유저 ${userFile} 처리 중 오류 발생:`, error.message);
            errorCount++;
        }
    }
    
    console.log('\n=== 지급 완료 ===');
    console.log(`성공: ${successCount}명`);
    console.log(`실패: ${errorCount}명`);
    console.log(`총 처리: ${successCount + errorCount}명`);
}

// 스크립트 실행
async function main() {
    console.log('모든 유저의 스페셜 가챠권을 10개 지급합니다다...');
    
    try {
        await giveSpecialGachaToAllUsers();
        console.log('\n스크립트가 성공적으로 완료되었습니다!');
    } catch (error) {
        console.error('스크립트 실행 중 오류 발생:', error);
        process.exit(1);
    }
}

// 스크립트가 직접 실행될 때만 main 함수 호출
if (require.main === module) {
    main();
}
