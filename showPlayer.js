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
        const roster1 = matchData.payload.teams.faction1.roster || [];
        const roster2 = matchData.payload.teams.faction2.roster || [];
        const allPlayers = [...roster1, ...roster2];


        // 3. Проверяем каждого игрока
        for (let i = 0; i < allPlayers.length; i++) {
            const player = allPlayers[i];
            const playerId = player.id;
            const playerNickname = player.nickname;
            try {
                const profileResponse = await fetch(`https://www.faceit.com/api/users/v1/users/${playerId}`);
                const profileData = await profileResponse.json();
                const profile = profileData.payload;
                const playerIdSteam = profile.platforms.steam.id64;

                //tw from faceit
                try {
                    console.log(`Checking [${i + 1}/10] ${playerNickname} — ${profile.streaming ? profile.streaming.twitch_id : "Not Streamer"}`);
                    if(profile.streaming){
                        console.log(await checkStreamSimple(profile.streaming.twitch_id) ? `Faceit https://twitch.tw/${profile.streaming.twitch_id} ONLINE` : "Faceit Twitch Offline")
                    }
                    
                }catch (e){
                    console.log("TW F error")
                }
                
                //yt from faceit
                try {
                    console.log(`Checking [${i + 1}/10] ${playerNickname} — ${profile.socials && profile.socials.youtube ? profile.socials.youtube.value : "No Faceit Yt"}`);
                    const ytUrl = profile.socials?.youtube?.value;
                    if (ytUrl) {
                        const isLive = await checkLiveStatusByScraping(ytUrl);
                        
                        if (isLive) {
                            console.log("WIN " + ytUrl);
                        } else {
                            console.log("losse");
                        }
                    }
                }catch (e){
                    console.log("YT F error")
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
                            //tv
                            if(uniqueLinks[j].includes("https://www.twitch.tv/") || uniqueLinks[j].includes("https://twitch.tv/")){
                                const twchannel = uniqueLinks[j].trim().replace(/\/+$/, '').split('/').pop().split('?')[0];
                                console.log(await checkStreamSimple(twchannel) ? `Steam ${uniqueLinks[j]} ONLINE` : "Steam Twitch Offline")
                            }
                            //yt
                            if(uniqueLinks[j].includes("https://www.youtube.com/") || uniqueLinks[j].includes("https://youtube.com/")){
                                const ytUrl = uniqueLinks[j];
                                if (ytUrl) {
                                    const isLive = await checkLiveStatusByScraping(ytUrl);
                                    if (isLive) {
                                        console.log("Steam " + ytUrl + " ONLINE");
                                    } else {
                                        console.log("Steam Youtube Offline");
                                    }
                                }
                            }
                        }
                    }
                }
                catch (e){
                    console.log("68 steam error")
                }
            }catch(e){
                console.log("71 error")
            }

        await new Promise(resolve => setTimeout(resolve, 500));//делей
        }
    }
    catch(error){
        console.log("error")
    }
}
setTimeout(checkPlayersInLobby, 3000);


// IF TV live
async function checkStreamSimple(channelName) {
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


// IF YT live
async function checkLiveStatusByScraping(channelHandle) {
  // Вытаскиваем только ник (@MrIceRam) из полной ссылки и убираем собачку @
  const cleanHandle = channelHandle
    .trim()
    .replace(/\/+$/, '')   // убираем слэш на конце
    .split('/')            // разбиваем по слэшам
    .pop()                 // забираем последнюю часть ("@MrIceRam")
    .replace(/^@/, '');    // отрезаем собачку ("MrIceRam")

  const url = `https://www.youtube.com/@${cleanHandle}/live`;
  
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