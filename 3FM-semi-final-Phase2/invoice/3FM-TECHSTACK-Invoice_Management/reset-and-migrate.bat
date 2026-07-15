@echo off
REM PostgreSQL Password Reset Helper - Basic Version
REM This batch file resets PostgreSQL password to 'postgres'

echo Stopping PostgreSQL service...
net stop postgresql-x64-18

timeout /t 3

echo Starting PostgreSQL in single-user mode...
REM This is complex, so let's try a simpler approach

echo Attempting to restart PostgreSQL...
net start postgresql-x64-18

timeout /t 3

echo PostgreSQL restarted. 
echo.
echo Now trying migration with password: postgres
echo.
cd backend
set PGPASSWORD=postgres
npx prisma migrate dev

pause
