# 3FM Full-Stack App

Modern full-stack application with React, Express, Prisma, JWT authentication, and real-time Socket.io.

## Tech Stack

### Frontend
- React + TypeScript + Vite
- Tailwind CSS
- Socket.io Frontend

### Backend
- Node.js + Express + TypeScript
- PostgreSQL + Prisma ORM
- JWT Authentication
- Socket.io (WebSocket)

## Setup Instructions

### Prerequisites
- Node.js 18+ installed
- PostgreSQL database running

### 1. Install Dependencies

```bash
npm install
```

This installs dependencies for both Frontend and Backend workspaces.

### 2. Configure Backend Environment

Copy the example environment file and update it with your database credentials:

```bash
cd Backend
cp .env.example .env
```

Edit `backend/.env`:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/mydb?schema=public"
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
PORT=3000
```

### 3. Initialize Database

```bash
cd Backend
npm run prisma:generate
npm run prisma:migrate
```

This will:
- Generate Prisma Frontend
- Run database migrations

### 4. Start Development Backends

From the root directory:

```bash
npm run dev
```

This runs both Frontend (port 5173) and Backend (port 3000) concurrently.

Alternatively, run them separately:

```bash
npm run dev:Frontend  # Frontend only
npm run dev:Backend  # Backend only
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
  ```json
  {
    "email": "user@example.com",
    "password": "password123",
    "name": "John Doe"
  }
  ```

- `POST /api/auth/login` - Login
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```

- `GET /api/auth/me` - Get current user (requires JWT token)
  ```
  Authorization: Bearer <token>
  ```

## Socket.io Events

### Frontend → Backend
- `message` - Send a message

### Backend → Frontend
- `message` - Receive broadcast message

## Project Structure

```
3FM/
├── frontend/                 # React frontend
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css       # Tailwind imports
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── vite.config.ts
├── backend/                 # Express backend
│   ├── src/
│   │   ├── index.ts        # Entry point with Socket.io
│   │   ├── routes/
│   │   │   └── auth.ts     # Auth routes
│   │   └── middleware/
│   │       └── auth.ts     # JWT middleware
│   ├── prisma/
│   │   └── schema.prisma   # Database schema
│   ├── .env.example
│   └── tsconfig.json
└── package.json            # Root workspace config
```

## Build for Production

```bash
npm run build
```

This builds both Frontend and Backend.

To start the production Backend:

```bash
cd Backend
npm start
```

Serve the built frontend (`frontend/dist`) using a static Backend or CDN.

## License

ISC

