# Gelişmiş Ortam Kurulum Betikleri (Windows & macOS)

Bu dizin, projenizin yerel geliştirme ortamını hızlı, güvenli ve otomatik bir şekilde ayağa kaldırmak için tasarlanmış iki adet gelişmiş otomasyon betiği içerir. 

Sistem mimarinize göre (`setup_w11.bat` / `setup_windows11.ps1` veya `setup_macOS.sh`) ilgili betik çalıştırıldığında; PostgreSQL servis kontrolü, eksik sistem paketlerinin (Node.js, Git vb.) terminal tabanlı interaktif seçimi, veritabanı/kullanıcı yapılandırması ve proje bağımlılıklarının (`npm install`, `Prisma ORM`) entegrasyonu tamamen otomatik olarak gerçekleştirilir.

---

## 🚀 Betiklerin Gerçekleştirdiği İşlemler (Adım Adım)

Betikler çalıştırıldığında sırasıyla aşağıdaki 4 ana aşamayı icra eder:

### 1. PostgreSQL Kontrolü ve Servis Yönetimi
* `psql` komutunun sistem `PATH` değişkeninde tanımlı olup olmadığını denetler. Eksikse yaygın kurulum dizinlerini (`Program Files` veya `Homebrew`) tarayarak geçici olarak ortama dahil eder.
* PostgreSQL servisinin durumunu kontrol eder. Servis kapalıysa, **3 kez döngüsel olarak (4'er saniye arayla)** servisi otomatik başlatmayı dener.
* `pg_isready` aracı vasıtasıyla veritabanının `5432` portundan bağlantı kabul edip etmediğini teyit eder.

### 2. İnteraktif Paket Seçim Menüsü
* Sistemde Chocolatey (Windows) veya Homebrew (macOS) paket yöneticisinin kurulu olup olmadığını kontrol eder, yoksa otomatik kurar.
* Terminal içinde **Aşağı/Yukarı ok tuşları**, **Boşluk (Space)** ve **Enter** tuşları ile kontrol edilen interaktif bir menü açar.
* **Node.js LTS** ve **Git** paketlerinin sistemdeki varlığını kontrol eder, seçiminize göre eksik olanları arka planda otomatik yükler.

### 3. Veritabanı ve Kullanıcı Yapılandırması
* Sizden PostgreSQL `postgres` (admin) şifresini, oluşturulacak yeni kullanıcı adını, şifresini ve hedef veritabanı adını talep eder.
* Admin şifresini doğrulamak için bir test bağlantısı gerçekleştirir.
* Belirttiğiniz isimde bir veritabanı kullanıcısı (Role) yoksa bunu `SUPERUSER` yetkileriyle oluşturur.
* Belirttiğiniz isimde bir veritabanı (Database) yoksa, sahibini yeni kullanıcı atayarak otomatik oluşturur.

### 4. Proje Entegrasyonu ve Prisma Ayarları
* Betiğin çalıştırıldığı dizinde `package.json` dosyasını arayarak proje kök dizininde olup olmadığınızı doğrular.
* `npm install` komutunu işleterek tüm bağımlılıkları yükler.
* Girilen kimlik bilgileriyle dinamik bir `DATABASE_URL` oluşturur. Dizinde `.env` dosyası yoksa otomatik üretir, varsa mevcut yapıyı koruyarak terminale çıktı verir.
* Projede Prisma ORM bağımlılığı tespit edilirse `npx prisma generate` komutunu tetikleyerek şemaları hazır hale getirir.

---

## 🛠️ Çalıştırma Talimatları

Betiklerin sağlıklı çalışabilmesi ve `npm install` süreçlerini yönetebilmesi için terminalinizin **projenin kök dizininde (package.json dosyasının olduğu yer)** açılmış olması gerekmektedir.

### 🪟 Windows 11 Üzerinde Çalıştırma

Windows betiği, PowerShell üzerinde kısıtlayıcı execution policy (çalıştırma politikası) engellerine takılmamanız ve yönetici haklarını otomatik kazanmanız için hibrit bir `bat` tetikleyicisi ile donatılmıştır.

1.  **Terminali/Komut Satırını Açın:** Projenizin kök dizinine gidin.
2.  **Tetikleyiciyi Çalıştırın:** Aşağıdaki komutu yürütün:
    ```cmd
    setup_w11.bat
    ```
3.  **Yönetici İzni:** Ekrana gelecek olan UAC (Kullanıcı Hesabı Denetimi) uyarısını onaylayarak betiğe yönetici yetkisi verin. Betik yeni bir PowerShell penceresinde güvenli modda (`Bypass`) açılacaktır.

---

### 🍏 macOS Üzerinde Çalıştırma

macOS betiği modern `zsh` kabuğu ile uyumlu çalışır. Ok tuşları ve imleç gizleme özellikleri için standart POSIX terminal komutlarını kullanır.

1.  **Terminali Açın:** Projenizin kök dizinine gidin.
2.  **Çalıştırma İzni (Sadece İlk Sefer İçin):** Betiğe çalıştırma yetkisi vermek adına aşağıdaki komutu çalıştırın:
    ```bash
    chmod +x setup_macOS.sh
    ```
3.  **Betiği Başlatın:** Betiği doğrudan yerel kabukta tetikleyin:
    ```bash
    ./setup_macOS.sh
    ```
    *(Not: Eğer sisteminizde Homebrew kurulu değilse, kurulum esnasında bir defaya mahsus macOS kullanıcı şifrenizi talep edebilir.)*

---

## ⚠️ Önemli Notlar ve Sorun Giderme

* **Şifre Girdileri:** Veritabanı yapılandırma adımında girdileri boş bırakırsanız parantez içinde belirtilen `(Varsayılan: ...)` değerler otomatik olarak atanır.
* **İnteraktif Menü Kontrolü:** Paket seçim ekranında ok tuşlarıyla gezinirken seçimleri değiştirmek için mutlaka **Boşluk (Space)** tuşuna basarak solundaki `[ ]` işaretini `[+]` haline getirmelisiniz. Seçimleri tamamladıktan sonra ilerlemek için **Enter** tuşuna basılmalıdır.
* **Bağlantı Hataları:** Eğer 1. adımda veya 3. adımda PostgreSQL bağlantı hatası alıyorsanız, girilen şifrenin doğruluğundan ya da PostgreSQL yerel servisinin (Windows Hizmetler veya macOS `brew services`) harici bir yazılımsal duvar tarafından engellenmediğinden emin olun.