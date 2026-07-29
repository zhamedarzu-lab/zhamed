# Personal Tracker

Finance, Fitness, and Journal — three independent books, single user, no login.

Built to the spec in the original README. See **[SETUP.md](./SETUP.md)** to run it.

## Stack

React + Vite · Express · PostgreSQL + Drizzle · Zod · Replit Object Storage

## Layout

```
shared/schema.ts      Drizzle tables — the nine models from the spec
shared/validation.ts  Zod schemas, shared by every route
server/index.ts       Express + Vite middleware, one port
server/routes/        finance.ts · fitness.ts · journal.ts
server/storage.ts     image storage adapter (Replit or local disk)
server/seed.ts        first-run bill template + debt accounts
client/src/pages/     Home · finance/* · Fitness · Journal · JournalDay
client/src/styles.css the whole design system
```

## Design notes

The interface is modeled on an accounting pad: pale green stock, ruled rows,
figures set in a mono face with tabular numerals so columns line up. Red is
reserved strictly for money moving the wrong way — debt balances,
over-allocation, bill shortfalls. Nothing else is allowed to use it.

The signature element is the **allocation tape** on the paycheck editor. A
deposit arrives as one solid bar and visibly drains as you assign it to bills,
debt, and the credit dump. The remainder is the largest number on the screen,
because it's the only figure you actually have to make a decision about.
