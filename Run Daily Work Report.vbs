Option Explicit

Dim shell, fso, appDir, electronCmd, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
electronCmd = fso.BuildPath(appDir, "node_modules\.bin\electron.cmd")

If fso.FileExists(electronCmd) Then
    command = "cmd.exe /c cd /d """ & appDir & """ && """ & electronCmd & """ ."
Else
    command = "cmd.exe /c cd /d """ & appDir & """ && npm start"
End If

shell.Run command, 0, False
