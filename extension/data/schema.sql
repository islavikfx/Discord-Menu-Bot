CREATE TABLE IF NOT EXISTS tasks (
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
    next_fire_at FLOAT DEFAULT 0
);


CREATE TABLE IF NOT EXISTS profiles (
    uid INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_name TEXT UNIQUE NOT NULL,
    snapshot TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);