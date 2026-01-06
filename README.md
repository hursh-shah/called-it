# Council Market

A credits-only, small-group prediction market using an LMSR automated market maker (AMM).

## Features (current MVP)

- Invite-token login (no OAuth)
- Monthly credit allowance (default: 100 credits/month)
- Admin-only market creation & resolution
- LMSR trading (buy by credits, buy/sell by shares)
- Positions, trades, and a simple ledger (audit trail)

## Local setup

### 1) Install dependencies

```bash
npm install
```

### 2) Create a Postgres DB

You need a Postgres database and a `DATABASE_URL`.

Example local URL:

```
postgres://postgres:postgres@localhost:5432/council_market
```

### 3) Configure env vars

Copy `.env.example` to `.env.local` and fill in values:

```bash
cp .env.example .env.local
```

Required:

- `DATABASE_URL`
- `INVITE_TOKEN` (for normal users)
- `ADMIN_INVITE_TOKEN` (for you)

### 4) Run migrations

```bash
npm run migrate
```

### 5) Start the app

```bash
npm run dev
```

Open `http://localhost:3000`.

## Usage

- Admin login: visit `/login?token=ADMIN_INVITE_TOKEN_VALUE` and choose a username.
- User login: share `/login?token=INVITE_TOKEN_VALUE`.
- Create markets: `/admin`
- Trade: `/markets/:id`

## Notes

- Credits are stored as cents in the DB (`balance_cents`, `cost_cents`, etc.).
- Market liquidity is controlled by `b` (bigger `b` = less price impact per trade).
- Trading closes automatically once `closes_at` is reached (even if `status` is still `OPEN`).

