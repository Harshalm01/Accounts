@echo off
echo ========================================
echo Starting 3FM Backend and Frontend Servers
echo ========================================
echo.

echo Step 1: Generating Prisma Client...
cd backend
call npx prisma generate 2>nul
if errorlevel 1 (
    echo Prisma generate failed, trying from root...
    cd ..
    call npx --prefix backend prisma generate --schema=backend/prisma/schema.prisma
    cd backend
)
echo.

echo Step 2: Starting Backend Server on Port 3000...
start "3FM Backend" cmd /c "npm run dev"
timeout /t 3 >nul
echo.

echo Step 3: Starting Frontend Server on Port 5173...
cd ../frontend
start "3FM Frontend" cmd /c "npm run dev"
echo.

echo ========================================
echo Both servers are starting!
echo Backend: http://localhost:3000
echo Frontend: http://localhost:5173
echo ========================================
echo.
echo Press any key to close this window...
echo (The servers will continue running in their own windows)
pause >nul
