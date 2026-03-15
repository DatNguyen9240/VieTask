# -*- coding: utf-8 -*-
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$tests = @(
  @{ label="1. tan lam + gio cu the (rule-based)"; text="nhắc uống thuốc 30 phút sau khi ăn sáng khoảng 7 rưỡi rồi tan làm nhắc gọi cho vợ"; now="2026-03-06 09:00" },
  @{ label="2. bao thuc + truoc do (rule-based)"; text="8 giờ sáng báo thức, 8 rưỡi nhắc pha cà phê, trước đó 15 phút nhắc chuẩn bị"; now="2026-03-06 07:00" },
  @{ label="3. sang mai nhieu task + tan lam (rule-based)"; text="sáng mai 6 giờ báo thức rồi 7 giờ nhắc pha cà phê rồi 8 giờ họp với team sau đó tan làm nhắc gọi cho vợ"; now="2026-03-06 07:00" },
  @{ label="4. buoi chieu khong gio (LLM)"; text="nhắc tôi gọi khách hàng vào buổi chiều"; now="2026-03-06 09:00" },
  @{ label="5. mo app Spotify (rule-based)"; text="7 giờ tối mở app Spotify"; now="2026-03-06 09:00" }
)

foreach ($t in $tests) {
  $payload = @{ text=$t.text; nowLocal=$t.now; tz="Asia/Ho_Chi_Minh" } | ConvertTo-Json -Compress
  $body = [System.Text.Encoding]::UTF8.GetBytes($payload)
  try {
    $resp = Invoke-WebRequest -Uri http://localhost:3000/parse -Method POST -ContentType "application/json; charset=utf-8" -Body $body -UseBasicParsing -TimeoutSec 60
    $json = $resp.Content | ConvertFrom-Json
    Write-Host "`n=== $($t.label) ===" -ForegroundColor Cyan
    foreach ($task in $json.tasks) {
      $q = if ($task.clarifying_question) { " | q=$($task.clarifying_question)" } else { "" }
      Write-Host "  [$($task.action)] $($task.title) @ $($task.datetime_local) clarify=$($task.need_clarification)$q"
    }
  } catch {
    Write-Host "`n=== $($t.label) === ERROR: $($_.Exception.Message)" -ForegroundColor Red
  }
}
