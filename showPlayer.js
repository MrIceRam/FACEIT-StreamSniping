playersMap = {};

const LIVE_CACHE = new Map();
const TTL = 60 * 1000;

function getLive(key, fetchFn) {
  const hit = LIVE_CACHE.get(key);
  if (hit && Date.now() - hit.t < TTL) return Promise.resolve(hit.live);
  const p = Promise.resolve().then(fetchFn).catch(() => false);
  LIVE_CACHE.set(key, { live: p, t: Date.now() });
  return p;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

function setScan(scan) {
  chrome.storage.local.set({ scan });
}

async function checkPlayersInLobby() {
  const matchIdMatch = window.location.href.match(/\/room\/([a-f0-9-]+)/i);
  if (!matchIdMatch) return;

  const matchId = matchIdMatch[1];
  console.log("========================== НАЙДЕНО ЛОББИ ==========================");
  console.log("ID матча:", matchId);

  try {
    clearMatchData();
    setScan({ running: true, state: "match", total: 0, done: 0, current: "Получение данных матча..." });

    const matchResponse = await fetch(`https://www.faceit.com/api/match/v2/match/${matchId}`);
    const matchPayload = await matchResponse.json();
    const body = matchPayload.payload;

    const faction1 = body.teams.faction1;
    const faction2 = body.teams.faction2;
    const roster1 = faction1.roster || [];
    const roster2 = faction2.roster || [];
    const team1Name = faction1.name || "Faction 1";
    const team2Name = faction2.name || "Faction 2";
    const allPlayers = [...roster1, ...roster2];

    allPlayers.forEach((p, i) => {
      const team = i < roster1.length ? 1 : 2;
      registerPlayer(
        p.nickname,
        team,
        team === 1 ? team1Name : team2Name,
        p.avatar,
        p.game_skill_level,
        p.id
      );
    });
    saveToStorage();

    setScan({ running: true, state: "profiles", total: allPlayers.length, done: 0, current: "Загрузка профилей..." });

    const profiles = await mapLimit(allPlayers, 5, async (player) => {
      try {
        const r = await fetch(`https://www.faceit.com/api/users/v1/users/${player.id}`);
        const d = await r.json();
        return d.payload;
      } catch (e) {
        console.log("profile error: " + e);
        return null;
      }
    });

    setScan({ running: true, state: "checking", total: allPlayers.length, done: 0, current: "Проверка каналов..." });

    await mapLimit(allPlayers, 3, async (player, i) => {
      await checkPlayer(player, profiles[i]);
      setScan({
        running: i + 1 < allPlayers.length,
        state: "checking",
        total: allPlayers.length,
        done: i + 1,
        current: player.nickname
      });
    });

    setScan({ running: false, state: "done", total: allPlayers.length, done: allPlayers.length, current: "" });
    console.log("Проверка завершена!");
  } catch (error) {
    console.log("error: " + error);
    setScan({ running: false, state: "error", total: 0, done: 0, current: "Ошибка загрузки матча" });
  }
}

async function checkPlayer(player, profile) {
  const nickname = player.nickname;
  const steamId = profile?.platforms?.steam?.id64;

  let tw = false;
  let yt = false;

  const twChannel = profile?.streaming?.twitch_id;
  if (twChannel) {
    const live = await checkLiveTV(twChannel);
    if (live) {
      tw = true;
      console.log(`FACEIT Twitch online: ${nickname}`);
      HideEnemy(twChannel, "TW");
      setPlayerTwitch(nickname, `https://www.twitch.tv/${twChannel}`);
      markLIVE(nickname, "twitch");
    } else {
      console.log("FACEIT Twitch offline");
    }
  }

  const ytUrl = profile?.socials?.youtube?.value;
  if (ytUrl) {
    const handle = cleanHandle(ytUrl);
    const live = await checkLiveYT(handle);
    if (live) {
      yt = true;
      console.log(`FACEIT YouTube online: ${nickname}`);
      HideEnemy(handle, "YT");
      setPlayerYoutube(nickname, ytUrl);
      markLIVE(nickname, "youtube");
    } else {
      console.log("FACEIT YouTube offline");
    }
  }

  if (steamId) {
    const links = await fetchSteamLinks(steamId);
    for (const link of links) {
      if (link.includes("twitch.tv/") && !tw) {
        const channel = link.trim().replace(/\/+$/, "").split("/").pop().split("?")[0];
        if (await checkLiveTV(channel)) {
          console.log(`Steam ${link} ONLINE`);
          HideEnemy(channel, "TW");
          setPlayerTwitch(nickname, link);
          markLIVE(nickname, "twitch");
          tw = true;
        }
      }
      if (link.includes("youtube.com/") && !yt) {
        const handle = cleanHandle(link);
        if (await checkLiveYT(handle)) {
          console.log("Steam " + link + " ONLINE");
          HideEnemy(handle, "YT");
          setPlayerYoutube(nickname, link);
          markLIVE(nickname, "youtube");
          yt = true;
        }
      }
    }
  }

  if (!tw && (await checkLiveTV(nickname))) {
    console.log(nickname + " СТРИМИТ НА TW");
    const url = `https://www.twitch.tv/${nickname}`;
    HideEnemy(nickname, "TW");
    setPlayerTwitch(nickname, url);
    markLIVE(nickname, "twitch");
  }
  if (!yt && (await checkLiveYT(nickname))) {
    console.log(nickname + " СТРИМИТ НА YT");
    const url = `https://www.youtube.com/@${Nickname}/live`;
    HideEnemy(nickname, "YT");
    setPlayerYoutube(nickname, url);
    markLIVE(nickname, "youtube");
  }
}

async function fetchSteamLinks(steamId) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: "fetchSteam",
      url: `https://steamcommunity.com/profiles/${steamId}`
    });
    if (!response?.success) return [];

    const doc = new DOMParser().parseFromString(response.html, "text/html");
    const raw = [
      ...doc.querySelectorAll(".profile_summary a"),
      ...doc.querySelectorAll(".showcase_notes a")
    ];
    return [...new Set(raw.map((a) => cleanSteamLink(a.getAttribute("href"))).filter(Boolean))];
  } catch (e) {
    console.log("steam fetch error: " + e);
    return [];
  }
}

function markLIVE(nickname, platform) {
  if (playersMap[nickname]) {
    playersMap[nickname].live = platform;
    saveToStorage();
  }
}

function cleanHandle(url) {
  return url
    .trim()
    .replace(/\/+$/, "")
    .split("/")
    .pop()
    .replace(/^@/, "");
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.action === "RESCAN") {
    checkPlayersInLobby();
  }
});

setTimeout(checkPlayersInLobby, 250);

// Проверка, стримит ли человек на Twitch
async function checkLiveTV(channelName) {
  if (!channelName) return false;
  return getLive(`tw:${channelName}`, async () => {
    try {
      const response = await fetch(`https://decapi.me/twitch/uptime/${channelName}`);
      if (!response.ok) return false;
      const text = await response.text();
      return !text.toLowerCase().includes("offline");
    } catch (error) {
      console.log("Ошибка проверки Twitch:", error);
      return false;
    }
  });
}

// Проверка, стримит ли человек на Youtube
async function checkLiveYT(Nickname) {
  if (!Nickname) return false;
  return getLive(`yt:${Nickname}`, async () => {
    const url = `https://www.youtube.com/@${Nickname}/live`;
    try {
      const response = await chrome.runtime.sendMessage({
        action: "fetchSteam",
        url: url
      });
      if (!response || !response.success) return false;
      const html = response.html;
      return (
        html.includes('canonical" href="https://www.youtube.com/watch?v=') ||
        html.includes('"status":"LIVE"') ||
        html.includes('"isLive":true')
      );
    } catch (error) {
      console.error("Ошибка проверки YouTube:", error);
      return false;
    }
  });
}

function HideEnemy(name, x) {
  chrome.runtime.sendMessage({
    action: "SHOW_NOTIF",
    message: `${name}: ${x}`
  });
}

function clearMatchData() {
  playersMap = {};
  LIVE_CACHE.clear();
  chrome.storage.local.remove("faceitTeams", () => {
    console.log("Данные прошлого матча очищены!");
  });
}

function saveToStorage() {
  const matchPlayers = Object.values(playersMap);
  chrome.storage.local.set({ faceitTeams: matchPlayers }, () => {
    console.log("Сохранено игроков:", matchPlayers.length);
  });
}

function registerPlayer(nickname, teamNumber, teamName, avatar, level, faceitId) {
  if (!playersMap[nickname]) {
    playersMap[nickname] = {
      id: faceitId,
      name: nickname,
      team: teamNumber,
      teamName: teamName,
      avatar: avatar || null,
      level: level || null,
      twitch: null,
      youtube: null,
      live: null
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
    const url = new URL(rawHref, "https://steamcommunity.com");
    if (url.pathname.includes("/linkfilter")) {
      const target = url.searchParams.get("u") || url.searchParams.get("url");
      return target ? decodeURIComponent(target) : rawHref;
    }
    return rawHref;
  } catch {
    return rawHref;
  }
}