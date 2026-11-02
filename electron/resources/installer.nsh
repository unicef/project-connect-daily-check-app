; Auto-start for every user of a per-machine install.
;
; The app calls app.setLoginItemSettings() at runtime, which can only write the
; Run key of the user who is running it (HKCU). A user who has never launched
; the app therefore never gets an auto-start entry, even when an administrator
; installed it for all users. Register the machine-wide Run value here instead,
; so auto-start does not depend on who opened the app first.
;
; Only for "all users" installs: a current-user install has no rights to HKLM.
; The 32-bit NSIS installer would land in Wow6432Node on 64-bit Windows, where
; the x64 app build cannot see its own entry, so select the native view first.

!macro customInstall
  ${if} $installMode == "all"
    ${if} ${RunningX64}
      SetRegView 64
    ${endif}
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_NAME}" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
    SetRegView default
  ${endif}
!macroend

!macro customUnInstall
  ${if} $installMode == "all"
    ${if} ${RunningX64}
      SetRegView 64
    ${endif}
    DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_NAME}"
    SetRegView default
  ${endif}
!macroend
