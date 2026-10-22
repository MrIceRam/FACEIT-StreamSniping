// Хосты, к которым content script может делать запросы через background
// (в обход CORS). Должны совпадать с host_permissions в manifest.json.
const ALLOWED_FETCH_HOSTS = ["steamcommunity.com", "www.youtube.com"];

const NOTIF_TTL = 10 * 1000;

function isAllowedUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && ALLOWED_FETCH_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "SHOW_NOTIF") {
    // Уникальный ID, чтобы несколько найденных стримов не затирали друг друга.
    const notifId = `fss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    chrome.notifications.create(notifId, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/128.png"),
      title: "Игрок найден",
      message: message.message ? message.message : "Кто-то стримит!"
    });

    setTimeout(() => {
      chrome.notifications.clear(notifId);
    }, NOTIF_TTL);
  }

  if (message.action === "FETCH_HTML") {
    if (!isAllowedUrl(message.url)) {
      sendResponse({ success: false, error: "URL not allowed" });
      return;
    }

    fetch(message.url)
      .then(async (res) => sendResponse({ success: res.ok, status: res.status, html: await res.text() }))
      .catch((err) => sendResponse({ success: false, error: err.message }));

    return true;
  }
});
