# CodeSync — Setup on a New Computer

Follow these in order. Do not skip any. Every command is meant to be
copy-pasted exactly as written.

Total time: about 15–20 minutes, most of it waiting for downloads.

---

## What you need first

| Thing | Why | Where |
| --- | --- | --- |
| **Node.js 20 or newer** | runs both the backend and the frontend | https://nodejs.org — download the **LTS** button |
| **A MongoDB database** | stores users, rooms and chat | Step 2 gives you two options |
| **A terminal** | to type commands | Windows: PowerShell. Mac/Linux: Terminal |

You do **not** need Docker, Git, or any paid service.

---
A
## Step 1 — Install Node.js

1. Go to https://nodejs.org
2. Click the big green **LTS** button. Run the installer.
3. Click Next → Next → Install. Accept every default.
4. **Close every terminal window that was already open.** The installer only
   updates new terminals.
5. Open a **new** terminal and type:

   ```bash
   node -v
   npm -v
   ```

6. You should see two version numbers, like `v22.14.0` and `10.9.2`.
   The first number after `v` must be **20 or higher**.

> If you see `'node' is not recognized`, the installer did not finish or you
> did not open a new terminal. Restart the computer and check again.

---

## Step 2 — Get a MongoDB database

Pick **ONE** of these two. Option A is easier and needs no installation.

### Option A — MongoDB Atlas (free cloud database, recommended)

1. Go to https://www.mongodb.com/cloud/atlas/register and create a free account.
2. When it asks, choose the **M0 / Free** cluster. Any region is fine.
3. It will ask you to create a **database user**:
   - Username: `codesync`
   - Password: click **Autogenerate**, then **copy the password somewhere safe**.
     You cannot see it again later.
4. It will ask about **network access**. Choose **Allow access from anywhere**
   (`0.0.0.0/0`). This is fine for a portfolio project.
5. On the cluster page click **Connect** → **Drivers** → **Node.js**.
6. Copy the connection string. It looks like this:

   ```
   mongodb+srv://codesync:<db_password>@cluster0.ab1cd.mongodb.net/?retryWrites=true&w=majority
   ```

7. Fix it two ways before using it:
   - Replace `<db_password>` (including the `<` and `>`) with the real password
     from step 3.
   - Add `/codesync` right before the `?`.

   Final result looks like:

   ```
   mongodb+srv://codesync:YourRealPassword@cluster0.ab1cd.mongodb.net/codesync?retryWrites=true&w=majority
   ```

8. Keep this string. You will paste it in Step 6.

### Option B — MongoDB installed on the computer

1. Go to https://www.mongodb.com/try/download/community
2. Download **MongoDB Community Server** for your operating system, install it.
3. During install, **tick "Install MongoDB as a Service"** and leave it ticked.
4. Your connection string is simply:

   ```
   mongodb://127.0.0.1:27017/codesync
   ```

5. Check it is running. Open a terminal and type:

   - Windows: `Get-Service MongoDB`  → Status should say `Running`
   - Mac (installed via brew): `brew services list`
   - Linux: `sudo systemctl status mongod`

---

## Step 3 — Unzip the project

1. Copy `codesync.zip` to the new computer.
2. Right-click it → **Extract All** (Windows) or double-click (Mac).
3. Put the extracted folder somewhere simple with **no spaces** in the path.
   Good: `C:\projects\codesync` or `~/projects/codesync`
   Bad: `C:\My Documents\New folder (2)\codesync`
4. Open the folder. You should see these items directly inside:

   ```
   client/   server/   package.json   README.md   SETUP.md   .gitignore
   ```

> **If you see only one folder called `codesync` inside `codesync`, go one
> level deeper.** The folder you work in is the one containing `client` and
> `server`.

---

## Step 4 — Open a terminal in that folder

**Windows:** open the folder in File Explorer, click the address bar, type
`powershell`, press Enter.

**Mac:** right-click the folder → Services → New Terminal at Folder.

**Any system:** open a terminal and `cd` into it, for example:

```bash
cd C:\projects\codesync
```

Check you are in the right place:

```bash
dir        # Windows
ls         # Mac / Linux
```

You must see `client`, `server` and `package.json` in the list. If you don't,
you are in the wrong folder — go back to Step 3.

---

## Step 5 — Install the dependencies

The zip does **not** include the downloaded libraries (that would make it
hundreds of megabytes). This command downloads them:

```bash
npm run install:all
```

- Takes 2–5 minutes depending on your internet.
- You will see a lot of scrolling text. That is normal.
- Warnings in yellow are normal. **Errors in red are not.**
- At the end you should see three lines like `added 129 packages`,
  `added 225 packages`, `added 138 packages`.

If that command fails, run these three one at a time instead:

```bash
npm install
npm install --prefix server
npm install --prefix client
```

---

## Step 6 — Create the two configuration files

The project needs two small text files that are **not** in the zip, because
they hold passwords. You create them now.

### 6a — The backend file

Create a file at `server/.env` — note the filename starts with a dot and has
no extension.

**Easiest way (Windows PowerShell), from the project folder:**

```powershell
notepad server\.env
```

Notepad will say the file doesn't exist and offer to create it. Click **Yes**.

**Mac / Linux:**

```bash
nano server/.env
```

Paste this in, then change the two marked lines:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=PASTE_YOUR_CONNECTION_STRING_FROM_STEP_2_HERE
JWT_SECRET=PASTE_A_LONG_RANDOM_STRING_HERE
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
RUNNER=local
PISTON_URL=https://emkc.org/api/v2/piston
```

**`MONGODB_URI`** — paste the string you prepared in Step 2.

**`JWT_SECRET`** — this signs login tokens. It must be long and random. Get one
by running this in your terminal and copying the output:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

It prints a long line of letters and numbers. Paste that after `JWT_SECRET=`.

Rules for this file:
- No spaces around the `=` sign.
- No quotes around the values.
- Do not leave the words `PASTE_...` anywhere.

Save and close (Notepad: Ctrl+S then close. nano: Ctrl+O, Enter, Ctrl+X).

### 6b — The frontend file

Create `client/.env` the same way:

```powershell
notepad client\.env
```

Paste exactly this — **nothing to change here**:

```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

Save and close.

---

## Step 7 — Start the project

From the project folder:

```bash
npm run dev
```

Wait about 10 seconds. **Success looks like this:**

```
[server] [db] connected to codesync
[server] [server] http://localhost:5000 (development)
[server] [server] accepting client origin http://localhost:5173
[client]   VITE v6.0.7  ready in 512 ms
[client]   ➜  Local:   http://localhost:5173/
```

The key line is **`connected to codesync`**. If you don't see it, jump to
Troubleshooting at the bottom.

**Leave this terminal window open.** Closing it stops the app.

---

## Step 8 — Check it works (do these in order)

Open your browser and go to **http://localhost:5173**

### Test 1 — Create an account
- You land on the login page. Click **Create one**.
- Fill in: username `alice`, email `alice@test.com`, password `Password123`
- Click **Create account**.
- ✅ Pass: you land on a dashboard saying "Welcome, alice".

### Test 2 — Create a room
- Type a room name like `test room`. Click **Create room**.
- ✅ Pass: the editor opens. Top-right shows a green **Connected** dot.
  Right side shows **alice (you)** with **OWNER** and a green dot.

### Test 3 — Type some code
- Click inside the black editor area and type:
  ```javascript
  console.log("hello world");
  ```
- ✅ Pass: the text is coloured (syntax highlighting).

### Test 4 — Run the code
- Click the **▶ Run** button at the top.
- ✅ Pass: a panel opens at the bottom showing `hello world`, and a grey line
  saying something like `javascript (local) · exit 0 · 43 ms · run by alice`.

### Test 5 — Two people at once (the important one)
- Copy the room ID — the short code under the room name, like `A2S4KFZQFU`.
- Open a **new incognito/private window** (Ctrl+Shift+N in Chrome).
  You must use incognito, not a new tab, so it counts as a different person.
- Go to http://localhost:5173, click **Create one**, register a second account:
  username `bob`, email `bob@test.com`, password `Password123`
- On bob's dashboard, paste the room ID into **Join with a room ID** and click
  **Join room**.
- ✅ Pass checklist — put the two windows side by side:
  - [ ] Both windows show the same code
  - [ ] Members list shows **alice** and **bob**, both with green dots
  - [ ] Typing in alice's window appears instantly in bob's window
  - [ ] Typing in bob's window appears instantly in alice's window
  - [ ] Each side sees the other's cursor as a coloured line with their name
  - [ ] Sending a chat message from alice appears in bob's chat
  - [ ] Clicking Run in one window shows the output in **both** windows

### Test 6 — Files, roles, sharing, password, activity
- In alice's window, left panel (**Workspace**): click the new-file icon, type
  `src/utils.js`, press Enter.
  - ✅ Pass: a `src` folder appears with `utils.js` inside it, and the same tree
    shows up in bob's window straight away.
- Click `utils.js` in alice's window only, and type something.
  - ✅ Pass: bob is still on `main.js` and his code is untouched. Click
    `utils.js` in bob's window → alice's text appears, and now both edit it
    together.
- Right-click a file → **Rename** / **Delete** both work; the last remaining
  file cannot be deleted.
- In alice's window (she is the owner), click bob's role badge in
  **Collaborators** → **Viewer**.
  - ✅ Pass: bob's window instantly shows a "View-only access" banner, his editor
    stops accepting typing, and the Run/Save buttons go dim. Switch him back to
    **Editor** → he can type again.
- Click the room-ID chip at the top → **Share workspace** → **Copy link**.
  - ✅ Pass: pasting that link in a *third* browser window sends you to login,
    and after signing in you land in the same room.
- Click the gear icon (owner only) → turn **Password protection** on, type
  `letmein42`, **Save**.
  - ✅ Pass: in the third browser, reopening the room asks for the password. A
    wrong password says "Incorrect password"; `letmein42` gets in.
- Look at the **Activity** panel on the right through all of the above.
  - ✅ Pass: it lists joins, the file you created, the rename, the role change
    and the password change, each with a name and a time. The
    All / Files / Members / Settings buttons filter the list.

### Test 7 — Data is saved
- Close the incognito window completely.
- ✅ Pass: in alice's window, bob's dot turns from green to a hollow circle.
- Now close **all** browser windows, then reopen http://localhost:5173 and go
  back into the room.
- ✅ Pass: every file's code is still there, and the chat messages are still
  there.

**If all seven tests pass, the project is fully working on this computer.**

---

## Step 9 — Optional: run the automated tests

These prove the same things without clicking. Open a **second** terminal in the
project folder (keep `npm run dev` running in the first one).

```bash
npm test
```
Expected ending: `Tests  25 passed (25)`

```bash
npm --prefix client run check:collab
```
Expected ending: `77 passed, 0 failed`

```bash
npm --prefix client run check:run
```
Expected ending: `12 passed, 0 failed`

> `check:run` may show fewer passes if that computer has no Python, Java or C++
> installed. That is expected — the app correctly reports which runtime is
> missing instead of crashing.

---

## Step 10 — Stopping and restarting

**Stop:** click the terminal running `npm run dev` and press `Ctrl + C`.

**Start again later:** open a terminal in the project folder and run
`npm run dev`. You only do Steps 1–6 once per computer.

---

## Troubleshooting

| What you see | What it means | Fix |
| --- | --- | --- |
| `'npm' is not recognized` | Node.js not installed, or terminal is stale | Redo Step 1, then open a **brand new** terminal |
| `Invalid environment configuration: MONGODB_URI is required` | `server/.env` missing, empty, or in the wrong folder | Redo Step 6a. The file must be `server/.env`, not `.env.txt` |
| `JWT_SECRET must be at least 16 characters` | You left the placeholder text | Generate a real secret, Step 6a |
| Notepad saved it as `.env.txt` | Windows added an extension | In Notepad's Save dialog set "Save as type" to **All Files**, and name it `.env` |
| `MongooseServerSelectionError` / `connect ECONNREFUSED` | The database is unreachable | **Atlas:** check the password in the string, and that Network Access allows `0.0.0.0/0`. **Local:** check the MongoDB service is Running (Step 2 Option B) |
| `bad auth : authentication failed` | Wrong Atlas password | The `<db_password>` placeholder is still there, or the password is wrong. If the password has symbols like `@` or `#`, regenerate it in Atlas as letters+numbers only |
| `EADDRINUSE: address already in use :::5000` | Port 5000 is taken (often a previous run) | Close old terminals. Windows: `Get-NetTCPConnection -LocalPort 5000` then `Stop-Process -Id <number> -Force` |
| Browser shows a blank white page | The frontend is still starting, or `client/.env` is wrong | Wait 10 seconds and refresh. Then check `client/.env` matches Step 6b exactly |
| Badge says **Disconnected** in red | The backend stopped, or `client/.env` points at the wrong port | Check the `npm run dev` terminal for a crash. Confirm both URLs use port **5000** |
| Editing works but you don't see the other person | You used a second tab instead of incognito | Same browser tabs share one login. Use an incognito window |
| Run button is greyed out | The language is not executable | HTML, CSS, JSON and SQL cannot run. Switch the Language dropdown to JavaScript |
| Run says `needs Python 3` / `needs a C++ compiler` | That runtime isn't on this computer | Install it, or just use JavaScript — Node is already installed |
| `npm install` fails with network errors | Firewall or proxy | Try a different network, or `npm config set registry https://registry.npmjs.org/` |

---

## Important notes

**Never put `.env` in a zip or on GitHub.** It contains your database password
and token secret. `.gitignore` already blocks it.

**`RUNNER=local` runs code on the computer.** That is fine on your own laptop.
If you ever host this on a public server, the app will refuse to run code
locally (it blocks itself when `NODE_ENV=production`) — see the README section
"Code execution" for the sandboxed setup.

**The frontend must be reached at `localhost:5173`, not `127.0.0.1:5173`.**
The login cookie is issued for `localhost`. Using the numeric address will make
logins silently fail.
