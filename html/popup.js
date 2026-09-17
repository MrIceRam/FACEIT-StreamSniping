const TWITCH_ICON = `<svg width="14" height="14" viewBox="0 0 24 24"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>`;
const YOUTUBE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;

const $ = (id) => document.getElementById(id);

function levelClass(level) {
  const l = Number(level);
  if (!l || l < 1 || l > 10) return "";
  return `level-${l}`;
}

function avatarInit(name) {
  return (name || "?").charAt(0).toUpperCase();
}

function createPlayerRow(player) {
  const row = document.createElement("div");
  row.className = "player-item";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  row.appendChild(avatar);

  // Если есть аватарка — показываем картинку, букву НЕ добавляем.
  // Если аватарки нет — показываем первую букву ника.
  if (player.avatar) {
    avatar.style.backgroundImage = `url("${player.avatar}")`;
  } else {
    const init = document.createElement("span");
    init.className = "init";
    init.textContent = avatarInit(player.name);
    avatar.appendChild(init);
  }

  const meta = document.createElement("div");
  meta.className = "player-meta";

  const nameRow = document.createElement("div");
  nameRow.className = "player-name";

  const nameText = document.createElement("span");
  nameText.className = "text";
  nameText.textContent = player.name;
  nameText.title = player.name;
  nameRow.appendChild(nameText);

  if (player.level) {
    const badge = document.createElement("span");
    badge.className = `level-badge ${levelClass(player.level)}`;
    badge.textContent = player.level;
    badge.title = "Уровень Faceit";
    nameRow.appendChild(badge);
  }

  meta.appendChild(nameRow);

  const status = document.createElement("div");
  status.className = "player-status";
  status.textContent = "—";
  meta.appendChild(status);

  if (player.live) {
    // Цвет рамки зависит от платформы.
    row.classList.add(player.live === "twitch" ? "live-twitch" : "live-youtube");
    // Похожее совпадение помечаем отдельным классом (пунктир).
    if (player.liveConfidence === "similar") row.classList.add("live-similar");

    status.className = "player-status live";
    const plat = player.live === "twitch" ? "Twitch" : "YouTube";
    const mark = player.liveConfidence === "similar" ? " (похож.)" : "";
    status.innerHTML = `<span class="blink"></span>LIVE — ${plat}${mark}`;
    if (player.liveConfidence === "similar") {
      status.title = "Совпадение по похожему никнейму — может быть не тот человек";
    }
  } else if (player.twitch || player.youtube) {
    status.className = "player-status none";
    status.textContent = "Канал оффлайн";
  }

  row.appendChild(meta);

  const linksBox = document.createElement("div");
  linksBox.className = "links";

  const twitchBtn = document.createElement("div");
  twitchBtn.className = "btn-icon btn-twitch" + (player.twitch ? "" : " disabled");
  twitchBtn.innerHTML = TWITCH_ICON;
  twitchBtn.title = player.twitch ? `Открыть Twitch: ${player.twitch}` : "Канал не найден";
  if (player.twitch) {
    twitchBtn.onclick = () => chrome.tabs.create({ url: player.twitch });
  }
  linksBox.appendChild(twitchBtn);

  const ytBtn = document.createElement("div");
  ytBtn.className = "btn-icon btn-youtube" + (player.youtube ? "" : " disabled");
  ytBtn.innerHTML = YOUTUBE_ICON;
  ytBtn.title = player.youtube ? `Открыть YouTube: ${player.youtube}` : "Канал не найден";
  if (player.youtube) {
    ytBtn.onclick = () => chrome.tabs.create({ url: player.youtube });
  }
  linksBox.appendChild(ytBtn);

  row.appendChild(linksBox);
  return row;
}

function render(players, scan) {
  const container = $("teamsContainer");
  const emptyState = $("emptyState");
  const team1List = $("team1List");
  const team2List = $("team2List");

  const hasPlayers = players && players.length > 0;

  if (!hasPlayers) {
    container.classList.remove("visible");
    emptyState.style.display = "flex";
  } else {
    emptyState.style.display = "none";
    container.classList.add("visible");
    team1List.innerHTML = "";
    team2List.innerHTML = "";

    players.forEach((player) => {
      const el = createPlayerRow(player);
      if (player.team === 1) team1List.appendChild(el);
      else team2List.appendChild(el);
    });
  }

  renderTeams(players || [], scan);
  renderProgress(scan);
  renderStatus(scan, hasPlayers);
}

function renderTeams(players, scan) {
  chrome.storage.local.get(["myTeamNumber"], ({ myTeamNumber }) => {
    const t1 = $("team1Title");
    const t2 = $("team2Title");
    const team1Player = players.find((p) => p.team === 1);
    const team2Player = players.find((p) => p.team === 2);

    const t1Name = team1Player?.teamName || "Команда 1";
    const t2Name = team2Player?.teamName || "Команда 2";

    t1.textContent = t1Name + (myTeamNumber === 1 ? " (вы)" : "");
    t2.textContent = t2Name + (myTeamNumber === 2 ? " (вы)" : "");
  });
}

function renderProgress(scan) {
  const wrap = $("progressWrap");
  if (!scan || !scan.running) {
    wrap.classList.remove("visible");
    return;
  }
  wrap.classList.add("visible");

  $("progressCount").textContent = scan.total ? `${scan.done} / ${scan.total}` : "";

  const pct = scan.total ? Math.round((scan.done / scan.total) * 100) : 0;
  $("progressFill").style.width = pct + "%";

  let label;
  if (scan.state === "match") label = "Получение данных матча...";
  else if (scan.state === "profiles") label = "Загрузка профилей...";
  else if (scan.state === "checking") label = `Проверка: ${scan.current || "..."}`;
  else if (scan.state === "similar") label = `Похожие ники: ${scan.current || "..."}`;
  else if (scan.state === "error") label = "Ошибка загрузки";
  else label = "Проверка игроков...";

  $("progressLabel").textContent = label;
}

function renderStatus(scan) {
  const pill = $("statusPill");
  const footer = $("footerText");

  if (scan?.running) {
    pill.className = "status-pill scanning";
    pill.innerHTML = '<span class="spinner"></span>Сканирование';
    if (scan.state === "similar") {
      footer.textContent = scan.current ? `Похожие ники: ${scan.current}` : "Поиск похожих ников...";
    } else {
      footer.textContent = scan.current ? `Анализ: ${scan.current}` : "Анализ...";
    }
  } else if (scan?.state === "done") {
    pill.className = "status-pill done";
    pill.textContent = "Готово";
    footer.textContent = "Анализ завершён. Каналы обновляются в реальном времени.";
  } else if (scan?.state === "error") {
    pill.className = "status-pill error";
    pill.textContent = "Ошибка";
    footer.textContent = "Не удалось загрузить данные матча. Обновите страницу.";
  } else {
    pill.className = "status-pill";
    pill.textContent = "Ожидание";
    footer.textContent = "Анализ и проверка каналов в реальном времени";
  }
}

function loadAll() {
  chrome.storage.local.get(["faceitTeams", "scan"], (res) => {
    render(res.faceitTeams || [], res.scan);
  });
}

function rescan() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.id) {
      return;
    }
    if (!/faceit\.com/i.test(tab.url || "")) {
      $("footerText").textContent = "Откройте вкладку Faceit, чтобы сканировать";
      return;
    }
    chrome.tabs.sendMessage(tab.id, { action: "RESCAN" }, () => {
      if (chrome.runtime.lastError) {
        $("footerText").textContent = "Нет активной вкладки Faceit в лобби";
      }
    });
  });
}

$("btnRefresh").addEventListener("click", rescan);

$("btnOpenFaceit").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://www.faceit.com" });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.faceitTeams || changes.scan) {
    loadAll();
  }
});

loadAll();