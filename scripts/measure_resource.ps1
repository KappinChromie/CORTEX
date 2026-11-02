$proc = Get-Process -Name cortex-desktop -ErrorAction SilentlyContinue
if ($proc) {
    $cpu1 = $proc.CPU
    $time1 = [System.DateTime]::UtcNow
    Start-Sleep -Seconds 5
    $proc.Refresh()
    $cpu2 = $proc.CPU
    $time2 = [System.DateTime]::UtcNow
    $cpuUsed = ($cpu2 - $cpu1) / (($time2 - $time1).TotalSeconds * [System.Environment]::ProcessorCount) * 100
    [PSCustomObject]@{
        Process = $proc.ProcessName
        PID = $proc.Id
        WorkingSetMB = [Math]::Round($proc.WorkingSet64 / 1MB, 2)
        PrivateMemoryMB = [Math]::Round($proc.PrivateMemorySize64 / 1MB, 2)
        AvgIdleCpuPercent = [Math]::Round($cpuUsed, 3)
    } | Format-List
} else {
    Write-Output "cortex-desktop process not found"
}
