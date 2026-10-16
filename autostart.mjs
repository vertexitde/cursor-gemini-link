const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function bridgeCommandPattern(nodePath, bridgePath) {
  return '^"?' + escapeRegex(nodePath) + '"?\\s+"?' + escapeRegex(bridgePath) + '"?\\s*$';
}

export function buildBridgeLauncher({nodePath, bridgePath}) {
  const pattern = bridgeCommandPattern(nodePath, bridgePath).replaceAll("'", "''");
  const restart = `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match '${pattern}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  const encoded = Buffer.from(restart, 'utf16le').toString('base64');
  return `
const {execFile,spawn}=require("node:child_process");
const start=()=>{
  const worker=spawn(${JSON.stringify(nodePath)},[${JSON.stringify(bridgePath)}],{
    detached:true,windowsHide:true,stdio:"ignore",
    env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}
  });
  worker.on("error",()=>{});worker.unref();
};
if(process.platform==="win32")execFile("powershell.exe",["-NoProfile","-NonInteractive","-EncodedCommand",${JSON.stringify(encoded)}],{windowsHide:true,timeout:15000},()=>start());
else start();
`;
}

export function buildAutostart(options) {
  // A detached launcher owns the entire stop/start sequence. A secondary
  // Cursor process may exit before the PowerShell process finishes.
  return `
/* cursor-gemini-link autostart */
import("node:child_process").then(({spawn})=>{
  const launcher=spawn(${JSON.stringify(options.nodePath)},["-e",${JSON.stringify(buildBridgeLauncher(options))}],{
    detached:true,windowsHide:true,stdio:"ignore",
    env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}
  });
  launcher.on("error",()=>{});launcher.unref();
});
`;
}
