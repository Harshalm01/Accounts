# 3FM Project Structure

```
3FM/
├── frontend/                          # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── App.tsx                  # Main app with auth & Socket.io demo
│   │   ├── main.tsx                 # React entry point
│   │   └── index.css                # Tailwind imports
│   ├── public/
│   ├── tailwind.config.js           # Tailwind configuration
│   ├── postcss.config.js            # PostCSS for Tailwind
│   ├── vite.config.ts               # Vite config + proxy to backend
│   ├── tsconfig.json                # TypeScript config
│   ├── .env.example                 # Example env vars
│   └── package.json
│
├── backend/                          # Express backend (Node + TypeScript)
│   ├── src/
│   │   ├── index.ts                 # Express + Socket.io Backend entry
│   │   ├── routes/
│   │   │   └── auth.ts              # Auth routes (register/login/me)
│   │   └── middleware/
│   │       └── auth.ts              # JWT authentication middleware
│   ├── prisma/
│   │   └── schema.prisma            # Database schema (PostgreSQL)
│   ├── tsconfig.json                # TypeScript config
│   ├── .env.example                 # Example database & JWT config
│   └── package.json
│
├── package.json                     # Root workspace config
├── README.md                        # Full documentation
├── QUICKSTART.md                    # Quick setup guide
└── .gitignore

```

## Technology Stack

| Layer          | Technology          |
|----------------|---------------------|
| Frontend       | React + TypeScript  |
| Build Tool     | Vite                |
| Styling        | Tailwind CSS        |
| Backend        | Node.js + Express   |
| Language       | TypeScript          |
| Database       | PostgreSQL          |
| ORM            | Prisma              |
| Authentication | JWT (jsonwebtoken)  |
| Password Hash  | bcrypt              |
| Real-time      | Socket.io           |
| Validation     | (Add Zod if needed) |

## Available Scripts

### Root (`c:\3FM`)
- `npm run dev` - Run both Frontend and Backend concurrently
- `npm run dev:Frontend` - Run frontend only
- `npm run dev:Backend` - Run backend only
- `npm run build` - Build both projects

### Frontend (`c:\3FM\Frontend`)
- `npm run dev` - Start Vite dev Backend (port 5173)
- `npm run build` - Build production bundle
- `npm run preview` - Preview production build

### Backend (`c:\3FM\Backend`)
- `npm run dev` - Start Express with hot reload (port 3000)
- `npm run build` - Compile TypeScript to dist/
- `npm start` - Run compiled production Backend
- `npm run prisma:generate` - Generate Prisma Frontend
- `npm run prisma:migrate` - Run database migrations

## Key Files

### Frontend
- [frontend/src/App.tsx](frontend/src/App.tsx) - Demo with auth & Socket.io
- [frontend/vite.config.ts](frontend/vite.config.ts) - API proxy configuration
- [frontend/tailwind.config.js](frontend/tailwind.config.js) - Tailwind setup

### Backend
- [backend/src/index.ts](backend/src/index.ts) - Express + Socket.io Backend
- [backend/src/routes/auth.ts](backend/src/routes/auth.ts) - Auth API endpoints
- [backend/src/middleware/auth.ts](backend/src/middleware/auth.ts) - JWT middleware
- [backend/prisma/schema.prisma](backend/prisma/schema.prisma) - Database schema

## Environment Variables

### Backend (`backend/.env`)
```env
DATABASE_URL="postgresql://user:password@localhost:5432/mydb?schema=public"
JWT_SECRET="your-super-secret-jwt-key"
PORT=3000
```

### Frontend (`frontend/.env` - optional)
```env
VITE_API_URL=http://localhost:3000
```

## API Endpoints

| Method | Endpoint        | Description          | Auth Required |
|--------|-----------------|----------------------|---------------|
| POST   | /api/auth/register | Register new user | No            |
| POST   | /api/auth/login    | Login user        | No            |
| GET    | /api/auth/me       | Get current user  | Yes (JWT)     |

## Socket.io Events

### Frontend → Backend
- `message` - Send a chat message

### Backend → Frontend  
- `message` - Receive broadcast message

## Development Workflow

1. Start PostgreSQL database
2. Configure `backend/.env` with DB credentials
3. Run `cd Backend && npm run prisma:migrate`
4. Run `npm run dev` from root
5. Open http://localhost:5173
6. Register/login and test real-time features

## Production Deployment

1. Build both projects: `npm run build`
2. Set production environment variables
3. Run database migrations on production DB
4. Serve `frontend/dist` via CDN or static host
5. Deploy `backend/dist` to Node.js host
6. Ensure PostgreSQL is accessible

## Next Steps

- Add input validation with Zod
- Implement refresh token rotation
- Add protected Socket.io rooms
- Create more database models
- Set up Docker containers
- Add testing (Jest, Vitest)

