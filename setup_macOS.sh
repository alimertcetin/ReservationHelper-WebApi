#!/usr/bin/env zsh

# =========================================================================
# SYNOPSIS
#     macOS Gelişmiş Kurulum ve Ağ Doğrulama Betiği
# DESCRIPTION
#     PostgreSQL servislerini döngüsel olarak kontrol eder ve çalıştırır.
#     psql erişimini denetler ve interaktif çoklu paket seçimi sunar.
# =========================================================================

# Renk Tanımlamaları
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # Renksiz (Reset)

echo -e "${CYAN}=========================================================${NC}"
echo -e "${CYAN}          Automated Environment Setup Script              ${NC}"
echo -e "${CYAN}=========================================================${NC}"

# --- 1. POSTGRESQL KONTROL VE DÖNGÜSEL ÇALIŞTIRMA MEKANİZMASI ---
echo -e "\n${YELLOW}[*] PostgreSQL dosya yolları ve servis durumu denetleniyor...${NC}"

# Kontrol A: psql komutunun sistemde kayıtlı olup olmadığının kontrolü
if command -v psql &> /dev/null; then
    echo -e "${GREEN}[+] psql komut satırı aracına sistem PATH değişkeninden ulaşıldı.${NC}"
else
    # macOS Intel ve Apple Silicon (M1/M2/M3) için standart Homebrew yolları kontrolü
    BREW_PG_PATHS=("/opt/homebrew/bin/psql" "/usr/local/bin/psql")
    PG_FOUND=false
    
    for path in "${BREW_PG_PATHS[@]}"; do
        if [ -f "$path" ]; then
            export PATH="$(dirname "$path"):$PATH"
            echo -e "${GREEN}[+] psql aracı standart dizinde tespit edildi ve PATH değişkenine eklendi.${NC}"
            PG_FOUND=true
            break
        fi
    done

    if [ "$PG_FOUND" = false ]; then
        echo -e "\n${RED}=========================================================${NC}"
        echo -e "${RED}[HATA] PostgreSQL komut satırı aracına (psql) ulaşılamadı!${NC}"
        echo -e "${YELLOW}PostgreSQL sistemde kurulu olmayabilir veya Homebrew yolları hatalı.${NC}"
        echo -e "${YELLOW}PostgreSQL kurulumunu kontrol edin: 'brew install postgresql@14' (veya güncel sürüm)${NC}"
        echo -e "${RED}=========================================================${NC}"
        exit 1
    fi
fi

# Kontrol B: macOS Homebrew Servis Durumu ve Döngüsel Yeniden Başlatma Kontrolü
if command -v brew &> /dev/null; then
    # Aktif postgresql servis adını yakala (örn: postgresql@14 veya postgresql)
    PG_SERVICE_NAME=$(brew services list | grep postgresql | awk '{print $1}' | head -n 1)
    
    if [ -n "$PG_SERVICE_NAME" ]; then
        retryCount=0
        maxRetries=3
        retryIntervalSeconds=4
        
        SERVICE_STATUS=$(brew services list | grep "^$PG_SERVICE_NAME " | awk '{print $2}')
        
        while [ "$SERVICE_STATUS" != "started" ] && [ $retryCount -lt $maxRetries ]; do
            ((retryCount++))
            echo -e "${YELLOW}[!] PostgreSQL servisi aktif değil. Başlatma denemesi gerçekleştiriliyor ($retryCount/$maxRetries)...${NC}"
            brew services start "$PG_SERVICE_NAME" &> /dev/null
            sleep $retryIntervalSeconds
            SERVICE_STATUS=$(brew services list | grep "^$PG_SERVICE_NAME " | awk '{print $2}')
        done

        if [ "$SERVICE_STATUS" != "started" ]; then
            echo -e "\n${RED}=========================================================${NC}"
            echo -e "${RED}[HATA] PostgreSQL servisi başlatılamadı!${NC}"
            echo -e "${YELLOW}'brew services restart $PG_SERVICE_NAME' komutu ile manuel tetikleyin.${NC}"
            echo -e "${RED}=========================================================${NC}"
            exit 1
        else
            echo -e "${GREEN}[+] PostgreSQL servisinin çalıştığı teyit edildi.${NC}"
        fi
    else
        echo -e "${YELLOW}[!] 'brew services' altında kayıtlı bir postgresql servisi bulunamadı. Port kontrolüne geçiliyor...${NC}"
    fi
else
    echo -e "${YELLOW}[!] Homebrew bulunamadı, servis kontrolü atlanıyor. Doğrudan port kontrol aşamasına geçiliyor...${NC}"
fi

# Kontrol C: pg_isready ile Bağlantı Kabul Teyidi
if command -v pg_isready &> /dev/null; then
    pg_isready -h localhost -p 5432 &> /dev/null
    if [ $? -ne 0 ]; then
        echo -e "${RED}[HATA] PostgreSQL servisi aktif fakat 5432 portu üzerinden bağlantı kabul etmiyor!${NC}"
        exit 1
    else
        echo -e "${GREEN}[+] PostgreSQL veritabanı sunucusu 5432 portunda bağlantıya hazır.${NC}"
    fi
fi


# --- 2. İNTERAKTİF TERMİNAL TABANLI ÇOKLU PAKET SEÇİM MENÜSÜ ---
echo -e "\n${CYAN}=========================================================${NC}"
echo -e "${CYAN}          Bağımlılık Paketlerinin Seçimi                 ${NC}"
echo -e "${CYAN}=========================================================${NC}"

# Homebrew eksikse yükle
if ! command -v brew &> /dev/null; then
    echo -e "${YELLOW}[*] Paket kurulumları için Homebrew altyapısı yükleniyor...${NC}"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Apple Silicon ve Intel için path'i güncelle
    if [ -f /opt/homebrew/bin/brew ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -f /usr/local/bin/brew ]; then
        eval "$(/usr/local/bin/brew shellenv)"
    fi
fi

# Paket listesi simülasyonu
pkg_names=("Node.js LTS (Çalıştırma Ortamı)" "Git (Sürüm Kontrol Sistemi)" "Hiçbiri (Seçimleri Temizle)")
pkg_brew=("node" "git" "none")
pkg_cmd=("node" "git" "none")
pkg_sel=(true true false)

echo -e "${GRAY}[*] Kullanım Kılavuzu:${NC}"
echo -e "${GRAY}    [Yukarı/Aşağı Ok Tuşları] Menü satırları arasında gezinir${NC}"
echo -e "${GRAY}    [SPACE / Boşluk Tuşu]     İlgili paketi seçer veya seçimi kaldırır${NC}"
echo -e "${GRAY}    [ENTER]                    Mevcut seçimleri onaylar ve işlem aşamasına geçer\n${NC}"

index=0
running=true

# Terminal ekran koruması ve klavye okuma ayarları
stty -echo
tput civis # İmleci gizle

while [ "$running" = true ]; do
    # Menüyü çiz
    for i in {0..2}; do
        if [ ${pkg_sel[$i+1]} = true ]; then
            checkSymbol="[+]"
            checkColor=$GREEN
        else
            checkSymbol="[ ]"
            checkColor=$GRAY
        fi

        if [ $i -eq $index ]; then
            echo -e " > ${checkColor}${checkSymbol}${NC} ${CYAN}${pkg_names[$i+1]}${NC}"
        else
            echo -e "   ${checkColor}${checkSymbol}${NC} ${pkg_names[$i+1]}"
        fi
    done

    # Klavyeden girdi al (macOS/BSD uyumlu)
    read -r -k 1 key
    if [[ $key == $'\x1b' ]]; then
        read -r -k 2 key
        if [[ $key == '[A' ]]; then # Yukarı Ok
            if [ $index -gt 0 ]; then ((index--)); fi
        elif [[ $key == '[B' ]]; then # Aşağı Ok
            if [ $index -lt 2 ]; then ((index++)); fi
        fi
    elif [[ $key == " " ]]; then # Boşluk
        idx=$((index + 1))
        if [ ${pkg_sel[$idx]} = true ]; then
            pkg_sel[$idx]=false
        else
            pkg_sel[$idx]=true
            # Hiçbiri seçildiyse diğerlerini temizle
            if [ $index -eq 2 ]; then
                pkg_sel=(false false false true)
            else
                pkg_sel[3]=false
            fi
        fi
    elif [[ $key == "" ]]; then # Enter
        running=false
    fi

    # Menüyü yukarı taşıyarak üzerine yazılmasını sağla
    tput cuu 3
    tput ed
done

# Terminal ayarlarını geri yükle
stty echo
tput cnorm # İmleci göster
echo -e "\n"

# Seçilen paketleri yükle
any_selected=false
for i in {1..2}; do
    if [ ${pkg_sel[$i]} = true ]; then
        any_selected=true
        cmd=${pkg_cmd[$i]}
        brew_name=${pkg_brew[$i]}
        name=${pkg_names[$i]}
        
        if ! command -v "$cmd" &> /dev/null; then
            echo -e "${YELLOW}[*] $name yükleme işlemi başlatılıyor...${NC}"
            brew install "$brew_name"
        else
            echo -e "${GREEN}[+] $name sistemde mevcut, kurulum adımı atlandı.${NC}"
        fi
    fi
done

if [ "$any_selected" = false ]; then
    echo -e "${CYAN}[*] Herhangi bir paket seçilmedi veya 'Hiçbiri' seçeneği tercih edildi. Bağımlılık yükleme adımı atlandı.${NC}"
fi


# --- 3. POSTGRESQL KULLANICI VE DB YAPILANDIRMASI ---
echo -e "\n${CYAN}=========================================================${NC}"
echo -e "${CYAN}            PostgreSQL Kimlik Doğrulama                  ${NC}"
echo -e "${CYAN}=========================================================${NC}"

# macOS'te varsayılan PostgreSQL kurulumu şifresiz gelebilir, bu yüzden prompt mantığı korunur
printf "PostgreSQL 'postgres' yönetici şifresi? (Varsayılan: postgres): "
read -r postgresAdminPass
[ -z "$postgresAdminPass" ] && postgresAdminPass="postgres"

printf "Oluşturulacak yeni veritabanı kullanıcı adı? (Varsayılan: reservation_user): "
read -r dbUser
[ -z "$dbUser" ] && dbUser="reservation_user"

printf "Oluşturulacak veritabanı kullanıcı şifresi? (Varsayılan: Reservation123!): "
read -r dbPass
[ -z "$dbPass" ] && dbPass="Reservation123!"

printf "Oluşturulacak veritabanı adı? (Varsayılan: reservation_db): "
read -r dbName
[ -z "$dbName" ] && dbName="reservation_db"

export PGPASSWORD="$postgresAdminPass"
echo -e "${YELLOW}[*] Kimlik bilgileri doğrulanıyor...${NC}"

# Bağlantı testi
psql -U postgres -h localhost -p 5432 -c "SELECT 1;" &> /dev/null
if [ $? -ne 0 ]; then
    echo -e "\n${RED}=========================================================${NC}"
    echo -e "${RED}[HATA] PostgreSQL kimlik doğrulaması başarısız!${NC}"
    echo -e "${YELLOW}Girilmiş olan 'postgres' şifresi geçersiz veya sunucu erişilemez durumda.${NC}"
    echo -e "${RED}=========================================================${NC}"
    exit 1
fi

# Rol Oluşturma (SQL script)
createUserSql="DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$dbUser') THEN CREATE ROLE $dbUser WITH LOGIN PASSWORD '$dbPass' SUPERUSER; END IF; END \$\$;"
psql -U postgres -h localhost -p 5432 -c "$createUserSql" &> /dev/null

# DB kontrol ve oluşturma
dbExists=$(psql -U postgres -h localhost -p 5432 -t -A -c "SELECT 1 FROM pg_database WHERE datname = '$dbName';")

if [ "$dbExists" != "1" ]; then
    echo -e "${YELLOW}[*] '$dbName' adlı veritabanı bulunamadı, veritabanı oluşturuluyor...${NC}"
    psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE $dbName OWNER $dbUser;" &> /dev/null
else
    echo -e "${GREEN}[+] '$dbName' veritabanı sistemde mevcut, oluşturma adımı atlandı.${NC}"
fi

echo -e "${GREEN}[+] Veritabanı rolleri ve şemalar başarıyla yapılandırıldı.${NC}"


# --- 4. PROJE BAĞIMLILIKLARI VE PRISMA AYARLARI ---
echo -e "\n${CYAN}=========================================================${NC}"
echo -e "${CYAN}                Proje Entegrasyonu                       ${NC}"
echo -e "${CYAN}=========================================================${NC}"

if [ -f "package.json" ]; then
    echo -e "${YELLOW}[*] Proje dizini doğrulandı. 'npm install' komutu çalıştırılıyor...${NC}"
    npm install
    
    envUrl="DATABASE_URL=\"postgresql://$dbUser:$dbPass@localhost:5432/$dbName?schema=public\""
    
    if [ ! -f ".env" ]; then
        echo "$envUrl" > .env
        echo -e "${GREEN}[+] .env dosyası oluşturuldu.${NC}"
    else
        echo -e "${YELLOW}[!] .env dosyası mevcut. Veritabanı bağlantı adresi şablonu:${NC}"
        echo -e "${GRAY}    $envUrl${NC}"
    fi
    
    if grep -q "prisma" package.json; then
        echo -e "${YELLOW}[*] Prisma ORM bağımlılığı tespit edildi. 'npx prisma generate' komutu çalıştırılıyor...${NC}"
        npx prisma generate
    fi
else
    echo -e "${YELLOW}[!] 'package.json' bulunamadı! Betiği projenin kök dizininde çalıştırın.${NC}"
fi

echo -e "\n${GREEN}=========================================================${NC}"
echo -e "${GREEN} Kurulum ve yapılandırma işlemleri tamamlandı.          ${NC}"
echo -e "${GREEN}=========================================================${NC}"