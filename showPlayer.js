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
            FoundTw = false
            FoundYt = false
            try {
                const profileResponse = await fetch(`https://www.faceit.com/api/users/v1/users/${playerId}`);
                const profileData = await profileResponse.json();
                const profile = profileData.payload;
                const playerIdSteam = profile.platforms.steam.id64;

                //tw from faceit
                try {
                    console.log(`Checking [${i + 1}/10] ${playerNickname} — ${profile.streaming ? profile.streaming.twitch_id : "Not Streamer"}`);
                    if(await checkLiveTV(profile?.streaming?.twitch_id)){
                        HideEnemy(profile?.streaming?.twitch_id,"TW")
                        console.log("Faceit Twitch Online")
                        setPlayerTwitch(playerNickname, `https://www.twitch.tv/${profile?.streaming?.twitch_id}`)
                        FoundTw = true
                    }else{console.log("Faceit Twitch Offline")}
                    
                }catch (e){
                    console.log("TW F error: " + e)
                }
                
                //yt from faceit
                try {
                    console.log(`Checking [${i + 1}/10] ${playerNickname} — ${profile?.socials?.youtube ? profile.socials.youtube.value : "No Faceit Yt"}`);
                    const ytUrl = profile?.socials?.youtube?.value;
                    if (ytUrl) {
                        const cleanHandle = ytUrl
                        .trim()
                        .replace(/\/+$/, '')
                        .split('/')         
                        .pop()              
                        .replace(/^@/, '');
                        const isLive = await checkLiveYT(cleanHandle);
                        
                        if (isLive) {
                            console.log("Faceut YouTube Online  " + ytUrl);
                            HideEnemy(cleanHandle,"YT")
                            setPlayerYoutube(playerNickname, ytUrl)
                            FoundYt = true
                        } else {
                            console.log("Faceut YouTube Offline");
                        }
                    }
                }catch (e){
                    console.log("YT F error: " + e)
                }

                //tw from steam https://steamcommunity.com/profiles/
                try {
                
                    const profilesteamurl = `https://steamcommunity.com/profiles/${playerIdSteam}`;
                    const response = await chrome.runtime.sendMessage({
                        action: 'fetchSteam',
                        url: profilesteamurl
                    });
                    if(response.success){
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
                        //console.log(uniqueLinks) //all links

                        for(let j = 0; j < uniqueLinks.length; j++){
                            
                            //TW
                            if(uniqueLinks[j].includes("https://www.twitch.tv/") || uniqueLinks[j].includes("https://twitch.tv/")){
                                const twchannel = uniqueLinks[j].trim().replace(/\/+$/, '').split('/').pop().split('?')[0];
                                const isLive = await checkLiveTV(twchannel);
                                if(isLive){
                                    console.log(`Steam ${uniqueLinks[j]} ONLINE`)
                                    HideEnemy(twchannel,"TW")
                                    if(!FoundTw)
                                        setPlayerTwitch(playerNickname, uniqueLinks[j])
                                }
                                else{
                                    console.log("Steam Twitch Offline")
                                }
                            }

                            //YT
                            if(uniqueLinks[j].includes("https://www.youtube.com/") || uniqueLinks[j].includes("https://youtube.com/")){
                                const ytUrl = uniqueLinks[j];
                                if (ytUrl) {
                                    const cleanHandle = ytUrl
                                    .trim()
                                    .replace(/\/+$/, '')   // убираем слэш на конце
                                    .split('/')            // разбиваем по слэшам
                                    .pop()                 // забираем последнюю часть ("@MrIceRam")
                                    .replace(/^@/, '');    // отрезаем собачку ("MrIceRam")

                                    const isLive = await checkLiveYT(cleanHandle);
                                    if (isLive) {
                                        HideEnemy(cleanHandle,"YT")
                                        console.log("Steam " + ytUrl + " ONLINE");
                                        if(!FoundYt)
                                            setPlayerYoutube(playerNickname, uniqueLinks[j])
                                    } else {
                                        console.log("Steam Youtube Offline");
                                    }
                                }
                            }
                        }
                    }
                }
                catch (e){
                    console.log("tw from steam error: " + e)
                }

                try{//try hide tw or twitch for nike
                  if(checkLiveTV(playerNickname)){//try hide tw
                    console.log(playerNickname + "СТИРМИТ НА TW")
                  }
                  if(checkLiveYT(playerNickname)){//try hide YT
                    console.log(playerNickname + "СТИРМИТ НА YT")
                  }
                }catch(e){
                console.log("126 error: " + e)
            }
            }catch(e){
                console.log("126 error: " + e)
            }

        //await new Promise(resolve => setTimeout(resolve, 500));//делей
        await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 400));// google ai
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
    const isLive = html.includes('canonical" href="https://www.youtube.com/watch?v=') || 
                   html.includes('"status":"LIVE"') || 
                   html.includes('"isLive":true');
    
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
