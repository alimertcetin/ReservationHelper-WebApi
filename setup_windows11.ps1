<#
.SYNOPSIS
    Windows 11 Automated Setup Script for ReservationHelper-WebApi
    Deploys Node.js, PostgreSQL, Git, configures DB users, installs npm packages, and configures Prisma.
.DESCRIPTION
    This script requires Administrative privileges. Run via PowerShell as Administrator.
#>

# Ensure script is running as Administrator
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Lütfen bu betiği yönetici (Administrator) olarak çalıştırın!"
    Exit
}

Set-ExecutionPolicy Bypass -Scope Process -Force
$ErrorActionPreference = "Stop"

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host " ReservationHelper-WebApi Windows 11 Otomatik Kurulumu " -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

# 1. Chocolatey Kurulum Kontrolü (Paket Yöneticisi)
if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Host "[*] Chocolatey kuruluyor..." -ForegroundColor Yellow
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    $env:Path += ";$env:ALLUSERSPROFILE\chocolatey\bin"
} else {
    Write-Host "[+] Chocolatey zaten kurulu." -ForegroundColor Green
}

# 2. Gerekli Paketlerin Kurulumu (Node.js, Git, PostgreSQL)
Write-Host "[*] Gerekli bağımlılıklar kontrol ediliyor ve kuruluyor..." -ForegroundColor Yellow

# Node.js LTS
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[*] Node.js (LTS) kuruluyor..." -ForegroundColor Yellow
    choco install nodejs-lts -y
} else {
    Write-Host "[+] Node.js zaten kurulu: $(node -v)" -ForegroundColor Green
}

# Git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[*] Git kuruluyor..." -ForegroundColor Yellow
    choco install git -y
} else {
    Write-Host "[+] Git zaten kurulu." -ForegroundColor Green
}

# PostgreSQL
$pgVersion = "16" # En kararlı ve güncel sürüm
if (-not (Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue)) {
    Write-Host "[*] PostgreSQL $pgVersion kuruluyor..." -ForegroundColor Yellow
    # Varsayılan PostgreSQL şifresi olarak 'postgres' atanıyor
    choco install postgresql$pgVersion --params "password=postgres" -y
    
    # Ortam değişkenlerini yenile
    $env:Path += ";C:\Program Files\PostgreSQL\$pgVersion\bin"
} else {
    Write-Host "[+] PostgreSQL servisi zaten mevcut." -ForegroundColor Green
}

# Ortam değişkenlerini güncel PowerShell oturumuna yansıt
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

# PostgreSQL Servisini Başlatma Garantisi
Write-Host "[*] PostgreSQL servisi kontrol ediliyor..." -ForegroundColor Yellow
$pgService = Get-Service -Name "postgresql*" | Select-Object -First 1
if ($pgService) {
    if ($pgService.Status -ne 'Running') {
        Start-Service $pgService.Name
        Write-Host "[+] PostgreSQL servisi başlatıldı." -ForegroundColor Green
    } else {
        Write-Host "[+] PostgreSQL servisi çalışıyor." -ForegroundColor Green
    }
}

# 3. PostgreSQL Kullanıcı ve Veritabanı Yapılandırması
Write-Host "[*] Veritabanı ve kullanıcı rolleri oluşturuluyor..." -ForegroundColor Yellow

# Prisma/WebAPI projelerinde yaygın olarak tercih edilen varsayılan yapılandırma:
# Kullanıcı adı: reservation_user | Şifre: Reservation123! | DB: reservation_db
$dbUser = "reservation_user"
$dbPass = "Reservation123!"
$dbName = "reservation_db"

# PostgreSQL bin dizinini bul
$pgBinPath = Join-Path $env:ProgramFiles "PostgreSQL\*\bin" | Get-Item | Select-Object -First 1
if ($pgBinPath) {
    $psql = Join-Path $pgBinPath.FullName "psql.exe"
    $env:PGPASSWORD = "postgres" # Kurulumdaki ana şifre
    
    # Kullanıcı oluşturma SQL komutu
    $createUserSql = "DO `$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$dbUser') THEN CREATE ROLE $dbUser WITH LOGIN PASSWORD '$dbPass' SUPERUSER; END IF; END `$\$;"
    & $psql -U postgres -c $createUserSql
    
    # Veritabanı oluşturma SQL komutu
    $createDbSql = "SELECT 'CREATE DATABASE $dbName OWNER $dbUser' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$dbName')\gexec"
    & $psql -U postgres -c $createDbSql
    
    Write-Host "[+] Veritabanı ve '$dbUser' kullanıcısı başarıyla yapılandırıldı!" -ForegroundColor Green
} else {
    Write-Warning "psql.exe bulunamadı! Lütfen PostgreSQL bin klasörünün PATH değişkeninde olduğundan emin olun."
}

# 4. Proje Bağımlılıkları ve Prisma Ayarları
if (Test-Path "package.json") {
    Write-Host "[*] Proje klasöründesiniz. Bağımlılıklar (npm install) yükleniyor..." -ForegroundColor Yellow
    npm install
    
    # .env Dosyası Oluşturma veya Güncelleme
    $envUrl = "DATABASE_URL=`"postgresql://$dbUser:$dbPass@localhost:5432/$dbName?schema=public`""
    if (-not (Test-Path ".env")) {
        New-Item -Path "." -Name ".env" -ItemType "file" -Value $envUrl | Out-Null
        Write-Host "[+] .env dosyası oluşturuldu ve DATABASE_URL eklendi." -ForegroundColor Green
    } else {
        Write-Host "[!] .env dosyası zaten mevcut. Lütfen DATABASE_URL'inizi kontrol edin:" -ForegroundColor Yellow
        Write-Host "    $envUrl" -ForegroundColor Gray
    }
    
    # Prisma Client ve Migration çalıştırma denemesi
    if (Get-Content "package.json" | Select-String "prisma") {
        Write-Host "[*] Prisma algılandı. Kod üretimi ve şema senkronizasyonu başlatılıyor..." -ForegroundColor Yellow
        npx prisma generate
        # npx prisma db push # veya npx prisma migrate dev --name init
    }
} else {
    Write-Host "[!] 'package.json' bulunamadı. Betiği lütfen projenin kök (root) dizininde çalıştırın veya repoyu clone edin." -ForegroundColor Yellow
}

Write-Host "=========================================================" -ForegroundColor Green
Write-Host " Kurulum Tamamlandı!" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
