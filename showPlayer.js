chrome.runtime.sendMessage({ action: "SHOW_NOTIF"});
const NicknamesElements = document.querySelectorAll('[class*="Nickname__Name"]');
NicknamesStr = ""
NicknamesElements.forEach((Nickname) => {
    NicknameStr += Nickname.innerText.trim() + " ";
    console.log(Nickname.innerText.trim());
});
console.log(NicknameStr)
console.log("dsadsaasdasdasdfhjsdfouidfsguio;fdshuihasdfguil;hfgsdauio;")

chrome.runtime.sendMessage({ action: "SHOW_NOTIF", message: NicknameStr });