# 3FM Database Setup - Quick Reference Card

## 🎯 What Needs to Be Done

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Update Database Password                           │
│  ─────────────────────────────────────────────────────────  │
│  File: backend/.env                                          │
│  Change PASSWORD to your PostgreSQL password:                │
│  DATABASE_URL="...@localhost:5432/3fm_db"                    │
│                                ^^^^^^^^^                     │
│                         Your password here                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  STEP 2: Create Database (1 minute)                          │
│  ─────────────────────────────────────────────────────────  │
│  cd backend                                                  │
│  npm run prisma:migrate                                      │
│  Type: init (when prompted)                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  STEP 3: Start Servers (2 terminals)                         │
│  ─────────────────────────────────────────────────────────  │
│  Terminal 1:              Terminal 2:                        │
│  cd backend               cd frontend                        │
│  npm run dev              npm run dev                        │
│                                                              │
│  Watch for: "Server running" messages                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  STEP 4: Open in Browser                                     │
│  ─────────────────────────────────────────────────────────  │
│  http://localhost:5173                                       │
│                                                              │
│  You should see: Influencer Dashboard                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Database Models (11 Tables)

| Model | Purpose | Key Fields |
|-------|---------|-----------|
| **User** | Accounts & auth | email, password, role |
| **LoginHistory** | Audit trail | userId, ipAddress, status |
| **Influencer** | Profiles | igLink, followers, primaryGenre |
| **Brand** | Clients | name, contactPerson |
| **Campaign** | Projects | name, budget, status, startDate |
| **CampaignInfluencer** | Influencer<br/>assignments | campaignId, influencerId |
| **Pitch** | Proposals | campaignId, brandId, status |
| **CampaignAssignment** | Team tasks | campaignId, headId |
| **AssignmentMessage** | Real-time chat | assignmentId, senderId |
| **CampaignStatusUpdate** | Timeline | campaignId, userId, content |
| **Roaster** | File uploads | month, fileName, fileData |

---

## 🔧 Key Commands

```powershell
# MOST IMPORTANT COMMANDS
npm run prisma:migrate         → Create database (DO THIS FIRST!)
npm run dev                    → Start both servers
npx prisma studio             → View database GUI

# Other useful commands
npm run prisma:generate        → Update Prisma client
npm run dev:backend            → Backend only
npm run dev:frontend           → Frontend only
npm run build                  → Build for production

# PostgreSQL (if needed)
psql -U postgres -h localhost -d 3fm_db
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Auth error | Update password in `backend/.env` |
| Port already in use | Change PORT in `.env` or kill process |
| Cannot find module | Run `npm install` in that directory |
| Prisma error | Run `npm run prisma:generate` |
| Database error | Check CONNECTION error in error message |

---

## 📁 Important Files

```
backend/.env              ← Edit this with PostgreSQL password
frontend/.env             ← API endpoints (already configured)
prisma/schema.prisma      ← Database schema (don't edit)
```

---

## 🚀 Standard Startup Process

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend (new terminal)
cd frontend
npm run dev

# Browser
Open http://localhost:5173
```

---

## 💾 Database Info

- **Type**: PostgreSQL
- **Port**: 5432 (default)
- **Database**: 3fm_db
- **User**: postgres
- **Tables**: 11 core models
- **ORM**: Prisma

---

## 📞 Help Resources

1. **Quick Setup**: `GETTING_STARTED.md`
2. **PostgreSQL Help**: `POSTGRESQL_SETUP.md`
3. **Full Details**: `DATABASE_SETUP.md`
4. **Architecture**: `PROJECT_ANALYSIS_REPORT.md`

---

## ✨ Features After Setup

- ✅ User authentication (register/login)
- ✅ Campaign management
- ✅ Influencer database
- ✅ Real-time chat (Socket.io)
- ✅ Pitch workflow
- ✅ Team assignments
- ✅ File uploads

---

## 🎯 Success Checklist

- [ ] Updated `backend/.env` with PostgreSQL password
- [ ] Ran `npm run prisma:migrate` successfully
- [ ] Backend started (`npm run dev`)
- [ ] Frontend started (`npm run dev`)
- [ ] Opened http://localhost:5173 in browser
- [ ] Can see the dashoard
- [ ] Can register a user
- [ ] Can create a campaign

---

## ⚡ 5-Minute Setup Timeline

| Time | Task |
|------|------|
| 0:00 | Update `backend/.env` |
| 1:00 | Run `npm run prisma:migrate` |
| 2:00 | Start backend: `npm run dev` |
| 3:00 | Start frontend: `npm run dev` |
| 4:00 | Open http://localhost:5173 |
| 5:00 | Test the app! |

---

## 📋 Don't Forget

✋ **STOP if you see this error:**
```
P1000: Authentication failed against database server at `localhost`
```
→ This means the password is WRONG
→ Edit `backend/.env` and fix the password
→ See: `POSTGRESQL_SETUP.md` if you don't know the password

---

**Ready? Start with Step 1 above! 🚀**
