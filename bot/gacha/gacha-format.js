// 받침 유무 검사 함수
function hasBatchim(char) {
	const code = char.charCodeAt(0);
	if (code < 0xAC00 || code > 0xD7A3) return false;
	return (code - 0xAC00) % 28 !== 0;
}

// 한국어 조사 처리 함수
function getKoreanParticle(text) {
	const lastChar = text.charAt(text.length - 1);
	return hasBatchim(lastChar) ? '을' : '를';
}

// 돌파 표기 함수
function breakthroughText(count) {
	if (count === 1) return '명함';
	if (count === 2) return '1돌파';
	if (count === 3) return '2돌파';
	if (count === 4) return '3돌파';
	if (count === 5) return '4돌파';
	if (count === 6) return '5돌파';
	return '풀 돌파';
}

// 가챠 결과 포맷팅
function formatGachaResults(gachaData, userId, updateFiveStarStats) {
	const { results, characters, isRarePack } = gachaData;
	
	// 통계 업데이트
	const { updateGachaStats } = require('./gacha-stats');
	updateGachaStats(results, isRarePack);
	
	let firstLine = characters.slice(0, 5).map(char => char.emoji).join(' ');
	let secondLine = characters.slice(5, 10).map(char => char.emoji).join(' ');
	let formattedResults = `${firstLine}\n${secondLine}`;
	const summary = {};
	results.forEach(rarity => {
		summary[rarity] = (summary[rarity] || 0) + 1;
	});
	let summaryText = '\n\n**가챠 결과 요약:**\n';
	for (const [rarity, count] of Object.entries(summary).sort((a, b) => b[0] - a[0])) {
		summaryText += `${rarity}성: ${count}개\n`;
	}
	
	let congratulationText = '';
	
	// 6성 축하 메시지
	if (summary[6] && summary[6] > 0) {
		const sixStarCharacters = characters.filter((char, index) => results[index] === 6);
		const characterNames = sixStarCharacters.map(char => `${char.emoji} **${char.name}**`).join(', ');
		const lastCharacterName = sixStarCharacters[sixStarCharacters.length - 1].name;
		const particle = getKoreanParticle(lastCharacterName);
		congratulationText += `\n\n🎊 **🎊 이럴수가! 6성 캐릭터 ${characterNames}${particle} 뽑으셨군요! 🎊** 🎊`;
	}
	
	// 5성 축하 메시지
	if (summary[5] && summary[5] > 0) {
		const fiveStarCharacters = characters.filter((char, index) => results[index] === 5);
		const characterNames = fiveStarCharacters.map(char => `${char.emoji} **${char.name}**`).join(', ');
		const lastCharacterName = fiveStarCharacters[fiveStarCharacters.length - 1].name;
		const particle = getKoreanParticle(lastCharacterName);
		congratulationText += `\n\n🎉 **축하합니다! ${characterNames}${particle} 뽑으셨군요!** 🎉`;
		if (updateFiveStarStats) updateFiveStarStats(userId, fiveStarCharacters);
	}
	
	return formattedResults + summaryText + congratulationText;
}

// 임베드 작성을 위한 상세 포맷팅 데이터 반환
function formatGachaResultsDetailed(gachaData, userId, updateFiveStarStats) {
	const { results, characters, isRarePack } = gachaData;

	// 통계 업데이트 및 사용자 카운트 증가는 여기서 수행하지 않습니다.

	const emojiLines = [
		characters.slice(0, 5).map(char => char.emoji).join(' '),
		characters.slice(5, 10).map(char => char.emoji).join(' ')
	];
	const gridText = `${emojiLines[0]}\n${emojiLines[1]}`;

	const summaryMap = {};
	results.forEach(rarity => {
		summaryMap[rarity] = (summaryMap[rarity] || 0) + 1;
	});

	let congratulationText = '';
	const hasSixStar = Boolean(summaryMap[6] && summaryMap[6] > 0);
	const hasFiveStar = Boolean(summaryMap[5] && summaryMap[5] > 0);

	if (hasSixStar) {
		const sixStarCharacters = characters.filter((char, index) => results[index] === 6);
		const characterNames = sixStarCharacters.map(char => `${char.emoji} **${char.name}**`).join(', ');
		const lastCharacterName = sixStarCharacters[sixStarCharacters.length - 1].name;
		const particle = getKoreanParticle(lastCharacterName);
		congratulationText += `🎊 이럴수가! 6성 캐릭터 ${characterNames}${particle} 뽑으셨군요! 🎊`;
	}

	if (hasFiveStar) {
		const fiveStarCharacters = characters.filter((char, index) => results[index] === 5);
		const characterNames = fiveStarCharacters.map(char => `${char.emoji} **${char.name}**`).join(', ');
		const lastCharacterName = fiveStarCharacters[fiveStarCharacters.length - 1].name;
		const particle = getKoreanParticle(lastCharacterName);
		const fiveMsg = `🎉 축하합니다! ${characterNames}${particle} 뽑으셨군요! 🎉`;
		congratulationText = congratulationText ? `${congratulationText}\n${fiveMsg}` : fiveMsg;
	}

	return {
		emojiLines,
		gridText,
		summaryMap,
		congratulationText,
		isRarePack,
		hasSixStar,
		hasFiveStar
	};
}

// Discord Embed 생성 함수
function createGachaEmbed(gachaMeta, username, avatarURL) {
	const { EmbedBuilder } = require('discord.js');
	const { updateMessage, isRarePack, emojiLines, summaryMap, congratulationText, hasSixStar, hasFiveStar } = gachaMeta;

	// 색상 및 타이틀 이모지 선정
	let color = 0x5865f2; // 기본 디스코드 블루
	if (isRarePack) color = 0xf39c12; // 금색
	else if (hasSixStar) color = 0xff4757; // 레드 계열
	else if (hasFiveStar) color = 0x9b59b6; // 퍼플 계열

	
	const title = `🎰 오늘의 가챠`;

	// 설명: 업데이트 메시지만 표시 (축하 메시지는 별도 필드로)
	const description = updateMessage || '';

	// 이모지 결과를 좌우 컬럼으로 분할하여 넓은 공간 활용
	const firstLine = (emojiLines && emojiLines[0]) ? emojiLines[0] : '';
	const secondLine = (emojiLines && emojiLines[1]) ? emojiLines[1] : '';

	// 요약: 5성 이상만 표시
	let summaryCompact = '';
	if (summaryMap && Object.keys(summaryMap).length > 0) {
		const ordered = Object.keys(summaryMap)
			.map(k => Number(k))
			.filter(k => k >= 5) // 5성 이상만 필터링
			.sort((a, b) => b - a);
		const tokens = ordered
			.map(r => ({ r, c: summaryMap[r] }))
			.filter(x => x.c > 0)
			.map(x => `${x.r}⭐ x ${x.c}`);
		
		if (tokens.length > 0) {
			summaryCompact = tokens.join(' · ');
		} else {
			summaryCompact = '`5성 이상 없음!`';
		}
	} else {
		summaryCompact = '`5성 이상 없음!`';
	}

	// 필드 구성: 여유 공간을 위한 빈 필드 추가
	const fields = [];

    // 여유 공간 추가
	fields.push({ name: '\u200B', value: '\u200B', inline: false });
	// 가챠 결과를 5개씩 2줄로 표시
	if (firstLine && secondLine) {
		fields.push({ name: '<a:lemon_click:1122183344818495608> 가챠 결과 <a:lemon_click:1122183344818495608>', value: `\n${firstLine}\n${secondLine}`, inline: false });
	} else if (firstLine || secondLine) {
		// 한 줄만 있는 경우
		fields.push({ name: '<a:lemon_click:1122183344818495608> 가챠 결과 <a:lemon_click:1122183344818495608>', value: firstLine || secondLine, inline: false });
	}

	// 레어팩/축하 메시지를 별도 필드로 표시 (중복 제거)
	if (isRarePack) {
		fields.push({ name: '특별 이벤트', value: '🎁 레어팩 발동! 모든 캐릭터가 5성 이상으로 등장했습니다.', inline: false });
		// 여유 공간 추가
		fields.push({ name: '\u200B', value: '\u200B', inline: false });
	} else if (congratulationText) {
		fields.push({ name: '특별 획득', value: congratulationText, inline: false });
		// 여유 공간 추가
		fields.push({ name: '\u200B', value: '\u200B', inline: false });
	}

	// 요약을 마지막에 배치
	fields.push({ name: '', value: summaryCompact, inline: false });

	const embed = new EmbedBuilder()
		.setColor(color)
		.setTitle(title)
		.setDescription(description)
		.setTimestamp(new Date());

	// author는 전달된 경우에만 설정 (supa.js에서 최종 설정됨)
	if (username) {
		embed.setAuthor({ name: username, iconURL: avatarURL });
	}

	if (fields.length > 0) {
		embed.addFields(fields);
	}

	return embed;
}

module.exports = {
	hasBatchim,
	getKoreanParticle,
	breakthroughText,
	formatGachaResults,
	formatGachaResultsDetailed,
	createGachaEmbed
}; 