const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const { SlashCommandBuilder } = require('@discordjs/builders');
require('dotenv').config();

const commands = [
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

const rest = new REST({ version: '10' }).setToken(process.env.SUPATOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(process.env.SUPA_CLIENT_ID),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
})();