# 🚀 Getting Started with 3FM - Quick Setup

**⏱️ Estimated setup time: 15 minutes**

---

## What is 3FM?

A full-stack **Influencer Marketing Management System** with:
- 💼 Campaign management for brands and agencies
- 👥 Influencer database with social metrics
- 💬 Real-time messaging via Socket.io
- 🔐 JWT-based authentication
- 📊 Pitch tracking and assignments

---

## ⚡ 5-Minute Quick Start

### Prerequisites
- ✓ Node.js 18+ (already have it)
- ✓ PostgreSQL 18 (already installed at C:\Program Files\PostgreSQL\18)
- ✓ npm (comes with Node.js)

### Step 1: Set PostgreSQL Password (2 min)

Edit `backend/.env` and replace the password:

```env
# Current:
DATABASE_URL="postgresql://postgres@localhost:5432/3fm_db?schema=public"

# Update to:
DATABASE_URL="postgresql://postgres:YOUR_ACTUAL_PASSWORD@localhost:5432/3fm_db?schema=public"
```

**Don't know your PostgreSQL password?**  
→ See: `POSTGRESQL_SETUP.md` (section: Reset PostgreSQL Password)

### Step 2: Create Database (1 min)

```powershell
cd backend
npm run prisma:migrate
```

When prompted: Type `init` and press Enter

✅ Database created with all tables!

### Step 3: Start Servers (2 min)

**Terminal 1 - Backend**
```powershell
cd backend
npm run dev
```

**Terminal 2 - Frontend**  
```powershell
cd frontend
npm run dev
```

### Step 4: Open in Browser (< 1 min)

Go to: **http://localhost:5173**

🎉 You should see the Influencer Dashboard!

---

## 🧪 Test It Out

1. **Register** a new user (email & password)
2. **Create Campaign** - Click "New Campaign"
3. **Add Influencers** - Select from database
4. **Open Multiple Tabs** - See real-time updates! ✨

---

## 📚 Detailed Guides

**Still stuck on PostgreSQL?**  
→ [POSTGRESQL_SETUP.md](POSTGRESQL_SETUP.md) - Full troubleshooting

**Want to understand the architecture?**  
→ [PROJECT_ANALYSIS_REPORT.md](PROJECT_ANALYSIS_REPORT.md) - Complete breakdown

**Need database details?**  
→ [DATABASE_SETUP.md](DATABASE_SETUP.md) - Schema & models

---

## 🔧 Available Commands

### Backend
```powershell
npm run dev              # Start development server
npm run build            # Compile TypeScript
npm run start            # Run compiled server
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Create/update database
npm run seed:heads       # Seed test data
```

### Frontend
```powershell
npm run dev              # Start dev server (Vite)
npm run build            # Build for production
npm run preview          # Preview production build
```

### Root (Both)
```powershell
npm run dev              # Start both servers concurrently
npm run dev:backend      # Backend only
npm run dev:frontend     # Frontend only
```

---

## 📊 View Database

### Option A: Prisma Studio (Recommended)
```powershell
cd backend
npx prisma studio
```
Opens GUI at: http://localhost:5555

### Option B: Query Directly
```powershell
# Add PostgreSQL to PATH
$env:Path += ";C:\Program Files\PostgreSQL\18\bin"

# Connect to database
psql -U postgres -d 3fm_db -h localhost

# List tables
\dt

# View users
SELECT * FROM "public"."User";

# Exit
\q
```

---

## 🐛 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| "Authentication failed" | Update password in `backend/.env` |
| "Port 3000 in use" | Change PORT in `backend/.env` |
| "Port 5173 in use" | Change port in `frontend/vite.config.ts` |
| "Cannot find module" | Run `npm install` in that directory |
| "Prisma error" | Run `npm run prisma:generate` in backend |

---

## 📁 Important Files

| File | Purpose |
|------|---------|
| `backend/.env` | Database credentials & settings |
| `frontend/.env` | API endpoints |
| `backend/prisma/schema.prisma` | Database schema (13 models) |
| `backend/src/index.ts` | Server entry point |
| `frontend/src/main.tsx` | React entry point |

---

## 🎓 Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    BROWSER (Port 5173)                    │
│  React Components + Socket.io Client                      │
│  ├─ Dashboard (Influencers)                               │
│  ├─ Campaigns                                             │
│  ├─ Brands                                                │
│  ├─ Pitches                                               │
│  └─ Real-time Chat                                        │
└──────────────────┬───────────────────────────────────────┘
                   │ REST API + WebSocket
                   ↓
┌──────────────────────────────────────────────────────────┐
│              NODE.JS SERVER (Port 3000)                   │
│  Express + Socket.io                                      │
│  ├─ /api/auth (Register, Login)                           │
│  ├─ /api/campaigns                                        │
│  ├─ /api/influencers                                      │
│  ├─ /api/brands                                           │
│  ├─ /api/pitches                                          │
│  └─ WebSocket Events (Real-time Updates)                  │
└──────────────────┬───────────────────────────────────────┘
                   │ Prisma ORM
                   ↓
┌──────────────────────────────────────────────────────────┐
│         PostgreSQL DATABASE (Port 5432)                   │
│  ├─ 13 Tables with Relationships                          │
│  ├─ Users (with roles: ADMIN, BRAND, AGENCY, EMPLOYEE)   │
│  ├─ Campaigns & Influencers                               │
│  ├─ Pitches & Assignments                                 │
│  └─ Real-time Status Updates                              │
└──────────────────────────────────────────────────────────┘
```

---

## 🔐 User Roles

1. **ADMIN** - Full system access
2. **BRAND** - Can view campaigns, receive pitches
3. **AGENCY** - Can view campaigns, send pitches  
4. **EMPLOYEE** - Can view assigned campaigns

---

## ✨ Key Features

- ✅ JWT-based authentication
- ✅ Real-time Socket.io updates
- ✅ Campaign management with timeline
- ✅ Influencer database with metrics
- ✅ Pitch workflow (Draft → Sent → Review → Accept/Reject)
- ✅ Team assignments & messaging
- ✅ File upload tracking
- ✅ Login history audit trail

---

## 📞 Need Help?

1. Check the troubleshooting guide: `POSTGRESQL_SETUP.md`
2. Review the full analysis: `PROJECT_ANALYSIS_REPORT.md`
3. See database details: `DATABASE_SETUP.md`
4. Check existing docs: `README.md`, `QUICKSTART.md`

---

## 🎉 You're All Set!

You should now have:
- ✅ PostgreSQL database running
- ✅ Prisma client generated
- ✅ Environment variables configured
- ✅ Both servers ready to launch
- ✅ Database tables created

**Next: Start the servers and enjoy the app!**

---

*Let's build something amazing with 3FM! 🚀*

---

**Still having issues?**

→ Edit `backend/.env` and make sure the password is **exactly** correct  
→ Run `npm run prisma:migrate` and watch for detailed error messages  
→ Check PostgreSQL service: `Get-Service postgresql-x64-18`  
→ See: `POSTGRESQL_SETUP.md` for advanced troubleshooting
