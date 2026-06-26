@echo off
set "APP_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath 'wscript.exe' -ArgumentList '\"%APP_DIR%Run Daily Work Report.vbs\"' -WorkingDirectory '%APP_DIR%' -WindowStyle Hidden"
exit /b
