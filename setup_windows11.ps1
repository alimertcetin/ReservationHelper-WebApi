<#
.SYNOPSIS
    Windows 11 Esnek Kurulum ve Yapılandırma Betiği
    ReservationHelper-WebApi projesi için özelleştirilmiştir.
.DESCRIPTION
    Bu betik PostgreSQL kurulumu yapmaz; mevcut kurulumu doğrular, yapılandırır,
    kullanıcı seçimine göre bağımlılıkları yükler ve veritabanı ayarlarını tamamlar.
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
Write-Host " ReservationHelper-WebApi Gelişmiş Kurulum Betiği " -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

# --- 1. POSTGRESQL DOĞRULAMA VE KONTROL AŞAMASI ---
Write-Host "`n[*] PostgreSQL kurulumu ve servis durumu kontrol ediliyor..." -ForegroundColor Yellow

$psqlPath = $null

# Kontrol A: PATH ortam değişkeninde psql var mı?
if (Get-Command psql -ErrorAction SilentlyContinue) {
    $psqlPath = (Get-Command psql).Source
    Write-Host "[+] psql sistemi ortam değişkenlerinde (PATH) bulundu." -ForegroundColor Green
} else {
    # Kontrol B: Standart kurulum dizininde psql arama
    Write-Host "[!] psql komutu PATH içinde bulunamadı. Program Files taranıyor..." -ForegroundColor Yellow
    $searchPath = Join-Path $env:ProgramFiles "PostgreSQL\*\bin\psql.exe"
    $foundFiles = Resolve-Path $searchPath -ErrorAction SilentlyContinue

    if ($foundFiles) {
        # En güncel sürümü seç (alfabetik/nümerik olarak en sonuncusu)
        $latestPsql = $foundFiles | Sort-Object Path -Descending | Select-Object -First 1
        $pgBinFolder = Split-Path $latestPsql.Path
        
        # Mevcut oturum için PATH'e ekle
        $env:Path += ";$pgBinFolder"
        $psqlPath = $latestPsql.Path
        Write-Host "[+] PostgreSQL dizini bulundu ve geçici olarak PATH'e eklendi: $pgBinFolder" -ForegroundColor Green
    } else {
        Write-Error "PostgreSQL bilgisayarınızda bulunamadı! Lütfen önce PostgreSQL yükleyin, ardından bu scripti tekrar çalıştırın."
        Exit
    }
}

# Kontrol C: Windows Servis Kontrolü
$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pgService) {
    if ($pgService.Status -ne 'Running') {
        Write-Host "[*] PostgreSQL servisi durdurulmuş. Başlatılıyor..." -ForegroundColor Yellow
        Start-Service $pgService.Name
        Write-Host "[+] PostgreSQL servisi başarıyla başlatıldı." -ForegroundColor Green
    } else {
        Write-Host "[+] PostgreSQL servisi arka planda aktif olarak çalışıyor." -ForegroundColor Green
    }
} else {
    Write-Warning "PostgreSQL Windows Servisi bulunamadı. PostgreSQL'in yerel olarak çalıştığından emin olun."
}


# --- 2. İNTERAKTİF PAKET SEÇİM AŞAMASI ---
Write-Host "`n=========================================================" -ForegroundColor Cyan
Write-Host " Kurulacak Paketlerin Seçimi " -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

# Chocolatey kontrolü (Seçim yapılırsa paket yüklemek için gerekli)
if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Host "[*] Paket yönetimi için Chocolatey kuruluyor..." -ForegroundColor Yellow
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    $env:Path += ";$env:ALLUSERSPROFILE\chocolatey\bin"
}

Write-Host "Lütfen yüklemek istediğiniz paketleri seçin:" -ForegroundColor White
Write-Host "[1] Node.js LTS (JavaScript Çalıştırma Ortamı)" -ForegroundColor Gray
Write-Host "[2] Git (Sürüm Kontrol Sistemi)" -ForegroundColor Gray
Write-Host "--------------------------------------------------------" -ForegroundColor Gray
Write-Host "Seçenekler: 'A' (Hepsini Kur), 'N' (Hiçbirini Kurma / Atla) veya numaraları virgülle ayırarak yazın (Örn: 1,2)" -ForegroundColor Yellow

$packageSelection = Read-Host "`nSeçiminiz (Varsayılan: A)"
if ([string]::IsNullOrWhiteSpace($packageSelection)) { $packageSelection = "A" }

$packageSelection = $packageSelection.ToUpper()

if ($packageSelection -ne "N") {
    if ($packageSelection -eq "A") {
        Write-Host "[*] Tüm paketler kuruluyor..." -ForegroundColor Yellow
        if (-not (Get-Command node -ErrorAction SilentlyContinue)) { choco install nodejs-lts -y } else { Write-Host "[+] Node.js zaten kurulu." -ForegroundColor Green }
        if (-not (Get-Command git -ErrorAction SilentlyContinue)) { choco install git -y } else { Write-Host "[+] Git zaten kurulu." -ForegroundColor Green }
    } else {
        $choices = $packageSelection -split ','
        foreach ($choice in $choices) {
            switch ($choice.Trim()) {
                "1" { if (-not (Get-Command node -ErrorAction SilentlyContinue)) { choco install nodejs-lts -y } else { Write-Host "[+] Node.js zaten kurulu." -ForegroundColor Green } }
                "2" { if (-not (Get-Command git -ErrorAction SilentlyContinue)) { choco install git -y } else { Write-Host "[+] Git zaten kurulu." -ForegroundColor Green } }
                Default { Write-Warning "Geçersiz seçim yoksayıldı: $choice" }
            }
        }
    }
} else {
    Write-Host "[*] Bağımlılık kurulum aşaması kullanıcı isteğiyle atlandı." -ForegroundColor Yellow
}


# --- 3. DİNAMİK POSTGRESQL YAPILANDIRMASI (INPUT) ---
Write-Host "`n=========================================================" -ForegroundColor Cyan
Write-Host " PostgreSQL Yapılandırma Ayarları " -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

# 1. Postgres Ana Kullanıcı Şifresi (Gerekli)
$postgresAdminPass = Read-Host "PostgreSQL 'postgres' (admin) kullanıcısının şifresi nedir? (Varsayılan: postgres)"
if ([string]::IsNullOrWhiteSpace($postgresAdminPass)) { $postgresAdminPass = "postgres" }

# 2. Yeni Oluşturulacak Proje Kullanıcı Adı
$dbUser = Read-Host "Proje için oluşturulacak yeni kullanıcı adı? (Varsayılan: reservation_user)"
if ([string]::IsNullOrWhiteSpace($dbUser)) { $dbUser = "reservation_user" }

# 3. Yeni Oluşturulacak Proje Şifresi
$dbPass = Read-Host "Proje kullanıcısı için şifre ne olsun? (Varsayılan: Reservation123!)"
if ([string]::IsNullOrWhiteSpace($dbPass)) { $dbPass = "Reservation123!" }

# 4. Veritabanı Adı
$dbName = Read-Host "Oluşturulacak veritabanı adı? (Varsayılan: reservation_db)"
if ([string]::IsNullOrWhiteSpace($dbName)) { $dbName = "reservation_db" }

# Veritabanında Rollere Göre Yapılandırmayı Çalıştır
Write-Host "`n[*] Veritabanı yapılandırılıyor..." -ForegroundColor Yellow
$env:PGPASSWORD = $postgresAdminPass

# Kullanıcı oluşturma SQL'i
$createUserSql = "DO `$ `$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${dbUser}') THEN CREATE ROLE ${dbUser} WITH LOGIN PASSWORD '${dbPass}' SUPERUSER; END IF; END `$ `$;"
& psql -U postgres -c $createUserSql 2>$null

if ($LASTEXITCODE -ne 0) {
    Write-Error "PostgreSQL bağlantısı başarısız oldu! Girdiğiniz admin şifresini veya pg_hba.conf izinlerini kontrol edin."
    Exit
}

# Veritabanı oluşturma SQL'i
$createDbSql = "SELECT 'CREATE DATABASE ${dbName} OWNER ${dbUser}' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${dbName}')\gexec"
& psql -U postgres -c $createDbSql

Write-Host "[+] Veritabanı ve '${dbUser}' rolü başarıyla hazırlandı." -ForegroundColor Green


# --- 4. PROJE BAĞIMLILIKLARI VE PRISMA AYARLARI ---
Write-Host "`n=========================================================" -ForegroundColor Cyan
Write-Host " Proje Entegrasyonu " -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

if (Test-Path "package.json") {
    Write-Host "[*] Proje klasörü doğrulandı. Bağımlılıklar (npm install) yükleniyor..." -ForegroundColor Yellow
    npm install
    
    # Güvenli .env URL formatı
    $envUrl = "DATABASE_URL=`"postgresql://${dbUser}:${dbPass}@localhost:5432/${dbName}?schema=public`" "
    
    if (-not (Test-Path ".env")) {
        New-Item -Path "." -Name ".env" -ItemType "file" -Value $envUrl | Out-Null
        Write-Host "[+] .env dosyası başarıyla oluşturuldu." -ForegroundColor Green
    } else {
        Write-Host "[!] .env dosyası zaten mevcut. Lütfen bağlantı adresinizi şu şekilde güncelleyin:" -ForegroundColor Yellow
        Write-Host "    $envUrl" -ForegroundColor Gray
    }
    
    # Prisma kontrolü ve tetikleme
    if (Get-Content "package.json" | Select-String "prisma") {
        Write-Host "[*] Prisma ORM algılandı. Client şeması üretiliyor..." -ForegroundColor Yellow
        npx prisma generate
    }
} else {
    Write-Host "[!] 'package.json' bulunamadı! Lütfen bu betiği projenizin kök klasörüne koyup oradan çalıştırın." -ForegroundColor Yellow
}

Write-Host "`n=========================================================" -ForegroundColor Green
Write-Host " İşlem Tamamlandı! " -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
