<#
Teste de ponta a ponta do caminho de colar (Windows).

Roda o Imprompt DE VERDADE (o .exe de release), com uma API falsa local e uma
pasta de dados temporária, e aperta o atalho de verdade numa janela de teste:

  1. modo instantâneo: Ctrl+C x2 cola o resultado por cima da seleção, mantendo
     o espaço/quebra de linha em volta
  2. modo instantâneo sem nada selecionado: nada é enviado nem colado
  3. modo instantâneo trocando de janela durante a resposta: não cola na outra
     janela; o resultado fica na área de transferência
  4. modo popup: Ctrl+C x2, Enter, Enter rápido → aplica quando a resposta chega
  5. modo popup sem nada selecionado: o popup abre (o texto é mostrado antes)

ATENÇÃO: por ~30 s o teste usa o teclado e o foco da tela. Não digite enquanto
ele roda. Antes de cada tecla ele confere que a janela certa está na frente e
aborta se não estiver. O Imprompt instalado é fechado no início (senão os dois
reagiriam ao atalho) e reaberto no fim.

Uso:  npm run tauri build -- --no-bundle
      powershell -ExecutionPolicy Bypass -File scripts\e2e\run.ps1
#>
param(
  [string]$Exe = (Join-Path $PSScriptRoot "..\..\src-tauri\target\release\imprompt.exe"),
  [int]$Port = 8765
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class Win {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  public static uint ForegroundPid() { uint p; GetWindowThreadProcessId(GetForegroundWindow(), out p); return p; }
  public static void Down(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); }
  public static void Up(byte vk) { keybd_event(vk, 0, 2, UIntPtr.Zero); }
}
"@
$VK_CTRL = 0x11; $VK_C = 0x43; $VK_RETURN = 0x0D; $VK_ESC = 0x1B

$Exe = (Resolve-Path $Exe).Path
$results = New-Object System.Collections.Generic.List[string]
$failed = $false
function Pass($name) { $script:results.Add("PASS  $name") }
function Fail($name, $why) { $script:results.Add("FAIL  $name -- $why"); $script:failed = $true }
function Pump($ms) { $end = (Get-Date).AddMilliseconds($ms); while ((Get-Date) -lt $end) { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 15 } }
function WaitFor([scriptblock]$cond, $ms) { $end = (Get-Date).AddMilliseconds($ms); while ((Get-Date) -lt $end) { [System.Windows.Forms.Application]::DoEvents(); if (& $cond) { return $true }; Start-Sleep -Milliseconds 25 }; return $false }
function Api($method, $path, $body) { if ($body) { Invoke-RestMethod -Method $method -Uri "http://127.0.0.1:$Port$path" -Body ($body | ConvertTo-Json) -ContentType "application/json" } else { Invoke-RestMethod -Method $method -Uri "http://127.0.0.1:$Port$path" } }
function Count { (Api GET "/count" $null).count }

function New-TestForm($title, $x) {
  $f = New-Object System.Windows.Forms.Form
  $f.Text = $title; $f.TopMost = $true; $f.StartPosition = "Manual"
  $f.Location = New-Object System.Drawing.Point($x, 120); $f.Size = New-Object System.Drawing.Size(380, 170)
  $t = New-Object System.Windows.Forms.TextBox
  $t.Multiline = $true; $t.Dock = "Fill"; $t.HideSelection = $false
  $f.Controls.Add($t); $f.Show(); Pump 150
  return @{ Form = $f; Box = $t }
}
function Focus-Form($w) {
  # Trazer pra frente a partir de um processo em segundo plano: anexa a fila de
  # entrada à da janela que está na frente agora (o Windows então permite).
  $fg = [Win]::GetForegroundWindow(); $pidOut = 0
  $fgThread = [Win]::GetWindowThreadProcessId($fg, [ref]$pidOut); $me = [Win]::GetCurrentThreadId()
  [void][Win]::AttachThreadInput($me, $fgThread, $true)
  [void][Win]::SetForegroundWindow($w.Form.Handle); $w.Form.Activate(); [void]$w.Box.Focus()
  [void][Win]::AttachThreadInput($me, $fgThread, $false)
  if (-not (WaitFor { [Win]::GetForegroundWindow() -eq $w.Form.Handle } 1500)) { throw "nao consegui trazer '$($w.Form.Text)' pra frente (na frente: $(Front-Name)); abortando sem enviar teclas" }
}
function Front-Name {
  $pidOut = 0; [void][Win]::GetWindowThreadProcessId([Win]::GetForegroundWindow(), [ref]$pidOut)
  $p = Get-Process -Id $pidOut -ErrorAction SilentlyContinue
  if ($p) { "$($p.ProcessName) '$($p.MainWindowTitle)'" } else { "nenhuma" }
}
function Assert-Front($w) {
  if ([Win]::GetForegroundWindow() -eq $w.Form.Handle) { return }
  Focus-Form $w   # outra janela passou na frente (ex.: a janelinha do app sumindo): retoma
  if ([Win]::GetForegroundWindow() -ne $w.Form.Handle) { throw "a janela de teste perdeu o foco para $(Front-Name); abortando sem enviar teclas" }
}
function Tap-CopyTwice($w) {
  # O gesto real: Ctrl seguro, C, C. Entre os toques a janela processa a cópia.
  Assert-Front $w
  [Win]::Down($VK_CTRL); [Win]::Down($VK_C); [Win]::Up($VK_C); Pump 130
  Assert-Front $w
  [Win]::Down($VK_C); [Win]::Up($VK_C); [Win]::Up($VK_CTRL); Pump 30
}
function Set-Config($dir, $mode) {
  @{ default_preset = "corrigir"; mode = $mode; output = "replace"; autostart = $false
     api_base_url = "http://127.0.0.1:$Port/v1"; api_model = "mock"; api_format = "chat_completions"; api_custom = $true
     api_fast_mode = $false; use_examples = $false; trigger_modifier = "ctrl"; trigger_key = "c"; debounce_ms = 400
     locale = "en"; theme = "light" } | ConvertTo-Json | Set-Content -Path (Join-Path $dir "settings.json") -Encoding utf8
  # (Set-Content -Encoding utf8 grava com BOM de proposito: o app tem de aceitar.)
}
function Start-App($dir) {
  $env:IMPROMPT_CONFIG_DIR = $dir
  $p = Start-Process -FilePath $Exe -ArgumentList "--start-hidden" -PassThru
  Start-Sleep -Seconds 4   # janelas e cliente de API pré-aquecidos
  if ($p.HasExited) { throw "o app de teste saiu logo ao abrir (codigo $($p.ExitCode))" }
  # Se o app nao leu a configuracao de teste, ele cairia no padrao (API real):
  # nesse caso o teste para ANTES de enviar qualquer texto.
  if (Test-Path (Join-Path $dir "settings.json.corrupt")) { Stop-App; throw "o app nao leu o settings.json de teste; abortando antes de enviar texto" }
  return $p
}
function Stop-App { Get-Process imprompt -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Exe } | Stop-Process -Force -Confirm:$false; Start-Sleep -Milliseconds 600 }

$installed = Get-Process imprompt -ErrorAction SilentlyContinue | Where-Object { $_.Path -ne $Exe } | Select-Object -First 1
$installedPath = if ($installed) { $installed.Path } else { $null }
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("imprompt-e2e-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Path $tmp | Out-Null
$server = $null; $a = $null; $b = $null
$savedClipboard = try { [System.Windows.Forms.Clipboard]::GetText() } catch { "" }

try {
  if ($installed) { Stop-Process -Id $installed.Id -Force -Confirm:$false; Start-Sleep -Milliseconds 800 }
  $server = Start-Process -FilePath "python" -ArgumentList "`"$(Join-Path $PSScriptRoot 'mock_api.py')`" $Port" -PassThru -WindowStyle Hidden
  if (-not (WaitFor { try { [void](Count); $true } catch { $false } } 6000)) { throw "a API falsa nao subiu na porta $Port" }

  $a = New-TestForm "Imprompt E2E - A" 120
  $b = New-TestForm "Imprompt E2E - B" 540

  # ------------------------------------------------------ modo instantâneo
  Set-Config $tmp "instant"; [void](Start-App $tmp)

  $name = "1 instant: pastes over the selection and keeps the surrounding whitespace"
  $a.Box.Text = "  hello wrold`r`n"; Focus-Form $a; $a.Box.SelectAll(); Pump 100
  $before = Count; Tap-CopyTwice $a
  if (WaitFor { $a.Box.Text -ne "  hello wrold`r`n" } 6000) {
    Pump 200
    if ($a.Box.Text -eq "  E2E[hello wrold]`r`n" -and (Count) -eq $before + 1) { Pass $name } else { Fail $name ("texto='" + ($a.Box.Text -replace "`r`n", "\r\n") + "' pedidos=" + ((Count) - $before)) }
  } else { Fail $name "nada foi colado em 6 s" }

  Pump 700
  $name = "2 instant: with nothing selected, nothing is sent or pasted"
  [System.Windows.Forms.Clipboard]::SetText("STALE-CLIPBOARD"); Pump 150
  $a.Box.Text = "keep me"; Focus-Form $a; $a.Box.Select(0, 0); Pump 100
  $before = Count; Tap-CopyTwice $a; Pump 1800
  if ((Count) -eq $before -and $a.Box.Text -eq "keep me") { Pass $name } else { Fail $name ("texto='" + $a.Box.Text + "' pedidos=" + ((Count) - $before)) }

  $name = "3 instant: switching windows while the API answers does not paste elsewhere"
  [void](Api POST "/config" @{ delay = 1.5 })
  $a.Box.Text = "switch test"; $b.Box.Text = "other window"
  Focus-Form $a; $a.Box.SelectAll(); Pump 100
  Tap-CopyTwice $a; Pump 300
  Focus-Form $b; $b.Box.SelectAll(); Pump 3200
  $clip = [System.Windows.Forms.Clipboard]::GetText()
  if ($a.Box.Text -eq "switch test" -and $b.Box.Text -eq "other window" -and $clip -eq "E2E[switch test]") { Pass $name } else { Fail $name ("A='" + $a.Box.Text + "' B='" + $b.Box.Text + "' clipboard='" + $clip + "'") }
  [void](Api POST "/config" @{ delay = 0 })
  Stop-App

  # ------------------------------------------------------------ modo popup
  Set-Config $tmp "popup"; $app = Start-App $tmp

  $name = "4 popup: Ctrl+C x2, Enter, Enter (typed ahead) applies when the answer arrives"
  [void](Api POST "/config" @{ delay = 0.7 })
  $a.Box.Text = "popup text"; Focus-Form $a; $a.Box.SelectAll(); Pump 100
  Tap-CopyTwice $a
  if (WaitFor { [Win]::ForegroundPid() -eq $app.Id } 4000) {
    Pump 350
    if ([Win]::ForegroundPid() -ne $app.Id) { throw "o popup perdeu o foco; abortando sem enviar teclas" }
    [Win]::Down($VK_RETURN); [Win]::Up($VK_RETURN); Pump 120
    if ([Win]::ForegroundPid() -ne $app.Id) { throw "o popup perdeu o foco; abortando sem enviar teclas" }
    [Win]::Down($VK_RETURN); [Win]::Up($VK_RETURN)
    if (WaitFor { $a.Box.Text -eq "E2E[popup text]" } 6000) { Pass $name } else { Fail $name ("texto='" + $a.Box.Text + "'") }
  } else { Fail $name "o popup nao abriu em 4 s" }
  [void](Api POST "/config" @{ delay = 0 })

  $name = "5 popup: with nothing selected the popup still opens and nothing is sent"
  [System.Windows.Forms.Clipboard]::SetText("STALE-CLIPBOARD"); Pump 150
  $a.Box.Text = "keep me"; Focus-Form $a; $a.Box.Select(0, 0); Pump 100
  $before = Count; Tap-CopyTwice $a
  if (WaitFor { [Win]::ForegroundPid() -eq $app.Id } 4000) {
    Pump 300
    if ([Win]::ForegroundPid() -eq $app.Id) { [Win]::Down($VK_ESC); [Win]::Up($VK_ESC) }
    Pump 500
    if ((Count) -eq $before -and $a.Box.Text -eq "keep me") { Pass $name } else { Fail $name ("texto='" + $a.Box.Text + "' pedidos=" + ((Count) - $before)) }
  } else { Fail $name "o popup nao abriu em 4 s" }
}
catch { Fail "harness" $_.Exception.Message }
finally {
  foreach ($vk in @($VK_CTRL, $VK_C, $VK_RETURN, $VK_ESC)) { [Win]::Up($vk) }   # nenhuma tecla fica presa
  Stop-App
  if ($a) { $a.Form.Close() }; if ($b) { $b.Form.Close() }
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -Confirm:$false }
  Remove-Item Env:\IMPROMPT_CONFIG_DIR -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  try { if ($savedClipboard) { [System.Windows.Forms.Clipboard]::SetText($savedClipboard) } else { [System.Windows.Forms.Clipboard]::Clear() } } catch {}
  if ($installedPath) {
    # Reabre o Imprompt instalado pelo serviço WMI, não como filho deste script:
    # um filho morre junto quando o terminal/ferramenta que rodou o teste encerra
    # a árvore de processos, e o usuário ficaria sem o app.
    try {
      $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "`"$installedPath`" --start-hidden" }
      if ($r.ReturnValue -ne 0) { throw "codigo $($r.ReturnValue)" }
    } catch { Start-Process -FilePath $installedPath -ArgumentList "--start-hidden" }
  }
}
$results | ForEach-Object { $_ }
if ($failed) { exit 1 } else { "ALL PASSED"; exit 0 }
