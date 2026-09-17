playersMap = {};

const LIVE_CACHE = new Map();
const TTL = 60 * 1000;

// ID последнего отсканированного матча. Нужен, чтобы не сбрасывать
// состояние при повторном скане того же матча.
let lastMatchId = null;

/*
 * getLive кэширует не результат, а Promise.
 * Если за 60 секунд тот же канал проверяется снова,
 * вернётся уже существующий Promise.
 * Если проверка упала — вернётся "none".
 */
function getLive(key, fetchFn) {
  const hit = LIVE_CACHE.get(key);
  if (hit && Date.now() - hit.t < TTL) return Promise.resolve(hit.live);
  const p = Promise.resolve().then(fetchFn).catch(() => "none");
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

// Запись прогресса сканирования в chrome.storage.local.
// Popup подписан на изменения и обновляет прогресс-бар.
function setScan(scan) {
  chrome.storage.local.set({ scan });
}

// ============================================================
// ОПРЕДЕЛЕНИЕ СВОЕЙ КОМАНДЫ
// ============================================================
// Пытается определить Faceit ID текущего пользователя.
// Возвращает строку ID или null, если не удалось.
async function getMyFaceitId() {
  // 1. Пробуем API /users/me — куки отправляются автоматически,
  //    т.к. запрос идёт со страницы faceit.com.
  try {
    const r = await fetch("https://www.faceit.com/api/users/v1/users/me");
    if (r.ok) {
      const d = await r.json();
      if (d?.payload?.id) return d.payload.id;
    }
  } catch (e) {
    // игнорируем
  }

  // 2. Пробуем мета-тег страницы.
  const meta =
    document.querySelector('meta[name="user-id"]') ||
    document.querySelector('meta[name="faceit-user-id"]');
  if (meta?.content) return meta.content;

  // 3. Пробуем глобальный стейт (у Faceit он обычно есть на SPA-страницах).
  try {
    const s = window.__INITIAL_STATE__ || window.__PRELOADED_STATE__;
    if (s?.user?.id) return s.user.id;
    if (s?.entities?.users?.me?.id) return s.entities.users.me.id;
  } catch (e) {
    // игнорируем
  }

  return null;
}

// ============================================================
// ОСНОВНОЙ СЦЕНАРИЙ
// ============================================================
async function checkPlayersInLobby() {
  const matchIdMatch = window.location.href.match(/\/room\/([a-f0-9-]+)/i);
  if (!matchIdMatch) return;

  const matchId = matchIdMatch[1];
  console.log("========================== НАЙДЕНО ЛОББИ ==========================");
  console.log("ID матча:", matchId);

  // Сбрасываем данные только если это новый матч.
  const sameMatch = matchId === lastMatchId;
  if (!sameMatch) {
    clearMatchData();
    lastMatchId = matchId;
  }

  let allPlayers, profiles;

  // ================== ПОДГОТОВКА: матч + профили ==================
  try {
    setScan({ running: true, state: "match", total: 0, done: 0, current: "Получение данных матча..." });

    // Запрос информации о матче через Faceit API.
    const matchResponse = await fetch(`https://www.faceit.com/api/match/v2/match/${matchId}`);
    const matchPayload = await matchResponse.json();
    const body = matchPayload.payload;

    const faction1 = body.teams.faction1;
    const faction2 = body.teams.faction2;
    const roster1 = faction1.roster || [];
    const roster2 = faction2.roster || [];
    const team1Name = faction1.name || "Faction 1";
    const team2Name = faction2.name || "Faction 2";

    // Регистрируем игроков с ПРАВИЛЬНЫМ номером команды —
    // независимо от порядка сканирования.
    roster1.forEach((p) =>
      registerPlayer(p.nickname, 1, team1Name, p.avatar, p.game_skill_level, p.id)
    );
    roster2.forEach((p) =>
      registerPlayer(p.nickname, 2, team2Name, p.avatar, p.game_skill_level, p.id)
    );
    saveToStorage();

    // Определяем свою команду, чтобы сканировать врагов первыми.
    const myFaceitId = await getMyFaceitId();
    const meInFaction1 = myFaceitId && roster1.some((p) => p.id === myFaceitId);
    const meInFaction2 = myFaceitId && roster2.some((p) => p.id === myFaceitId);

    let scanOrder;
    let myTeamNumber = null;
    if (meInFaction1) {
      scanOrder = [...roster2, ...roster1]; // я в faction1 → враги faction2
      myTeamNumber = 1;
      console.log("Моя команда: faction1. Сканирую ВРАГОВ первыми.");
    } else if (meInFaction2) {
      scanOrder = [...roster1, ...roster2]; // я в faction2 → враги faction1
      myTeamNumber = 2;
      console.log("Моя команда: faction2. Сканирую ВРАГОВ первыми.");
    } else {
      scanOrder = [...roster1, ...roster2];
      console.log("Не удалось определить свою команду — порядок по умолчанию.");
    }

    // Сохраняем номер своей команды в storage (popup это прочитает, если нужно).
    chrome.storage.local.set({ myTeamNumber });

    // allPlayers — уже в нужном порядке сканирования.
    allPlayers = scanOrder;

    setScan({ running: true, state: "profiles", total: allPlayers.length, done: 0, current: "Загрузка профилей..." });

    // Профили грузим в том же порядке — profiles[i] соответствует allPlayers[i].
    profiles = await mapLimit(allPlayers, 5, async (player) => {
      try {
        const r = await fetch(`https://www.faceit.com/api/users/v1/users/${player.id}`);
        const d = await r.json();
        return d.payload;
      } catch (e) {
        console.log("profile error: " + e);
        return null;
      }
    });
  } catch (error) {
    console.log("error: " + error);
    setScan({ running: false, state: "error", total: 0, done: 0, current: "Ошибка загрузки матча" });
    return;
  }

  // ================== ФАЗА 1: точные проверки ==================
  try {
    setScan({ running: true, state: "checking", total: allPlayers.length, done: 0, current: "Проверка каналов..." });

    let done1 = 0;
    await mapLimit(allPlayers, 3, async (player, i) => {
      await checkPlayerExact(player, profiles[i]);
      done1++;
      setScan({
        running: true,
        state: "checking",
        total: allPlayers.length,
        done: done1,
        current: player.nickname
      });
    });

    setScan({ running: false, state: "done", total: allPlayers.length, done: allPlayers.length, current: "" });
    console.log("Фаза 1 завершена!");
  } catch (error) {
    console.log("phase1 error: " + error);
    setScan({ running: false, state: "error", total: 0, done: 0, current: "Ошибка проверки" });
    return;
  }

  // ================== ФАЗА 2A: похожие — bucket 0+1 ==================
  try {
    setScan({ running: true, state: "similar", total: allPlayers.length, done: 0, current: "Похожие ники (основные)..." });

    let done2a = 0;
    await mapLimit(allPlayers, 2, async (player) => {
      await checkPlayerSimilar(player, [0, 1]);
      done2a++;
      setScan({
        running: true,
        state: "similar",
        total: allPlayers.length,
        done: done2a,
        current: player.nickname
      });
    });

    setScan({ running: false, state: "done", total: allPlayers.length, done: allPlayers.length, current: "" });
    console.log("Фаза 2A завершена!");
  } catch (error) {
    console.log("phase2a error: " + error);
    setScan({ running: false, state: "done", total: allPlayers.length, done: allPlayers.length, current: "" });
  }

  // ================== ФАЗА 2B: похожие — bucket 2+3 ==================
  try {
    setScan({ running: true, state: "similar", total: allPlayers.length, done: 0, current: "Похожие ники (расширенные)..." });

    let done2b = 0;
    await mapLimit(allPlayers, 1, async (player) => {
      await checkPlayerSimilar(player, [2, 3]);
      done2b++;
      setScan({
        running: true,
        state: "similar",
        total: allPlayers.length,
        done: done2b,
        current: player.nickname
      });
    });

    setScan({ running: false, state: "done", total: allPlayers.length, done: allPlayers.length, current: "" });
    console.log("Фаза 2B завершена, всё готово!");
  } catch (error) {
    console.log("phase2b error: " + error);
    setScan({ running: false, state: "done", total: allPlayers.length, done: allPlayers.length, current: "" });
  }
}

// ===================== ФАЗА 1: точные проверки =====================
// Ищет Twitch/YouTube в Faceit-профиле, Steam-профиле и по точному нику.
async function checkPlayerExact(player, profile) {
  const nickname = player.nickname;
  const p = playersMap[nickname];
  if (!p) return;

  const steamId = profile?.platforms?.steam?.id64;

  // ---- Twitch из Faceit-профиля ----
  if (!p.foundTwitchExact && !p.foundTwitchSimilar) {
    const twChannel = profile?.streaming?.twitch_id;
    if (twChannel) {
      const status = await checkTwitchStatus(twChannel);
      if (status === "live") {
        HideEnemy(twChannel, "TW");
        setPlayerTwitch(nickname, `https://www.twitch.tv/${twChannel}`);
        markLIVE(nickname, "twitch", "exact");
      } else if (status === "offline") {
        // Канал есть, но не стримит — сохраняем ссылку, LIVE не ставим.
        setPlayerTwitch(nickname, `https://www.twitch.tv/${twChannel}`);
      }
    }
  }

  // ---- YouTube из Faceit-профиля ----
  if (!p.foundYoutubeExact && !p.foundYoutubeSimilar) {
    const ytUrl = profile?.socials?.youtube?.value;
    if (ytUrl) {
      const handle = cleanHandle(ytUrl);
      const status = await checkYouTubeStatus(handle);
      if (status === "live") {
        HideEnemy(handle, "YT");
        setPlayerYoutube(nickname, ytUrl);
        markLIVE(nickname, "youtube", "exact");
      } else if (status === "offline") {
        setPlayerYoutube(nickname, ytUrl);
      }
    }
  }

  // ---- Ссылки из Steam-профиля ----
  if (steamId) {
    const links = await fetchSteamLinks(steamId);
    for (const link of links) {
      if (!p.foundTwitchExact && !p.foundTwitchSimilar && link.includes("twitch.tv/")) {
        const channel = link.trim().replace(/\/+$/, "").split("/").pop().split("?")[0];
        const status = await checkTwitchStatus(channel);
        if (status === "live") {
          HideEnemy(channel, "TW");
          setPlayerTwitch(nickname, link);
          markLIVE(nickname, "twitch", "exact");
        } else if (status === "offline" && !p.twitch) {
          setPlayerTwitch(nickname, link);
        }
      }
      if (!p.foundYoutubeExact && !p.foundYoutubeSimilar && link.includes("youtube.com/")) {
        const handle = cleanHandle(link);
        const status = await checkYouTubeStatus(handle);
        if (status === "live") {
          HideEnemy(handle, "YT");
          setPlayerYoutube(nickname, link);
          markLIVE(nickname, "youtube", "exact");
        } else if (status === "offline" && !p.youtube) {
          setPlayerYoutube(nickname, link);
        }
      }
    }
  }

  // ---- Fallback: точный ник ----
  if (!p.foundTwitchExact && !p.foundTwitchSimilar) {
    const status = await checkTwitchStatus(nickname);
    if (status === "live") {
      HideEnemy(nickname, "TW");
      setPlayerTwitch(nickname, `https://www.twitch.tv/${nickname}`);
      markLIVE(nickname, "twitch", "exact");
    }
  }
  if (!p.foundYoutubeExact && !p.foundYoutubeSimilar) {
    const status = await checkYouTubeStatus(nickname);
    if (status === "live") {
      HideEnemy(nickname, "YT");
      setPlayerYoutube(nickname, `https://www.youtube.com/@${nickname}/live`);
      markLIVE(nickname, "youtube", "exact");
    }
  }
}

// ===================== ФАЗА 2: похожие никнеймы =====================
// bucketFilter — массив номеров корзин (например [0,1] или [2,3]).
async function checkPlayerSimilar(player, bucketFilter) {
  const nickname = player.nickname;
  const p = playersMap[nickname];
  if (!p) return;

  let tw = p.foundTwitchExact || p.foundTwitchSimilar;
  let yt = p.foundYoutubeExact || p.foundYoutubeSimilar;
  if (tw && yt) return;

  const variations = generateNickVariations(nickname, bucketFilter).slice(0, 30);

  for (const variant of variations) {
    if (variant.toLowerCase() === nickname.toLowerCase()) continue;

    if (!tw && (await checkTwitchStatus(variant)) === "live") {
      console.log(`${nickname} → похожий TW: ${variant}`);
      HideEnemy(`${variant} (похож на ${nickname})`, "TW");
      setPlayerTwitch(nickname, `https://www.twitch.tv/${variant}`);
      markLIVE(nickname, "twitch", "similar");
      tw = true;
    }

    if (!yt && (await checkYouTubeStatus(variant)) === "live") {
      console.log(`${nickname} → похожий YT: ${variant}`);
      HideEnemy(`${variant} (похож на ${nickname})`, "YT");
      setPlayerYoutube(nickname, `https://www.youtube.com/@${variant}`);
      markLIVE(nickname, "youtube", "similar");
      yt = true;
    }

    if (tw && yt) break;
  }
}

// ============================================================
// ХЕЛПЕРЫ
// ============================================================

// Загружает HTML Steam-профиля через background и вытаскивает
// все ссылки из блока профиля и showcase-заметок.
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

// Помечает игрока как live и устанавливает флаг "найден".
// Точное совпадение не перезаписывается похожим.
function markLIVE(nickname, platform, confidence = "exact") {
  if (!playersMap[nickname]) return;
  const p = playersMap[nickname];

  const cap = platform === "twitch" ? "Twitch" : "Youtube";
  const foundKey = "found" + cap + (confidence === "similar" ? "Similar" : "Exact");
  p[foundKey] = true;

  // Обновляем отображение только если это "лучше" текущего.
  const isExact = confidence === "exact";
  const currentExact = p.liveConfidence === "exact";
  if (!p.live || (isExact && !currentExact)) {
    p.live = platform;
    p.liveConfidence = confidence;
  }
  saveToStorage();
}

function cleanHandle(url) {
  return url
    .trim()
    .replace(/\/+$/, "")
    .split("/")
    .pop()
    .replace(/^@/, "");
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.action === "RESCAN") {
    checkPlayersInLobby();
  }
});

setTimeout(checkPlayersInLobby, 250);

// ============================================================
// ПРОВЕРКА СТАТУСА КАНАЛОВ
// Возвращает "live" | "offline" | "none"
// ============================================================

// Проверка статуса Twitch-канала.
async function checkTwitchStatus(channelName) {
  if (!channelName) return "none";
  return getLive(`tw:${channelName}`, async () => {
    try {
      const response = await fetch(`https://decapi.me/twitch/uptime/${channelName}`);
      if (!response.ok) return "none";
      const text = (await response.text()).toLowerCase().trim();

      // Явные негативы / ошибки — канал не найден.
      if (text.includes("not found")) return "none";
      if (text.includes("no user")) return "none";
      if (text.includes("does not exist")) return "none";
      if (text.includes("error")) return "none";
      if (text.includes("no such")) return "none";

      // Явный оффлайн.
      if (text.includes("offline")) return "offline";

      // Явный лайв — единственный вариант, при котором ставим LIVE.
      if (text.includes("is live") || text.includes("is streaming")) return "live";

      // Непонятный ответ — не рискуем помечать как live.
      return "none";
    } catch (error) {
      console.log("Ошибка проверки Twitch:", error);
      return "none";
    }
  });
}

// Проверка статуса YouTube-канала.
async function checkYouTubeStatus(handle) {
  if (!handle) return "none";
  return getLive(`yt:${handle}`, async () => {
    const url = `https://www.youtube.com/@${handle}/live`;
    try {
      const response = await chrome.runtime.sendMessage({
        action: "fetchSteam",
        url: url
      });
      if (!response || !response.success) return "none";
      const html = response.html;
      if (!html || html.length < 200) return "none";

      // Канонический URL страницы.
      const canonMatch = html.match(/<link rel="canonical" href="([^"]+)"/i);
      const canonical = canonMatch ? canonMatch[1] : "";

      const isWatchPage = /youtube\.com\/watch\?v=/.test(canonical);
      const isChannelPage = /youtube\.com\/(@|channel\/|c\/|user\/)/.test(canonical);

      const hasLive =
        html.includes('"isLive":true') ||
        html.includes('"isLiveNow":true') ||
        html.includes('"isLiveContent":true') ||
        html.includes('"status":"LIVE"');

      // LIVE: только если это watch-страница И есть live-маркер.
      if (isWatchPage && hasLive) return "live";

      // Канал существует, но эфира нет.
      if (isChannelPage || isWatchPage) return "offline";

      return "none";
    } catch (error) {
      console.error("Ошибка проверки YouTube:", error);
      return "none";
    }
  });
}

// ============================================================
// СЛУЖЕБНОЕ
// ============================================================

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
      live: null,
      liveConfidence: null,
      // Флаги найденных каналов — для пропуска повторных проверок.
      foundTwitchExact: false,
      foundTwitchSimilar: false,
      foundYoutubeExact: false,
      foundYoutubeSimilar: false
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