chrome.action.onClicked.addListener(function () {
  
  chrome.notifications.create("dhMsg", {
    type: 'basic',
    iconUrl: "ico/128.png",
    title: "Игрок найден",
    message: "OPEN THE DOOR!!!"
          }, 
        function () {
            setTimeout(function () {
                chrome.notifications.clear("dhMsg");
            }, 10000);
        });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "SHOW_NOTIF") {
    chrome.notifications.create("dhMsg", {
      type: "basic",
      iconUrl: chrome.runtime.getURL("ico/128.png"),
      title: "Игрок найден",
      message: message.message ? message.message : "123123123123123123123123"
    });

    setTimeout(() => {
      chrome.notifications.clear("dhMsg");
    }, 10000);
  }

  if (message.action === 'fetchSteam') {
    fetch(message.url)
      .then(res => res.text())
      .then(html => sendResponse({ success: true, html }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    
    return true;
  }
});