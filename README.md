# Pixel Poker - Texas Hold'em (Botlara Karşı, Web)

Bu doküman projenin tam spesifikasyonudur. Projeyi sıfırdan, bu dokümana uyarak geliştir. Belirsiz kalan yerlerde makul bir karar ver ve kararı `DECISIONS.md` dosyasına kısaca yaz. Doküman Türkçe, kod, değişken ve dosya isimleri İngilizce olsun.

---

## 1. Proje Özeti

Tarayıcıda çalışan, tek oyunculu bir **Texas Hold'em (No-Limit)** poker oyunu. Oyuncu, **3 ila 5 yapay zeka botuna** karşı **cash game** formatında oynar. Botlar farklı oyun tarzlarına sahiptir ve blöf yapabilir. Görsel stil **retro / piksel sanat**tır. Oyunda animasyonlar, ses efektleri, el geçmişi ve istatistikler bulunur.

### Hedefler
- Kurallara tam uygun, hatasız bir Texas Hold'em motoru.
- Botlarla oynarken gerçek bir poker masası hissi (farklı karakterler, blöf, tilt'siz ama öngörülemez davranış).
- Tutarlı, şık bir 8-bit / piksel sanat deneyimi.
- Backend gerektirmeden, tamamen istemci tarafında çalışması.

### Kapsam Dışı
- Online çok oyunculu mod, kullanıcı hesabı, gerçek para, ödeme sistemi.
- Turnuva modu (blind'lar artmaz, cash game).
- Diğer poker varyantları (Omaha, Draw vb.).

---

## 2. Teknoloji Yığını

Teknoloji seçimi sana bırakılmıştır. Kısıtlar ve tercihler:

- **Backend yok.** Her şey tarayıcıda çalışır, veriler `localStorage` içinde tutulur.
- **TypeScript zorunlu.**
- Tercih: **React + TypeScript + Vite**. Farklı bir seçim yaparsan gerekçesini `DECISIONS.md` içine yaz.
- Oyun motoru (kurallar, el değerlendirme, bot kararları) **UI'dan tamamen bağımsız saf TypeScript modülü** olmalı. React/DOM'a bağımlılığı olmayacak, böylece Node ortamında test edilebilecek.
- Test: Vitest veya Jest ile motor için birim testleri.
- Harici görsel ve ses dosyası zorunluluğu yok: ses efektleri **Web Audio API** ile sentezlenebilir, piksel görseller CSS/Canvas/SVG ile veya kodla üretilebilir. Telifli varlık kullanma.
- Rastgelelik: deste karıştırma için `crypto.getRandomValues` tabanlı **Fisher-Yates** shuffle kullan.

### Önerilen Klasör Yapısı
```
src/
  engine/        # saf oyun motoru (UI'dan bağımsız)
    deck.ts
    handEvaluator.ts
    game.ts          # state machine, tur akışı
    pots.ts          # ana pot ve side pot hesabı
    types.ts
  bots/
    personalities.ts
    botBrain.ts
  ui/            # bileşenler, masa, kartlar, butonlar
  audio/         # ses sentezi
  stats/         # el geçmişi ve istatistik hesapları
  storage/       # localStorage katmanı
tests/
DECISIONS.md
```

---

## 3. Oyun Kuralları ve Ayarları

### Format
- **No-Limit Texas Hold'em, cash game.**
- Masada 1 insan oyuncu + 3-5 bot. Bot sayısı oyun başlamadan önce menüden seçilir (varsayılan: 4). Oyun sırasında bot sayısı değişmez.
- Maksimum masa büyüklüğü 6 kişi.

### Varsayılan Ayarlar (menüden değiştirilebilir)
| Ayar | Varsayılan |
|---|---|
| Başlangıç stack'i | 1000 chip |
| Small blind / Big blind | 10 / 20 |
| Bot sayısı | 4 |
| Blind'lar | Sabit (artmaz) |

### Cash Game Davranışları
- Stack'i biten bot, **otomatik olarak yeniden başlangıç stack'iyle masaya oturur** (rebuy). Böylece masa boyutu sabit kalır. Her rebuy istatistiklerde ayrı izlenir.
- Oyuncunun stack'i biterse "Rebuy" veya "Masadan Kalk" seçeneği sunulur.
- Oyuncu istediği zaman masadan kalkabilir, kalkarken net kâr/zarar özeti gösterilir.
- Dealer butonu her elde saat yönünde ilerler. Heads-up (2 kişi kaldığı) durumlarda kurallar doğru uygulanmalı, ancak normalde masa dolu kalır.

### El Akışı
1. Blind'lar yatırılır.
2. Pre-flop: herkese 2 kapalı kart, bahis turu (UTG'den başlar).
3. Flop (3 kart), bahis turu (small blind'den başlayarak).
4. Turn (1 kart), bahis turu.
5. River (1 kart), bahis turu.
6. Showdown: kalan oyuncular kartlarını açar, en iyi 5 kartlık el kazanır.
7. Pot dağıtılır, dealer butonu ilerler, yeni el başlar.

### Geçerli Aksiyonlar
Fold, Check, Call, Bet, Raise, All-in.
- Minimum raise kuralları doğru uygulanmalı (önceki bahis/raise miktarı kadar artırmak zorunlu, all-in istisna).
- Arayüzde bahis miktarı için **slider + hızlı butonlar** (1/2 pot, 3/4 pot, pot, all-in) bulunur.
- Geçersiz aksiyonlar UI'da pasif olmalı, motor tarafında da reddedilmeli.

### Zorunlu Kenar Durumları (mutlaka işlenmeli ve test edilmeli)
- **Side pot**: farklı stack'lerle all-in senaryoları, birden fazla side pot.
- **Eşit el (split pot)**: bölünemeyen chip'in dağıtım kuralı (dealer'ın solundaki ilk oyuncuya).
- **Kicker karşılaştırmaları** ve 5 kartın tamamının board'dan oluştuğu durumlar.
- Herkes fold edince kalan tek oyuncunun kartlarını göstermeden potu alması.
- Bahis turunda tek oyuncu dışında herkes all-in ise kalan board'ın otomatik açılması.
- Yetersiz stack ile blind yatırma (kısmi blind, otomatik all-in).
- As'ın hem yüksek (A-K-Q-J-10) hem düşük (A-2-3-4-5, "wheel") straight'te kullanılması.

### El Sıralaması
Royal Flush > Straight Flush > Four of a Kind > Full House > Flush > Straight > Three of a Kind > Two Pair > One Pair > High Card. El değerlendirici 7 karttan (2 hole + 5 board) en iyi 5 kartı bulmalı ve el karşılaştırmaları için sayısal bir skor döndürmeli.

---

## 4. Bot Sistemi

Botlar oyunun kalbidir. Her bot **farklı bir oyun tarzına (personality)** sahiptir ve **blöf yapabilir**.

### Bot Karakterleri (en az bu 4 arketip, her masa için rastgele atanır)
| Arketip | Özellik |
|---|---|
| Tight-Aggressive (TAG) | Az el oynar, oynadığında agresif. Dengeli ve tehlikeli. |
| Loose-Aggressive (LAG) | Çok el oynar, sık raise eder, çok blöf yapar. |
| Tight-Passive (Rock) | Sadece güçlü ellerle oynar, çoğunlukla call/check yapar, nadiren blöf. |
| Loose-Passive (Calling Station) | Çok el oynar ama nadiren raise eder, kolay fold etmez, neredeyse hiç blöf yapmaz. |

Her bota benzersiz bir **isim ve piksel avatar** verilir. Arketip oyuncuya doğrudan gösterilmez (oyuncu gözlemleyerek anlamalı), ancak istatistik ekranında "bot profili" olarak bot başına gözlenen VPIP gibi değerler gösterilebilir.

### Karar Mekanizması
Her bot kararını şu girdilere göre verir:
- **El gücü:** pre-flop için el sıralaması (starting hand strength), post-flop için board ile el gücü ve draw potansiyeli (flush/straight draw, outs).
- **Pot odds** ve **implied odds** yaklaşımı.
- **Pozisyon** (dealer'a göre erken/orta/geç pozisyon, geç pozisyonda daha geniş oynama).
- **Stack derinliği** (kısa stack'te push/fold eğilimi).
- **Karaktere bağlı parametreler:** `looseness` (oynadığı el aralığı), `aggression`, `bluffFrequency`, `callDownTendency`, `foldToPressure`.
- **Kontrollü rastgelelik:** aynı durumda her seferinde aynı kararı vermemeli. Karar bir olasılık dağılımından örneklenmeli.

### Blöf Davranışı
- Botlar zayıf ellerle bahis/raise yapabilir (semi-bluff: draw ile, pure bluff: hiçbir şeyle).
- Blöf sıklığı karaktere göre değişir, board dokusuna (kuru/ıslak board) ve rakip sayısına göre ayarlanır.
- Çok oyunculu potlarda blöf azalır, heads-up durumlarda artar.
- Blöf yapan botun kartı showdown'da açılırsa el geçmişine "blöf" olarak işaretlenmez (oyuncu kendisi çıkarım yapmalı), ancak istatistiklerde gözlenen blöf oranı hesaplanabilir.

### Davranış Gerçekçiliği
- Botların her kararından önce **rastgele 0.6 - 2.0 saniyelik düşünme süresi** olmalı (zor kararlarda daha uzun).
- Botlar insan oyuncunun kartlarını veya destedeki gelecek kartları **asla bilmemeli** (hile yapmamalı). Karar fonksiyonu yalnızca o botun görebileceği bilgiyi alır.
- Botlar kısa süreli adaptasyon yapabilir (isteğe bağlı bonus): oyuncunun son ellerdeki agresifliğine göre hafifçe davranış değiştirme.

---

## 5. Kullanıcı Arayüzü ve Görsel Stil

### Genel Stil: Retro / Piksel Sanat
- 8-bit / 16-bit estetik: piksel fontu (ör. "Press Start 2P" benzeri, lisansı uygun bir font veya sistem fontuyla taklit), sınırlı renk paleti, keskin (anti-aliasing'siz) kenarlar.
- `image-rendering: pixelated` kullan, tüm görseller piksel gridine oturmalı.
- Masa: üstten görünüm, piksel dokulu kumaş, 3-5 bot ve oyuncu için koltuklar. Her koltukta avatar, isim, stack, güncel bahis ve (varsa) dealer/blind işareti.
- Kartlar: piksel sanat tarzında özgün tasarım (telifli kart tasarımı kullanma), net okunabilir rank ve suit.
- Chip'ler: piksel chip yığınları, değerlerine göre renkli.
- Responsive: masaüstü öncelikli, ancak tablet ve mobil genişlikte kullanılabilir olmalı.

### Ekranlar
1. **Ana menü:** Oyuna başla, ayarlar (bot sayısı, başlangıç stack'i, blind'lar, ses aç/kapa), istatistikler.
2. **Oyun masası:** ana oyun ekranı, aksiyon butonları altta, bahis slider'ı.
3. **El geçmişi paneli:** yan panel veya modal olarak açılır.
4. **İstatistik ekranı.**
5. **Masadan kalkış özeti.**

### Animasyonlar
- Kart dağıtma (desteden koltuklara kayarak).
- Flop/turn/river açılışında kart çevirme.
- Chip'lerin potta toplanması ve kazanana kayması.
- Sıra kimdeyse onun koltuğunda belirgin vurgu (yanıp sönen çerçeve gibi).
- Kazanan elin vurgulanması (kazanan 5 kart parlar).
- Animasyonlar piksel stiline uygun olmalı (adım adım hareket, yumuşatmasız), toplam animasyon süresi oyunu yavaşlatmamalı. Ayarlardan **animasyon hızı** (normal / hızlı / kapalı) seçilebilmeli.

### Ses Efektleri
- Web Audio API ile sentezlenmiş **chiptune** tarzı sesler: kart dağıtma, chip koyma, check (tıklama), fold, raise/all-in, kazanma, kaybetme, sıra sende uyarısı.
- Ses ve müzik ayrı kontrol edilebilir, varsayılan ses seviyesi makul olmalı.
- Tarayıcı autoplay kısıtına uyum: ses, ilk kullanıcı etkileşiminden sonra başlatılır.
- İsteğe bağlı bonus: hafif döngüsel chiptune arka plan müziği (kapatılabilir).

---

## 6. El Geçmişi ve İstatistikler

### El Geçmişi
- Oynanan her elin kaydı tutulur: el numarası, tarih, oyuncular ve pozisyonları, hole card'lar (showdown'da açılanlar), board, her turdaki aksiyonlar ve miktarlar, pot, kazanan(lar), kazanç.
- Arayüzde son N el liste halinde gösterilir, bir ele tıklayınca **adım adım replay** (aksiyon aksiyon) izlenebilir.
- Kayıtlar `localStorage` içinde saklanır (en fazla son 500 el, sınır aşılırsa en eskiler silinir).
- Geçmiş dışa aktarılabilir (JSON indirme).

### İstatistikler (oyuncu için)
- Oynanan el sayısı, kazanılan el sayısı, kazanma yüzdesi.
- Net kâr/zarar (chip) ve **zaman içinde bakiye grafiği** (basit çizgi grafik, piksel stilinde).
- **VPIP** (voluntarily put money in pot) ve **PFR** (pre-flop raise) yüzdeleri.
- Showdown'a gitme oranı ve showdown'da kazanma oranı.
- En büyük kazanılan pot, en iyi el.
- Aksiyon dağılımı (fold/call/raise yüzdeleri).
- Oturum bazlı ve tüm zamanlar için ayrı görünüm, istatistikleri sıfırlama butonu (onay ile).

---

## 7. Mimari ve Kalite Gereksinimleri

- **Oyun motoru bir state machine** olarak tasarlanmalı (ör. `WAITING -> PREFLOP -> FLOP -> TURN -> RIVER -> SHOWDOWN -> PAYOUT`). Geçersiz durum geçişleri engellenmeli.
- Motor **deterministik test edilebilir** olmalı: shuffle fonksiyonu enjekte edilebilir (seed'li RNG ile test).
- **Birim testleri zorunlu:** el değerlendirici (tüm el türleri, kicker, wheel straight, eşitlik), side pot hesabı, minimum raise kuralları, split pot dağıtımı.
- Bot karar fonksiyonu saf fonksiyon olarak yazılmalı (girdi: görünür oyun durumu + personality, çıktı: aksiyon).
- UI, motor durumunu sadece okur ve aksiyonları motora iletir. Oyun mantığı UI bileşenlerinde bulunmaz.
- Erişilebilirlik: klavye kısayolları (F: fold, C: check/call, R: raise gibi), yeterli renk kontrastı, kart renklerinin yalnızca renge bağlı olmaması (suit sembolleri net olmalı).
- Performans: animasyonlar akıcı (60fps hedef), gereksiz re-render yok.
- Kod temiz, tip güvenli (`strict` mod), anlamlı isimlendirme ve kısa yorumlarla belgelenmiş olmalı.

---

## 8. Geliştirme Sırası (Önerilen Milestone'lar)

1. **Motor:** deck, shuffle, hand evaluator, testler.
2. **Oyun akışı:** state machine, bahis turları, pot ve side pot, testler.
3. **Basit botlar:** önce rastgele geçerli aksiyon yapan botlarla uçtan uca oynanabilir konsol/test akışı.
4. **UI iskeleti:** masa, koltuklar, kartlar, aksiyon butonları, motorla bağlantı.
5. **Bot zekası:** personality'ler, el gücü hesabı, pot odds, blöf davranışı, düşünme süresi.
6. **Piksel stil ve animasyonlar.**
7. **Ses efektleri.**
8. **El geçmişi, replay ve istatistikler.**
9. **Ayarlar, menüler, cilalama, kenar durum testleri.**

Her milestone sonunda proje çalışır durumda olmalı.

---

## 9. Kabul Kriterleri

- [ ] Oyuncu 3-5 botla bir cash game oturumunu baştan sona oynayabiliyor.
- [ ] Tüm poker kuralları doğru: side pot, split pot, min raise, wheel straight dahil.
- [ ] El değerlendirici testleri geçiyor, tüm el türleri ve kicker durumları kapsanmış.
- [ ] Botlar belirgin şekilde farklı oynuyor ve blöf yapıyor, ancak hile yapmıyor.
- [ ] Görsel stil tutarlı biçimde retro/piksel sanat.
- [ ] Animasyonlar ve ses efektleri çalışıyor, ayarlardan kontrol edilebiliyor.
- [ ] El geçmişi kaydediliyor, replay çalışıyor, istatistikler doğru hesaplanıyor.
- [ ] Sayfa yenilense bile istatistikler ve el geçmişi korunuyor.
- [ ] `README` içinde kurulum ve çalıştırma talimatları (`npm install`, `npm run dev`, `npm test`) güncel ve çalışıyor.

---

## 10. Teslim

- Çalışan proje kaynak kodu, `package.json` ile birlikte.
- Güncel bir kurulum ve çalıştırma bölümü içeren README (bu dokümanın üstüne eklenebilir).
- `DECISIONS.md` (teknoloji seçimi ve verdiğin önemli kararlar).
- Her milestone'dan sonra kısa bir ilerleme özeti.


---

## 11. Kurulum ve Çalıştırma

Gereksinimler: Node.js 18 veya üstü, npm.

```bash
npm install        # bağımlılıkları kurar
npm run dev        # geliştirme sunucusu (varsayılan: http://localhost:5173)
npm test           # motor, bot, ses, istatistik ve arayüz testleri (Vitest)
```

Diğer komutlar:

```bash
npm run build      # tip kontrolü (strict) + üretim derlemesi (dist/)
npm run typecheck  # yalnızca TypeScript kontrolü
npm run simulate   # konsolda botlar arası 50 elin özeti
```

Kısayollar: **F** fold, **C** check/call, **R** bet/raise (slider/sayı kutusundaki miktarla).

Klasörler: `src/engine` (saf oyun motoru), `src/bots` (kişilikler, karar, equity), `src/audio` (Web Audio sentezi), `src/stats` ve `src/storage` (el geçmişi, istatistik, `localStorage`), `src/ui` (React arayüzü), `tests/` (birim ve arayüz testleri). Kararlar için `DECISIONS.md`'ye bakın.
