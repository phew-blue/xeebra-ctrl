; xeebra-ctrl Windows Installer
; Built with Inno Setup 6 — https://jrsoftware.org/isinfo.php
;
; Build:
;   1. cd /path/to/xeebra-ctrl
;   2. make build          (builds frontend + Go binary)
;   3. iscc installer\windows\xeebra-ctrl.iss

#define MyAppName      "xeebra-ctrl"
#ifndef MyAppVersion
  #define MyAppVersion "0.2.1"
#endif
#define MyAppPublisher "Phew Blue"
#define MyAppExeName   "xeebra-ctrl.exe"

[Setup]
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\xeebra-ctrl
DefaultGroupName={#MyAppName}
OutputDir=Output
OutputBaseFilename=xeebra-ctrl-setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Main binary (Go, embeds the React frontend)
Source: "..\..\xeebra-ctrl.exe"; DestDir: "{app}"; Flags: ignoreversion
; PowerShell startup task helper
Source: "install-startup.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Open xeebra-ctrl"; Filename: "http://localhost:3200"; Comment: "Open xeebra-ctrl in browser"
Name: "{group}\Uninstall xeebra-ctrl"; Filename: "{uninstallexe}"

[Run]
; Register startup task
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\install-startup.ps1"" -InstallDir ""{app}"""; \
  StatusMsg: "Registering startup task..."; \
  Flags: waituntilterminated runhidden

; Launch the app (starts tray + server)
Filename: "{app}\{#MyAppExeName}"; \
  WorkingDir: "{app}"; \
  StatusMsg: "Starting xeebra-ctrl..."; \
  Flags: nowait postinstall skipifsilent

; Open in browser
Filename: "http://localhost:3200"; \
  Description: "Open xeebra-ctrl in browser"; \
  Flags: postinstall shellexec skipifsilent unchecked

[UninstallRun]
; Kill the tray process
Filename: "taskkill.exe"; \
  Parameters: "/IM xeebra-ctrl.exe /F"; \
  Flags: runhidden

; Remove startup task
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -WindowStyle Hidden -Command ""schtasks /Delete /TN 'xeebra-ctrl' /F"""; \
  Flags: runhidden

[UninstallDelete]
Type: files; Name: "{app}\xeebra-ctrl.config.json"

[Code]
var
  PortPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  PortPage := CreateInputQueryPage(wpWelcome,
    'Port',
    'Web interface port',
    'xeebra-ctrl runs a local web server. Choose a port that is not in use on this machine.');
  PortPage.Add('Port (default 3200):', False);
  PortPage.Values[0] := '3200';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;

  if CurPageID = PortPage.ID then
  begin
    if Trim(PortPage.Values[0]) = '' then
      PortPage.Values[0] := '3200';
  end;
end;

procedure WriteConfigFile;
var
  Dir, Port: String;
  Content: String;
begin
  Dir  := ExpandConstant('{app}');
  Port := Trim(PortPage.Values[0]);

  if Port = '' then Port := '3200';

  Content :=
    '{' + #13#10 +
    '  "port": ' + Port + #13#10 +
    '}' + #13#10;

  SaveStringToFile(Dir + '\xeebra-ctrl.config.json', Content, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    WriteConfigFile;
end;
