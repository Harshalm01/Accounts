# Influencer Database - Real-Time System

## ✨ Features

- **Beautiful UI** with gradient design and smooth animations
- **Real-time updates** - See changes instantly across all browsers using Socket.io
- **Full CRUD operations** - Create, Read, Update, Delete influencers
- **Smart search** - Filter by name, genre, or location
- **Direct Instagram links** - Click to open influencer profiles
- **Responsive design** - Works on all screen sizes

## 🚀 How to Run

### 1. Start the Backend (Already Running ✅)
```bash
cd backend
npm run dev
```
Backend runs on: http://localhost:3000

### 2. Start the Frontend

**Option A: Fix dependencies first (recommended)**
```bash
# Run this from the root folder (d:\3FM)
fix-frontend.bat

# Then start the server
cd frontend
npm run dev
```

**Option B: Manual fix**
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

Frontend will run on: http://localhost:5173

## 📋 API Endpoints

### Influencers
- `GET /api/influencers` - Get all influencers
- `GET /api/influencers/:id` - Get one influencer
- `POST /api/influencers` - Create influencer
- `PUT /api/influencers/:id` - Update influencer
- `DELETE /api/influencers/:id` - Delete influencer

### Socket.io Events
- `influencer:created` - New influencer added
- `influencer:updated` - Influencer updated
- `influencer:deleted` - Influencer deleted

## 🎨 UI Components

### Main Dashboard
- Header with search bar
- "Add Influencer" button
- Data table with all influencers
- Action buttons (Edit, Delete)

### Add/Edit Modal
- Form with all influencer fields
- Validation
- Save/Cancel buttons

## 💾 Database Schema

```prisma
model Influencer {
  id            String   @id @default(uuid())
  srNo          Int      @unique
  name          String
  igLink        String
  followers     String
  avgViews      String?
  genre         String
  contact       String
  commercials   String
  location      String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

## 🔄 Real-Time Sync

The system uses Socket.io to provide real-time updates:

1. User A adds a new influencer
2. Backend saves to database
3. Backend emits `influencer:created` event
4. All connected clients (including User B, C, etc.) receive the update
5. UI updates automatically without refresh!

This works for create, update, and delete operations.

## 🎯 Next Steps

1. Run `fix-frontend.bat` to fix dependencies
2. Start frontend with `npm run dev`
3. Open http://localhost:5173 in multiple browser windows
4. Try adding/editing/deleting influencers
5. Watch the real-time sync in action!

## 📱 Test Real-Time Sync

1. Open http://localhost:5173 in Chrome
2. Open http://localhost:5173 in another browser/tab
3. In one window, click "Add Influencer" and create a new one
4. Watch it appear instantly in the other window! ✨

Enjoy your real-time influencer management system! 🎉
