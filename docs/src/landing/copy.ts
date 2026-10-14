// Landing page copy, Turkish (default, served at /) and English (/en/).
// Facts here must stay true: no invented counts, no prices for paid plans,
// no competitor names. See docs/PRODUCT.md.

export type Lang = 'tr' | 'en';

export const copy = {
  tr: {
    htmlLang: 'tr',
    title: 'Lonca: lisanssız pazaryeri entegrasyonu',
    description:
      'Trendyol ve Hepsiburada için açık kaynak motorlu pazaryeri entegratörü. Lonca Panel yakında; küçük satıcıya her zaman ücretsiz.',
    nav: {
      sellers: 'Satıcılar',
      developers: 'Geliştiriciler',
      pricing: 'Fiyatlar',
      docs: 'Dokümanlar',
      star: 'Star',
      waitlist: 'Bekleme listesi',
      langSwitch: 'EN',
      home: 'Lonca ana sayfa',
      changelog: 'Sürüm notları',
      changelogHref: '/surum-notlari/',
    },
    hero: {
      line1: 'Lisanssız entegrasyon.',
      line2: 'Amiral gemisi işi, sıfır lisans.',
      sub: 'Trendyol, Hepsiburada ve n11 için açık kaynak motorlu entegratör. Panel yakında; küçük satıcıya her zaman ücretsiz.',
      emailLabel: 'E-posta adresin',
      emailPlaceholder: 'E-posta adresin',
      submit: 'Bekleme listesine yazıl',
      npm: 'npm i @lonca/trendyol @lonca/hepsiburada',
      copied: 'Kopyalandı',
    },
    hub: {
      label:
        'Pazaryerlerinden Lonca motoruna, oradan bugün kendi koduna, yakında Lonca Panel’e giden akış şeması.',
      trendyol: 'Trendyol',
      hepsiburada: 'Hepsiburada',
      n11: 'n11',
      soon: 'yakında',
      engine: 'Lonca motoru',
      engineSub: 'açık kaynak',
      code: 'Kendi kodun',
      today: 'bugün',
      panel: 'Lonca Panel',
    },
    facts: [
      {
        title: 'Yıllık lisans yok',
        body: 'Ayda 200 siparişe kadar her zaman ücretsiz. Yıllık sözleşme imzalamazsın.',
      },
      {
        title: 'API her pakette açık',
        body: 'Pazaryeri verine erişim üst pakete kilitli değil; kendi sistemine bağla.',
      },
      {
        title: 'Motor açık kaynak (MIT)',
        body: 'Entegrasyon kodu GitHub’da. İstersen aynı motoru kendin çalıştır.',
      },
    ],
    compare: {
      title: 'Amiral gemisi özellikleri. Lisans faturası yok.',
      lead: 'Yıllık lisanslı entegratörlerin herkese açık fiyat ve paket bilgileriyle karşılaştırma. İsim vermiyoruz; sınıf olarak kıyaslıyoruz.',
      them: 'Yıllık lisanslı entegratörler',
      us: 'Lonca',
      rows: [
        {
          label: 'Lisans',
          them: 'Yıllık 9.500 – 99.000 ₺',
          us: 'Ayda 200 siparişe kadar 0 ₺, her zaman',
        },
        { label: 'API erişimi', them: 'Çoğunlukla üst pakette', us: 'Her pakette açık' },
        { label: 'Kaynak kod', them: 'Kapalı', us: 'Açık kaynak motor (MIT)' },
        {
          label: 'Pazaryeri API’si değişince',
          them: 'Herkese açık bir doğrulama kaydı yok',
          plain: true,
          us: 'Canlı ortamda doğrulanır, sapma yakalanır',
        },
        {
          label: 'Ayrılmak istersen',
          them: 'Akışın onların sisteminde kalır',
          us: 'Aynı motoru kendin çalıştırabilirsin',
        },
      ],
      note: 'Fiyat aralığı, yıllık lisanslı entegratörlerin 11 Ekim 2026’daki herkese açık fiyat sayfalarından.',
    },
    how: {
      title: 'Tek motor, iki kapı.',
      steps: [
        {
          title: 'Pazaryeri hesabını bağla',
          body: 'Trendyol, Hepsiburada ve n11 satıcı panelinden aldığın API bilgileriyle.',
        },
        {
          title: 'Siparişler ve stok tek yere akar',
          body: 'Lonca motoru siparişleri, ürünleri, stoğu ve iadeleri aynı tipli yapıya çevirir.',
        },
        {
          title: 'Panelden yönet ya da koduna al',
          body: 'Lonca Panel yakında. Geliştiricin aynı motoru bugün kendi sisteminde kullanabilir.',
        },
      ],
    },
    codesign: {
      title: 'Panelin ilk sürümünü birlikte kuruyoruz.',
      lead: 'Henüz satacak bir panelimiz yok; ne yapması gerektiğini bekleme listesindeki satıcılarla belirliyoruz. İlk önce neyi çözelim?',
      needs: [
        'Stok senkronu',
        'Sipariş yönetimi',
        'İade ve iptal',
        'Fatura',
        'Kargo etiketi',
        'Fiyat güncelleme',
        'Raporlar',
      ],
      volumeLabel: 'Aylık sipariş',
      volumes: ['200’e kadar', '200 – 2.000', '2.000+'],
    },
    proof: {
      title: 'Açık kaynak, açık kayıt.',
      lead: 'Kullanıcı sayısı yazmıyoruz; kontrol edebileceğin bilgileri yazıyoruz.',
      license: 'Lisans',
      latest: 'Son sürümler',
      trendyolSurface: '14 kaynak · ~70 metod',
      hbSurface: '12 kaynak · 95 metod',
      status: 'Pazaryeri durumu',
      verified: 'canlıda doğrulandı',
      beta: 'beta (0.x)',
      vote: 'Sıradaki pazaryeri için oy ver',
      releases: 'Sürüm notları',
      independent:
        'Resmi ortak değiliz. Pazaryerlerinin resmi satıcı API’lerini senin kimlik bilgilerinle kullanırız.',
    },
    dev: {
      title: 'Kendi entegrasyonunu mu yazıyorsun? Motor bugün hazır.',
      lead: 'Tipli istemciler, sayfalama, yeniden deneme, hız sınırı ve webhook yardımcıları. Ücretsiz, MIT lisanslı.',
      docs: 'Dokümanlar',
      guide: 'Trendyol’a 30 dakikada başla',
      github: 'GitHub',
      issues: 'İlk katkı için kolay işler',
    },
    pricing: {
      title: 'Küçükken ücretsiz. Yıllık lisans hiç yok.',
      plans: [
        {
          name: 'Küçük satıcı',
          price: '0 ₺',
          note: 'Ayda 200 siparişe kadar, her zaman.',
          tag: 'Lonca Panel · yakında',
        },
        {
          name: 'Büyüyen satıcı',
          price: 'Lansmanda',
          note: 'Fiyatı panelle birlikte açıklayacağız. Yıllık lisans yok.',
          tag: 'Lonca Panel · yakında',
        },
        {
          name: 'Geliştirici',
          price: '0 ₺',
          note: 'SDK’lar ücretsiz ve açık kaynak (MIT).',
          tag: 'Bugün',
        },
      ],
    },
    faq: {
      title: 'Sık sorulanlar',
      items: [
        {
          q: 'Lonca resmi bir pazaryeri ortağı mı?',
          a: 'Hayır. Lonca bağımsız bir projedir. Trendyol, Hepsiburada ve n11’in herkese açık satıcı API’lerini, senin kendi API bilgilerinle kullanır.',
        },
        {
          q: 'Lonca Panel ne zaman çıkacak?',
          a: 'Henüz bir tarih vermiyoruz. Bekleme listesindekiler ilk sürümü ilk görecek ve ne yapması gerektiğine birlikte karar vereceğiz.',
        },
        {
          q: 'Küçük satıcı için neden ücretsiz?',
          a: 'Motor açık kaynak ve zaten çalışıyor; küçük bir mağazayı bağlamanın bize maliyeti düşük. Ayda 200 siparişe kadar ücret almayacağız.',
        },
        {
          q: 'Verilerim nerede tutulacak?',
          a: 'Panelin barındırma ayrıntılarını lansmanla birlikte açıklayacağız. SDK’ları kendi sisteminde çalıştırırsan veri hiç bize gelmez.',
        },
        {
          q: 'Açık kaynak olmasının bana faydası ne?',
          a: 'Entegrasyonun nasıl çalıştığını herkes görebilir, hatayı herkes bildirebilir ve bir gün ayrılmak istersen aynı motoru kendin çalıştırabilirsin.',
        },
        {
          q: 'Şu anki entegratörümden geçebilir miyim?',
          a: 'Panel açıldığında geçiş adımlarını yayınlayacağız. Bugün geliştiricin, mevcut sisteminin yanında SDK’ları deneyebilir.',
        },
        {
          q: 'Hangi pazaryerleri sırada?',
          a: 'Trendyol ve Hepsiburada hazır, n11 beta olarak yayında. Sıradakini GitHub’daki ankette sen seçebilirsin.',
        },
        {
          q: 'Geliştiriciyim, nasıl başlarım?',
          a: '`npm i @lonca/trendyol` ile kur, “Trendyol’a 30 dakikada başla” rehberini izle. Sorular için GitHub Discussions açık.',
        },
      ],
    },
    closing: {
      title: 'Yıllık lisans devri kapanıyor.',
      sub: 'Listeye ilk sen yazıl; panel açılınca ilk haberi sen al.',
    },
    changelog: {
      title: 'Sürüm notları · Lonca',
      description:
        '@lonca paketlerinin yayımlanan her sürümü ve değişiklikleri: kararlı paketlerde 1.0’dan, beta paketlerde ilk sürümden bu yana.',
      heading: 'Sürüm notları',
      lead: '@lonca paketlerinin her sürümü, en yenisi üstte: kararlı paketlerde 1.0’dan, henüz 1.0 olmayan beta paketlerde ilk sürümden bu yana. Paketler semantik sürümlemeyi izler: kırıcı değişiklik yalnızca büyük sürümde gelir; beta (0.x) paketlerde ara sürümde de gelebilir.',
      bump: { major: 'Büyük sürüm', minor: 'Ara sürüm', patch: 'Yama' },
      deps: 'Bağımlılık güncellendi',
      untranslated: 'Bu notun Türkçesi henüz yok.',
      stability: 'Sürümleme politikası',
      beta: 'beta',
      older: 'Kararlı paketlerin 0.x sürümlerinin notları CHANGELOG dosyalarında:',
      npm: 'npm’de gör',
    },
    footer: {
      project: 'Lonca, bir Zanaat projesi.',
      contact: 'hello@zanaat.dev',
      disclaimer:
        'Lonca bağımsız bir projedir; Trendyol, Hepsiburada veya n11 ile resmi bir bağı yoktur. Pazaryeri adları ve markaları sahiplerine aittir.',
    },
  },
  en: {
    htmlLang: 'en',
    title: 'Lonca: marketplace integration without the licence',
    description:
      'An open-source-engine integrator for Trendyol and Hepsiburada. Lonca Panel is coming; small sellers will always be free.',
    nav: {
      sellers: 'Sellers',
      developers: 'Developers',
      pricing: 'Pricing',
      docs: 'Docs',
      star: 'Star',
      waitlist: 'Waitlist',
      langSwitch: 'TR',
      home: 'Lonca home',
      changelog: 'Release notes',
      changelogHref: '/en/changelog/',
    },
    hero: {
      line1: 'Integration, unlicensed.',
      line2: 'Flagship work, zero licence.',
      sub: 'An open-source-engine integrator for Trendyol, Hepsiburada and n11. Panel coming soon; small sellers will always be free.',
      emailLabel: 'Your email',
      emailPlaceholder: 'Your email',
      submit: 'Join the waitlist',
      npm: 'npm i @lonca/trendyol @lonca/hepsiburada',
      copied: 'Copied',
    },
    hub: {
      label:
        'Flow diagram: marketplaces feed the Lonca engine, which feeds your own code today and Lonca Panel soon.',
      trendyol: 'Trendyol',
      hepsiburada: 'Hepsiburada',
      n11: 'n11',
      soon: 'soon',
      engine: 'Lonca engine',
      engineSub: 'open source',
      code: 'Your own code',
      today: 'today',
      panel: 'Lonca Panel',
    },
    facts: [
      {
        title: 'No yearly licence',
        body: 'Always free up to 200 orders a month. No yearly contract to sign.',
      },
      {
        title: 'API open on every plan',
        body: 'Access to your marketplace data is never locked to a top tier.',
      },
      {
        title: 'Open-source engine (MIT)',
        body: 'The integration code is on GitHub. Run the same engine yourself if you like.',
      },
    ],
    compare: {
      title: 'Flagship features. No licence bill.',
      lead: 'Compared with the public pricing and plan pages of yearly-licence integrators. We compare the class, not names.',
      them: 'Yearly-licence integrators',
      us: 'Lonca',
      rows: [
        {
          label: 'Licence',
          them: '9,500 – 99,000 ₺ a year',
          us: '0 ₺ up to 200 orders a month, always',
        },
        { label: 'API access', them: 'Usually a top-tier feature', us: 'Open on every plan' },
        { label: 'Source code', them: 'Closed', us: 'Open-source engine (MIT)' },
        {
          label: 'When a marketplace API changes',
          them: 'No public verification record',
          plain: true,
          us: 'Checked against production, drift caught',
        },
        {
          label: 'If you want to leave',
          them: 'Your flow stays in their system',
          us: 'Run the same engine yourself',
        },
      ],
      note: 'Price range from the public pricing pages of yearly-licence integrators, 11 October 2026.',
    },
    how: {
      title: 'One engine, two doors.',
      steps: [
        {
          title: 'Connect your marketplace account',
          body: 'With the API credentials from your Trendyol, Hepsiburada and n11 seller panels.',
        },
        {
          title: 'Orders and stock flow to one place',
          body: 'The Lonca engine turns orders, products, stock and returns into one typed shape.',
        },
        {
          title: 'Manage in the panel, or in your code',
          body: 'Lonca Panel is coming. Your developer can use the same engine in your own system today.',
        },
      ],
    },
    codesign: {
      title: 'We are building the panel’s first version with you.',
      lead: 'There is no panel to sell yet; the sellers on the waitlist decide what it does first. What should it solve first?',
      needs: [
        'Stock sync',
        'Order management',
        'Returns and cancellations',
        'Invoicing',
        'Shipping labels',
        'Price updates',
        'Reports',
      ],
      volumeLabel: 'Orders a month',
      volumes: ['Up to 200', '200 – 2,000', '2,000+'],
    },
    proof: {
      title: 'Open source, open record.',
      lead: 'We do not quote user counts; we show what you can check.',
      license: 'Licence',
      latest: 'Latest releases',
      trendyolSurface: '14 resources · ~70 methods',
      hbSurface: '12 resources · 95 methods',
      status: 'Marketplace status',
      verified: 'verified in production',
      beta: 'beta (0.x)',
      vote: 'Vote for the next marketplace',
      releases: 'Release notes',
      independent:
        'We are not an official partner. We use the marketplaces’ official seller APIs with your own credentials.',
    },
    dev: {
      title: 'Writing your own integration? The engine is ready today.',
      lead: 'Typed clients, pagination, retries, rate limiting and webhook helpers. Free, MIT-licensed.',
      docs: 'Docs',
      guide: 'Trendyol in 30 minutes',
      github: 'GitHub',
      issues: 'Good first issues',
    },
    pricing: {
      title: 'Free while you are small. No yearly licence, ever.',
      plans: [
        {
          name: 'Small seller',
          price: '0 ₺',
          note: 'Up to 200 orders a month, always.',
          tag: 'Lonca Panel · soon',
        },
        {
          name: 'Growing seller',
          price: 'At launch',
          note: 'Priced together with the panel. No yearly licence.',
          tag: 'Lonca Panel · soon',
        },
        {
          name: 'Developer',
          price: '0 ₺',
          note: 'The SDKs are free and open source (MIT).',
          tag: 'Today',
        },
      ],
    },
    faq: {
      title: 'Questions',
      items: [
        {
          q: 'Is Lonca an official marketplace partner?',
          a: 'No. Lonca is an independent project. It uses the public seller APIs of Trendyol, Hepsiburada and n11 with your own API credentials.',
        },
        {
          q: 'When does Lonca Panel launch?',
          a: 'We are not giving a date yet. People on the waitlist see the first version first and help decide what it does.',
        },
        {
          q: 'Why is it free for small sellers?',
          a: 'The engine is open source and already works, so connecting a small shop costs us little. We will not charge up to 200 orders a month.',
        },
        {
          q: 'Where will my data live?',
          a: 'We will publish the panel’s hosting details at launch. If you run the SDKs in your own system, your data never reaches us.',
        },
        {
          q: 'What does open source give me?',
          a: 'Anyone can see how the integration works and report problems, and if you ever leave you can run the same engine yourself.',
        },
        {
          q: 'Can I move from my current integrator?',
          a: 'We will publish migration steps when the panel opens. Today your developer can try the SDKs alongside your current setup.',
        },
        {
          q: 'Which marketplaces are next?',
          a: 'Trendyol and Hepsiburada are ready, n11 is out in beta. You can pick the next one in the GitHub poll.',
        },
        {
          q: 'I am a developer. How do I start?',
          a: 'Install with `npm i @lonca/trendyol` and follow “Trendyol in 30 minutes”. GitHub Discussions is open for questions.',
        },
      ],
    },
    closing: {
      title: 'The yearly licence era is ending.',
      sub: 'Join the list first and hear first when the panel opens.',
    },
    changelog: {
      title: 'Release notes · Lonca',
      description:
        'Every release of the @lonca packages, with what changed: since 1.0 for stable packages, since the first release for beta ones.',
      heading: 'Release notes',
      lead: 'Every release of the @lonca packages, newest first: since 1.0 for stable packages, since the first release for beta packages that have not reached 1.0. The packages follow semantic versioning: breaking changes only ship in a major version, or in a minor one for a beta (0.x) package.',
      bump: { major: 'Major', minor: 'Minor', patch: 'Patch' },
      deps: 'Dependency updated',
      untranslated: '',
      stability: 'Versioning policy',
      beta: 'beta',
      older: 'Notes for the 0.x releases of the stable packages live in their CHANGELOG:',
      npm: 'View on npm',
    },
    footer: {
      project: 'Lonca, a Zanaat project.',
      contact: 'hello@zanaat.dev',
      disclaimer:
        'Lonca is an independent project with no official tie to Trendyol, Hepsiburada or n11. Marketplace names and trademarks belong to their owners.',
    },
  },
} as const;
