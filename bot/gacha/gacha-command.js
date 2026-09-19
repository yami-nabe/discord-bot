const path = require('path');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const { SlashCommandBuilder } = require('@discordjs/builders');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const commands = [
    new SlashCommandBuilder()
        .setName('persona')
        .setDescription('호출 가능한 페르소나 목록 확인'),
    new SlashCommandBuilder()
        .setName('gacha')
        .setDescription('오늘의 가챠 돌리기'),
    new SlashCommandBuilder()
        .setName('gachainfo')
        .setDescription('가챠 정보 및 확률 확인'),
    new SlashCommandBuilder()
        .setName('gachalist')
        .setDescription('5성 캐릭터 목록 및 픽업 정보'),
    new SlashCommandBuilder()
        .setName('mygacha')
        .setDescription('내 가챠 정보 확인'),
    new SlashCommandBuilder()
        .setName('coupon')
        .setDescription('천장 쿠폰으로 5성 캐릭터 교환')
        .addStringOption(option =>
            option.setName('대상')
                .setDescription('교환할 캐릭터 이름 (입력하지 않으면 이모지 반응으로 선택)')
                .setRequired(false)),
    new SlashCommandBuilder()
        .setName('gachastats')
        .setDescription('전체 가챠 통계 확인'),
].map(command => command.toJSON());

(async () => {
    try {
        const token = process.env.SUPA_TOKEN || process.env.SUPATOKEN;
        const applicationId = process.env.SUPA_CLIENT_ID;
        if (!token || !applicationId) {
            throw new Error('.env에 SUPA_TOKEN(또는 SUPATOKEN)과 SUPA_CLIENT_ID를 설정해주세요.');
        }

        const rest = new REST({ version: '10' }).setToken(token);
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(applicationId),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error registering commands:', error.message);
        process.exitCode = 1;
    }
})();
