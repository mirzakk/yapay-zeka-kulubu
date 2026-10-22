# Yapay Zekâ Kulübü (YZK)

Disiplinler arası yapay zekâ araştırma, deney ve geliştirme topluluğu resmi web sitesi.

Modern siber estetik, fareyi takip eden interaktif spotlight ışığı, canlı sinir ağı kanvası, dinamik kaydırma ilerleme çubuğu, istemci tarafı tanı araçları (Açık Lab: Karmaşıklık Matrisi & Token Tahmincisi) ve çift dil desteği (TR / EN) içerir.

Saf HTML5, CSS3 ve modern ES6 JavaScript kullanır; hiçbir derleme (build), harici kütüphane veya arka yüz sunucusu gerektirmeden **GitHub Pages** üzerinde doğrudan çalışır.

## Özellikler

1. **İnteraktif Deneyim ("Mouse Yaklaşınca Tepki Veren")**:
   - İmleci takip eden dinamik radyal ışık huzmesi (`ambient-glow`).
   - Kart sınırlarını fareye göre aydınlatan Spotlight efektleri (`.spotlight-card`).
   - Hover durumunda derinlikli 3D kart yükselmesi ve siber neon ışıma.
2. **Scroll-Driven Micro-Interactions**:
   - Üst kısımda anlık kaydırma yüzdesini gösteren neon ilerleme çubuğu (`.scroll-progress`).
   - Kaydırmayla devreye giren camlaşan ve sınırlanan yapışkan üst menü (`.top.scrolled`).
   - IntersectionObserver destekli kademeli görünüm animasyonları (`.reveal`).
3. **Canlı Sinir Ağı Kanvası (Neural Constellation Canvas)**:
   - Hero bölümünde fare hareketine tepki veren, tıklandığında enerji dalgaları yayan 50 düğümlü canlı sinir ağı simülasyonu.
4. **6 Disiplinler Arası Odak Alanı**:
   - Hukuk, Tıp, Tasarım, Eğitim, Ekonomi, Mühendislik.
   - Her alana özel yüksek kaliteli 3D görsel illüstrasyonlar ve İnsan/Model/Etki mercekleri.
5. **Açık Laboratuvar & Tanılama Araçları**:
   - **Karmaşıklık Matrisi Hesaplayıcı**: TP, FP, FN, TN girdileriyle Doğruluk, Kesinlik, Duyarlılık ve F1 skoru hesabı.
   - **Token & Bağlam Tahmincisi**: Canlı metin analizi, karakter/kelime/token oranları ve 8K bağlam doluluk göstergesi.
6. **Topluluk ve Program Ekosistemi**:
   - Etkinlikler ve iCal (`.ics`) takvim dışa aktarımı.
   - Açık projeler ve yerel Markdown proje/ekip taslağı oluşturucu (`.md` çıktısı).
   - Kaynaklı yapay zekâ bülteni ve 14+ terimli YZ Sözlüğü.
   - Formspree entegrasyonlu çift modlu (Üyelik & Yönetim) başvuru formu.
   - Hızlı komut paleti (`Ctrl + K` / `⌘ + K`).
   - PWA ve Çevrimdışı Çalışma (`sw.js`, `manifest.webmanifest`).

## GitHub Pages ile Yayına Alma

1. Bu klasörün içeriğini GitHub reponuza yükleyin:
   ```bash
   git init
   git add .
   git commit -m "Yapay Zeka Kulubu v2 - Siber & interaktif surum"
   git branch -M main
   git remote add origin https://github.com/<kullanici>/<repo>.git
   git push -u origin main
   ```
2. **Settings → Pages** sekmesine gidin.
3. **Branch** kısmından `main` ve `/ (root)` seçerek kaydedin.
4. Siteniz saniyeler içinde HTTPS desteğiyle tüm cihazlarda canlıya geçecektir!

## Güvenlik modeli (dürüst özet)

Bu site **sunucusuz** (GitHub Pages). Yani:

- **SQL injection yok** — SQL yok, veritabanı yok. Form verisi hiçbir sunucuya gitmez.
- **XSS** — tüm kullanıcı girdisi `esc()` ile kaçışlanır, `data-act` delege dinleyicisi
  inline `onclick` yerine geçer, CSP `script-src 'self'` ile satır içi script yasak.
  Ölçüm: 10 farklı XSS vektörü (img/svg/iframe/script/attribute-breakout/template)
  gönderildi → 0 tetikleme, 0 CSP ihlali.
- **Başvurular şifreli** — RSA-3072 + AES-256-GCM zarf. Sitede **yalnızca açık anahtar**
  var; özel anahtar `../yzk-anahtarlar/yzk-admin-anahtar.json` içinde ve parola ile sarılı.
  Depoyu (localStorage/IndexedDB/disk) ele geçiren kişi kayıtları okuyamaz.
- **Kullanıcı hesapları** — parola PBKDF2-SHA256 (210k tur, rastgele tuz); kayıtlar
  cihaz-yerel AES-256-GCM zarfıyla, anahtar IndexedDB'de `extractable:false`.
  Profil klasörü kopyalansa bile anahtar ham bayt olarak dışarı çıkmaz.
- **Panel parolası** — kaynakta varsayılan parola yok. İlk açılışta belirlenir,
  PBKDF2 + tuz ile saklanır; 5 hatalı denemede 5 dakika kilit.
- **CSV enjeksiyonu** — `=`, `+`, `-`, `@` ile başlayan hücreler `'` ile kaçışlanır.

Sınır (dürüstçe): bu bir **istemci-taraflı** model. Tarayıcıda çalışan kod, o tarayıcıya
sahip olan kişiye karşı koruma sağlayamaz — XSS olursa anahtar o sayfada kullanılabilir.
Bunu kapatmanın tek yolu sunucu tarafı kimlik doğrulama. Mevcut tasarım, **veri hırsızlığına**
(disk/yedek/profil kopyası) ve **enjeksiyon saldırılarına** karşı korur; "site hacklenemez"
iddiası sunucusuz bir sitede teknik olarak yalnızca bu kapsamda doğrudur.
