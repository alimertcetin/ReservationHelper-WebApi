<#
.SYNOPSIS
    Windows 11 Gelişmiş Kurulum ve Ağ Doğrulama Betiği
.DESCRIPTION
    PostgreSQL servislerini döngüsel olarak kontrol eder ve çalıştırır.
    psql erişimini denetler ve interaktif çoklu paket seçimi sunar.
#>

# Yönetici yetkisi kontrolü
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Lütfen bu betiği yönetici (Administrator) olarak çalıştırın!"
    Exit
}

Set-ExecutionPolicy Bypass -Scope Process -Force
$ErrorActionPreference = "Stop"

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "         Automated Environment Setup Script              " -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

# --- 1. POSTGRESQL KONTROL VE DÖNGÜSEL ÇALIŞTIRMA MEKANİZMASI ---
Write-Host "`n[*] PostgreSQL dosya yolları ve servis durumu denetleniyor..." -ForegroundColor Yellow

$pgBinFolder = $null

# Kontrol A: psql komutuna ulaşılabiliyor mu?
if (Get-Command psql -ErrorAction SilentlyContinue) {
    $pgBinFolder = Split-Path (Get-Command psql).Source
    Write-Host "[+] psql komut satırı aracına sistem PATH değişkeninden ulaşıldı." -ForegroundColor Green
} else {
    # Standart dizini tara
    $searchPath = Join-Path $env:ProgramFiles "PostgreSQL\*\bin\psql.exe"
    $foundFiles = Resolve-Path $searchPath -ErrorAction SilentlyContinue
    if ($foundFiles) {
        $latestPsql = $foundFiles | Sort-Object Path -Descending | Select-Object -First 1
        $pgBinFolder = Split-Path $latestPsql.Path
        $env:Path += ";$pgBinFolder"
        Write-Host "[+] psql aracı standart dizinde tespit edildi ve işlem sürecindeki PATH değişkenine eklendi." -ForegroundColor Green
    } else {
        Write-Host "`n=========================================================" -ForegroundColor Red
        Write-Host "[HATA] PostgreSQL komut satırı aracına (psql.exe) ulaşılamadı!" -ForegroundColor Red
        Write-Host "PostgreSQL sistemde kurulu olmayabilir veya hedef dizin bulunamıyor." -ForegroundColor Yellow
        Write-Host "PostgreSQL kurulumunu ve erişilebilirliğini kontrol edin." -ForegroundColor Yellow
        Write-Host "=========================================================" -ForegroundColor Red
        Exit
    }
}

# Kontrol B: Windows Servis Durumu ve Döngüsel Yeniden Başlatma Kontrolü
$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pgService) {
    $retryCount = 0
    $maxRetries = 3
    $retryIntervalSeconds = 4

    # Servis çalışana kadar veya maksimum deneme sınırına ulaşana kadar döngüye girer
    while ($pgService.Status -ne 'Running' -and $retryCount -lt $maxRetries) {
        $retryCount++
        Write-Host "[!] PostgreSQL Windows servisi çalışmıyor. Başlatma denemesi ($retryCount/$maxRetries)..." -ForegroundColor Yellow
        Start-Service $pgService.Name -ErrorAction SilentlyContinue
        Start-Sleep -Seconds $retryIntervalSeconds
        $pgService = Get-Service -Name $pgService.Name
    }

    if ($pgService.Status -ne 'Running') {
        Write-Host "`n=========================================================" -ForegroundColor Red
        Write-Host "[HATA] PostgreSQL servisi başlatılamadı!" -ForegroundColor Red
        Write-Host "Lütfen Windows Hizmetler (services.msc) panelini açarak servisi manuel tetiklemeyi deneyin." -ForegroundColor Yellow
        Write-Host "=========================================================" -ForegroundColor Red
        Exit
    } else {
        Write-Host "[+] PostgreSQL Windows servisi başarıyla çalışıyor ve teyit edildi." -ForegroundColor Green
    }
} else {
    Write-Warning "[!] Sistemde kayıtlı 'postgresql' adında bir Windows servisi bulunamadı. Doğrudan port kontrolüne geçiliyor..."
}

# Kontrol C: pg_isready ile Bağlantı Kabul Teyidi
$pgIsReadyExe = Join-Path $pgBinFolder "pg_isready.exe"
if (Test-Path $pgIsReadyExe) {
    $readyCheck = & $pgIsReadyExe -h localhost -p 5432
    if ($LASTEXITCODE -ne 0) {
        Write-Error "[HATA] PostgreSQL servisi aktif görünüyor fakat 5432 portu üzerinden bağlantı kabul etmiyor!"
        Exit
    } else {
        Write-Host "[+] PostgreSQL veritabanı sunucusu 5432 portunda bağlantıya hazır." -ForegroundColor Green
    }
}


# --- 2. INTERAKTİF ÇOKLU PAKET SEÇİM MENÜSÜ (SPACE / CLICK) ---
Write-Host "`n=========================================================" -ForegroundColor Cyan
Write-Host "          Bağımlılık Paketlerinin Seçimi                 " -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Host "[*] Paket kurulumları için Chocolatey altyapısı yükleniyor..." -ForegroundColor Yellow
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    $env:Path += ";$env:ALLUSERSPROFILE\chocolatey\bin"
}

# Paket listesi veri yapısı - Varsayılan olarak paketler seçili durumdadır ($true)
$packages = @(
    [PSCustomObject]@{ Name = "Node.js LTS (Çalıştırma Ortamı)"; ChocoName = "nodejs-lts"; IsSelected = $true; Command = "node"; IsNoneOption = $false },
    [PSCustomObject]@{ Name = "Git (Sürüm Kontrol Sistemi)"; ChocoName = "git"; IsSelected = $true; Command = "git"; IsNoneOption = $false },
    [PSCustomObject]@{ Name = "Hiçbiri (Seçimleri Temizle)"; ChocoName = $null; IsSelected = $false; Command = $null; IsNoneOption = $true }
)

Write-Host "[*] Kullanım Klavuzu:" -ForegroundColor Gray
Write-Host "    [Yukarı/Aşağı Ok Tuşları] Menü satırları arasında gezinir" -ForegroundColor Gray
Write-Host "    [SPACE / Boşluk Tuşu]     İlgili paketi seçer veya seçimi kaldırır" -ForegroundColor Gray
Write-Host "    [ENTER]                   Mevcut seçimleri onaylar ve işlem aşamasına geçer`n" -ForegroundColor Gray

$index = 0
$running = $true
$startTop = [Console]::CursorTop

while ($running) {
    # Menü arayüzü çizim işlemi
    [Console]::SetCursorPosition(0, $startTop)
    for ($i = 0; $i -lt $packages.Count; $i++) {
        $p = $packages[$i]
        
        $checkSymbol = if ($p.IsSelected) { "[+]" } else { "[ ]" }
        $checkColor = if ($p.IsSelected) { "Green" } else { "DarkGray" }
        
        if ($i -eq $index) {
            Write-Host " > " -ForegroundColor Cyan -NoNewline
            Write-Host "$checkSymbol " -ForegroundColor $checkColor -NoNewline
            Write-Host $p.Name -ForegroundColor Cyan
        } else {
            Write-Host "   " -NoNewline
            Write-Host "$checkSymbol " -ForegroundColor $checkColor -NoNewline
            Write-Host $p.Name -ForegroundColor White
        }
    }

    $key = [Console]::ReadKey($true)

    switch ($key.Key) {
        "UpArrow" {
            if ($index -gt 0) { $index-- }
        }
        "DownArrow" {
            if ($index -lt ($packages.Count -1)) { $index++ }
        }
        "Spacebar" {
            # Durum tersleme işlemi (Toggle)
            $packages[$index].IsSelected = -not $packages[$index].IsSelected
            
            # "Hiçbiri" seçeneği aktif edildiyse diğer tüm paketlerin seçim durumunu kaldırır
            if ($packages[$index].IsNoneOption -and $packages[$index].IsSelected) {
                for ($j = 0; $j -lt $packages.Count; $j++) {
                    if (-not $packages[$j].IsNoneOption) {
                        $packages[$j].IsSelected = $false
                    }
                }
            }
            # Herhangi bir paket aktif edildiyse "Hiçbiri" seçeneğinin durumunu kaldırır
            if (-not $packages[$index].IsNoneOption -and $packages[$index].IsSelected) {
                for ($j = 0; $j -lt $packages.Count; $j++) {
                    if ($packages[$j].IsNoneOption) {
                        $packages[$j].IsSelected = $false
                    }
                }
            }
        }
        "Enter" {
            $running = $false
        }
    }
}

Write-Host ""

# Seçilmiş olan geçerli paketlerin filtrelenmesi
$selectedPackages = $packages | Where-Object { $_.IsSelected -eq $true -and $_.IsNoneOption -eq $false }

if ($selectedPackages) {
    foreach ($pkg in $selectedPackages) {
        if (-not (Get-Command $pkg.Command -ErrorAction SilentlyContinue)) {
            Write-Host "[*] $($pkg.Name) yükleme işlemi başlatılıyor..." -ForegroundColor Yellow
            choco install $pkg.ChocoName -y
        } else {
            Write-Host "[+] $($pkg.Name) sistemde mevcut, kurulum adımı atlandı." -ForegroundColor Green
        }
    }
} else {
    Write-Host "[*] Herhangi bir paket seçilmedi, bağımlılık yükleme adımı atlandı." -ForegroundColor Cyan
}


# --- 3. POSTGRESQL KULLANICI VE DB YAPILANDIRMASI ---
Write-Host "`n=========================================================" -ForegroundColor Cyan
Write-Host "           PostgreSQL Kimlik Doğrulama                   " -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

$postgresAdminPass = Read-Host "PostgreSQL 'postgres' yönetici şifresi? (Varsayılan: postgres)"
if ([string]::IsNullOrWhiteSpace($postgresAdminPass)) { $postgresAdminPass = "postgres" }

$dbUser = Read-Host "Oluşturulacak yeni veritabanı kullanıcı adı? (Varsayılan: reservation_user)"
if ([string]::IsNullOrWhiteSpace($dbUser)) { $dbUser = "reservation_user" }

$dbPass = Read-Host "Oluşturulacak veritabanı kullanıcı şifresi? (Varsayılan: Reservation123!)"
if ([string]::IsNullOrWhiteSpace($dbPass)) { $dbPass = "Reservation123!" }

$dbName = Read-Host "Oluşturulacak veritabanı adı? (Varsayılan: reservation_db)"
if ([string]::IsNullOrWhiteSpace($dbName)) { $dbName = "reservation_db" }

$env:PGPASSWORD = $postgresAdminPass
Write-Host "[*] Kimlik bilgileri doğrulanıyor..." -ForegroundColor Yellow

# Hata yakalama mekanizmasının durdurulmasını önlemek için yerel tercih geçici olarak değiştirilir
$oldPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"

$testAuth = & psql -U postgres -p 5432 -c "SELECT 1;" 2>&1

# Tercih eski haline getirilir
$ErrorActionPreference = $oldPreference

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n=========================================================" -ForegroundColor Red
    Write-Host "[HATA] PostgreSQL kimlik doğrulaması başarısız!" -ForegroundColor Red
    Write-Host "Girilmiş olan 'postgres' yönetici şifresi veritabanı sunucusu tarafından reddedildi." -ForegroundColor Yellow
    Write-Host "Lütfen şifrenizi kontrol edip betiği yeniden çalıştırın." -ForegroundColor Yellow
    Write-Host "=========================================================" -ForegroundColor Red
    Exit
}

$createUserSql = 'DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = ''' + $dbUser + ''') THEN CREATE ROLE ' + $dbUser + ' WITH LOGIN PASSWORD ''' + $dbPass + ''' SUPERUSER; END IF; END $$;'
& psql -U postgres -p 5432 -c $createUserSql | Out-Null

$checkDbSql = "SELECT 1 FROM pg_database WHERE datname = '" + $dbName + "';"
$dbExists = & psql -U postgres -p 5432 -t -A -c $checkDbSql

if ($dbExists -ne "1") {
    Write-Host "[*] '$dbName' adlı veritabanı bulunamadı, veritabanı oluşturuluyor..." -ForegroundColor Yellow
    $createDbSql = "CREATE DATABASE " + $dbName + " OWNER " + $dbUser + ";"
    & psql -U postgres -p 5432 -c $createDbSql | Out-Null
} else {
    Write-Host "[+] '$dbName' veritabanı sistemde mevcut, oluşturma adımı atlandı." -ForegroundColor Green
}

Write-Host "[+] Veritabanı rolleri ve şemalar başarıyla yapılandırıldı." -ForegroundColor Green


# --- 4. PROJE BAĞIMLILIKLARI VE PRISMA AYARLARI ---
Write-Host "`n=========================================================" -ForegroundColor Cyan
Write-Host "                 Proje Entegrasyonu                      " -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

if (Test-Path "package.json") {
    Write-Host "[*] Proje dizini doğrulandı. 'npm install' komutu çalıştırılıyor..." -ForegroundColor Yellow
    npm install
    
    $envUrl = 'DATABASE_URL="postgresql://' + $dbUser + ':' + $dbPass + '@localhost:5432/' + $dbName + '?schema=public"'
    
    if (-not (Test-Path ".env")) {
        New-Item -Path "." -Name ".env" -ItemType "file" -Value $envUrl | Out-Null
        Write-Host "[+] .env dosyası oluşturuldu." -ForegroundColor Green
    } else {
        Write-Host "[!] .env dosyası mevcut. Veritabanı bağlantı adresi şablonu:" -ForegroundColor Yellow
        Write-Host "    $envUrl" -ForegroundColor Gray
    }
    
    if (Get-Content "package.json" | Select-String "prisma") {
        Write-Host "[*] Prisma ORM bağımlılığı tespit edildi. 'npx prisma generate' komutu çalıştırılıyor..." -ForegroundColor Yellow
        npx prisma generate
    }
} else {
    Write-Host "[!] 'package.json' bulunamadı! Betiği projenin kök dizininde çalıştırın." -ForegroundColor Yellow
}

Write-Host "`n=========================================================" -ForegroundColor Green
Write-Host " Kurulum ve yapılandırma işlemleri başarıyla tamamlandı! " -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
