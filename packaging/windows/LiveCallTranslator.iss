#ifndef SourceDir
#define SourceDir "..\..\dist\LiveCallTranslator-portable"
#endif

#ifndef OutputDir
#define OutputDir "..\..\dist"
#endif

#ifndef AppVersion
#define AppVersion "0.1.0"
#endif

[Setup]
AppId={{2DA356A8-4CA5-4C28-BBC6-3E5D4D1C3A3B}
AppName=Live Call Translator AI
AppVersion={#AppVersion}
AppPublisher=Live Call Translator AI
DefaultDirName={localappdata}\LiveCallTranslatorAI
DefaultGroupName=Live Call Translator AI
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename=LiveCallTranslator-Setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName=Live Call Translator AI
WizardStyle=modern

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Live Call Translator AI"; Filename: "{app}\Start-Translator.cmd"; WorkingDir: "{app}"

[Run]
Filename: "{app}\README-FIRST.txt"; Description: "Open quick start notes"; Flags: postinstall shellexec skipifsilent
Filename: "{cmd}"; Parameters: "/c ""{app}\Start-Translator.cmd"""; Description: "Launch Live Call Translator AI"; Flags: postinstall nowait skipifsilent unchecked
