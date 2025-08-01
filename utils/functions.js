const { emojiDict } = require('./mapping');

function toLongEmoji(text) {
    // Generate a regular expression pattern from the keys of the dictionary
    const emojiPattern = new RegExp(Object.keys(emojiDict).map(key => key.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1")).join("|"), "g");

    // Use the generated pattern to replace the shortcuts in the text
    return text.replace(emojiPattern, (match) => emojiDict[match]);
}

function toShortEmoji(text) {
    // Regular expression to match full-name emojis, both static and animated
    const emojiPattern = /<a?:([a-zA-Z0-9_]+):\d+>/g;

    // Replace full-name emojis with their shorter form
    return text.replace(emojiPattern, (match, p1) => {
        // Convert underscores to spaces in the extracted emoji name
        const shortName = p1.replace(/_/g, ' ');
        return `:${shortName}:`;
    });
}

function editOutput(text){
    text = toLongEmoji(text);
    return text;
}

async function sendLongMessage(message, content) {
    const MAX_LENGTH = 2000;
    let startIndex = 0;
    let lastReply;

    while (startIndex < content.length) {
        const endIndex = Math.min(startIndex + MAX_LENGTH, content.length);
        const messagePart = content.slice(startIndex, endIndex);
        lastReply = await message.reply(messagePart);
        startIndex = endIndex;
    }

    if(lastReply&&!(content.startsWith('Current log:'))){
        await lastReply.react('🔄');
        await lastReply.react('❌');
    }
}

async function sendLongNormalMessage(channel, content) {
    const MAX_LENGTH = 2000;
    let startIndex = 0;

    while (startIndex < content.length) {
        const endIndex = Math.min(startIndex + MAX_LENGTH, content.length);
        const messagePart = content.slice(startIndex, endIndex);
        await channel.send(messagePart);
        startIndex = endIndex;
    }
}

function extractTextFromResponse(response) {
    // Split the response into individual lines
    const lines = response.split('\n');
    let collectedText = '';

    // Loop through each line and look for "content_block_delta" events
    lines.forEach(line => {
        if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'content_block_delta' && data.delta.type === 'text_delta') {
                collectedText += data.delta.text;
            }
        }
    });

    return collectedText;
}

async function sendLog(message, messages){
    const logOutput = messages.map((msg, index) => {
        const rolePrefix = msg.role === 'user' ? 'U' : 'A';
        return `${index + 1}. ${rolePrefix}: ${msg.content.split(' ').slice(0, 5).join(' ')}...`;
    }).join('\n');
    await sendLongMessage(message, `Current log:\n\`\`\`\n${logOutput}\n\`\`\``);
}

async function sendGeminiLog(message, messages){
    // Generate the log output by mapping over the messages array
    const logOutput = messages.map((msg, index) => {
        // Determine the role prefix (U for user, A for assistant)
        const rolePrefix = msg.role === 'user' ? 'U' : 'A';
        // Extract the text from the parts array
        const messageText = msg.parts.map(part => part.text).join(' ');
        // Take the first 5 words of the message content and join them with spaces
        const truncatedContent = messageText.split(' ').slice(0, 5).join(' ') + '...';
        // Return the formatted string for this message
        return `${index + 1}. ${rolePrefix}: ${truncatedContent}`;
    }).join('\n'); // Join all messages with newlines

    // Send the formatted log output as a long message in a code block
    await sendLongMessage(message, `Current log:\`\`\`\n${logOutput}\n\`\`\``);
}
async function getAccessToken(clientEmail, privateKey) {
    const jwt = await generateJWT(clientEmail, privateKey);
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });
    if (!response.ok) {
        let errorText;
        try {
            errorText = JSON.stringify(await response.json());
        }
        catch {
            errorText = response.status;
        }
        throw new Error(`Failed to refresh google access token: ${errorText}`);
    }
    const data = await response.json();
    const accessToken = data.access_token;
    if (!accessToken) {
        throw new Error("No google access token in the response");
    }
    return accessToken;
}
async function generateJWT(clientEmail, privateKey) {
    if (!clientEmail.includes("gserviceaccount.com")) {
        throw new Error("Invalid Vertex project id. Must include gserviceaccount.com");
    }
    if (!privateKey.includes("-----BEGIN PRIVATE KEY-----") ||
        !privateKey.includes("-----END PRIVATE KEY-----")) {
        throw new Error("Invalid Vertex private key. Must include proper key markers.");
    }
    const header = {
        alg: "RS256",
        typ: "JWT",
    };
    const now = Math.floor(Date.now() / 1000);
    const claimSet = {
        iss: clientEmail,
        scope: "https://www.googleapis.com/auth/cloud-platform",
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now,
    };
    const encodedHeader = base64url(new TextEncoder().encode(JSON.stringify(header)));
    const encodedClaimSet = base64url(new TextEncoder().encode(JSON.stringify(claimSet)));
    const key = await crypto.subtle.importKey("pkcs8", str2ab(privateKey), {
        name: "RSASSA-PKCS1-v1_5",
        hash: { name: "SHA-256" },
    }, false, ["sign"]);
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${encodedHeader}.${encodedClaimSet}`));
    return `${encodedHeader}.${encodedClaimSet}.${base64url(new Uint8Array(signature))}`;
}
function str2ab(privateKey) {
    const binaryString = atob(privateKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\\n/g, ""));
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}
function base64url(source) {
    return btoa(String.fromCharCode.apply(null, [...source]))
        .replace(/=+$/, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}
module.exports = {toShortEmoji,editOutput, sendLongMessage, sendLongNormalMessage, extractTextFromResponse,sendLog, sendGeminiLog,generateJWT,getAccessToken};