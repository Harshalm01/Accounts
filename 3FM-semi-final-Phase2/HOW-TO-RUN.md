    # 🚀 How to Run Your 3FM Application

## Quick Start (Recommended)

### Option 1: Run Servers Separately

**Terminal 1 - Backend:**
```bash
cd d:\3FM\backend
npm run dev
```
Backend will run on: http://localhost:3000

**Terminal 2 - Frontend:**
```bash
cd d:\3FM\frontend
npm run dev
```
Frontend will run on: http://localhost:5173

### Option 2: Run from VS Code

1. Open **2 terminals** in VS Code
2. In Terminal 1: `cd backend` then `npm run dev`
3. In Terminal 2: `cd frontend` then `npm run dev`

## ✅ What to Check

Open http://localhost:5173 in your browser - you should see:
- Beautiful gradient influencer dashboard
- 50 influencers already loaded from your CSV
- Search bar to filter influencers
- Add/Edit/Delete buttons

## 🔄 Real-Time Test

1. Open http://localhost:5173 in **Chrome**
2. Open http://localhost:5173 in **another browser** (Edge, Firefox, etc.)
3. Click "Add Influencer" in one browser
4. Watch it appear instantly in the other browser! ✨

## 🐛 Troubleshooting

### If Backend Won't Start:
```bash
cd d:\3FM
npx prisma generate --schema=backend/prisma/schema.prisma
cd backend
npm run dev
```

### If Frontend Shows Errors:
```bash
cd d:\3FM\frontend
npm install
npm run dev
```

### If Database Connection Fails:
Make sure PostgreSQL is running and check `backend/.env` for correct DATABASE_URL

## 📊 View Database

To view/edit database directly:
```bash
cd d:\3FM\backend
npx prisma studio
```
Opens at: http://localhost:5555

## 🎯 Features to Try

1. **Search** - Type in search bar to filter by name, genre, location
2. **Add** - Click "Add Influencer" button
3. **Edit** - Click pencil icon on any row
4. **Delete** - Click trash icon (with confirmation)
5. **Instagram Links** - Click the Instagram icon to open their profile
6. **Real-time** - Open multiple browser tabs and watch live updates!

Enjoy your real-time influencer management system! 🎉
