### Discord Menu Bot

Chrome extension for Discord self-bot message scheduling with interval control and random delays.

![Menu](https://github.com/islavikfx/Discord-Menu-Bot/blob/main/img/preview.png?raw=true)

Use PyCharm to run it or manually.
```
For Linux:
sudo apt install python3 git && sudo apt update
cd ~
git clone https://github.com/islavikfx/Discord-Menu-Bot.git
cd Discord-Menu-Bot/
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
nano .env (edit your discord token)
```

#### How to get your Discord token?

Open discord.com, press Ctrl+Shift+i, go to Network tab; 

In the filter box type /api, refresh the page with F5;

Look for the Authorization header in science folders.

#### Install and Run:

Open Chrome, go to chrome://extensions;

Enable Developer Mode (top right toggle);

Click Load Unpacked, select the extension folder from the project.

Run: python3 src/server_main.py

Then open or reload Discord in your browser. Click the '⚡' button in the bottom-right corner to open the menu. Discord may show a permission prompt at the top - accept it.

Menu release on GitHub is not full because the project was written for one person.

Youtube video: https://youtu.be/N1YHLVpPICk

t.me/islavikhome
