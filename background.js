chrome.action.onClicked.addListener(function () {
      chrome.notifications.create("dhMsg", {
            type: 'basic',
            iconUrl: "ico/128.png",
            title: "Delete History",
            message: "67!"
        }, function () {
            setTimeout(function () {
                chrome.notifications.clear("dhMsg");
            }, 10000);
        });
});