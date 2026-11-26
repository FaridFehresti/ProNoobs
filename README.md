# ProNoobs Dota

A React landing page served as static files. The page uses React, Framer Motion, and Lucide React from browser ESM CDNs, so it does not need a Node.js build step on the VPS. Keep `index.html`, `index.js`, and `styles.css` together in the document root, along with the `assets/` directory. The HTML also includes a static fallback so the page remains readable before JavaScript loads.

The theme colors, typography, and glass styles are CSS custom properties at the top of `styles.css`.

## Tournament API

The Express API lives in `backend/` and uses PostgreSQL. It is separate from the static website so the website and a future Discord bot can use the same API. It stores tournaments, teams, player identities and MMR, team rosters, and tournament registrations.

Requirements: Node.js 20 or later and PostgreSQL. From the repository root, create the database and apply the initial schema:

```bash
createdb pronoobs
psql -d pronoobs -f backend/migrations/001_initial_schema.sql
psql -d pronoobs -f backend/migrations/002_team_signup_fields.sql
psql -d pronoobs -f backend/migrations/003_team_logos.sql
psql -d pronoobs -f backend/migrations/004_discord_team_flows.sql
cd backend
pnpm install
```

Copy `backend/.env.example` to `backend/.env`, set `DATABASE_URL` and replace `ADMIN_API_KEY` with a long random secret, then start the API:

```bash
pnpm dev
```

The API listens on port `3000` by default. `GET /health` checks the database connection. Set `CORS_ORIGINS` to the website's origin(s), separated by commas.

### API routes

Public read routes:

- `GET /api/tournaments` and `GET /api/tournaments/:id`
- `GET /api/teams` and `GET /api/teams/:id` (include team name, captain's Discord name, agreement acceptance, and roster with player MMR)
- `GET /api/tournaments/:id/registrations`

Write routes require the `X-API-Key` header set to `ADMIN_API_KEY`:

- `POST /api/tournaments` — create a tournament. Set status to `registration_open` to accept entries.
- `PATCH /api/tournaments/:id` — update tournament details or status.
- `POST /api/teams` — create a team with its captain's Discord name, accepted captain agreement, and exactly five members. Each member needs `displayName` (Steam/Dota name) and integer `mmr`.
- Discord bot routes (all require the bot's `X-API-Key`): `GET /api/discord/tournaments/open`, `GET /api/discord/teams/mine?discordId=...`, `POST /api/discord/teams`, and captain-owned `PATCH /api/discord/teams/:id`, `POST /api/discord/teams/:id/members`, `PATCH /api/discord/teams/:id/members/:playerId`, `DELETE /api/discord/teams/:id/members/:playerId`, and `POST /api/discord/teams/:id/registrations`.
- `PUT /api/teams/:id/logo` — upload one PNG, JPEG, or WebP logo (multipart file field `logo`, maximum 5 MB). Team responses include a relative `logoUrl` when uploaded.
- `PATCH /api/players/:id` — update a player's name, MMR, Discord ID, or Steam ID.
- `POST /api/tournaments/:id/registrations` with `{ "teamId": 1 }` — register a team while the tournament is open and has capacity.
- `PATCH /api/registrations/:id` with `{ "status": "approved" }` — update a registration (`pending`, `approved`, `rejected`, or `withdrawn`).

The Discord route creates a recruiting team from one captain and zero to four teammates. Each teammate only needs a Dota name and MMR, so a captain can add people who have not joined the server yet; `discordId` can be left out and linked later. Responses include `memberCount`, `maxMembers`, and `recruiting`. The captain's Discord user ID is stored for ownership checks and is omitted from public team responses. Roster changes are limited to that captain, and the captain cannot remove themselves. Teams with fewer than five players can register through the Discord team registration route and continue recruiting afterward.

Example Discord team payload:

```json
{
  "name": "Ancient Stack",
  "captainDiscordId": "123456789012345678",
  "captainDiscordName": "farid",
  "captainDisplayName": "FaridDota",
  "captainMmr": 4200,
  "captainAgreementAccepted": true,
  "members": [
    { "displayName": "PlayerTwo", "mmr": 3500 },
    { "displayName": "PlayerThree", "mmr": 2800 }
  ]
}
```

### Discord registration experience

The bot should use a short guided interaction rather than asking captains to prepare a full five-player roster up front:

1. `/register` offers open tournaments with start date and remaining capacity. If none are open, explain that clearly and point users to announcements.
2. The captain chooses **Create a team** or **Manage my team**. A modal collects team name, captain's Dota name, and MMR. Discord account identity supplies the captain's Discord ID and display name; a clear agreement card asks the captain to accept before saving.
3. Ask whether the other players are in the server. Let captains select members who are present, or add a teammate by Dota name and MMR without a Discord account. Show the roster as `2/5` and mark unlinked entries so the captain can link them when those players join.
4. Show a review card with tournament, team, roster, MMRs, and agreement; offer **Register team**, **Keep recruiting**, and **Edit roster**. Both register and keep recruiting create a team record, so the captain can finish later.
5. After registering, show a confirmation with registration status, roster count, and buttons to edit, add/remove teammates, or view registration. `/team` should reopen the captain's team using `GET /api/discord/teams/mine`.

The bot sends `actorDiscordId` on captain edits, roster changes, and registration. Keep `ADMIN_API_KEY` only in the bot/API server configuration. To add a member call the members route with `{ "actorDiscordId": "...", "displayName": "...", "mmr": 2500 }`; omitted `discordId` is an unlinked teammate. Register with `POST /api/discord/teams/:id/registrations` and `{ "actorDiscordId": "...", "tournamentId": 1 }`. Return API validation and conflict messages in plain language, and preserve the captain's form values when allowing a retry.

The legacy admin endpoint's example team payload remains:

```json
{
  "name": "Ancient Stack",
  "captainDiscordName": "farid#1234",
  "captainAgreementAccepted": true,
  "members": [
    { "displayName": "PlayerOne", "mmr": 4200, "isCaptain": true },
    { "displayName": "PlayerTwo", "mmr": 3500 },
    { "displayName": "PlayerThree", "mmr": 2800 },
    { "displayName": "PlayerFour", "mmr": 3100 },
    { "displayName": "PlayerFive", "mmr": 2500 }
  ]
}
```

Keep the API key on a trusted server or bot. Do not put it in browser code; public website writes need a user authentication flow or a server-side form handler before enabling registration from the page.

The captain agreement records acceptance of team participation and organization responsibilities, tournament rules and fair-play MMR cap, a non-toxic environment, and communication with organizers.

Logo upload example:

```bash
curl -X PUT http://localhost:3000/api/teams/1/logo \
  -H "X-API-Key: your-admin-api-key" \
  -F "logo=@team-logo.png"
```

## Deploy on an Ubuntu Droplet

Replace `example.com` with your domain in the Nginx configuration and Certbot command below. The Cloudflare `@` and `www` A records should point to the Droplet IPv4, and remain **DNS only** while issuing the certificate. Allow inbound TCP ports 80 and 443 in the Droplet firewall.

```bash
sudo apt update
sudo apt install -y nginx git
sudo git clone https://github.com/FaridFehresti/ProNoobs.git /var/www/pronoobs
```

Configure Nginx for the domain:

```bash
sudo tee /etc/nginx/sites-available/pronoobs >/dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    root /var/www/pronoobs;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/pronoobs /etc/nginx/sites-enabled/pronoobs
sudo nginx -t && sudo systemctl reload nginx
```

After `http://example.com` loads, install a free Let's Encrypt certificate with Certbot:

```bash
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/local/bin/certbot
sudo certbot --nginx -d example.com -d www.example.com
sudo certbot renew --dry-run
```

To publish an update later:

```bash
cd /var/www/pronoobs
sudo git pull
```
