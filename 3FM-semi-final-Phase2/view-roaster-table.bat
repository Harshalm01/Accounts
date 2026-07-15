@echo off
echo ==========================================
echo VIEWING ROASTER TABLE
echo ==========================================
echo.
echo Running SQL query to fetch Roaster data...
echo.

cd backend
npx prisma db execute --stdin < roaster-query.sql

pause
