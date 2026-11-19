@echo off
setlocal
echo ======================================================================
echo          PATEL SAHAB SPICES - AUTO SYNC & DEPLOY TO GITHUB
echo ======================================================================
cd /d "%~dp0"

echo.
echo [1/3] Adding modified and new files...
git add .

echo.
echo [2/3] Committing changes...
git commit -m "Auto-update: %DATE% %TIME%"

echo.
echo [3/4] Pushing source code to GitHub (main branch)...
git push origin main

echo.
echo [4/4] Building and deploying live website to GitHub Pages...
call npm run deploy

echo.
echo ======================================================================
echo   SUCCESS! All changes are uploaded and live site is updated!
echo.
echo   - GitHub Repository: https://github.com/PATELSAHAB2905/patel-sahab-spices
echo   - Live Application:  https://patelsahab2905.github.io/patel-sahab-spices/
echo ======================================================================
pause
