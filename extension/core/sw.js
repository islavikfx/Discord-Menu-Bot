chrome.runtime.onMessage.addListener((req, sender, sendResp) => {
    if (req.action === 'get_token') {
        chrome.storage.local.get(['user_token'], (data) => {
            sendResp({token: data.user_token});
        });
        return true;
    }
    if (req.action === 'persist_token') {
        chrome.storage.local.set({ user_token: req.token }, () => {
            sendResp({success: true});
        });
        return true;
    }
});


chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({ tasks: [] });
});