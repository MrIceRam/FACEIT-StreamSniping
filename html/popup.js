const TWITCH_ICON = `<svg width="14" height="14" viewBox="0 0 24 24"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>`;
const YOUTUBE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;

function createPlayerRow(player) {
  const row = document.createElement('div');
  row.className = 'player-item';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'player-name';
  nameSpan.textContent = player.name;
  nameSpan.title = player.name;
  row.appendChild(nameSpan);

  const linksBox = document.createElement('div');
  linksBox.className = 'links';

  if (player.twitch) {
    const twitchBtn = document.createElement('div');
    twitchBtn.className = 'btn-icon btn-twitch';
    twitchBtn.title = `Открыть Twitch: ${player.twitch}`;
    twitchBtn.innerHTML = TWITCH_ICON;
    twitchBtn.onclick = (e) => {
      e.stopPropagation();
      chrome.tabs.create({ url: player.twitch });
    };
    linksBox.appendChild(twitchBtn);
  }

  if (player.youtube) {
    const ytBtn = document.createElement('div');
    ytBtn.className = 'btn-icon btn-youtube';
    ytBtn.title = `Открыть YouTube: ${player.youtube}`;
    ytBtn.innerHTML = YOUTUBE_ICON;
    ytBtn.onclick = (e) => {
      e.stopPropagation();
      chrome.tabs.create({ url: player.youtube });
    };
    linksBox.appendChild(ytBtn);
  }

  row.appendChild(linksBox);
  return row;
}

function render(players) {
  const container = document.getElementById('teamsContainer');
  const emptyState = document.getElementById('emptyState');
  const team1List = document.getElementById('team1List');
  const team2List = document.getElementById('team2List');

  if (!players || players.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  container.style.display = 'grid';
  team1List.innerHTML = '';
  team2List.innerHTML = '';

  players.forEach((player) => {
    const el = createPlayerRow(player);
    if (player.team === 1) {
      team1List.appendChild(el);
    } else {
      team2List.appendChild(el);
    }
  });
}

// Чтение данных при открытии
chrome.storage.local.get(['faceitTeams'], (res) => {
  render(res.faceitTeams || []);
});

// Слушаем обновления в реальном времени, если попап открыт во время сканирования
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.faceitTeams) {
    render(changes.faceitTeams.newValue || []);
  }
});