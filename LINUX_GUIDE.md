# Linux Antigravity Setup & Development Guide

This guide walks you through setting up, running, updating, and deploying the **Dashboard App** directly within your **Linux Antigravity** environment, eliminating any need to switch back to Windows.

---

## 1. Prerequisites on Linux

Ensure your Linux system has Git and Python 3 with the venv module installed:

```bash
# Ubuntu / Debian
sudo apt update
sudo apt install -y git python3 python3-venv python3-pip

# Fedora / RHEL
sudo dnf install -y git python3 python3-pip

# Arch Linux
sudo pacman -S git python python-pip
```

---

## 2. GitHub Authentication on Linux (One-Time Setup)

To allow Linux Antigravity to push updates to GitHub without prompting for passwords:

### Option A: Using SSH Keys (Recommended)
1. Generate an SSH key on Linux (press Enter to accept default path):
   ```bash
   ssh-keygen -t ed25519 -C "afifrzn@users.noreply.github.com"
   ```
2. Display and copy your public key:
   ```bash
   cat ~/.ssh/id_ed25519.pub
   ```
3. Add this key to your GitHub account: **GitHub > Settings > SSH and GPG keys > New SSH key**.
4. Test the connection:
   ```bash
   ssh -T git@github.com
   # Output should confirm: "Hi afifrzn! You've successfully authenticated..."
   ```

### Option B: Using GitHub CLI (`gh`)
```bash
sudo apt install gh
gh auth login
# Follow the interactive prompt to authenticate with your GitHub account
```

---

## 3. Clone Repository in Linux Antigravity

Open your Linux Antigravity terminal and clone the repository:

```bash
# Using SSH (if you set up Option A above):
git clone git@github.com:afifrzn/automate-dashboard.git ~/automate-dashboard
cd ~/automate-dashboard

# OR using HTTPS:
git clone https://github.com/afifrzn/automate-dashboard.git ~/automate-dashboard
cd ~/automate-dashboard
```

---

## 4. Virtual Environment & Dependencies

Inside the project directory, create and activate a Python virtual environment:

```bash
cd ~/automate-dashboard

# 1. Create virtual environment
python3 -m venv venv

# 2. Activate virtual environment
source venv/bin/activate

# 3. Install required packages
pip install --upgrade pip
pip install -r requirements.txt
```

---

## 5. Running the Application

### Option A: Interactive Run (Development)
```bash
source venv/bin/activate
python3 run.py
```
By default, the server binds to `0.0.0.0:8080`, making it accessible via:
- Local machine: **`http://127.0.0.1:8080`** or **`http://localhost:8080`**
- Network / VM / Remote IP: **`http://<your-linux-ip>:8080`**

To specify a different port or host:
```bash
python3 run.py 9000 0.0.0.0
```

### Option B: Run in Background with nohup
```bash
source venv/bin/activate
nohup python3 run.py > server.log 2>&1 &
echo "Server PID: $!"
```

To stop the background server:
```bash
pkill -f "python3 run.py"
# or
fuser -k 8080/tcp
```

### Option C: Run as a Persistent Systemd Service (Production / Always-On)
If you want the dashboard to start automatically on Linux boot:

1. Create service file:
   ```bash
   sudo nano /etc/systemd/system/dashboard-app.service
   ```
2. Paste the following configuration (replace `YOUR_USERNAME` with your Linux username):
   ```ini
   [Unit]
   Description=Automate Dashboard App Service
   After=network.target

   [Service]
   Type=simple
   User=YOUR_USERNAME
   WorkingDirectory=/home/YOUR_USERNAME/automate-dashboard
   Environment="PATH=/home/YOUR_USERNAME/automate-dashboard/venv/bin:/usr/local/bin:/usr/bin"
   ExecStart=/home/YOUR_USERNAME/automate-dashboard/venv/bin/python run.py 8080 0.0.0.0
   Restart=always
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   ```
3. Enable and start:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now dashboard-app
   ```
4. Check status or logs:
   ```bash
   sudo systemctl status dashboard-app
   sudo journalctl -u dashboard-app -f
   ```

---

## 6. Updating the Web Application from Linux Antigravity

When you are working inside Linux Antigravity, you can instruct Antigravity to make any code updates directly. You never need to go back to Windows.

### Updating Frontend
- Frontend files reside in `frontend/` (`index.html`, `style.css`, `app.js`).
- Because these are served directly as static assets, any edit in `frontend/` is immediately available in your browser upon a hard refresh (`Ctrl + Shift + R` or `Ctrl + F5`).

### Updating Backend
- Backend files reside in `backend/` (`server.py`, `run_engine.py`, `importer.py`, `database.py`, `lint_engine.py`, etc.).
- After editing backend code, restart the server or run:
  ```bash
  sudo systemctl restart dashboard-app   # If running as systemd service
  # OR restart your python3 run.py process
  ```

### Running Automated Unit Tests on Linux
Before committing changes, execute the test suite:
```bash
source venv/bin/activate
python3 -m unittest discover tests
```
All 15 seed acceptance tests should output `OK`.

---

## 7. Committing & Pushing Updates to GitHub

Push your updates directly from the Linux Antigravity terminal:

```bash
# 1. Check changed files
git status

# 2. Stage changes
git add .

# 3. Commit
git commit -m "feat/fix: describe your changes here"

# 4. Push directly to GitHub
git push origin main
```

---

## 8. Firewall & Port Opening (If Accessing Remotely)

If your Linux machine has an active firewall (`ufw` or `firewalld`), allow incoming traffic on port 8080:

```bash
# For UFW (Ubuntu/Debian)
sudo ufw allow 8080/tcp
sudo ufw reload

# For Firewalld (RHEL/CentOS/Fedora)
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --reload
```

---

## 9. Summary Workflow Inside Linux Antigravity

```
┌─────────────────────────────────────────────────────────────────┐
│                     Linux Antigravity Workspace                │
│                                                                 │
│  1. Prompt Antigravity: "Add feature X" or "Fix bug Y"         │
│  2. Antigravity edits files in `backend/` or `frontend/`       │
│  3. Verify tests: `python3 -m unittest discover tests`          │
│  4. Refresh browser at `http://<ip>:8080` to verify UI          │
│  5. Push to GitHub: `git push origin main`                      │
│                                                                 │
│  ✓ Completely standalone — 0 Windows dependency required        │
└─────────────────────────────────────────────────────────────────┘
```
