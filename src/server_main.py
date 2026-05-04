import time, requests, random, json, threading, sqlite3, os, logging
from datetime import datetime
from flask import Flask, render_template as _html, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
load_dotenv()
user_token = os.getenv('dc_token')
app = Flask(__name__, template_folder='../extension/popup', static_folder='../extension')
app.secret_key = os.getenv('flask_key', 'default-secret-key')
CORS(app)

global db_pool


@app.after_request
def add_cors_headers(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    return response


@app.before_request
def handle_options():
    if request.method == 'OPTIONS':
        return '', 200


class StorageEngine:
    def __init__(self, db_name='project_store.db'):
        self.db_name = db_name
        self.lock = threading.Lock()
        self._init_db()


    def _init_db(self):
        with sqlite3.connect(self.db_name) as conn:
            conn.execute('''CREATE TABLE IF NOT EXISTS tasks (
                uid INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                channel_title TEXT,
                guild_title TEXT,
                trigger_mode TEXT NOT NULL DEFAULT 'interval',
                delay_sec INTEGER,
                payload TEXT NOT NULL,
                active INTEGER DEFAULT 0,
                fire_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_fired_at TIMESTAMP NULL,
                random_delay_enabled INTEGER DEFAULT 0,
                random_max_sec INTEGER DEFAULT 30,
                next_fire_at FLOAT DEFAULT 0
            )''')
            conn.execute('''CREATE TABLE IF NOT EXISTS profiles (
                uid INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_name TEXT UNIQUE NOT NULL,
                snapshot TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )''')
            conn.commit()


    def insert_task(self, guild_id, channel_id, delay_sec, payload, random_delay_enabled=False, random_max=30, guild_title=None, channel_title=None):
        with self.lock:
            with sqlite3.connect(self.db_name) as conn:
                cursor = conn.cursor()
                now = time.time()
                next_time = now + delay_sec
                if random_delay_enabled:
                    next_time += random.randint(1, random_max)
                cursor.execute('''INSERT INTO tasks 
                    (guild_id, channel_id, channel_title, guild_title, trigger_mode, delay_sec, payload, active, fire_count, random_delay_enabled, random_max_sec, next_fire_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ''', (guild_id, channel_id, channel_title, guild_title, 'interval', delay_sec, payload, 0, 0,
                      1 if random_delay_enabled else 0, random_max, next_time))
                conn.commit()
                return cursor.lastrowid


    def fetch_all_tasks(self):
        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.execute('SELECT * FROM tasks ORDER BY created_at DESC')
            return cursor.fetchall()


    def fetch_active_tasks(self):
        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.execute('SELECT * FROM tasks WHERE active = 1')
            return cursor.fetchall()


    def modify_task(self, task_uid, **kwargs):
        with self.lock:
            set_clause = ', '.join([f'{key} = ?' for key in kwargs.keys()])
            values = list(kwargs.values())
            values.append(task_uid)
            with sqlite3.connect(self.db_name) as conn:
                conn.execute(f'UPDATE tasks SET {set_clause} WHERE uid = ?', values)
                conn.commit()


    def remove_task(self, task_uid):
        with self.lock:
            with sqlite3.connect(self.db_name) as conn:
                conn.execute('DELETE FROM tasks WHERE uid = ?', (task_uid,))
                conn.commit()


    def fetch_task(self, task_uid):
        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.execute('SELECT * FROM tasks WHERE uid = ?', (task_uid,))
            return cursor.fetchone()


    def save_profile(self, name, data):
        with self.lock:
            with sqlite3.connect(self.db_name) as conn:
                cursor = conn.cursor()
                cursor.execute('INSERT OR REPLACE INTO profiles (profile_name, snapshot) VALUES (?, ?)', (name, json.dumps(data)))
                conn.commit()
                return cursor.lastrowid


    def get_profile(self, name):
        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.execute('SELECT snapshot FROM profiles WHERE profile_name = ?', (name,))
            result = cursor.fetchone()
            return json.loads(result[0]) if result else None


    def fetch_all_profiles(self):
        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.execute('SELECT * FROM profiles ORDER BY created_at DESC')
            return cursor.fetchall()


    def remove_profile(self, profile_uid):
        with self.lock:
            with sqlite3.connect(self.db_name) as conn:
                conn.execute('DELETE FROM profiles WHERE uid = ?', (profile_uid,))
                conn.commit()


class DiscordSession:
    def __init__(self, token):
        self.token = token
        self.headers = {'Authorization': token,
            'Content-Type': 'application/json',
            'User-Agent': 'Chrome 147, Linux'}
        self.my_profile = None
        self.guilds = []
        self.connected = False
        self.my_uid = None
        self._guild_cache = {}
        self._channel_cache = {}


    def authenticate(self):
        try:
            resp = requests.get('https://discord.com/api/v9/users/@me', headers=self.headers, timeout=10)
            if resp.status_code == 200:
                self.my_profile = resp.json()
                self.my_uid = self.my_profile['id']
                self.connected = True
                guilds_resp = requests.get('https://discord.com/api/v9/users/@me/guilds', headers=self.headers, timeout=10)
                if guilds_resp.status_code == 200:
                    self.guilds = guilds_resp.json()
                    for g in self.guilds:
                        self._guild_cache[g['id']] = g['name']
                return True
            return False
        except Exception as err:
            logger.error(f'Auth error: {err}.')
            return False


    def resolve_guild_name(self, gid):
        if gid in self._guild_cache:
            return self._guild_cache[gid]
        try:
            resp = requests.get(f'https://discord.com/api/v9/guilds/{gid}', headers=self.headers, timeout=5)
            if resp.status_code == 200:
                name = resp.json().get('name', f'Server {gid}')
                self._guild_cache[gid] = name
                return name
        except:
            pass
        return f'Server {gid}'


    def fetch_channels(self, gid):
        try:
            resp = requests.get(f'https://discord.com/api/v9/guilds/{gid}/channels', headers=self.headers, timeout=10)
            if resp.status_code == 200:
                channels = resp.json()
                for ch in channels:
                    if ch['type'] == 0:
                        self._channel_cache[ch['id']] = ch.get('name', f'channel-{ch['id']}')
                return channels
            return []
        except Exception as err:
            logger.error(f'Error fetching channels: {err}.')
            return []


    def resolve_channel_info(self, cid):
        if cid in self._channel_cache:
            return {'name': self._channel_cache[cid]}
        try:
            resp = requests.get(f'https://discord.com/api/v9/channels/{cid}', headers=self.headers, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                name = data.get('name', f'channel-{cid}')
                self._channel_cache[cid] = name
                return {'name': name, 'guild_id': data.get('guild_id')}
        except:
            pass
        return {'name': f'channel-{cid}'}


    def dispatch_message(self, cid, msg):
        try:
            resp = requests.post(f'https://discord.com/api/v9/channels/{cid}/messages', headers=self.headers, json={'content': msg}, timeout=10)
            if resp.status_code == 200:
                return True
            elif resp.status_code == 429:
                delay = resp.json().get('retry_after', 1)
                time.sleep(delay)
                return self.dispatch_message(cid, msg)
            return False
        except Exception as err:
            logger.error(f'Send error: {err}.')
            return False


class TaskScheduler:
    def __init__(self, session: DiscordSession, db: StorageEngine):
        self.session = session
        self.storage = db
        self.lock = threading.Lock()
        self.active = True
        self.thread = threading.Thread(target=self._scheduler_loop, daemon=True)
        self.thread.start()


    def _scheduler_loop(self):
        while self.active:
            try:
                self._process_tasks()
                time.sleep(0.1)
            except Exception as err:
                logger.error(f'Scheduler error: {err}.')
                time.sleep(1)


    def _process_tasks(self):
        with self.lock:
            tasks = self.storage.fetch_active_tasks()
            if not tasks: return
            now = time.time()
            for t in tasks:
                uid = t[0]
                cid = t[2]
                delay = t[6]
                text = t[7]
                count = t[9] if t[9] else 0
                rand_enabled = t[12]
                rand_max = t[13] if len(t) > 13 else 30
                next_fire = t[14] if len(t) > 14 else 0

                if next_fire == 0:
                    nft = now + delay
                    if rand_enabled:
                        nft += random.randint(1, rand_max)
                    self.storage.modify_task(uid, next_fire_at=nft)
                    continue

                if now >= next_fire:
                    ok = self.session.dispatch_message(cid, text)
                    if ok:
                        base = now + delay
                        extra = random.randint(1, rand_max) if rand_enabled else 0
                        new_next = base + extra
                        self.storage.modify_task(uid, last_fired_at=datetime.now().strftime('%Y-%m-%d %H:%M:%S'), next_fire_at=new_next, fire_count=count + 1)
                    else:
                        self.storage.modify_task(uid, next_fire_at=now + 30)


    def halt_all(self):
        with self.lock:
            tasks = self.storage.fetch_all_tasks()
            for t in tasks:
                if t[8]: self.storage.modify_task(t[0], active=0, next_fire_at=0)


    def halt_task(self, uid):
        with self.lock:
            self.storage.modify_task(uid, active=0, next_fire_at=0)


    def launch_task(self, uid):
        with self.lock:
            t = self.storage.fetch_task(uid)
            if t:
                now = time.time()
                rand_enabled = t[12]
                rand_max = t[13] if len(t) > 13 else 30
                nft = now + t[6]
                if rand_enabled:
                    nft += random.randint(1, rand_max)
                self.storage.modify_task(uid, active=1, next_fire_at=nft, last_fired_at=datetime.now().strftime('%Y-%m-%d %H:%M:%S'))


db_pool = StorageEngine()
session = DiscordSession(user_token)
if not session.authenticate():
    logger.error('Discord auth failed. Check token.')
scheduler = TaskScheduler(session, db_pool)


@app.route('/api/state')
def api_state():
    return jsonify({'status': 'online' if session.connected else 'offline', 'profile': session.my_profile, 'uid': session.my_uid})


@app.route('/api/guilds')
def get_guilds():
    return jsonify([{'id': g['id'], 'name': g['name']} for g in session.guilds])


@app.route('/api/channels/<gid>')
def get_channels(gid):
    channels = session.fetch_channels(gid)
    return jsonify([{'id': c['id'], 'name': c['name']} for c in channels if c['type'] == 0])


@app.route('/api/channel_info/<cid>')
def get_channel_info(cid):
    info = session.resolve_channel_info(cid)
    if 'guild_id' in info:
        info['guild_name'] = session.resolve_guild_name(info['guild_id'])
    return jsonify(info)


@app.route('/api/tasks')
def get_tasks():
    tasks = db_pool.fetch_all_tasks()
    result = []
    for s in tasks:
        channel_info = session.resolve_channel_info(s[2])
        guild_name = None
        if len(s) > 3 and s[1] != 'current':
            guild_name = session.resolve_guild_name(s[1])
        data = {
            'uid': s[0], 'guild_id': s[1], 'channel_id': s[2],
            'guild_name': guild_name or s[3], 'channel_name': channel_info.get('name') or s[4],
            'mode': s[5], 'delay': s[6], 'payload': s[7], 'active': bool(s[8]),
            'count': s[9], 'created': s[10], 'last_fired': s[11],
            'random_delay': bool(s[12]), 'random_max': s[13] if len(s) > 13 else 30,
            'next_fire': s[14] if len(s) > 14 else 0
        }
        result.append(data)
    return jsonify(result)


@app.route('/api/tasks/add', methods=['POST'])
def add_task():
    data = request.json
    channel_info = session.resolve_channel_info(data['channel_id'])
    gid = channel_info.get('guild_id', 'current')
    gname = session.resolve_guild_name(gid) if gid != 'current' else 'Current Server'
    uid = db_pool.insert_task(gid, data['channel_id'], data['delay'], data['payload'],
                              data.get('random_delay', False), data.get('random_max', 30),
                              gname, channel_info.get('name'))
    return jsonify({'success': True, 'uid': uid})


@app.route('/api/tasks/update/<int:uid>', methods=['POST'])
def update_task(uid):
    data = request.json
    if 'random_delay' in data:
        data['random_delay_enabled'] = data.pop('random_delay')
    if 'random_max' in data:
        data['random_max_sec'] = data.pop('random_max')
    if 'value' in data:
        data['delay_sec'] = data.pop('value')
    if 'text' in data:
        data['payload'] = data.pop('text')
    db_pool.modify_task(uid, **data)
    return jsonify({'success': True})


@app.route('/api/tasks/start/<int:uid>', methods=['POST'])
def start_task(uid):
    scheduler.launch_task(uid)
    return jsonify({'success': True})


@app.route('/api/tasks/stop/<int:uid>', methods=['POST'])
def stop_task(uid):
    scheduler.halt_task(uid)
    return jsonify({'success': True})


@app.route('/api/tasks/delete/<int:uid>', methods=['POST'])
def delete_task(uid):
    scheduler.halt_task(uid)
    db_pool.remove_task(uid)
    return jsonify({'success': True})


@app.route('/api/tasks/start_all', methods=['POST'])
def start_all():
    for s in db_pool.fetch_all_tasks():
        if not s[8]: scheduler.launch_task(s[0])
    return jsonify({'success': True})


@app.route('/api/tasks/stop_all', methods=['POST'])
def stop_all():
    scheduler.halt_all()
    return jsonify({'success': True})


@app.route('/api/send', methods=['POST'])
def send_message():
    data = request.json
    if not data.get('channel_id') or not data.get('message'): return jsonify({'success': False})
    ok = session.dispatch_message(data['channel_id'], data['message'])
    return jsonify({'success': ok})


@app.route('/api/profiles', methods=['GET'])
def get_profiles():
    configs = db_pool.fetch_all_profiles()
    result = [{'uid': c[0], 'name': c[1], 'snapshot': json.loads(c[2]), 'created': c[3]} for c in configs]
    return jsonify(result)


@app.route('/api/profiles', methods=['POST'])
def save_profile():
    data = request.json
    name = data.get('name')
    if not name: return jsonify({'success': False})
    tasks = db_pool.fetch_all_tasks()
    tasks_data = [{'uid': s[0], 'guild_id': s[1], 'channel_id': s[2], 'delay': s[6], 'payload': s[7], 'active': bool(s[8]), 'random_delay': bool(s[12]), 'random_max': s[13]} for s in tasks]
    profile_id = db_pool.save_profile(name, {'tasks': tasks_data, 'timestamp': datetime.now().isoformat()})
    return jsonify({'success': True, 'uid': profile_id})


@app.route('/api/profiles/load/<name>', methods=['POST'])
def load_profile(name):
    config = db_pool.get_profile(name)
    if not config: return jsonify({'success': False})
    for t in config.get('tasks', []):
        db_pool.insert_task(t.get('guild_id', 'current'), t['channel_id'], t['delay'], t['payload'],
                          t.get('random_delay', False), t.get('random_max', 30))
    return jsonify({'success': True})


@app.route('/api/profiles/<int:uid>', methods=['DELETE'])
def delete_profile(uid):
    db_pool.remove_profile(uid)
    return jsonify({'success': True})


@app.route('/api/test_connection')
def test_connection():
    return jsonify({'discord_connected': session.connected, 'user': session.my_profile, 'user_id': session.my_uid})


if __name__ == '__main__':
    print(f'Launching server on 0.0.0.0:2525')
    app.run(host='0.0.0.0', port=2525, debug=False, threaded=True)