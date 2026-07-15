## 📊 3FM Database Setup Guide

### Project: 3FM Full-Stack Application
**Database System**: PostgreSQL + Prisma ORM

---

## 📋 Database Overview

### Technology Stack
- **Primary Database**: PostgreSQL
- **ORM**: Prisma (TypeScript)
- **Node.js Version**: 18+

### Database Schema (13 Main Models)

#### 1. **User** (Core)
- Account management for ADMIN, BRAND, AGENCY, EMPLOYEE roles
- Login tracking and authentication
- Relationships: Manages campaigns, brands, pitches, assignments

#### 2. **LoginHistory**
- Tracks login attempts with timestamp, IP address, user agent
- Linked to User records with cascade delete

#### 3. **Influencer**
- Contains influencer profile data (name, Instagram stats, location, genre)
- Stores contact info and commercial details as JSON
- Many-to-many relationship with campaigns

#### 4. **Brand**
- Brand information and contact person
- Linked to User accounts for BRAND role users
- Receives pitches from agencies

#### 5. **Campaign**
- Core business entity for influencer marketing campaigns
- Stores budget, timeline, brief, and status
- Tracks internal/external costs
- Linked to User (agency owner)

#### 6. **CampaignInfluencer**
- Junction table: Many-to-many between Campaign and Influencer
- Stores live links and invoice details

#### 7. **Roaster**
- File upload tracking for monthly roaster spreadsheets
- Stores file data and metadata

#### 8. **Pitch**
- Agency pitches to brands for campaigns
- Status tracking: DRAFT → SENT → UNDER_REVIEW → ACCEPTED/REJECTED
- Includes proposal details and timeline

#### 9. **CampaignAssignment**
- Assignments of campaigns to team heads
- Status: PENDING → ACCEPTED/REJECTED
- Linked to both assigner and assignee

#### 10. **AssignmentMessage**
- Real-time chat/messages within assignments
- Read status tracking
- Uses Socket.io for live updates

#### 11. **CampaignStatusUpdate**
- Timeline of status changes for campaigns
- User role-based updates (AGENCY/EMPLOYEE)

---

## 🔧 Setup Instructions

### Step 1: Prerequisites Checklist

- [ ] Node.js 18+ installed
  ```powershell
  node --version  # Should show v18+
  ```
- [ ] PostgreSQL installed and running
  ```powershell
  # Check if PostgreSQL service is running
  Get-Service | Where-Object {$_.Name -like "*postgres*"}
  ```
- [ ] npm installed (comes with Node.js)
- [ ] VS Code or any code editor

### Step 2: PostgreSQL Database Setup

#### Option A: Using Default PostgreSQL Setup (Windows)

1. **Install PostgreSQL** (if not already):
   - Download from: https://www.postgresql.org/download/windows/
   - During installation, set password for `postgres` user
   - Default port: 5432

2. **Create Database**:
   ```powershell
   # Open PowerShell as Administrator
   # Connect to PostgreSQL
   psql -U postgres
   
   # In psql prompt:
   CREATE DATABASE 3fm_db;
   \q  # exit psql
   ```

#### Option B: Using pgAdmin GUI

1. Open **pgAdmin** (comes with PostgreSQL)
2. Right-click "Databases" → "Create" → "Database"
3. Name: `3fm_db`
4. Click "Save"

### Step 3: Update Environment Variables

Edit `backend/.env`:

```env
# Example with your PostgreSQL credentials
DATABASE_URL="postgresql://postgres:YourPassword@localhost:5432/3fm_db?schema=public"
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
PORT=3000
NODE_ENV="development"
```

**Replace** `YourPassword` with the password you set during PostgreSQL installation.

### Step 4: Generate Prisma Client

```powershell
cd backend
npm run prisma:generate
```

Expected output:
```
✔ Generated Prisma Client (v5.22.0) to .\node_modules\@prisma\client
```

### Step 5: Run Database Migrations

This creates all tables based on the Prisma schema:

```powershell
cd backend
npm run prisma:migrate
```

First time will prompt:
```
✔ Enter a name for the new migration: › init
```

This will:
- Create `prisma/migrations/[timestamp]_init/migration.sql`
- Create all 13 tables in the database
- Set up all relationships and constraints

### Step 6: Verify Database Setup

#### Option A: Using Prisma Studio (GUI)

```powershell
cd backend
npx prisma studio
```

Opens at: http://localhost:5555
Shows all tables visually

#### Option B: Using pgAdmin

1. Connect to PostgreSQL in pgAdmin
2. Navigate to: Databases → 3fm_db → Schemas → public → Tables
3. Should see all 13 tables

#### Option C: Query Database

```powershell
psql -U postgres -d 3fm_db

# In psql:
\dt  # List all tables
SELECT * FROM "public"."User";  # Query users
\q   # Exit
```

### Step 7: (Optional) Seed Test Data

Run test setup script:

```powershell
cd backend
node setup-test-data.js
```

This adds:
- 1 test brand
- 1 test campaign

---

## ✅ Verification Checklist

After completing setup, verify:

- [x] `backend/.env` file exists with valid DATABASE_URL
- [x] Prisma client generated (see `node_modules/@prisma/client`)
- [x] Database `3fm_db` exists in PostgreSQL
- [x] All 13 tables created in public schema:
  - `User`
  - `LoginHistory`
  - `Influencer`
  - `Brand`
  - `Campaign`
  - `CampaignInfluencer`
  - `Roaster`
  - `Pitch`
  - `CampaignAssignment`
  - `AssignmentMessage`
  - `CampaignStatusUpdate`
  - (other enum values and indices)

---

## 🚀 Running the Application

### Terminal 1 - Backend:
```powershell
cd backend
npm run dev
```
Runs on: http://localhost:3000

### Terminal 2 - Frontend:
```powershell
cd frontend
npm run dev
```
Runs on: http://localhost:5173

### View Full Stack:
```powershell
# From root directory
npm run dev
```

---

## 🐛 Common Issues & Solutions

### Issue 1: "Authentication failed"
**Cause**: Wrong PostgreSQL credentials in `.env`

**Solution**:
1. Verify PostgreSQL password
2. Update `DATABASE_URL` in `backend/.env`
3. Test connection: `psql -U postgres -d 3fm_db`

### Issue 2: "Database 3fm_db does not exist"
**Cause**: Database not created

**Solution**:
```powershell
psql -U postgres
CREATE DATABASE 3fm_db;
\q
```

### Issue 3: "Port 5432 already in use"
**Cause**: PostgreSQL instance already running on that port

**Solution**:
1. Change port in `backend/.env`: `DATABASE_URL="...@localhost:5433/..."`
2. Or stop conflicting PostgreSQL service

### Issue 4: "Prisma migration error"
**Cause**: Schema issue or database connectivity

**Solution**:
```powershell
# Reset and try again
cd backend
npm run prisma:generate
npm run prisma:migrate
```

---

## 📚 Project Files Referenced

- **Schema**: `backend/prisma/schema.prisma` (13 models defined)
- **Migrations**: `backend/prisma/migrations/` (created after first sync)
- **Config**: `backend/.env` (edit with your credentials)
- **Client Generator**: `package.json` (has prisma scripts)

---

## 🔗 Useful Commands

| Command | Purpose |
|---------|---------|
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Create/update database schema |
| `npx prisma studio` | Open Prisma Studio GUI |
| `npx prisma db push` | Sync schema to database |
| `npx prisma db seed` | Run seed script (if configured) |

---

## ✨ Next Steps

1. Complete the 7 setup steps above
2. Run `npm run dev` in root to start both servers
3. Open http://localhost:5173
4. Test authentication, create campaigns, manage influencers
5. Monitor real-time updates via Socket.io

---

**Database Setup by**: GitHub Copilot
**Last Updated**: February 20, 2026
**For Project**: 3FM Tech Stack Phase 6
