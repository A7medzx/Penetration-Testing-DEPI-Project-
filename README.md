# LinkUp — Web Application & API Penetration Testing Target

A polished, Facebook-inspired social media application called **LinkUp** built from scratch using Node.js, Express, and SQLite. LinkUp is specifically designed as an intentionally vulnerable training ground for local web application and API penetration testing practice.

The app features a three-column social layout, fictional member profiles and timelines, photo posts, 24-hour stories, interactive comments, likes, saves, follows, global search, and creator tools. All member accounts, posts, stories, and photographs are fictional mock data.

---

## 🛡️ Safety & Containment Boundary

LinkUp is built strictly for **local educational practice**:

- **Strict Localhost Binding**: The application server binds exclusively to `127.0.0.1` (`HOST = '127.0.0.1'`). It never binds to `0.0.0.0` and will not accept connections from external devices.
- **Contained SSRF**: Link preview and URL inspection route strictly through an in-process mock service (`http://mock.internal/*`). The application never initiates real outbound network requests. External domains are rejected.
- **Contained Path Traversal & LFI**: File operations resolve within a virtual, in-memory catalog (`mockVirtualFiles`). Real host files and system directories are never accessed.
- **Simulated Command Injection**: The media optimizer parses shell separators (`;`, `&`, `|`) and simulates shell responses in memory. It never spawns real operating system child processes.
- **In-Memory File Uploads**: Uploaded files and attachments are stored volatilely in memory (`multer.memoryStorage()`) with a 5 MB cap. Uploaded files are never written to host disk and disappear upon server restart.
- **Local SQLite Database**: Synthetic accounts, posts, comments, follows, and stories persist locally in `data/lab.sqlite` (ignored by Git). Deleting `data/lab.sqlite` automatically reseeds fresh fictional data on the next start.

---

## 🚀 Requirements & Quick Start

### Requirements
- **Node.js**: Version 22.5.0 or newer (uses the built-in `node:sqlite` module)
- **npm**: Standard package manager

### Run Locally

1. From this repository directory, install dependencies:
   ```powershell
   npm install
   ```

2. Start the application:
   ```powershell
   npm start
   ```

3. Open your browser and navigate to:
   ```
   http://127.0.0.1:3000
   ```

4. To stop the server, press `Ctrl+C`.

---

## 👥 Demo Accounts

The database comes pre-seeded with 6 fictional profiles:

| Username | Password | Role | Display Name | Profile Bio / Focus |
| :--- | :--- | :--- | :--- | :--- |
| `alice` | `alice123` | member | Alice Chen | UI/UX Designer, neighborhood walks, succulents 🌿 |
| `bob` | `bob123` | member | Bob Rivera | Specialty coffee roaster, weekend camper ☕ |
| `nour` | `nour123` | member | Nour Hassan | Architectural photographer, old novels, sunsets 🌅 |
| `omar` | `omar123` | member | Omar Saleh | Artisanal bakery reviewer, amateur baker 🥐 |
| `maya` | `maya123` | member | Maya Farouk | Historic architecture, vinyl records, acoustic playlists 🎶 |
| `admin` | `admin123` | admin | Morgan Lane | Community Host · System Administrator with confidential privileges 🔒 |

> **Tip**: You can also register a brand new account directly from the Sign In dialog.

---

## 🎯 Vulnerability Matrix & Natural App Features

Every vulnerability is reachable through a natural, ordinary social network action and has a direct, observable impact on fictional data:

| Vulnerability | Natural In-App Feature | Route / Endpoint | Observable Impact on Fictional Data |
| :--- | :--- | :--- | :--- |
| **Error-Based SQL Injection** | Top Navigation Search Bar | `GET /api/search?q=...` | Entering a single quote (`'`) reveals a raw SQLite syntax error. Entering `' OR '1'='1' --` bypasses filters and returns all users including the hidden admin account and internal notes. |
| **Reflected XSS** | "Open public search results ↗" link | `GET /lab/reflected?q=...` | Reflects the unescaped query parameter into server-rendered HTML. Supplying `<script>alert(document.cookie)</script>` immediately executes JavaScript in the victim's browser and reveals session cookies. |
| **Stored XSS** | Post Composer & Comment Replies | `POST /api/posts`<br>`POST /api/posts/:id/comments` | Post and comment bodies are stored as raw text and rendered directly into the DOM via `innerHTML`. Payloads like `<img src=x onerror=alert('Stored-XSS')>` trigger on every feed refresh for all viewers. |
| **Open Redirect** | Creator Studio "Open Shared Invite" | `GET /go?to=...` | Accepts unvalidated URLs in the `to` parameter and immediately redirects the user via HTTP 302, facilitating credential phishing attacks. |
| **SSRF (In-Process Mock)** | Post Composer "Preview Link" button | `GET /api/labs/ssrf?url=...` | Inspecting internal endpoints such as `http://mock.internal/metadata/instance` or `http://mock.internal/private/notes` leaks confidential mock cloud credentials and private memos. |
| **Unrestricted File Upload** | Post Composer Photo / File Attachment | `POST /api/labs/upload` | Accepts files of any extension (e.g., `.php`, `.html`, `.exe`) into memory. Non-raster files are served safely with `text/plain` and `X-Content-Type-Options: nosniff`. |
| **Path Traversal** | Creator Studio "Archive Exporter" | `GET /api/labs/files?path=...` | Resolving relative sequences like `../../etc/passwd` or `../../private/flag.txt` traverses the virtual catalog and returns secret training flags. |
| **Local File Inclusion (LFI)** | Creator Studio "Theme Fragment Preview" | `GET /api/labs/include?page=...` | Loads fragments into the DOM. Specifying `../../etc/passwd` directly embeds the mock passwd file as HTML into the theme preview box. |
| **Simulated OS Command Injection** | Creator Studio "Media Optimizer" | `GET /api/labs/command?name=...` | Entering shell chaining operators (e.g., `avatar.png; whoami` or `photo.jpg; cat /etc/passwd`) parses and evaluates commands against the mock environment. |
| **IDOR / BOLA** | User Profile & Timeline Modal | `GET /api/users/:id` | Fetching any arbitrary user ID (e.g., `/api/users/1`) returns sensitive administrative metadata, internal system notes, and master API tokens without ownership or authentication checks. |
| **Weak Authentication & Sessions** | Login System & Session Management | `POST /api/auth/login`<br>Cookie: `lab_session` | Passwords are stored in plain text. Session tokens follow a predictable sequence (`lab-user-{id}`) and lack `HttpOnly` and `Secure` flags, allowing JavaScript theft and trivial session hijacking. |
| **Credential SQL Injection** | Dedicated lab authentication query | `GET /api/labs/auth-sqli?username=...&password=...` | Synthetic credential fields are interpolated into a query and raw SQLite errors are returned. Kept separate from the normal sign-in flow. |
| **CSRF** | Cookie-authenticated profile action | `GET /api/labs/csrf/profile?bio=...` | A state-changing GET has no CSRF token. The lab cookie is SameSite=Lax; the included local PoC uses a second 127.0.0.1 port (same-site, cross-origin) to demonstrate the request without leaving localhost. |
| **Unsigned JWT / Broken Authentication** | Lab token issue and verification endpoints | `GET /api/labs/jwt/issue`<br>`GET /api/labs/jwt/me` | The verifier trusts the unverified JWT payload, including the caller-controlled role and subject, and does not check signature or expiry. Synthetic identities only. |
| **Business Logic / Price Tampering** | Simulated checkout | `GET /api/labs/shop/products`<br>`POST /api/labs/shop/checkout` | Checkout trusts caller-supplied product, quantity, and unit price. No payment is processed; order rows are local synthetic records. |
| **Order IDOR / BOLA** | Synthetic order lookup | `GET /api/labs/shop/orders/:id` | An order can be read without checking ownership. `DELETE` is a lab cleanup route and also intentionally has no auth; use only the local seeded lab database. |
| **Missing Rate Limiting** | Normal and lab login endpoints | `POST /api/auth/login`<br>`GET /api/labs/auth-sqli` | There is no rate limit or lockout. Demonstrate only a few manual failures against synthetic accounts; do not automate password guessing. |

---

## 🔬 Hands-On Testing & Exploitation Walkthrough

### 1. Error-Based SQL Injection
1. In the top search bar, type a single apostrophe: `'` and press Enter.
2. **Observable Impact**: The search popover turns red and displays:<br>
   `Database Query Error: SQLite Error: unrecognized token: "'''..."`
3. Now type a boolean bypass payload:
   ```sql
   ' OR '1'='1' --
   ```
4. **Observable Impact**: The search query retrieves every single account in the database (including Morgan Lane's administrator profile and confidential notes).

---

### 2. Reflected Cross-Site Scripting (XSS)
1. In the search bar, enter:
   ```html
   <script>alert('Reflected XSS: ' + document.cookie)</script>
   ```
2. Click **Open public search results ↗** at the bottom of the search popover.
3. **Observable Impact**: A new tab opens to `/lab/reflected` where the script executes instantly, displaying an alert box containing the active `lab_session` cookie.

---

### 3. Stored Cross-Site Scripting (XSS)
1. In the post composer, type:
   ```html
   Loving LinkUp! <img src="invalid-image" onerror="alert('Stored XSS Triggered: ' + document.domain)">
   ```
2. Click **Post**.
3. **Observable Impact**: The post renders in the main feed and immediately executes the alert. Any user browsing the feed will execute the script upon loading the page.
4. Try the same payload inside a comment reply on any post.

---

### 4. Open Redirect
1. Expand the **Creator Studio & Dev Tools** widget on the right sidebar.
2. In the "Invite Destination URL" field, enter an external URL:
   ```
   https://example.invalid/phishing-login
   ```
3. Click **Open Link**.
4. **Observable Impact**: The server receives `GET /go?to=https://example.invalid/phishing-login` and issues an unvalidated HTTP 302 redirect.

---

### 5. Server-Side Request Forgery (SSRF)
1. In the post composer's "Share a link" field (or in Creator Studio), enter:
   ```
   http://mock.internal/metadata/instance
   ```
2. Click **Preview Link**.
3. **Observable Impact**: The composer reveals simulated AWS/Cloud IAM role credentials (`AccessKeyId: ASIA-MOCK-LINKUP-KEY-9932`).
4. Test private internal notes:
   ```
   http://mock.internal/private/notes
   ```

---

### 6. Contained File Upload
1. In the post composer, click **Photo / File**.
2. Select any file (including arbitrary extensions like `.txt` or `.html`).
3. Click **Post**.
4. **Observable Impact**: The file is uploaded to memory (`POST /api/labs/upload`), assigned an in-memory ID, and linked in the post feed.

---

### 7. Virtual Path Traversal & LFI
1. In the Creator Studio, navigate to **Archive Exporter**.
2. Input the traversal path:
   ```
   ../../private/flag.txt
   ```
3. Click **Read**.
4. **Observable Impact**: The response returns:
   `DEPI_FLAG{v1rtu4l_p4th_tr4v3rs4l_c0nf1rm3d_7894}`
5. In **Theme Fragment Preview**, enter:
   ```
   ../../etc/passwd
   ```
6. Click **Render** to view the simulated system accounts rendered in HTML.

---

### 8. Simulated OS Command Injection
1. In the Creator Studio, find **Media Optimizer**.
2. Enter a filename chained with a shell command:
   ```
   cover.jpg; whoami
   ```
3. Click **Optimize**.
4. **Observable Impact**: Output displays:
   `uid=1000(linkup) gid=1000(linkup) groups=1000(linkup),4(adm)`
5. Test file listing:
   ```
   cover.jpg; ls -la
   ```

---

### 9. Insecure Direct Object Reference (IDOR / BOLA)
1. Click on **Bob Rivera** or **Nour Hassan** in the "People You May Know" widget.
2. Inspect the HTTP traffic: `GET /api/users/1`.
3. **Observable Impact**: Notice that fetching `/api/users/1` without being logged in as an administrator returns:
   - Secret email: `morgan@linkup.invalid`
   - Confidential system note: `"CONFIDENTIAL: System Administrator with elevated lab privileges. Master API key: LU-ADMIN-SECRET-KEY-9941"`

---

### 10. Weak Authentication & Session Hijacking
1. Open your browser Developer Tools (`F12`) and navigate to the Console.
2. Sign in as `alice` (`alice123`).
3. Check the session cookie:
   ```javascript
   console.log(document.cookie); // Outputs: lab_session=lab-user-2
   ```
4. Now escalate privileges to the administrator (`admin` has ID `1`) by modifying the cookie in the console:
   ```javascript
   document.cookie = "lab_session=lab-user-1; path=/";
   location.reload();
   ```
5. **Observable Impact**: The top right avatar and left sidebar will now display **Morgan Lane (@admin)** with the red Administrator role badge! You have fully hijacked the admin session without knowing the password.

---

## Additional pentest-report-inspired exercises

These extra exercises use only fictional LinkUp data and separate lab endpoints. They do not add access to real files, cloud services, payment systems, or operating-system commands.

### Credential SQL injection
```text
http://127.0.0.1:3000/api/labs/auth-sqli?username=alice&password=wrong
```
Use Burp Repeater and vary `username` or `password` one parameter at a time. A quote produces the raw database error; a Boolean condition may alter the synthetic authentication result. Keep the exercise on this endpoint rather than the normal login flow.

### CSRF profile change
1. Sign in to LinkUp as `alice` in a browser.
2. In another terminal, run `py -m http.server 3001 --bind 127.0.0.1 --directory artifacts/PoCs` from the repository root.
3. Open `http://127.0.0.1:3001/csrf-profile.html`. The page sends a local request to the lab profile endpoint. Confirm the bio changed at `/api/profile`.
4. Restore the original bio in the Profile UI or with an authenticated `PUT /api/profile` request.

### Unsigned JWT
1. Request `/api/labs/jwt/issue?username=alice` and copy the token.
2. Decode its payload locally, change `role` to `admin` and `sub` to the seeded admin ID, then base64url-encode the JSON and rebuild `header.payload.` (empty signature).
3. Send `GET /api/labs/jwt/me` with `Authorization: Bearer <token>`. Record whether the unverified identity/role is trusted. Do not use it outside LinkUp.

### Checkout price tampering and order BOLA
1. `GET /api/labs/shop/products` for the listed synthetic prices.
2. Sign in as `alice`, then `POST /api/labs/shop/checkout` with JSON such as `{"productId":"mug","quantity":1,"unitPrice":0.01}`.
3. Fetch the resulting order at `/api/labs/shop/orders/{orderId}` without a cookie and as a different user. Record price and ownership validation behavior. Delete the synthetic order afterward.

### Rate limiting and password policy
Make no more than five manual invalid login attempts using a synthetic username, note status, response, and timing, and stop. Do not use a wordlist, automation, or distributed attempts. Registration accepts short passwords (three characters minimum); verify with a disposable test account and delete/reset it after recording the response.

For expanded Burp/sqlmap/ffuf workflows, chains, evidence guidance, and containment boundaries, see `reports/LinkUp-Local-Pentest-Field-Guide.md`.

---

## 🧹 Database Reset

To reset all data back to the clean seed state:
1. Stop the application server (`Ctrl+C`).
2. Delete the database file:
   ```powershell
   Remove-Item data\lab.sqlite
   ```
3. Start the server again (`npm start`). The database and seed profiles will be recreated automatically.
