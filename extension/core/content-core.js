class DiscordUIOverlay {
    constructor() {
        this.tasks = [];
        this.formModel = {
            delay: '60',
            text: '',
            randomMax: '30'
        };
        this.myUserId = null;
        this.profiles = [];
        this.editingUid = null;
        this.init();
    }

    async init() {
        await this.resolveUserId();
        this.loadFormState();
        await this.fetchProfiles();
        this.mountTrigger();
        await this.fetchTasks();
    }

    async resolveUserId() {
        try {
            const res = await fetch('http://localhost:2525/api/test_connection');
            const data = await res.json();
            if (data.discord_connected && data.user_id) {
                this.myUserId = data.user_id;
            } else {
                this.myUserId = 'unknown';
            }
        } catch (e) {
            this.myUserId = 'unknown';
        }
    }

    async fetchProfiles() {
        try {
            const res = await fetch('http://localhost:2525/api/profiles');
            if (res.ok) this.profiles = await res.json();
        } catch (e) {}
    }

    loadFormState() {
        const saved = localStorage.getItem('discord_scheduler_form');
        if (saved) this.formModel = JSON.parse(saved);
    }

    saveFormState() {
        localStorage.setItem('discord_scheduler_form', JSON.stringify(this.formModel));
    }

    mountTrigger() {
        if (document.getElementById('scheduler-trigger')) return;
        const btn = document.createElement('div');
        btn.id = 'scheduler-trigger';
        btn.innerHTML = '<span style="color:white;font-size:24px;">⚡</span>';
        document.body.appendChild(btn);
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu();
        });
    }

    toggleMenu() {
        const existing = document.getElementById('scheduler-menu');
        if (existing) {
            existing.remove();
            this.editingUid = null;
            return;
        }
        this.buildMenu();
    }

    buildMenu() {
        const menu = document.createElement('div');
        menu.id = 'scheduler-menu';
        menu.innerHTML = this.renderMenu();
        document.body.appendChild(menu);
        this.bindMenuEvents();
        this.refreshTaskList();
        this.applyFormModel();
        this.makeDraggable(menu);
    }

    makeDraggable(el) {
        let isDragging = false;
        let startX, startY, initialX, initialY;

        el.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = el.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            el.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            el.style.left = (initialX + dx) + 'px';
            el.style.top = (initialY + dy) + 'px';
            el.style.transform = 'none';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            el.style.cursor = '';
        });
    }

    renderMenu() {
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; cursor:move;">
                <h3 style="margin:0; color:#ff6b6b; font-size:20px;">Discord Menu Bot by iSlavik (@islavikfx).</h3>
                <button id="menu-close" style="background:none; border:none; color:#b9bbbe; font-size:22px; cursor:pointer; padding:0 4px;">×</button>
            </div>
            <div style="margin-bottom:12px;">
                <label style="display:block; color:#ffd479; font-size:12px; font-weight:700; margin-bottom:4px;">Delay of send (seconds):</label>
                <div style="display:flex; gap:8px; align-items:center;">
                    <input type="range" id="delay-range" min="3" max="600" step="1" style="flex:1;">
                    <input type="number" id="delay-number" min="3" max="600" style="width:65px; background:#2d2f42; color:white; border:2px solid #8a2be2; border-radius:4px; padding:6px; text-align:center; font-weight:700;">
                </div>
            </div>
            <div style="margin-bottom:12px;">
                <label style="display:block; color:#ffd479; font-size:12px; font-weight:700; margin-bottom:4px;">Message:</label>
                <textarea id="msg-input" rows="2" style="width:100%; background:#2d2f42; color:white; border:2px solid #8a2be2; border-radius:6px; padding:8px; font-family:inherit; font-weight:600; resize:vertical;"></textarea>
            </div>
            <div style="margin-bottom:12px; background:rgba(138,43,226,0.1); border-radius:8px; padding:12px; border:2px solid #8a2be2;">
                <label style="display:flex; align-items:center; cursor:pointer; margin-bottom:8px;">
                    <input type="checkbox" id="random-flag" checked style="width:18px; height:18px; margin-right:10px; accent-color:#8a2be2;">
                    <span style="color:#ffd479; font-size:12px; font-weight:700;">Add Random Delay:</span>
                </label>
                <div style="display:flex; gap:8px; align-items:center;">
                    <span style="color:#b9bbbe; font-size:11px;">10s</span>
                    <input type="range" id="random-range" min="10" max="60" step="1" style="flex:1;">
                    <span style="color:#b9bbbe; font-size:11px;">60s</span>
                    <input type="number" id="random-number" min="10" max="60" style="width:55px; background:#2d2f42; color:white; border:2px solid #8a2be2; border-radius:4px; padding:6px; text-align:center; font-weight:700;">
                </div>
            </div>
            <div style="display:flex; gap:8px; margin-bottom:12px;">
                <button id="add-task-btn" style="flex:1; background:linear-gradient(135deg, #8a2be2, #6a0dad); color:white; border:none; border-radius:8px; padding:10px; font-weight:800; transition:all 0.2s;">Add Task</button>
                <button id="send-now-btn" style="flex:1; background:linear-gradient(135deg, #43b581, #3ca374); color:white; border:none; border-radius:8px; padding:10px; font-weight:800; transition:all 0.2s;">Send Now</button>
            </div>
            <div id="task-container" style="max-height:260px; overflow-y:auto; background:#1a1a2e; border-radius:8px; padding:10px; border:2px solid #8a2be2; min-height:100px;">
                <div style="color:#72767d; text-align:center; padding:20px; font-weight:600;">No tasks yet.</div>
            </div>
            <div style="text-align:center; color:#72767d; font-size:10px; margin-top:12px; padding-top:8px; border-top:1px solid #40444b;">
                Current channel: <span id="current-channel-label" style="color:#ff6b6b; font-weight:700;">Detecting...</span>
            </div>
        `;
    }

    bindMenuEvents() {
        document.getElementById('menu-close').addEventListener('click', () => {
            document.getElementById('scheduler-menu').remove();
            this.editingUid = null;
        });

        document.getElementById('add-task-btn').addEventListener('click', () => {
            if (this.editingUid) {
                this.updateExistingTask();
            } else {
                this.createNewTask();
            }
        });

        document.getElementById('send-now-btn').addEventListener('click', () => this.sendNow());

        const range = document.getElementById('delay-range');
        const number = document.getElementById('delay-number');
        range.addEventListener('input', () => { number.value = range.value; this.captureForm(); });
        number.addEventListener('input', () => {
            let v = parseInt(number.value);
            if (isNaN(v)) v = 60;
            if (v < 3) v = 3;
            if (v > 600) v = 600;
            number.value = v;
            range.value = v;
            this.captureForm();
        });

        const randRange = document.getElementById('random-range');
        const randNumber = document.getElementById('random-number');

        randRange.addEventListener('input', () => {
            randNumber.value = randRange.value;
            this.captureForm();
        });

        randNumber.addEventListener('input', () => {
            let v = parseInt(randNumber.value);
            if (isNaN(v)) v = 30;
            if (v < 10) v = 10;
            if (v > 60) v = 60;
            randNumber.value = v;
            randRange.value = v;
            this.captureForm();
        });

        document.getElementById('msg-input').addEventListener('input', () => this.captureForm());

        document.getElementById('random-flag').addEventListener('change', () => {
            const checked = document.getElementById('random-flag').checked;
            document.getElementById('random-range').disabled = !checked;
            document.getElementById('random-number').disabled = !checked;
            this.captureForm();
        });

        document.addEventListener('click', (e) => {
            const menu = document.getElementById('scheduler-menu');
            if (menu && !menu.contains(e.target) && e.target.id !== 'scheduler-trigger') {
                menu.remove();
                this.editingUid = null;
            }
        });

        this.updateChannelLabel();
    }

    updateChannelLabel() {
        const label = document.getElementById('current-channel-label');
        if (!label) return;
        const cid = this.getCurrentChannelId();
        if (cid) {
            label.textContent = `#channel-${cid.slice(-6)}`;
        } else {
            label.textContent = 'Not found';
        }
    }

    captureForm() {
        this.formModel = {
            delay: document.getElementById('delay-number').value,
            text: document.getElementById('msg-input').value,
            randomMax: document.getElementById('random-number').value,
            randomEnabled: document.getElementById('random-flag').checked
        };
        this.saveFormState();
    }

    applyFormModel() {
        document.getElementById('delay-number').value = this.formModel.delay || '60';
        document.getElementById('delay-range').value = this.formModel.delay || '60';
        document.getElementById('msg-input').value = this.formModel.text || '';

        const isRandomEnabled = this.formModel.randomEnabled !== undefined ? this.formModel.randomEnabled : true;
        document.getElementById('random-flag').checked = isRandomEnabled;
        document.getElementById('random-number').value = this.formModel.randomMax || '30';
        document.getElementById('random-range').value = this.formModel.randomMax || '30';
        document.getElementById('random-range').disabled = !isRandomEnabled;
        document.getElementById('random-number').disabled = !isRandomEnabled;
    }

    getCurrentChannelId() {
        const match = window.location.pathname.match(/channels\/(?:\d+\/)?(\d+)/);
        return match ? match[1] : null;
    }

    async createNewTask() {
        const cid = this.getCurrentChannelId();
        if (!cid) return this.showNotification('Navigate to a channel first.', 'error');
        const randomEnabled = document.getElementById('random-flag').checked;
        const response = await fetch('http://localhost:2525/api/tasks/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                channel_id: cid,
                delay: parseInt(this.formModel.delay),
                payload: this.formModel.text,
                random_delay: randomEnabled,
                random_max: parseInt(this.formModel.randomMax)
            })
        });
        if (response.ok) {
            this.formModel.text = '';
            this.captureForm();
            this.applyFormModel();
            await this.fetchTasks();
            this.showNotification('Task added.', 'success');
        }
    }

    async updateExistingTask() {
        const randomEnabled = document.getElementById('random-flag').checked;
        const response = await fetch(`http://localhost:2525/api/tasks/update/${this.editingUid}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                value: parseInt(this.formModel.delay),
                text: this.formModel.text,
                random_delay: randomEnabled ? 1 : 0,
                random_max: parseInt(this.formModel.randomMax)
            })
        });
        if (response.ok) {
            this.editingUid = null;
            document.getElementById('add-task-btn').textContent = 'Add Task';
            this.formModel.text = '';
            this.captureForm();
            this.applyFormModel();
            await this.fetchTasks();
            this.showNotification('Task updated.', 'success');
        }
    }

    async fetchTasks() {
        const res = await fetch('http://localhost:2525/api/tasks');
        if (res.ok) {
            this.tasks = await res.json();
            this.refreshTaskList();
        }
    }

    refreshTaskList() {
        const container = document.getElementById('task-container');
        if (!container) return;
        if (this.tasks.length === 0) {
            container.innerHTML = '<div style="color:#72767d; text-align:center; padding:20px; font-weight:600;">No tasks yet.</div>';
            return;
        }
        container.innerHTML = this.tasks.map(t => {
            const randomTag = t.random_delay ? `<span style="background:#8a2be2; color:white; padding:1px 6px; border-radius:3px; font-size:9px; margin-left:6px; font-weight:800;">+Random</span>` : '';
            return `
                <div style="background:#2d2f42; margin-bottom:6px; padding:10px; border-radius:6px; border-left:4px solid ${t.active ? '#43b581' : '#8a2be2'};">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="color:${t.active ? '#43b581' : '#fff'}; font-weight:700; font-size:12px;">
                            Every ${t.delay}s ${randomTag} ${t.active ? '🟢' : '🔴'}
                        </span>
                        <span style="display:flex; gap:4px;">
                            <button data-action="edit" data-uid="${t.uid}" style="background:#faa61a; color:white; border:none; border-radius:3px; padding:3px 8px; cursor:pointer; font-size:10px; font-weight:700;">Edit</button>
                            <button data-action="toggle" data-uid="${t.uid}" style="background:${t.active ? '#ed4245' : '#43b581'}; color:white; border:none; border-radius:3px; padding:3px 8px; cursor:pointer; font-size:10px; font-weight:700;">${t.active ? 'Stop' : 'Start'}</button>
                            <button data-action="delete" data-uid="${t.uid}" style="background:#ed4245; color:white; border:none; border-radius:3px; padding:3px 8px; cursor:pointer; font-size:10px; font-weight:700;">×</button>
                        </span>
                    </div>
                    <div style="color:#ffd479; font-size:11px; margin-top:4px; font-weight:600;">${t.payload.substring(0, 50)}${t.payload.length > 50 ? '...' : ''}</div>
                    <div style="color:#72767d; font-size:9px; margin-top:4px;">${t.channel_name || 'Channel ' + t.channel_id}</div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const uid = parseInt(btn.dataset.uid);
                const action = btn.dataset.action;
                if (action === 'toggle') this.toggleTask(uid);
                if (action === 'delete') this.deleteTask(uid);
                if (action === 'edit') this.editTask(uid);
            });
        });
    }

    editTask(uid) {
        const task = this.tasks.find(t => t.uid === uid);
        if (!task) return;
        this.editingUid = uid;
        document.getElementById('delay-number').value = task.delay;
        document.getElementById('delay-range').value = task.delay;
        document.getElementById('msg-input').value = task.payload;

        const hasRandom = task.random_delay === true || task.random_delay === 1;
        document.getElementById('random-flag').checked = hasRandom;
        document.getElementById('random-number').value = task.random_max || '30';
        document.getElementById('random-range').value = task.random_max || '30';
        document.getElementById('random-number').disabled = !hasRandom;
        document.getElementById('random-range').disabled = !hasRandom;
        document.getElementById('add-task-btn').textContent = 'Update Task';
        this.captureForm();

        const menu = document.getElementById('scheduler-menu');
        if (menu) menu.scrollTop = 0;
        this.showNotification('Editing task. Change values and click Update.', 'info');
    }

    async toggleTask(uid) {
        const task = this.tasks.find(t => t.uid === uid);
        const endpoint = task.active ? 'stop' : 'start';
        await fetch(`http://localhost:2525/api/tasks/${endpoint}/${uid}`, { method: 'POST' });
        await this.fetchTasks();
    }

    async deleteTask(uid) {
        if (!confirm('Delete this task?')) return;
        await fetch(`http://localhost:2525/api/tasks/delete/${uid}`, { method: 'POST' });
        await this.fetchTasks();
    }

    async sendNow() {
        const cid = this.getCurrentChannelId();
        if (!cid || !this.formModel.text) {
            this.showNotification('Enter message and select a channel.', 'error');
            return;
        }
        await fetch('http://localhost:2525/api/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel_id: cid, message: this.formModel.text })
        });
        this.showNotification('Message sent.', 'success');
    }

    showNotification(message, type) {
        const existing = document.querySelector('.scheduler-notification');
        if (existing) existing.remove();
        const el = document.createElement('div');
        el.className = 'scheduler-notification';
        el.textContent = message;
        el.style.background = type === 'error' ? '#ed4245' : type === 'success' ? '#43b581' : '#8a2be2';
        document.body.appendChild(el);
        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transition = 'opacity 0.3s';
            setTimeout(() => el.remove(), 300);
        }, 2500);
    }
}


function initScheduler() {
    const interval = setInterval(() => {
        if (document.body && !window.schedulerInstance) {
            clearInterval(interval);
            window.schedulerInstance = new DiscordUIOverlay();
        }
    }, 400);
}


if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScheduler);
} else {
    initScheduler();
}