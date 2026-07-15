@echo off
echo Fixing frontend dependencies...
cd frontend
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del package-lock.json
npm cache clean --force
npm install
echo.
echo Done! Now run: npm run dev
pause
