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
