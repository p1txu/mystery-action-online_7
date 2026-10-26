; Instalador de Windows de Pokémon Mystery Action (Inno Setup 6).
; Lo compila GitHub Actions (.github/workflows/windows-installer.yml) sobre la carpeta que prepara
; tools/stage-windows.mjs (juego + node_modules + Node.js portátil en runtime\). A mano, en Windows:
;   node tools\stage-windows.mjs --node C:\ruta\node-v22.x-win-x64
;   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" /DAppVersion=0.31 installer\MysteryAction.iss
;
; - Se instala en la carpeta del usuario (sin permisos de administrador): así las actualizaciones automáticas
;   pueden escribir sin preguntar.
; - Acceso directo en el menú Inicio (y en el escritorio si se marca) con el icono del juego.
; - Al desinstalar pregunta si borrar también data\ (cuentas, perfiles, amistades y el secreto que las cifra).

#ifndef AppVersion
  #define AppVersion "0.0"
#endif
#define AppName "Pokémon Mystery Action"

[Setup]
AppId={{8F4B1C2E-6A1D-4C8B-9E2A-5D7F3B1A9C64}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Pokémon Mystery Action
DefaultDirName={localappdata}\Programs\Pokemon Mystery Action
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
DisableDirPage=auto
UsePreviousAppDir=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=Output
OutputBaseFilename=MysteryAction-Setup
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\installer\icon.ico
UninstallDisplayName={#AppName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear un acceso directo en el escritorio"; GroupDescription: "Accesos directos:"

[Files]
Source: "..\build\win\app\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\Jugar.bat"; WorkingDir: "{app}"; IconFilename: "{app}\installer\icon.ico"; Comment: "Abre el juego (deja abierta la ventana mientras juegas)"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\Jugar.bat"; WorkingDir: "{app}"; IconFilename: "{app}\installer\icon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\Jugar.bat"; WorkingDir: "{app}"; Description: "Jugar ahora"; Flags: postinstall nowait skipifsilent shellexec

[UninstallDelete]
; Lo que crea o descarga el juego después de instalarse (dependencias, compilados, actualizaciones). data\ NO.
Type: filesandordirs; Name: "{app}\node_modules"
Type: filesandordirs; Name: "{app}\runtime"
Type: filesandordirs; Name: "{app}\.update"
Type: filesandordirs; Name: "{app}\client"
Type: filesandordirs; Name: "{app}\server"
Type: filesandordirs; Name: "{app}\shared"
Type: filesandordirs; Name: "{app}\tools"
Type: filesandordirs; Name: "{app}\prototype"
Type: filesandordirs; Name: "{app}\docs"
Type: filesandordirs; Name: "{app}\deploy"
Type: filesandordirs; Name: "{app}\installer"
Type: filesandordirs; Name: "{app}\build"

[Code]
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usUninstall) and DirExists(ExpandConstant('{app}\data')) then
  begin
    if MsgBox('¿Borrar también tus cuentas, perfiles y amistades (carpeta «data»)?' + #13#10 + #13#10 +
              'Si eliges «No», se conservan y volverán a estar ahí si instalas el juego otra vez.',
              mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
      DelTree(ExpandConstant('{app}\data'), True, True, True);
  end;
end;
