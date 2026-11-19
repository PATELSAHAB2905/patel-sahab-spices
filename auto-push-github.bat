@echo off
echo ========================================================
echo   PATEL SAHAB SPICES - AUTO SYNC & PUSH TO GITHUB
echo ========================================================
cd /d "%~dp0"

echo.
echo [1/3] Checking Git status...
git status -s

echo.
echo [2/3] Adding modified and new files...
git add .

echo.
echo [3/3] Creating commit...
git commit -m "Auto-update: %DATE% %TIME%"

echo.
echo [4/4] Pushing to GitHub (origin main)...
git push origin main

echo.
echo ========================================================
echo   SUCCESS! All changes are uploaded to GitHub.
echo   Repository: https://github.com/PATELSAHAB2905/patel-sahab-spices
echo   Live Website: https://patelsahab2905.github.io/patel-sahab-spices/
echo ========================================================
pause
