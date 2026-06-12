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
        Write-Host "[+] psql aracı standart dizinde bulundu ve PATH'e eklendi." -ForegroundColor Green
    } else {
        Write-Host "`n=========================================================" -ForegroundColor Red
        Write-Host "[HATA] PostgreSQL komut satırı aracına (psql.exe) ulaşılamadı!" -ForegroundColor Red
        Write-Host "PostgreSQL bilgisayarınızda kurulu olmayabilir veya hedef dizin bulunamıyor." -ForegroundColor Yellow
        Write-Host "Lütfen PostgreSQL'in bilgisayarınızda kurulu ve erişilebilir olduğundan emin olun." -ForegroundColor Yellow
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

$packages = @(
    [PSCustomObject]@{ ID = 1; Name = "Node.js LTS (Çalıştırma Ortamı)"; ChocoName = "nodejs-lts" },
    [PSCustomObject]@{ ID = 2; Name = "Git (Sürüm Kontrol Sistemi)"; ChocoName = "git" }
)

Write-Host "[*] Lütfen yüklemek istediğiniz paketleri yön tuşlarıyla gezip SPACE (Boşluk) ile seçin, ardından ENTER'a basın:" -ForegroundColor Yellow
Write-Host "(Açılan listeden çoklu seçim yapıp 'Tamam' butonuna tıklayabilirsiniz)`n" -ForegroundColor Gray

$selectedPackages = $packages | Out-GridView -Title "Yüklenecek Paketleri Seçin (Birden fazla seçmek için Ctrl veya Shift kullanabilirsiniz)" -PassThru

if ($selectedPackages) {
    foreach ($pkg in $selectedPackages) {
        $cmdCheck = if ($pkg.ID -eq 1) { "node" } else { "git" }
        if (-not (Get-Command $cmdCheck -ErrorAction SilentlyContinue)) {
            Write-Host "[*] ${pkg.Name} kuruluyor..." -ForegroundColor Yellow
            choco install $pkg.ChocoName -y
        } else {
            Write-Host "[+] ${pkg.Name} zaten sistemde kurulu." -ForegroundColor Green
        }
    }
} else {
    Write-Host "[*] Herhangi bir paket seçilmedi, bağımlılık yükleme adımı atlandı." -ForegroundColor SemiBrightCyan
}


# --- 3. POSTGRESQL KULLANICI VE DB YAPILANDIRMASI ---
Write-Host "`n=========================================================" -ForegroundColor Cyan
Write-Host "           PostgreSQL Kimlik Doğrulama                   " -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

$postgresAdminPass = Read-Host "PostgreSQL ana 'postgres' kullanıcısı şifresi? (Varsayılan: postgres)"
if ([string]::IsNullOrWhiteSpace($postgresAdminPass)) { $postgresAdminPass = "postgres" }

$dbUser = Read-Host "Projeniz için oluşturulacak yeni kullanıcı adı? (Varsayılan: reservation_user)"
if ([string]::IsNullOrWhiteSpace($dbUser)) { $dbUser = "reservation_user" }

$dbPass = Read-Host "Proje kullanıcısı için şifre ne olsun? (Varsayılan: Reservation123!)"
if ([string]::IsNullOrWhiteSpace($dbPass)) { $dbPass = "Reservation123!" }

$dbName = Read-Host "Oluşturulacak veritabanı adı? (Varsayılan: reservation_db)"
if ([string]::IsNullOrWhiteSpace($dbName)) { $dbName = "reservation_db" }

$env:PGPASSWORD = $postgresAdminPass
Write-Host "[*] Kimlik bilgileri doğrulanıyor..." -ForegroundColor Yellow

$testAuth = & psql -U postgres -p 5432 -c "SELECT 1;" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "[HATA] PostgreSQL kimlik doğrulaması başarısız! Girdiğiniz 'postgres' admin şifresi yanlış."
    Exit
}

# Değişken çakışmalarını önlemek için String Concatenation (Birleştirme) yöntemiyle güvenli SQL oluşturma
$createUserSql = 'DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = ''' + $dbUser + ''') THEN CREATE ROLE ' + $dbUser + ' WITH LOGIN PASSWORD ''' + $dbPass + ''' SUPERUSER; END IF; END $$;'
& psql -U postgres -p 5432 -c $createUserSql | Out-Null

$createDbSql = 'SELECT ''CREATE DATABASE ' + $dbName + ' OWNER ' + $dbUser + ''' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = ''' + $dbName + ''')\gexec'
& psql -U postgres -p 5432 -c $createDbSql | Out-Null

Write-Host "[+] Veritabanı rolleri ve şemalar başarıyla oluşturuldu." -ForegroundColor Green


# --- 4. PROJE BAĞIMLILIKLARI VE PRISMA AYARLARI ---
Write-Host "`n=========================================================" -ForegroundColor Cyan
Write-Host "                 Proje Entegrasyonu                      " -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

if (Test-Path "package.json") {
    Write-Host "[*] Proje dizini doğrulandı. Bağımlılıklar (npm install) yükleniyor..." -ForegroundColor Yellow
    npm install
    
    $envUrl = 'DATABASE_URL="postgresql://' + $dbUser + ':' + $dbPass + '@localhost:5432/' + $dbName + '?schema=public"'
    
    if (-not (Test-Path ".env")) {
        New-Item -Path "." -Name ".env" -ItemType "file" -Value $envUrl | Out-Null
        Write-Host "[+] .env dosyası başarıyla oluşturuldu." -ForegroundColor Green
    } else {
        Write-Host "[!] .env dosyası zaten mevcut. Gerekirse bağlantı adresinizi şu şekilde güncelleyin:" -ForegroundColor Yellow
        Write-Host "    $envUrl" -ForegroundColor Gray
    }
    
    if (Get-Content "package.json" | Select-String "prisma") {
        Write-Host "[*] Prisma ORM tespit edildi. Şema yapıları oluşturuluyor..." -ForegroundColor Yellow
        npx prisma generate
    }
} else {
    Write-Host "[!] 'package.json' bulunamadı! Lütfen betiği projenin kök klasöründe çalıştırın." -ForegroundColor Yellow
}

Write-Host "`n=========================================================" -ForegroundColor Green
Write-Host " Kurulum ve yapılandırma işlemleri başarıyla tamamlandı! " -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
