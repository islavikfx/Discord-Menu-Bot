document.getElementById('saveBtn').addEventListener('click', () => {
    const token = document.getElementById('tokenField').value.trim();
    if (!token) {
        alert('Enter a valid token');
        return;
    }
    chrome.storage.local.set({ user_token: token }, () => {
        const statusEl = document.getElementById('statusBlock');
        statusEl.textContent = 'Saved';
        statusEl.className = 'state state--ok';
        setTimeout(() => window.close(), 800);
    });
});


chrome.storage.local.get(['user_token'], (data) => {
    if (data.user_token) {
        document.getElementById('tokenField').value = data.user_token;
        const statusEl = document.getElementById('statusBlock');
        statusEl.textContent = 'Loaded';
        statusEl.className = 'state state--ok';
    }
});