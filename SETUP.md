# Setup

## On Replit

1. Import this repo from GitHub (**Create Repl → Import from GitHub**).
2. Open the **Database** tool in the sidebar and create a PostgreSQL database.
   Replit sets `DATABASE_URL` for you.
3. Add the Object Storage tool if you want journal photos synced across devices.
   Without it, photos fall back to a local `uploads/` folder, which doesn't
   survive a Repl reset.
4. In the Shell:
   ```
   npm install
   npm run db:push
   ```
5. Hit **Run**. The app serves on port 5000 — API and client share one origin.

## Anywhere else

```
cp .env.example .env      # fill in DATABASE_URL
npm install
npm run db:push
npm run dev               # http://localhost:5000
```

`STORAGE_DRIVER=local` keeps journal images in `./uploads`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Express + Vite middleware, hot reload, one port |
| `npm run build` | Builds the client to `dist/public` |
| `npm start` | Production: Express serves the built client |
| `npm run db:push` | Pushes the Drizzle schema to Postgres |
| `npm run db:studio` | Opens Drizzle Studio to browse the data |
| `npm run typecheck` | `tsc --noEmit` |

## Keeping GitHub in the middle

Replit's Git pane pushes and pulls from the same repo, so the loop is:
work in Replit → commit → push to GitHub → pull down anywhere else. Nothing
in this project is Replit-specific except the Object Storage driver, which
degrades gracefully.

## First run

The database seeds itself once, and only if the tables are empty:

- the ten bills from the spec's template
- four debt accounts (Credit Card A, Credit Card B, Cash App, Afterpay)

Everything is editable in the app afterwards. Delete what you don't need.

## API surface

```
GET    /api/health

GET    /api/finance/paychecks            ?from=&to=
GET    /api/finance/paychecks/last       powers "repeat last structure"
POST   /api/finance/paychecks            creates paycheck + allocations
PATCH  /api/finance/paychecks/:id        replaces allocations wholesale
DELETE /api/finance/paychecks/:id

GET    /api/finance/bills
POST   /api/finance/bills
PATCH  /api/finance/bills/:id
DELETE /api/finance/bills/:id
GET    /api/finance/bill-payments        ?month=YYYY-MM
PUT    /api/finance/bill-payments        upsert, one row per bill per month

GET    /api/finance/debt-accounts        includes latest balance
POST   /api/finance/debt-accounts
PATCH  /api/finance/debt-accounts/:id
DELETE /api/finance/debt-accounts/:id
GET    /api/finance/debt-snapshots       ?accountId=
POST   /api/finance/debt-snapshots
GET    /api/finance/debt/trend           aggregate owed over time

GET    /api/finance/summary/:month       monthly roll-up
GET    /api/finance/months

GET    /api/fitness/logs                 ?from=&to=&tag=&limit=
GET    /api/fitness/types
POST   /api/fitness/logs
PATCH  /api/fitness/logs/:id
DELETE /api/fitness/logs/:id

GET    /api/journal/month/:month         calendar marks
GET    /api/journal/entries              recent entries, for the dashboard
GET    /api/journal/entries/:date         blank entry if the day is empty
PUT    /api/journal/entries/:date
POST   /api/journal/entries/:date/images multipart, field name "images"
GET    /api/journal/images/:id/raw
DELETE /api/journal/images/:id
```
