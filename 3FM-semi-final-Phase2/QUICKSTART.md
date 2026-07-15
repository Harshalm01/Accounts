# Quick Start Guide

## Prerequisites

Before starting, ensure you have:
- Node.js 18+ installed
- PostgreSQL database running

## Setup Steps

### 1. Configure Environment Variables

**Backend:**
```bash
cd Backend
cp .env.example .env
```

Edit `backend/.env` with your database credentials:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/mydb?schema=public"
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
PORT=3000
```

**Frontend (optional):**
```bash
cd Frontend
cp .env.example .env
```

### 2. Initialize Database

```bash
cd Backend
npm run prisma:generate
npm run prisma:migrate
```

The migrate command will prompt you to create an initial migration. Accept and provide a name (e.g., "init").

### 3. Start Development

From the **root directory** (`c:\3FM`):

```bash
npm run dev
```

This starts both:
- Frontend at http://localhost:5173
- Backend at http://localhost:3000

### 4. Test the App

1. Open http://localhost:5173 in your browser
2. Register a new user with email and password
3. After registration, you'll be automatically logged in
4. Test real-time chat by opening multiple browser tabs
5. Messages sent from one tab appear instantly in others

## Project Features

✅ **Authentication**: JWT-based register/login/me endpoints  
✅ **Real-time**: Socket.io WebSocket connection  
✅ **Database**: PostgreSQL with Prisma ORM  
✅ **Type-safe**: Full TypeScript across frontend and backend  
✅ **Modern UI**: Tailwind CSS styling  
✅ **Hot Reload**: Vite (Frontend) and tsx watch (Backend)

## Troubleshooting

### Database Connection Error
- Verify PostgreSQL is running
- Check `DATABASE_URL` in `backend/.env`
- Ensure the database exists

### Port Already in Use
- Change `PORT` in `backend/.env`
- Change `port` in `frontend/vite.config.ts`

### Socket.io Connection Failed
- Verify backend is running on port 3000
- Check browser console for CORS errors

## Next Steps

- Add more Prisma models in `backend/prisma/schema.prisma`
- Create additional API routes in `backend/src/routes/`
- Build React components in `frontend/src/`
- Implement protected routes with JWT middleware

