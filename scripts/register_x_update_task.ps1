<#
.SYNOPSIS
  Registers (or unregisters) a Windows Task Scheduler task that runs
  scripts/update_x_articles.py --push once a day.

.DESCRIPTION
  Task name: LP_XArticlesUpdate
  Schedule: daily at 07:00 local time.
  Runs: python.exe <repoRoot>\scripts\update_x_articles.py --push
  Working directory: <repoRoot>

  The GitHub Actions RSS workflow (update-articles.yml) runs around 06:00 JST.
  This task is scheduled at 07:00 so its "git pull --rebase" step (inside
  update_x_articles.py --push) picks up that commit first and avoids
  unnecessary conflicts.

  This task only runs while the PC is powered on and the user is logged in
  (it does not wake the machine or run as SYSTEM). If the PC is off or
  asleep at 07:00, Task Scheduler will simply skip that run unless you
  change the trigger settings yourself.

  This script only registers/unregisters the scheduled task. It does not
  run update_x_articles.py itself, and it does not require an elevated
  (Administrator) PowerShell session for a per-user task.

.PARAMETER Unregister
  Removes the LP_XArticlesUpdate task instead of creating it.

.EXAMPLE
  # Preview what would happen (no changes made)
  .\register_x_update_task.ps1 -WhatIf

.EXAMPLE
  # Register the daily task
  .\register_x_update_task.ps1

.EXAMPLE
  # Remove the daily task
  .\register_x_update_task.ps1 -Unregister
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [switch]$Unregister
)

$ErrorActionPreference = "Stop"

$TaskName = "LP_XArticlesUpdate"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ScriptPath = Join-Path $RepoRoot "scripts\update_x_articles.py"

function Get-PythonPath {
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if (-not $cmd) {
        $cmd = Get-Command python3 -ErrorAction SilentlyContinue
    }
    if (-not $cmd) {
        Write-Error "python.exe not found on PATH. Install Python or add it to PATH, then re-run this script."
        return $null
    }
    return $cmd.Source
}

if ($Unregister) {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $existing) {
        Write-Output "Task '$TaskName' is not registered. Nothing to do."
        exit 0
    }

    if ($PSCmdlet.ShouldProcess($TaskName, "Unregister-ScheduledTask")) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Output "Task '$TaskName' has been removed."
    }
    exit 0
}

if (-not (Test-Path $ScriptPath)) {
    Write-Error "Cannot find update_x_articles.py at: $ScriptPath"
    exit 1
}

$PythonPath = Get-PythonPath
if (-not $PythonPath) {
    exit 1
}

Write-Output "Task name    : $TaskName"
Write-Output "Python       : $PythonPath"
Write-Output "Script       : $ScriptPath"
Write-Output "Working dir  : $RepoRoot"
Write-Output "Trigger      : Daily at 07:00 (local time)"
Write-Output "Arguments    : --push"
Write-Output ""
Write-Output "Note: this task runs only while the PC is on and the user is"
Write-Output "logged in. It will NOT wake the machine from sleep and will NOT"
Write-Output "run as SYSTEM / in the background when logged out."

$Action = New-ScheduledTaskAction -Execute $PythonPath -Argument "`"$ScriptPath`" --push" -WorkingDirectory $RepoRoot
$Trigger = New-ScheduledTaskTrigger -Daily -At "07:00"
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -ExecutionTimeLimit (New-TimeSpan -Minutes 20)

if ($PSCmdlet.ShouldProcess($TaskName, "Register-ScheduledTask")) {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Output "Task '$TaskName' already exists. Removing old definition before re-registering."
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }

    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Daily semi-automatic update of X (Twitter) article cards via local xHermes, then git push." | Out-Null

    Write-Output ""
    Write-Output "Task '$TaskName' registered successfully."
    Write-Output "Use '.\register_x_update_task.ps1 -Unregister' to remove it later."
}
