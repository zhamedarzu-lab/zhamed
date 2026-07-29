# README.md: Personal Tracker App (Finance, Fitness & Journal)

A clean, modular personal tracking application built for manual entry, structured around three main independent modules: **Finance**, **Fitness**, and **Journal**. 

---

## 1. App Architecture & Navigation

* **Home Page (`/`)**: 
  * Features a clean dashboard with three primary, distinct navigation cards/buttons:
    1. **Finance** (Leads to `/finance`)
    2. **Fitness** (Leads to `/fitness`)
    3. **Journal** (Leads to `/journal`)
* **Module Isolation**: The Finance, Fitness, and Journal sections are completely separate views/modules, keeping your workflows focused and organized.

---

## 2. Finance Module (`/finance`)

Designed for a **biweekly pay cycle** with manual entry controls, allowing both a detailed paycheck-by-paycheck breakdown and an aggregated monthly summary.

### Core Workflow & Logic
When a paycheck arrives, you manually input the numbers and allocate funds following your custom priority waterfall:
1. **Income Entry**: Record the paycheck amount tied to a specific date.
2. **Monthly Expenses**: Allocate funds toward bills and fixed costs.
3. **Debt Repayment / Borrowed Funds**: Allocate money to pay back borrowed balances (e.g., Cash App, Afterpay).
4. **Credit Dump (Leftover)**: Whatever surplus is left over gets manually dumped onto credit card payments.

### Integrated Bill Breakdown Template
The app should include a reference or template tracker for your recurring monthly bills, mirroring your baseline breakdown:
* **Rent**: $850
* **Credit Cards (A/B)**: $200
* **Power**: $130
* **Subscriptions**: $200
* **Web**: $120
* **Student Loans**: $150
* **Phone**: $120
* **Car Insurance**: $80
* **Storage Unit**: $0
* **Subtotals & Splits**: Tracks the split structure ($750 + $1,850 or alternative round $2,000 monthly target for 1/2 and 2/2 bill splits).

### Enhanced Features & Friction Reducers
* **Quick-Template Paycheck Entries**: A *"Repeat Last Paycheck Structure"* button to pre-load your standard split.
* **Live "Surplus / Leftover" Calculator Helper**: A running math bar as you type allocations ($Total - Expenses - Debt = Remaining$) with a one-click action to assign the exact remainder straight to your credit card dump.
* **Debt Payoff Tracker**: A dedicated visual view to watch balances trend downward paycheck-by-paycheck for Cash App, Afterpay, and credit cards.
* **Custom Tags & One-Off Notes**: Field tags for unique entries (e.g., *"Neo from Vince"*, *"Traffic tickets"*, *"Steam Deck"*).

### Data Structure & Fields
* **Paycheck Record (`Paycheck`)**:
  * `id` (UUID / Auto-increment)
  * `pay_date` (Date)
  * `amount` (Decimal / Float)
  * `allocation_type` (Enum/Tag: e.g., "Paycheck 1 of Month", "Paycheck 2 of Month")
* **Allocation Ledger (`Allocation`)**:
  * `paycheck_id` (Foreign Key)
  * `category` (Enum: `Bills / Expenses`, `Cash App / Afterpay Borrow`, `Credit Card Debt`, `Surplus / Spend`)
  * `amount` (Decimal / Float)
  * `notes` (String, optional)

### Views & Reporting
* **Biweekly View**: A chronological log of every individual paycheck entry and its manual breakdown.
* **Monthly Summary View**: An aggregated roll-up combining both paychecks of a given month.

---

## 3. Fitness Module (`/fitness`)

A completely independent section dedicated to logging workouts, physical activity, and progress metrics.

* **Dashboard (`/fitness`)**: Quick summary of recent activity logs.
* **Manual Entry Log**: Simple forms to record workout types, duration, intensity, or custom fitness milestones.

---

## 4. Journal Module (`/journal`)

A central place for daily notes, event tracking, and visual logs.

* **Calendar View**: An interactive calendar interface to view days at a glance, click on specific dates, and track events or daily entries over time.
* **Daily Entry & Picture Input**: 
  * Text area for journaling notes, thoughts, or daily logs.
  * Image upload/attachment support (to snap or upload pictures to keep track of items, receipts, gear, or daily milestones just in case).

---

## 5. Tech Stack & Setup (Vibecoding Instructions)

* **Frontend/Backend**: [Insert your preferred stack here, e.g., Next.js, React + Node, or Python/Streamlit]
* **Database**: Lightweight local database (e.g., SQLite or PostgreSQL) with media storage handling for journal picture inputs.

### Quickstart Prompts for AI Code Generation
* *"Create the Home page with three distinct navigation cards for Finance, Fitness, and Journal."*
* *"Build the Finance module schema and manual entry form supporting biweekly paychecks, expense allocations, debt repayments, and credit card dumps, including the recurring bill template breakdown."*
* *"Build the Journal module featuring an interactive calendar, daily text entries, and picture upload capability."*