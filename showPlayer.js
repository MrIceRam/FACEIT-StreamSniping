playersMap = {};

async function checkPlayersInLobby() {
    
    // 1. Проверяем, что мы в лобби матча
    const url = window.location.href;
    const matchIdMatch = url.match(/\/room\/([a-f0-9-]+)/i);
    
    if (!matchIdMatch) {
        console.log("Это не страница лобби матча");
        return;
    }

    const matchId = matchIdMatch[1];
    console.log("========================== НАЙДЕНО ЛОББИ ==========================");
    console.log("ID матча:", matchId);

    try {
        // 2. Получаем данные матча
        const matchResponse = await fetch(`https://www.faceit.com/api/match/v2/match/${matchId}`);
        const matchData = await matchResponse.json();

        // Собираем всех игроков из обеих команд
        console.log("TEST")
        clearMatchData()
        const roster1 = matchData.payload.teams.faction1.roster || [];
        const roster2 = matchData.payload.teams.faction2.roster || [];
        const allPlayers = [...roster1, ...roster2];

        allPlayers.forEach((player, i) => {
            const playerTeam = i < roster1.length ? 1 : 2;
            registerPlayer(player.nickname, playerTeam);
        });
        saveToStorage(); // Сразу сохраняем все 10 ников в попап!


        // 3. Проверяем каждого игрока
    for (let i = 0; i < allPlayers.length; i++) {
    const playerTeam = i < roster1.length ? 1 : 2;
    const player = allPlayers[i];
    const playerId = player.id;
    const playerNickname = player.nickname;

    try {
        // 1. Сначала узнаём профиль FACEIT (это нужно для Twitch/YouTube)
        const profileResponse = await fetch(`https://www.faceit.com/api/users/v1/users/${playerId}`);
        const profileData = await profileResponse.json();
        const profile = profileData.payload;
        const playerIdSteam = profile?.platforms?.steam?.id64;


        // 2. ПАРАЛЛЕЛЬНО запускаем три проверки
        const [faceitTw, faceitYt, steamResult] = await Promise.all([
            checkFaceitTwitch(profile, playerNickname, i),
            checkFaceitYoutube(profile, playerNickname, i),
            checkSteam(playerIdSteam, playerNickname, false, false),
            checkNike(playerNickname)
        ]);


        const FoundTw = faceitTw || steamResult.tw;
        const FoundYt = faceitYt || steamResult.yt;

    } catch (e) {
        console.log("126 error: " + e);
    }

    await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 400));
}
    }
    catch(error){
        console.log("error: " + error)
    }
}
setTimeout(checkPlayersInLobby, 3000);

// IF TV live
async function checkLiveTV(channelName) {
try {
    const response = await fetch(`https://decapi.me/twitch/uptime/${channelName}`);
    if (!response.ok) return false;

    const text = await response.text();
    // Если канал оффлайн, сервис вернет строку с фразой "is offline"
    const isLive = !text.toLowerCase().includes("offline");

    return isLive ? 1 : 0;
} catch (error) {
    console.error("Ошибка проверки:", error);
    return 0;
}
}

// IF YT live
async function checkLiveYT(Nickname) {
  // Вытаскиваем только ник (@MrIceRam) из полной ссылки и убираем собачку @
const url = `https://www.youtube.com/@${Nickname}/live`;

try {
    const response = await chrome.runtime.sendMessage({
        action: 'fetchSteam',
        url: url
    });

    if (!response || !response.success) {
        return false;
    }

    const html = response.html;

    // Исправленная строка с закрытыми кавычками:
    const isLive = html.includes('canonical" href="https://www.youtube.com/watch?v=') || html.includes('"status":"LIVE"') || html.includes('"isLive":true');
    return isLive;
    } catch (error) {
    console.error('Ошибка при проверке:', error);
    return false;
    }
}

function HideEnemy(name,x){
    chrome.runtime.sendMessage({
        action: 'SHOW_NOTIF',
        message: `${name}: ${x}`,
    });
}

function clearMatchData() {
    playersMap = {};

    chrome.storage.local.remove('faceitTeams', () => {
    console.log("Данные прошлого матча очищены!");
    });
}

function saveToStorage() {
  const matchPlayers = Object.values(playersMap);
  
  chrome.storage.local.set({ faceitTeams: matchPlayers }, () => {
    console.log("Сохранено игроков:", matchPlayers.length);
  });
}

function registerPlayer(nickname, teamNumber) {
  if (!playersMap[nickname]) {
    playersMap[nickname] = {
      name: nickname,
      team: teamNumber, // 1 или 2
      twitch: null,
      youtube: null
    };
  }
}

function setPlayerTwitch(nickname, twitchUrl) {
  if (playersMap[nickname]) {
    playersMap[nickname].twitch = twitchUrl;
    saveToStorage();
  }
}

function setPlayerYoutube(nickname, ytUrl) {
  if (playersMap[nickname]) {
    playersMap[nickname].youtube = ytUrl;
    saveToStorage();
  }
}

function cleanSteamLink(rawHref) {
  if (!rawHref) return null;
  try {
    const url = new URL(rawHref, 'https://steamcommunity.com');
    if (url.pathname.includes('/linkfilter')) {
      const target = url.searchParams.get('u') || url.searchParams.get('url');
      return target ? decodeURIComponent(target) : rawHref;
    }
    return rawHref;
  } catch {
    return rawHref;
  }
}

//bed
// Проверка Twitch из FACEIT-профиля
async function checkFaceitTwitch(profile, nickname, index) {
    try {
        const twitchId = profile?.streaming?.twitch_id;
        console.log(`Checking [${index + 1}/10] ${nickname} — ${twitchId || "Not Streamer"}`);
        if (!twitchId) return false;

        if (await checkLiveTV(twitchId)) {
            HideEnemy(twitchId, "TW");
            console.log("Faceit Twitch Online");
            setPlayerTwitch(nickname, `https://www.twitch.tv/${twitchId}`);
            return true;
        } else {
            console.log("Faceit Twitch Offline");
            return false;
        }
    } catch (e) {
        console.log("TW F error: " + e);
        return false;  // ← важно! не кидаем ошибку наружу
    }
}

// Проверка YouTube из FACEIT-профиля
async function checkFaceitYoutube(profile, nickname, index) {
    try {
        const ytUrl = profile?.socials?.youtube?.value;
        console.log(`Checking [${index + 1}/10] ${nickname} — ${ytUrl || "No Faceit Yt"}`);
        if (!ytUrl) return false;

        const cleanHandle = ytUrl
            .trim()
            .replace(/\/+$/, '')
            .split('/')
            .pop()
            .replace(/^@/, '');

        if (await checkLiveYT(cleanHandle)) {
            console.log("Faceit YouTube Online  " + ytUrl);
            HideEnemy(cleanHandle, "YT");
            setPlayerYoutube(nickname, ytUrl);
            return true;
        } else {
            console.log("Faceit YouTube Offline");
            return false;
        }
    } catch (e) {
        console.log("YT F error: " + e);
        return false;
    }
}

// Загрузка и парсинг Steam-профиля + проверка ссылок внутри
async function checkSteam(playerIdSteam, nickname, FoundTw, FoundYt) {
    try {
        if (!playerIdSteam) return { tw: false, yt: false };

        const response = await chrome.runtime.sendMessage({
            action: 'fetchSteam',
            url: `https://steamcommunity.com/profiles/${playerIdSteam}`
        });

        if (!response?.success) return { tw: false, yt: false };

        const parser = new DOMParser();
        const doc = parser.parseFromString(response.html, 'text/html');
        const rawElements = [
            ...doc.querySelectorAll('.profile_summary a'),
            ...doc.querySelectorAll('.showcase_notes a')
        ];

        const uniqueLinks = [...new Set(
            rawElements
                .map(a => cleanSteamLink(a.getAttribute('href')))
                .filter(Boolean)
        )];

        let foundTwSteam = false;
        let foundYtSteam = false;

        for (let j = 0; j < uniqueLinks.length; j++) {
            const link = uniqueLinks[j];

            // Twitch
            if (link.includes("twitch.tv/")) {
                const twChannel = link.trim().replace(/\/+$/, '').split('/').pop().split('?')[0];
                if (await checkLiveTV(twChannel)) {
                    console.log(`Steam ${link} ONLINE`);
                    HideEnemy(twChannel, "TW");
                    if (!FoundTw) {
                        setPlayerTwitch(nickname, link);
                        foundTwSteam = true;
                    }
                } else {
                    console.log("Steam Twitch Offline");
                }
            }

            // YouTube
            if (link.includes("youtube.com/")) {
                const cleanHandle = link
                    .trim()
                    .replace(/\/+$/, '')
                    .split('/')
                    .pop()
                    .replace(/^@/, '');

                if (await checkLiveYT(cleanHandle)) {
                    HideEnemy(cleanHandle, "YT");
                    console.log("Steam " + link + " ONLINE");
                    if (!FoundYt) {
                        setPlayerYoutube(nickname, link);
                        foundYtSteam = true;
                    }
                } else {
                    console.log("Steam Youtube Offline");
                }
            }
        }

        return { tw: foundTwSteam, yt: foundYtSteam };
    } catch (e) {
        console.log("steam error: " + e);
        return { tw: false, yt: false };
    }
}
async function checkNike(playerIdSteam, nickname, FoundTw, FoundYt) {
        try {
            if (await checkLiveTV(nickname)) {
                console.log(nickname + " СТИРМИТ НА TW");
            }
            if (await checkLiveYT(nickname)) {
                console.log(nickname + " СТИРМИТ НА YT");
            }
        } catch (e) {
            console.log("126 error: " + e);
        }
}