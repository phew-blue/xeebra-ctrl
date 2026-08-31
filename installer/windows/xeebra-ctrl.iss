; xeebra-ctrl Windows Installer
; Built with Inno Setup 6 — https://jrsoftware.org/isinfo.php
;
; Build:
;   1. cd /path/to/xeebra-ctrl
;   2. make build          (builds frontend + Go binary)
;   3. iscc installer\windows\xeebra-ctrl.iss

#define MyAppName      "Xeebra CTRL"
#ifndef MyAppVersion
  #define MyAppVersion "0.3.1"
#endif
#define MyAppPublisher "Phew Blue"
#define MyAppExeName   "xeebra-ctrl.exe"

[Setup]
; Pinned to the value AppName used to derive before the display name changed to
; "Xeebra CTRL". Keeps the xeebra-ctrl_is1 uninstall key, so later upgrades are
; recognised as upgrades rather than installed alongside.
AppId=xeebra-ctrl
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
; Per-user: nothing here needs elevation, and installing under LOCALAPPDATA lets
; the running exe be replaced during self-update. See notes/windows-app-layout.md.
PrivilegesRequired=lowest
DefaultDirName={localappdata}\Phew Blue\{#MyAppName}
DisableDirPage=yes
DefaultGroupName={#MyAppName}
; The binary is windows/amd64. Without this the installer runs in 32-bit mode
; and {autopf}/{commonpf} resolve to the "(x86)" tree.
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=Output
OutputBaseFilename=xeebra-ctrl-setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}
; Self-update runs this installer while the tray process is alive, and Windows
; will not overwrite a locked .exe. Deliberately no AppMutex: Inno checks it
; before PrepareToInstall and can only answer with a message box, so under
; /SUPPRESSMSGBOXES it defaults to Cancel and every silent upgrade becomes a
; silent no-op. PrepareToInstall below does the job unattended instead.
CloseApplications=force
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Main binary (Go, embeds the React frontend)
Source: "..\..\xeebra-ctrl.exe"; DestDir: "{app}"; Flags: ignoreversion

[Tasks]
Name: "startup"; Description: "Run {#MyAppName} at logon (tray icon)"; GroupDescription: "Startup"

[Icons]
Name: "{group}\Open {#MyAppName}"; Filename: "http://localhost:3200"; Comment: "Open {#MyAppName} in browser"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
; Per-user startup entry. Replaces the elevated scheduled task used up to v0.2.1 —
; a per-user install cannot register a task at RunLevel Highest.
Name: "{userstartup}\Phew Blue {#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startup

[Run]
; Launch the app (starts tray + server). Deliberately NOT skipifsilent: a silent
; self-update exits the running copy, so this is what brings it back.
Filename: "{app}\{#MyAppExeName}"; \
  WorkingDir: "{app}"; \
  StatusMsg: "Starting {#MyAppName}..."; \
  Flags: nowait postinstall runhidden

; Open in browser
Filename: "http://localhost:3200"; \
  Description: "Open {#MyAppName} in browser"; \
  Flags: postinstall shellexec skipifsilent unchecked

[UninstallRun]
; Kill the tray process
Filename: "taskkill.exe"; \
  Parameters: "/IM xeebra-ctrl.exe /F"; \
  Flags: runhidden

[UninstallDelete]
; Config is created at runtime / by [Code], so Inno does not track it.
Type: files;      Name: "{app}\xeebra-ctrl.config.json"
Type: dirifempty; Name: "{localappdata}\Phew Blue"

[Code]
const
  UninstallKey = 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\xeebra-ctrl_is1';

var
  PortPage: TInputQueryWizardPage;
  { Config rescued from a machine-wide install before it is uninstalled, so the
    configured groups survive the move to a per-user location. AnsiString because
    LoadStringFromFile takes it as a var parameter, which cannot convert. }
  MigratedConfig: AnsiString;

{ A resident tray process holds our own .exe open. Restart Manager cannot reliably
  close a tray app with no main window, and a silent install must never stop to
  ask, so terminate any running copy before the file step. Failing to kill is not
  fatal — returning '' means carry on. }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/IM xeebra-ctrl.exe /F', '',
       SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;

{ Up to v0.2.1 this was a machine-wide install: PrivilegesRequired=admin, files in
  Program Files (x86), uninstall entry in HKLM, and an elevated logon task. AppId
  pins the key name but not the hive, so a per-user install would not recognise
  that one and would leave it stranded with its task still running. Uninstall it
  first. Best-effort: if the user declines the elevation prompt we carry on rather
  than blocking a fresh install. }
{ Removes a machine-wide install left by <= v0.2.1, first rescuing its config.

  Deliberately only HKLM, and both registry views. v0.2.1 installed in 32-bit
  mode, so its key is under WOW6432Node; this installer runs 64-bit and sees a
  different view, which is why the first attempt at this silently found nothing
  and stranded the old copy. HKCU is never checked: that is where the current
  per-user install registers, and uninstalling it here would delete the very
  config we are about to migrate. Inno handles same-AppId upgrades itself. }
function RemoveMachineWideInstall(RootKey: Integer): Boolean;
var
  UninstallString, InstallLocation, OldConfig: String;
  ResultCode: Integer;
begin
  Result := False;
  if not RegQueryStringValue(RootKey, UninstallKey, 'UninstallString', UninstallString) then
    Exit;

  { Rescue the config before the old uninstaller deletes it: its UninstallDelete
    entry removes xeebra-ctrl.config.json, and the new install lives somewhere
    else entirely, so nothing else would carry the groups across.
    NB: never start a line here with a bracketed word — Inno reads any line whose
    first non-space character is "[" as a section tag, even inside a comment. }
  if RegQueryStringValue(RootKey, UninstallKey, 'InstallLocation', InstallLocation) then
  begin
    InstallLocation := RemoveQuotes(InstallLocation);
    if InstallLocation <> '' then
    begin
      OldConfig := AddBackslash(InstallLocation) + 'xeebra-ctrl.config.json';
      if FileExists(OldConfig) then
        LoadStringFromFile(OldConfig, MigratedConfig);
    end;
  end;

  UninstallString := RemoveQuotes(UninstallString);
  if FileExists(UninstallString) then
  begin
    Exec(UninstallString, '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '',
         SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Result := True;
  end;
end;

function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  Result := True;
  MigratedConfig := '';

  { 64-bit view first, then the 32-bit one v0.2.1 actually used. }
  if not RemoveMachineWideInstall(HKLM64) then
    RemoveMachineWideInstall(HKLM32);

  { The old install also registered a scheduled task. Its uninstaller removes it,
    but drop it explicitly in case that install was already gone. }
  Exec(ExpandConstant('{sys}\schtasks.exe'), '/Delete /TN "xeebra-ctrl" /F', '',
       SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure InitializeWizard;
begin
  PortPage := CreateInputQueryPage(wpWelcome,
    'Port',
    'Web interface port',
    '{#MyAppName} runs a local web server. Choose a port that is not in use on this machine.');
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
  Path, Port: String;
  Content: String;
begin
  Path := ExpandConstant('{app}') + '\xeebra-ctrl.config.json';

  { Never clobber an existing config — an upgrade, including every silent
    self-update, would otherwise wipe the configured groups. The port from the
    wizard page only applies to a fresh install. }
  if FileExists(Path) then
    Exit;

  { Carried over from a machine-wide install we just removed: keep the groups
    rather than seeding an empty config the operator would have to rebuild. }
  if MigratedConfig <> '' then
  begin
    SaveStringToFile(Path, MigratedConfig, False);
    Exit;
  end;

  Port := Trim(PortPage.Values[0]);
  if Port = '' then Port := '3200';

  Content :=
    '{' + #13#10 +
    '  "port": ' + Port + ',' + #13#10 +
    '  "groups": []' + #13#10 +
    '}' + #13#10;

  SaveStringToFile(Path, Content, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    WriteConfigFile;
end;
