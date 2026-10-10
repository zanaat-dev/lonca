/**
 * Hand-compiled OpenAPI definitions for the n11 REST API, the input of
 * `scripts/specs/build-n11.mjs`.
 *
 * n11 publishes no machine-readable REST definition (no OpenAPI, Swagger or
 * Postman collection). Every operation below is compiled by hand from its page
 * on https://developer.n11.com/documentation/ (Turkish). Each page has prose, a
 * request-parameter table, usually a response-field table, and JSON examples.
 * Nothing here comes from `@lonca/n11`; the SDK is checked against this file,
 * not the other way round.
 *
 * Compilation rules (see specs/n11/README.md for the full list):
 *
 *   - Field names, required-ness ("Zorunluluk"/"Parametre Değer": Evet) and the
 *     table's type column come from the page's field tables, never from the
 *     examples. Several examples are not valid JSON (unquoted strings, missing
 *     commas or braces, `"null"` strings, leading spaces in enum values).
 *   - Response tables have no type column on most pages, so the JSON type of a
 *     response field is read from the page's example value. A field whose
 *     example value is `null` (or that the example omits) gets no `type`,
 *     unless the table text itself names its values.
 *   - Every request body and response carries `x-lonca-doc-basis`:
 *       "table"   — the page has a field table for this body. Properties the
 *                   example shows but the table does not list are marked
 *                   `x-lonca-doc-example-only: true` (wrapper keys such as
 *                   `payload`/`skus`, and paging envelopes, are typical).
 *       "example" — the page has no field table for this body; the schema is
 *                   compiled from its example payloads and prose.
 *   - Where a table and an example disagree on a type, the table wins and the
 *     property `description` says what the example shows.
 *   - A property (or its type) taken from another page than the operation's
 *     carries that page as its own `x-lonca-doc-url` (the Mikro İhracat page's
 *     order example, see `onMicroExport`).
 *   - Descriptions are the page's own wording (Turkish), shortened. Notes added
 *     by Lonca are in English and start with "Lonca:".
 *
 * Exports:
 *   - `COMPILED_AT`         the date the pages were read
 *   - `DOCUMENTS`           one OpenAPI document per portal section
 *   - `PROBE_OBSERVATIONS`  where each contract probe's wire response lives in
 *                           the spec, so fields seen on prod but absent from the
 *                           docs can be added as `x-lonca-observed`
 */

/** The day the documentation pages were read and compiled. */
export const COMPILED_AT = '2026-10-11';

const DOCS = 'https://developer.n11.com/documentation';
const PRODUCT_SECTION = `${DOCS}/n11-marketplace-entegrasyonu`;
const ORDER_SECTION = `${DOCS}/n11-siparis-entegrasyonu`;
const page = (section, slug) => `${section}/${slug}/`;

// ---------------------------------------------------------------------------
// Schema helpers (plain object builders; they keep the definitions short)
// ---------------------------------------------------------------------------

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const withDesc = (schema, description) => (description ? { ...schema, description } : schema);
const int64 = (description) => withDesc({ type: 'integer', format: 'int64' }, description);
const int32 = (description) => withDesc({ type: 'integer', format: 'int32' }, description);
const num = (description) => withDesc({ type: 'number' }, description);
const str = (description) => withDesc({ type: 'string' }, description);
const bool = (description) => withDesc({ type: 'boolean' }, description);
const arr = (items, description) => withDesc({ type: 'array', items }, description);
const obj = (properties, extra = {}) => ({ type: 'object', ...extra, properties });
const nullable = (schema) => ({ ...schema, nullable: true });
/** A property the page's example shows but its field table does not list. */
const exampleOnly = (schema) => ({ ...schema, 'x-lonca-doc-example-only': true });
/** A field whose type the page does not give (example value `null` or absent). */
const untyped = (description) => ({
  description: `${description} Lonca: the page gives no type (example value null or absent).`,
});

const jsonBody = (schema, basis, example) => ({
  required: true,
  'x-lonca-doc-basis': basis,
  content: { 'application/json': { schema, ...(example ? { example } : {}) } },
});
const jsonResponse = (description, schema, basis) => ({
  200: {
    description,
    'x-lonca-doc-basis': basis,
    content: { 'application/json': { schema } },
  },
});

const VAT_RATES = [0, 1, 10, 20];
const CURRENCIES = ['TL', 'USD', 'EUR'];

/** Both REST credentials, as plain headers. */
const securitySchemes = {
  appKey: {
    type: 'apiKey',
    in: 'header',
    name: 'appKey',
    description:
      'n11 API anahtarı. Sayfalar "Authorization no auth seçiniz. Headers alanına appKey ve ' +
      'appSecret bilgisini eklemeniz gerekir." der; bazı sayfalar başlığı küçük harfle (appkey) ' +
      'yazar. HTTP başlık adları büyük/küçük harf duyarsızdır.',
  },
  appSecret: {
    type: 'apiKey',
    in: 'header',
    name: 'appSecret',
    description: 'n11 API şifresi (appsecret).',
  },
};

const TASK_NOTES =
  "İsteği JSON formatında body'de raw olarak gönderin. Tek seferde maksimum 1000 sku " +
  "gönderilebilir. Her başarılı istek için response'ta ID (taskId) döner; işlemin sonucu " +
  'TaskDetails servisi ile kontrol edilir.';

// ---------------------------------------------------------------------------
// "Ürün Entegrasyonu" (portal section slug: n11-marketplace-entegrasyonu)
// ---------------------------------------------------------------------------

const PRODUCT_DOCS = {
  categories: page(PRODUCT_SECTION, 'kategori-agaci-listeleme'),
  attributes: page(PRODUCT_SECTION, 'kategori-ozellikleri-listeleme'),
  productQuery: page(PRODUCT_SECTION, 'satici-urun-sorgulama'),
  create: page(PRODUCT_SECTION, 'urun-yukleme'),
  update: page(PRODUCT_SECTION, 'urun-bilgisi-guncelleme'),
  priceStock: page(PRODUCT_SECTION, 'urun-fiyat-stok-guncelleme'),
  delete: page(PRODUCT_SECTION, 'urun-silme'),
  taskDetails: page(PRODUCT_SECTION, 'task-detail-sorgulama'),
};

/** `payload: { integrator, skus: [...] }` — the envelope every product task shares. */
function taskRequest(skuSchemaName, integratorDescription) {
  return obj(
    {
      payload: exampleOnly(
        obj(
          {
            integrator: str(integratorDescription),
            skus: exampleOnly(arr(ref(skuSchemaName), 'Tek seferde maksimum 1000 sku.')),
          },
          { required: ['integrator', 'skus'] },
        ),
      ),
    },
    { required: ['payload'] },
  );
}

const INTEGRATOR_CREATE =
  'API Kullanıcı/Entegratör Firma ismini yazınız. Tüm gönderimlerinizde aynı ismi iletiniz.';
const INTEGRATOR_UPDATE =
  'Entegratör ve API kullanıcısının verilebilecek özel ismi. Tüm gönderimlerinizde aynı değer ' +
  'kullanmanızı rica ederiz.';

const productDocument = {
  openapi: '3.0.3',
  info: {
    title: 'n11 Ürün Entegrasyonu (REST)',
    version: COMPILED_AT,
    description:
      'REST services of the "Ürün Entegrasyonu" section of the n11 developer portal: the ' +
      'category tree, category attributes, the seller product query, the asynchronous product ' +
      'tasks and task details. n11 publishes no machine-readable definition; this document is ' +
      "compiled by hand from the section's pages (field tables first, examples second). The " +
      'SOAP services of the same section (questions, catalogue search) are not included.',
  },
  servers: [
    {
      url: 'https://api.n11.com',
      description: 'Canlı ortam. n11 bir test ortamı belgelemiyor.',
    },
  ],
  tags: [
    { name: 'Kategori', description: 'Kategori ağacı ve kategori özellikleri' },
    { name: 'Ürün', description: 'Ürün sorgulama ve ürün task servisleri' },
  ],
  security: [{ appKey: [], appSecret: [] }],
  paths: {
    '/cdn/categories': {
      get: {
        tags: ['Kategori'],
        summary: 'Kategori Ağacı Listeleme',
        operationId: 'getCategories',
        description:
          'Tüm n11 kategori ağacını tek istekle döner; parametre gerekmez. subCategories değerinin ' +
          'null dönmesi o kategorinin en alt kırılım olduğunu ifade eder. Ürün yükleme servisinde ' +
          'en alt kırılım olan kategorinin id değeri iletilmelidir. Sayfa yalnızca appKey başlığını ' +
          "ister; changelog'daki 2025-06-17 ve 2025-07-17 duyuruları kategori servislerinin " +
          '2025-08-15 itibarıyla API Key & Secret olmadan çalışmayacağını söyler, bu yüzden iki ' +
          'güvenlik seçeneği de listelenmiştir.',
        security: [{ appKey: [], appSecret: [] }, { appKey: [] }],
        responses: jsonResponse('Kategori ağacı', ref('CategoryTree'), 'example'),
        'x-lonca-doc-url': PRODUCT_DOCS.categories,
      },
    },
    '/cdn/category/{categoryId}/attribute': {
      get: {
        tags: ['Kategori'],
        summary: 'Kategori Özellikleri Listeleme',
        operationId: 'getCategoryAttributesList',
        description:
          "Endpoint içindeki categoryId değerine göre kategoriye ait attribute'ları (id, value ve " +
          "value id) listeler; request parametresi yoktur. isMandatory: true olan attribute'lar " +
          'CreateProduct servisinde zorunludur. isVariant: true olan attribute için aynı ' +
          'productMainId ile gönderilen ürünler aynı sayfada seçenek olarak görünür. ' +
          'isCustomValue: true ise listeden bir valueId ya da customValue ile yeni bir değer ' +
          'iletilebilir.',
        parameters: [
          {
            name: 'categoryId',
            in: 'path',
            required: true,
            description: 'GetCategories servisinden alınan kategori id değeri.',
            schema: { type: 'integer', format: 'int64' },
          },
        ],
        security: [{ appKey: [], appSecret: [] }, { appKey: [] }],
        responses: jsonResponse(
          'Kategoriye ait özellikler ve değerleri',
          ref('CategoryAttributes'),
          'example',
        ),
        'x-lonca-doc-url': PRODUCT_DOCS.attributes,
      },
    },
    '/ms/product-query': {
      get: {
        tags: ['Ürün'],
        summary: 'Satıcı Ürün Sorgulama',
        operationId: 'getSellerProducts',
        description:
          'Request parametrelerinde zorunluluk yoktur; hiçbir parametre girilmediğinde satıcının ' +
          'tüm ürünleri page 0 size 20 olacak şekilde listelenir. stockCode her istekte tek bir ' +
          "değer alır. Sayfalama için page 0'dan başlayıp totalPages alanını dikkate alarak " +
          "content'i boş dönen sayfa son sayfa kabul edilebilir. Response alanlarının karakter " +
          'sayısı ve veri tipleri ürün sayısının artışıyla değişebilir (ör. n11ProductId 9 haneden ' +
          '10 haneye çıkabilir).',
        parameters: [
          {
            name: 'id',
            in: 'query',
            description: 'n11 Ürün kodu ile listeleme.',
            schema: { type: 'integer', format: 'int64' },
          },
          {
            name: 'productMainId',
            in: 'query',
            description: 'Ürün grup kodu ile listeleme.',
            schema: { type: 'string' },
          },
          {
            name: 'stockCode',
            in: 'query',
            description: 'Satıcı ürün kodu ile listeleme. Her istekte tek bir değer alır.',
            schema: { type: 'string' },
          },
          {
            name: 'saleStatus',
            in: 'query',
            description:
              'Ürün satış durumuna göre listeleme. On_Sale: Satışta, Out_Of_Stock: Stokta Yok.',
            schema: { type: 'string', enum: ['On_Sale', 'Out_Of_Stock'] },
          },
          {
            name: 'productStatus',
            in: 'query',
            description:
              'Ürün onay durumuna göre listeleme. Active: Onaylı, InCatalogApproval: Katalog Onay ' +
              'Sürecinde, Suspended: Beklemede, CatalogRejected: Katalogdan Reddedildi, ' +
              'Prohibited: Yasaklı, Unlisted: Limit Dışı, InApproval: Aksiyon Bekleyen.',
            schema: {
              type: 'string',
              enum: [
                'Active',
                'InCatalogApproval',
                'Suspended',
                'CatalogRejected',
                'Prohibited',
                'Unlisted',
                'InApproval',
              ],
            },
          },
          {
            name: 'brandName',
            in: 'query',
            description: 'Satıcı panelindeki ürünleri marka ismine göre listeler.',
            schema: { type: 'string' },
          },
          {
            name: 'categoryIds',
            in: 'query',
            description:
              'Kategori ID ile listeleme (tablodaki tip: "long list"). Lonca: the page does not ' +
              'say how several values are encoded (comma-separated or repeated parameter).',
            schema: { type: 'array', items: { type: 'integer', format: 'int64' } },
          },
          {
            name: 'page',
            in: 'query',
            description: 'Sayfa numarası. Varsayılan 0.',
            schema: { type: 'integer', format: 'int32', default: 0 },
          },
          {
            name: 'size',
            in: 'query',
            description: 'Sayfa boyutu. Varsayılan 20, maksimum 250.',
            schema: { type: 'integer', format: 'int32', default: 20, maximum: 250 },
          },
          {
            name: 'sender',
            in: 'query',
            description:
              'Gönderici tipi. SELLER: Satıcı gönderir, N11: n11 Depo gönderir, ALL: Tümü. ' +
              'Gönderilmediği takdirde varsayılan değer SELLER olarak alınır.',
            schema: { type: 'string', enum: ['SELLER', 'N11', 'ALL'], default: 'SELLER' },
          },
        ],
        responses: jsonResponse('Satıcının ürünleri (sayfalı)', ref('ProductQueryPage'), 'table'),
        'x-lonca-doc-url': PRODUCT_DOCS.productQuery,
      },
    },
    '/ms/product/tasks/product-create': {
      post: {
        tags: ['Ürün'],
        summary: 'Ürün Yükleme',
        operationId: 'createProduct',
        description:
          `${TASK_NOTES} Ürün yüklemeden önce zorunlu özellikler doldurulmalı ve customValue alanı ` +
          'kontrol edilmelidir (GetCategoryAttributesList). Ürün görsel boyutu maksimum 10 MB ' +
          'olmalıdır. Gönderilen barcode n11 kataloğundaki bir barkodla eşleşirse ürün, attribute ' +
          'özelliklerine bakılmaksızın satıcı onayı bekliyor statüsünde açılır. Ürün bazlı ' +
          'shipmentTemplate (kargo şablon adı) gönderilmelidir. Aynı productMainId ile gönderilen ' +
          've variant/slicer özelliği olan ürünler varyantlı açılır.',
        requestBody: jsonBody(ref('ProductCreateRequest'), 'table'),
        responses: jsonResponse('Task oluşturuldu', ref('ProductTask'), 'table'),
        'x-lonca-doc-url': PRODUCT_DOCS.create,
      },
    },
    '/ms/product/tasks/product-update': {
      post: {
        tags: ['Ürün'],
        summary: 'Ürün Bilgisi Güncelleme',
        operationId: 'updateProduct',
        description:
          `${TASK_NOTES} productMainId silinmek isteniyorsa deleteProductMainId true, ` +
          'maxPurchaseQuantity silinmek isteniyorsa deleteMaxPurchaseQuantity true gönderilmelidir ' +
          '(bu durumda satın alım adet sınırı olmadığı kabul edilir). attributes alanında stok kodu ' +
          'bazında ürün güvenliği attribute değerleri gönderilir; ürün temel özellikleri (Marka, ' +
          'Renk, Beden vb.) yalnızca n11 tarafından güncellenebilir. Güncellenebilecek ürün ' +
          'güvenliği ve besin değeri attribute id\'leri sayfadaki "Ürün Güvenliği Bilgileri ve ' +
          'Besin Değerleri" tablosunda listelenir.',
        requestBody: jsonBody(ref('ProductUpdateRequest'), 'table'),
        responses: jsonResponse('Task oluşturuldu', ref('ProductTask'), 'table'),
        'x-lonca-doc-url': PRODUCT_DOCS.update,
      },
    },
    '/ms/product/tasks/price-stock-update': {
      post: {
        tags: ['Ürün'],
        summary: 'Ürün Fiyat-Stok Güncelleme',
        operationId: 'updatePriceAndStock',
        description:
          `${TASK_NOTES} Fiyat güncellemelerinde listPrice ve salePrice birlikte gönderilmelidir; ` +
          'küsurat nokta ile ayrılmalı ve noktadan sonra 2 hane iletilmelidir, aksi halde istek ' +
          'FAIL olur. Sadece fiyat veya sadece stok güncellenecekse diğer alanlar gönderilmeyebilir; ' +
          'istekte olmayan alanlar güncellenmez. listPrice ve salePrice aynı olabilir; listPrice ' +
          "salePrice'tan düşük olamaz.",
        requestBody: jsonBody(ref('PriceStockUpdateRequest'), 'table'),
        responses: jsonResponse('Task oluşturuldu', ref('ProductTask'), 'table'),
        'x-lonca-doc-url': PRODUCT_DOCS.priceStock,
      },
    },
    '/ms/product/tasks/product-delete': {
      post: {
        tags: ['Ürün'],
        summary: 'Ürün Silme',
        operationId: 'deleteProduct',
        description: TASK_NOTES,
        requestBody: jsonBody(ref('ProductDeleteRequest'), 'table'),
        responses: jsonResponse('Task oluşturuldu', ref('ProductTask'), 'table'),
        'x-lonca-doc-url': PRODUCT_DOCS.delete,
      },
    },
    '/ms/product/task-details/page-query': {
      post: {
        tags: ['Ürün'],
        summary: 'Task Detail Sorgulama',
        operationId: 'getTaskDetails',
        description:
          "Ürün task'larının sonucunu sayfalı döner. itemCode ürünün stockCode değeridir; " +
          'skus.content içindeki status ürün bazlı sonucu verir (SUCCESS veya FAIL), hata detayı ' +
          "reasons alanındadır. Ana seviyedeki status task'ın genel durumudur: PROCESSED işlem " +
          'tamamlandı, IN_QUEUE işlem devam ediyor, REJECT task işleme alınmadı.',
        requestBody: jsonBody(ref('TaskDetailsRequest'), 'example', {
          taskId: 362,
          pageable: { page: 0, size: 1000 },
        }),
        responses: jsonResponse('Task detayı', ref('TaskDetails'), 'example'),
        'x-lonca-doc-url': PRODUCT_DOCS.taskDetails,
      },
    },
  },
  components: {
    securitySchemes,
    schemas: {
      // -- categories (both pages are example-only: no field table) ----------
      CategoryTree: obj({
        categories: arr(ref('Category'), 'Kök kategoriler (parentId: null).'),
      }),
      Category: obj({
        id: int64(),
        parentId: nullable(int64('Üst kategori id; kök kategorilerde null.')),
        name: str(),
        subCategories: nullable(
          arr(ref('Category'), 'Alt kategoriler. null ise kategori en alt kırılımdır (leaf).'),
        ),
      }),
      CategoryAttributes: obj({
        id: int64('Kategori id'),
        name: str('Kategori adı'),
        categoryAttributes: arr(ref('CategoryAttribute')),
      }),
      CategoryAttribute: obj({
        attributeId: int64('Özellik id (ör. 1: Marka).'),
        categoryId: int64(),
        attributeName: str(),
        isMandatory: bool('true ise CreateProduct servisinde ürün bazlı gönderilmesi zorunludur.'),
        isVariant: bool(
          'true ise aynı productMainId ile gönderilen ürünler aynı sayfada seçenek olarak görünür.',
        ),
        isSlicer: bool(),
        isCustomValue: bool(
          'true ise listeden bir valueId ya da customValue ile yeni bir değer iletilebilir.',
        ),
        isN11Grouping: bool(),
        attributeOrder: int32(),
        attributeValues: arr(
          obj({ id: int64('Değer id (valueId)'), value: str() }),
          'Özelliğin n11 tarafından tanımlı değerleri.',
        ),
      }),

      // -- product query (response table without types: types from the example)
      ProductQueryPage: obj({
        content: exampleOnly(arr(ref('ProductQueryItem'))),
        pageable: exampleOnly(
          obj({
            sort: untyped('Sıralama bilgisi.'),
            pageNumber: int32(),
            pageSize: int32(),
            offset: int64(),
            paged: bool(),
            unpaged: bool(),
          }),
        ),
        last: exampleOnly(bool()),
        totalElements: int64('Toplam Ürün Sayısı'),
        totalPages: int32('Toplam Sayfa Sayısı'),
        first: exampleOnly(bool()),
        number: int32('Mevcut Sayfa Numarası'),
        sort: exampleOnly(untyped('Sıralama bilgisi.')),
        numberOfElements: int32('Sayfadaki Ürün Sayısı'),
        size: int32('Listelenen Ürün Adedi'),
        empty: exampleOnly(bool()),
      }),
      ProductQueryItem: obj({
        n11ProductId: int64('N11 Ürün Kodu. 9 haneden 10 haneye çıkabilir.'),
        sellerId: int64('Mağaza ID'),
        sellerNickname: str(
          'Mağaza Adı. Lonca: the example value is an unquoted token (invalid JSON); typed string.',
        ),
        stockCode: str('Satıcı Stok Kodu'),
        title: str('Ürün Adı'),
        description: str('Ürün açıklaması'),
        categoryId: int64('Kategori ID'),
        productMainId: str('Model Kodu'),
        status: str('Ürün Aktifliği (ör. Active).'),
        saleStatus: str('Satış Durumu (ör. On_Sale).'),
        preparingDay: int32('Kargo Hazırlık Süresi'),
        shipmentTemplate: str('Kargo Şablonu'),
        maxPurchaseQuantity: int32('Maksimum Satın Alım Adedi'),
        customTextOptions: arr({}, 'Müşteriye Özel Ürün Seçeneği. Örnekte boş dizi.'),
        catalogId: int64('Ürün Katalog ID'),
        barcode: untyped('Barkod.'),
        groupId: int64('Ürün Katalog Grup ID'),
        currencyType: str('Para Birimi (ör. TL).'),
        salePrice: num('Satış Fiyatı'),
        listPrice: num('Liste Fiyatı'),
        quantity: int32('Stok Adedi'),
        rejectInfo: untyped(
          'Ürün katalog ret bilgisi (status: CatalogRejected ise bu parametre verilmektedir).',
        ),
        attributes: arr(
          obj({
            attributeId: int64(),
            attributeName: str(),
            attributeValue: str(),
          }),
          'Ürün Özellikleri',
        ),
        imageUrls: arr(str(), 'Görsel Linkleri'),
        vatRate: int32('KDV Oranı'),
        commissionRate: num('Komisyon Oranı'),
        sender: str('Gönderici tipi; SELLER: Satıcı gönderir, N11: n11 depo gönderir.'),
      }),

      // -- product tasks (request tables with types) ------------------------
      ProductCreateRequest: taskRequest('ProductCreateSku', INTEGRATOR_CREATE),
      ProductCreateSku: obj(
        {
          title: str(
            'Ürün ismi; marka, cinsiyet, renk veya ürün bilgisini ekleyerek yazabilirsiniz.',
          ),
          description: str('Ürüne ait açıklamalar (tablodaki tip: HTML-string).'),
          categoryId: int64(
            'GetCategories servisinden alınan kategorinin en alt kırılım id değeri.',
          ),
          currencyType: {
            type: 'string',
            enum: CURRENCIES,
            description:
              'TL, USD, EUR kullanılabilir. USD ve EUR Merkez Bankası kur oranına göre güncellenir.',
          },
          productMainId: str(
            'Ürüne ait tüm modeller için aynı id. Varyantlı ürün açmak için Renk ve Beden ' +
              'değerlerinin tamamında aynı değer kullanılmalıdır.',
          ),
          preparingDay: int32('Ürünün kargoya verilmesi için gereken süre.'),
          shipmentTemplate: str(
            'Hesabım > Teslimat Bilgilerim alanından oluşturulan kargo şablonunun ismi.',
          ),
          maxPurchaseQuantity: int32('Tekil alıcı başına maksimum satın alım adedi.'),
          stockCode: str(
            "Ürüne ait belirlenen uniq değer; stok-fiyat güncellemeleri stockCode'a göre yapılır. " +
              'Maksimum değeri 255.',
          ),
          catalogId: nullable(int64('n11 katalogundaki id değeri. Örnekte null.')),
          barcode: str(
            'Sadece ulusal barkodlar kaydedilir; n11 katalogundaki barkodla eşleştirme için ' +
              'yazılır. Lonca: one example sends a JSON number, another the string "null".',
          ),
          quantity: { ...int32('Stok miktarı. Maksimum değer 999.999.'), maximum: 999999 },
          images: arr(
            obj(
              {
                url: str('SSL sertifikalı "https" formatında görsel adresi.'),
                order: int32('Görsel sırası.'),
              },
              { required: ['url', 'order'] },
            ),
            'Ürün görsellerinin URL listesi (tabloda "images/url/order", tip string).',
          ),
          attributes: arr(
            obj(
              {
                id: int64('Kategori özellik servisindeki özellik id değeri.'),
                valueId: nullable(
                  int64(
                    'isCustomValue false ise kategori özellik servisindeki valueId yazılmalıdır.',
                  ),
                ),
                customValue: nullable(
                  str(
                    'isCustomValue true ise serbest değer yazılabilir. Lonca: the examples send ' +
                      'the string "null" when a valueId is given.',
                  ),
                ),
              },
              { required: ['id', 'valueId', 'customValue'] },
            ),
            'Ürünün kategori özellik bilgileri (tablodaki tip: string). isMandatory: true olan ' +
              'özellikler zorunludur.',
          ),
          salePrice: num('Ürün satış fiyatı (tablodaki tip: amount).'),
          listPrice: num(
            'Ürün liste fiyatı (satış fiyatı düşük olunca üstü çizilen fiyat, PSF; tablodaki tip: amount).',
          ),
          vatRate: { ...int32('Ürün KDV oranı.'), enum: VAT_RATES },
        },
        {
          required: [
            'title',
            'description',
            'categoryId',
            'currencyType',
            'productMainId',
            'preparingDay',
            'shipmentTemplate',
            'stockCode',
            'quantity',
            'images',
            'attributes',
            'salePrice',
            'listPrice',
            'vatRate',
          ],
        },
      ),
      ProductUpdateRequest: taskRequest('ProductUpdateSku', INTEGRATOR_UPDATE),
      ProductUpdateSku: obj(
        {
          stockCode: str(
            'Tedarikçinin ürüne belirlediği uniq kod; SKU güncellemelerinde zorunludur.',
          ),
          status: {
            type: 'string',
            enum: ['Active', 'Suspended'],
            description: 'Satışta olması için "Active", satıştan çekmek için "Suspended".',
          },
          preparingDay: { ...int32('Ürün bazlı kargoya gönderim süresi.'), minimum: 1 },
          shipmentTemplate: str(
            'Satıcı Panelinde Hesabım > Teslimat Bilgileri alanındaki "Şablon Adı".',
          ),
          deleteProductMainId: bool('productMainId silinmek isteniyorsa true.'),
          productMainId: str('Ana ürün kodu; aynı modele ait ürün özelliklerini birleştirir.'),
          deleteMaxPurchaseQuantity: bool('maxPurchaseQuantity silinmek isteniyorsa true.'),
          maxPurchaseQuantity: int32('Ürün bazlı maksimum satın alınabilecek adet.'),
          description: str('Ürün açıklaması'),
          vatRate: { ...int32('Ürün KDV oranı.'), enum: VAT_RATES },
          attributes: arr(
            obj(
              {
                id: str(
                  'Kategori özellik servisindeki özellik id değeri. Lonca: typed string as in ' +
                    'the table; the example sends a JSON number.',
                ),
                valueId: nullable(
                  str(
                    'isCustomValue false ise valueId yazılmalıdır. Lonca: typed string as in the ' +
                      'table; the example sends a JSON number or null.',
                  ),
                ),
                customValue: nullable(str('isCustomValue true ise serbest değer yazılabilir.')),
              },
              { required: ['id', 'valueId', 'customValue'] },
            ),
            'Güncellenecek ürün güvenliği attribute değerleri (tablodaki tip: string). attributes ' +
              'gönderildiğinde id, valueId ve customValue zorunludur.',
          ),
        },
        { required: ['stockCode'] },
      ),
      PriceStockUpdateRequest: taskRequest('PriceStockUpdateSku', INTEGRATOR_UPDATE),
      PriceStockUpdateSku: obj(
        {
          stockCode: str(
            'Tedarikçinin ürüne belirlediği uniq kod; SKU güncellemelerinde zorunludur.',
          ),
          listPrice: num(
            'Ürün liste fiyatı (PSF). Fiyat güncellemesinde salePrice ile birlikte zorunludur.',
          ),
          salePrice: num(
            'Ürün satış fiyatı (TSF). Fiyat güncellemesinde listPrice ile birlikte zorunludur.',
          ),
          quantity: int32('Stok miktarı.'),
          currencyType: {
            type: 'string',
            enum: CURRENCIES,
            description: 'Ürün liste fiyatı para birimi (tablodaki tip: text).',
          },
        },
        { required: ['stockCode'] },
      ),
      ProductDeleteRequest: taskRequest('ProductDeleteSku', INTEGRATOR_CREATE),
      ProductDeleteSku: obj(
        { stockCode: str('Silinecek ürüne ait satıcı stok kodu.') },
        { required: ['stockCode'] },
      ),
      ProductTask: obj({
        id: int64("Task id; TaskDetails'de bu id ile sorgulanmalıdır."),
        type: {
          type: 'string',
          enum: ['SKU_UPDATE', 'PRODUCT_UPDATE', 'PRODUCT_CREATE', 'PRODUCT_DELETE'],
          description:
            'SKU_UPDATE: Stok Fiyat Güncelleme, PRODUCT_UPDATE: Ürün Güncelleme, PRODUCT_CREATE: ' +
            'Ürün Yükleme, PRODUCT_DELETE: Ürün Silme.',
        },
        status: {
          type: 'string',
          enum: ['IN_QUEUE', 'REJECT'],
          description:
            "IN_QUEUE: Task işleniyor, TaskDetails'den sorgulayınız. REJECT: Task işlenmemiştir, " +
            'reasons alanını kontrol ediniz.',
        },
        reasons: arr(
          str(),
          'Status bilgisine göre nedenler. Task işleme alındığında "X sku işlenmeye alındı." döner.',
        ),
      }),

      // -- task details (example-only page) ---------------------------------
      TaskDetailsRequest: obj({
        taskId: int64('Ürün task servislerinin döndüğü id.'),
        pageable: obj({ page: int32(), size: int32() }),
      }),
      TaskDetails: obj({
        taskId: int64(),
        skus: ref('TaskSkuPage'),
        createdDate: str('Örnek biçim: "12-08-2024 06:12:05" (dd-MM-yyyy HH:mm:ss).'),
        modifiedDate: str('Örnek biçim: "12-08-2024 06:12:11" (dd-MM-yyyy HH:mm:ss).'),
        status: {
          type: 'string',
          enum: ['PROCESSED', 'IN_QUEUE', 'REJECT'],
          description:
            'PROCESSED: işlem tamamlandı, IN_QUEUE: işlem devam ediyor, REJECT: task işleme alınmadı.',
        },
      }),
      TaskSkuPage: obj({
        content: arr(ref('TaskSkuResult')),
        pageable: obj({
          sort: ref('Sort'),
          offset: int64(),
          pageNumber: int32(),
          pageSize: int32(),
          paged: bool(),
          unpaged: bool(),
        }),
        last: bool(),
        totalElements: int64(),
        totalPages: int32(),
        sort: ref('Sort'),
        first: bool(),
        number: int32(),
        numberOfElements: int32(),
        size: int32(),
        empty: bool(),
      }),
      Sort: obj({ empty: bool(), sorted: bool(), unsorted: bool() }),
      TaskSkuResult: obj({
        taskId: int64(),
        ownerId: int64(),
        itemCode: str('Ürünün stockCode değeri.'),
        status: {
          type: 'string',
          enum: ['SUCCESS', 'FAIL'],
          description: 'Ürün bazlı işlem sonucu.',
        },
        sku: obj(
          {
            salePrice: num(),
            listPrice: num(),
            currencyType: str(),
            reasons: arr(str()),
            stock: int32(),
          },
          {
            description:
              'Gönderilen SKU verisi. Lonca: the only example is a price/stock (SKU_UPDATE) task; ' +
              'the fields for other task types are not documented.',
          },
        ),
        reasons: arr(str(), 'İşlem başarısız olduğunda hata detayı.'),
      }),
    },
  },
};

// ---------------------------------------------------------------------------
// "Sipariş Entegrasyonu" (portal section slug: n11-siparis-entegrasyonu)
// ---------------------------------------------------------------------------

const ORDER_DOCS = {
  list: page(ORDER_SECTION, 'siparis-listeleme-servisi'),
  update: page(ORDER_SECTION, 'siparis-kalemlerini-guncelleme-servisi'),
  split: page(ORDER_SECTION, 'siparis-paket-bolme'),
  splitByQuantity: page(ORDER_SECTION, 'miktar-bazli-paket-bolme-siparis-urun-iptali'),
  collection: page(ORDER_SECTION, 'toplama-talebi-olusturma'),
  laborCosts: page(ORDER_SECTION, 'siparis-kalemine-iscilik-bedeli-gonderme'),
};

/**
 * The "Mikro İhracat" page documents the same shipmentPackages response with a
 * second, complete example (an e-export order). It types several fields that are
 * null or absent in the order-listing page's own example, and shows two keys
 * that page does not mention at all. Such properties carry this page as their
 * own `x-lonca-doc-url`.
 */
const MICRO_EXPORT = page(`${DOCS}/mikro-ihracat`, 'mikro-ihracat');
const onMicroExport = (schema) => ({ ...schema, 'x-lonca-doc-url': MICRO_EXPORT });
const MICRO_TYPED =
  "Lonca: null or absent in this page's example; typed from the Mikro İhracat example.";

const PACKAGE_STATUSES = [
  'Created',
  'Picking',
  'Shipped',
  'Cancelled',
  'Delivered',
  'Unpacked',
  'UnSupplied',
];

/** Address keys shared by billing and shipping address (all example-only). */
const addressProperties = () => ({
  address: exampleOnly(str()),
  city: exampleOnly(str()),
  district: exampleOnly(str()),
  neighborhood: exampleOnly(str()),
  fullName: exampleOnly(str()),
  gsm: exampleOnly(str()),
  tcId: exampleOnly(str()),
  postalCode: exampleOnly(str()),
});

const SPLIT_NOTES =
  'Siparişler yalnızca Picking statüsünde bölünebilir; Created statüsündekiler bölünemez. ' +
  'Bölünen ana paketin statüsü Unpacked olur, bölünmüş paketler Picking statüsünde, aynı ' +
  'orderNumber, farklı id (paket numarası) ve farklı cargoTrackingNumber (kampanya kodu) ile ' +
  'oluşur. orderLineId değerleri GetShipmentPackages servisinden alınır.';

const orderDocument = {
  openapi: '3.0.3',
  info: {
    title: 'n11 Sipariş Entegrasyonu (REST)',
    version: COMPILED_AT,
    description:
      'REST services of the "Sipariş Entegrasyonu" section of the n11 developer portal: order ' +
      '(shipment package) listing, order line approval, package split, split by quantity with ' +
      'line cancel, logistics collection request and labour costs. n11 publishes no ' +
      "machine-readable definition; this document is compiled by hand from the section's " +
      'pages (field tables first, examples second). The SOAP invoice-link service of the same ' +
      'section is not included.',
  },
  servers: [
    {
      url: 'https://api.n11.com',
      description: 'Canlı ortam. n11 bir test ortamı belgelemiyor.',
    },
  ],
  tags: [{ name: 'Sipariş', description: 'Sipariş paketleri ve sipariş kalemleri' }],
  security: [{ appKey: [], appSecret: [] }],
  paths: {
    '/rest/delivery/v1/shipmentPackages': {
      get: {
        tags: ['Sipariş'],
        summary: 'Sipariş Listeleme Servisi',
        operationId: 'getShipmentPackages',
        description:
          'Servise 1 dakika içinde maksimum 1000 istek atılabilir. status her istekte tek bir ' +
          'değer alır. 2024 Kasım öncesi sipariş verisi bu servisten verilmez. Sonuçlar son ' +
          'güncelleme tarihine göre sıralanır (orderByDirection). Yalnızca startDate girilirse ' +
          'sonraki 15 günün, yalnızca endDate girilirse önceki 15 günün kayıtları listelenir; iki ' +
          "tarih arasında çok fark varsa endDate'ten önceki son 15 gün listelenir. Satır bazlı " +
          'fatura tutarı: (price * quantity) - (sellerDiscount + sellerCouponDiscount) = ' +
          'sellerInvoiceAmount. Konuma Özel Teslimat siparişlerinde paket numarası (id) null ' +
          'döner. sender gönderilmediğinde mağaza siparişleri listelenir. orderNumber 12 haneden ' +
          '13 haneye çıkabilir.',
        parameters: [
          {
            name: 'startDate',
            in: 'query',
            description:
              'Belirtilen tarihten sonraki siparişleri getirir. Timestamp (milliseconds) ve GMT+3 ' +
              'olarak gönderilmelidir.',
            schema: { type: 'integer', format: 'int64' },
          },
          {
            name: 'endDate',
            in: 'query',
            description:
              'Belirtilen tarihe kadar olan siparişleri getirir. Timestamp (milliseconds) ve GMT+3 ' +
              'olarak gönderilmelidir.',
            schema: { type: 'integer', format: 'int64' },
          },
          {
            name: 'page',
            in: 'query',
            description: 'Sadece belirtilen sayfadaki bilgileri döndürür.',
            schema: { type: 'integer', format: 'int32' },
          },
          {
            name: 'size',
            in: 'query',
            description: 'Bir sayfada listelenecek maksimum adet. Maksimum 100.',
            schema: { type: 'integer', format: 'int32', maximum: 100 },
          },
          {
            name: 'orderNumber',
            in: 'query',
            description: 'Sipariş numarası ile sorgulama.',
            schema: { type: 'string' },
          },
          {
            name: 'packageIds',
            in: 'query',
            description: 'Paket numarası ile sorgulama.',
            schema: { type: 'string' },
          },
          {
            name: 'status',
            in: 'query',
            description:
              'Belirtilen statüdeki siparişleri getirir. Her istekte tek bir değer alır.',
            schema: { type: 'string', enum: PACKAGE_STATUSES },
          },
          {
            name: 'orderByDirection',
            in: 'query',
            description: 'ASC: eskiden yeniye, DESC: yeniden eskiye sıralar.',
            schema: { type: 'string', enum: ['ASC', 'DESC'] },
          },
          {
            name: 'orderByField',
            in: 'query',
            description:
              'true girildiğinde paketin lastModifiedDate alanına göre sorgulama yapılır; ' +
              'kaldırıldığında ya da false olduğunda tarih aralığı sipariş oluşturma tarihi olarak ' +
              "baz alınır (tablodaki tip: string). Lonca: the page's example URL spells it " +
              '"orderbyField".',
            schema: { type: 'string', enum: ['true', 'false'] },
          },
          {
            name: 'sender',
            in: 'query',
            description:
              'Gönderici tipi: SELLER (satıcı gönderir), n11 (n11 depo gönderir), ALL (tümü). ' +
              'Gönderilmediği takdirde varsayılan değer SELLER olarak alınır. Lonca: this table ' +
              'writes "n11" where the product-query table and the response field write "N11".',
            schema: { type: 'string', default: 'SELLER' },
          },
        ],
        responses: jsonResponse(
          'Sipariş paketleri (sayfalı)',
          ref('ShipmentPackagesPage'),
          'table',
        ),
        'x-lonca-doc-url': ORDER_DOCS.list,
      },
    },
    '/rest/order/v1/update': {
      put: {
        tags: ['Sipariş'],
        summary: 'Sipariş Kalemlerini Güncelleme',
        operationId: 'updateOrder',
        description:
          'Şu an için yalnızca Picking statü güncellemesi (sipariş kalemlerini onaylama) ' +
          'yapılabilir. GetShipmentPackages servisinden Created dönen kalemler güncellenebilir. ' +
          "Hatalı ya da statüsü uygun olmayan lineId'ler için hata mesajı dönülür, kalanlar " +
          'işleme alınır. lineId için orderLineId baz alınmalıdır; birden fazla lineId ' +
          'gönderilebilir, status tek olmalıdır.',
        requestBody: jsonBody(ref('UpdateOrderRequest'), 'table'),
        responses: jsonResponse('Satır bazlı sonuç', ref('LineResults'), 'example'),
        'x-lonca-doc-url': ORDER_DOCS.update,
      },
    },
    '/rest/delivery/v1/splitCombinePackage': {
      post: {
        tags: ['Sipariş'],
        summary: 'Sipariş Paket Bölme',
        operationId: 'splitCombinePackage',
        description:
          `${SPLIT_NOTES} Gönderilen orderLineId'ler dışındaki ürünler otomatik olarak yeni bir ` +
          'pakette oluşur. Birden fazla ürün içeren bölünmüş paketler tekrar bölünebilir. Her ' +
          'splitGroups öğesi bir paket oluşturur.',
        requestBody: jsonBody(ref('SplitCombinePackageRequest'), 'example'),
        responses: jsonResponse('Oluşan paketler', ref('SplitPackageResult'), 'example'),
        'x-lonca-doc-url': ORDER_DOCS.split,
      },
    },
    '/rest/delivery/v1/splitPackageByQuantity': {
      post: {
        tags: ['Sipariş'],
        summary: 'Miktar Bazlı Paket Bölme & Sipariş Ürün İptali',
        operationId: 'splitPackageByQuantity',
        description:
          `${SPLIT_NOTES} quantities ile oluşacak paketteki ürün miktarı gönderilir; toplam ` +
          'sipariş ürün miktarını aşamaz. Body içinde yalnızca aynı siparişe ait ürünler ' +
          "bulunmalıdır. Bölme sonrası yeni ürün satırları için yeni orderLineId'ler üretilir. " +
          'Bu servisle paket bölme ile birlikte parçalı ürün iptali yapılabilir, fakat yalnızca ' +
          'iptal yapılamaz; iptal edilen paket UnSupplied olur.',
        requestBody: jsonBody(ref('SplitPackageByQuantityRequest'), 'example'),
        responses: jsonResponse('Oluşan paketler', ref('SplitPackageResult'), 'example'),
        'x-lonca-doc-url': ORDER_DOCS.splitByQuantity,
      },
    },
    '/rest/delivery/v1/collectionRequest': {
      put: {
        tags: ['Sipariş'],
        summary: 'Toplama Talebi Oluşturma',
        operationId: 'createCollectionRequest',
        description:
          'GetShipmentPackages servisinden Picking dönen kalemler için lojistik firma ' +
          '(Horoz, Ceva, Borusan) toplama talebi oluşturur. Paketteki tüm sipariş kalemleri için ' +
          'istek gönderilmelidir; eksik ya da hatalı gönderimde "Eksik ya da uygun olmayan sipariş ' +
          'öğesi bulunmaktadır." hatası alınır.',
        requestBody: jsonBody(ref('CollectionRequest'), 'table'),
        responses: jsonResponse('Sonuç', ref('CodeMessage'), 'example'),
        'x-lonca-doc-url': ORDER_DOCS.collection,
      },
    },
    '/rest/order/v1/labor-costs': {
      put: {
        tags: ['Sipariş'],
        summary: 'Sipariş Kalemine İşçilik Bedeli Gönderme',
        operationId: 'updateLaborCosts',
        description:
          "Hatalı ya da uygun olmayan orderLineId'ler için hata mesajı dönülür, kalanlar işleme " +
          "alınır. Birden fazla orderLineId gönderilebilir. İşçilik KDV oranı varsayılan 20'dir. " +
          'Hesaplama sonucu amountExcludingVAT alanında verilir. İşçilik bedeli eklenebilen ' +
          'kategoriler sayfadaki listede yer alır.',
        requestBody: jsonBody(ref('LaborCostsRequest'), 'table'),
        responses: jsonResponse('Satır bazlı sonuç', ref('LaborCostResults'), 'example'),
        'x-lonca-doc-url': ORDER_DOCS.laborCosts,
      },
    },
  },
  components: {
    securitySchemes,
    schemas: {
      // -- order listing (response table without types: types from the example)
      ShipmentPackagesPage: obj({
        pageCount: exampleOnly(int32()),
        totalPages: exampleOnly(int32()),
        page: exampleOnly(int32()),
        size: exampleOnly(int32()),
        content: exampleOnly(arr(ref('ShipmentPackage'))),
      }),
      ShipmentPackage: obj({
        billingAddress: ref('BillingAddress'),
        shippingAddress: ref('ShippingAddress'),
        orderNumber: str('Sipariş numarası. 12 haneden 13 haneye çıkabilir.'),
        id: nullable(str('Paket numarası. Konuma Özel Teslimat siparişlerinde null döner.')),
        customerEmail: str('Alıcı mail adresi'),
        customerfullName: str('Alıcı ad soyad (invoiceType: 2 ise Firma Ünvanı bu alandan döner).'),
        customerId: int64('Alıcı ID bilgisi'),
        taxId: untyped('Vergi no.'),
        taxOffice: untyped('Vergi dairesi.'),
        tcIdentityNumber: str('TC kimlik numarası'),
        cargoSenderNumber: onMicroExport(nullable(str(`Kargo takip numarası. ${MICRO_TYPED}`))),
        cargoTrackingNumber: str('Kargo barkod numarası / Kargo kampanya kodu'),
        cargoTrackingLink: str('Kargo takip linki'),
        shipmentCompanyId: int64(
          'Kargo firma id (GetShipmentCompanies metodu ile listelenebilir).',
        ),
        cargoProviderName: str(
          'Kargo firma ünvanı (GetShipmentCompanies metodu ile listelenebilir).',
        ),
        shipmentMethod: {
          ...int32('Kargo yöntemi, 1: Kargo, 2: Diğer (dijital, hediye, online teslimat).'),
          enum: [1, 2],
        },
        installmentChargeWithVATprice: num('KDV dahil vade farkı'),
        lines: arr(ref('ShipmentPackageLine'), 'Sipariş ürün satırları'),
        lastModifiedDate: int64('Sipariş son hareket tarihi (epoch milisaniye).'),
        agreedDeliveryDate: int64('Maksimum kargolama tarihi (epoch milisaniye).'),
        totalAmount: num('Toplam tutar'),
        totalDiscountAmount: num('Toplam indirim tutarı'),
        packageHistories: arr(
          ref('PackageHistory'),
          'Paket geçmişi (paketin geçmiş statüleri, tarih bazlı).',
        ),
        shipmentPackageStatus: str(`Sipariş statüsü (${PACKAGE_STATUSES.join(', ')}).`),
        micro: nullable(bool('true: e-İhracat siparişi, null: Yurt içi siparişi.')),
        hsCode: onMicroExport(
          nullable(
            str(`Ürünün uluslararası gümrük sınıflandırma kodu (GTİP / HS Kodu). ${MICRO_TYPED}`),
          ),
        ),
        invoiceLink: onMicroExport(
          nullable(
            str(
              'Sipariş Fatura Linki (yalnızca e-İhracat siparişlerinde kullanılmaktadır). ' +
                MICRO_TYPED,
            ),
          ),
        ),
        invoiceDate: onMicroExport(
          nullable(
            int64(
              'Sipariş Fatura Tarihi (yalnızca e-İhracat siparişlerinde kullanılmaktadır); ' +
                `Timestamp (milliseconds), GMT+3. ${MICRO_TYPED}`,
            ),
          ),
        ),
        etgbNo: onMicroExport(
          nullable(
            str(
              'Elektronik Ticaret Gümrük Beyanname Numarası; sipariş teslim edildikten sonra n11 ' +
                `tarafından doldurulur. ${MICRO_TYPED}`,
            ),
          ),
        ),
        etgbDate: onMicroExport(
          nullable(
            int64(
              'Elektronik Ticaret Gümrük Beyanname Tarihi; sipariş teslim edildikten sonra n11 ' +
                `tarafından doldurulur. ${MICRO_TYPED}`,
            ),
          ),
        ),
        deliveryAddressType: nullable({
          type: 'string',
          enum: ['KTN', 'EASYPOINT', 'PUP'],
          description:
            'Teslimat adresi tipi. null haricinde bir değer aldığında sipariş bir teslimat ' +
            'noktası siparişidir ve shippingAddress teslimat noktasının adresidir.',
        }),
        sellerId: exampleOnly(int64()),
        isReturned: onMicroExport(
          exampleOnly(bool("Lonca: only in the Mikro İhracat page's example (false there).")),
        ),
        dst_office_id: onMicroExport(
          exampleOnly(untyped("Lonca: only in the Mikro İhracat page's example (null there).")),
        ),
      }),
      BillingAddress: obj(
        {
          ...addressProperties(),
          taxId: exampleOnly(untyped('Vergi no.')),
          taxHouse: exampleOnly(untyped('Vergi dairesi.')),
          invoiceType: { ...int32('Fatura tipi, 1: Bireysel, 2: Kurumsal.'), enum: [1, 2] },
          countryCode: str(
            'Alıcı ülke kodu. Lonca: the example value is the string "null"; the Mikro İhracat ' +
              'example has "RU".',
          ),
        },
        { description: 'Fatura adresi' },
      ),
      ShippingAddress: obj(
        {
          ...addressProperties(),
          fullName: exampleOnly(
            nullable(
              str('Teslimat noktası siparişlerinde (deliveryAddressType null değilse) null döner.'),
            ),
          ),
        },
        {
          description:
            'Teslimat adresi. Teslimat noktası siparişlerinde teslimat noktasının adresidir.',
        },
      ),
      ShipmentPackageLine: obj({
        quantity: int32('Sipariş ürün adedi'),
        productId: int64('N11 ürün kodu'),
        productName: str('Ürün adı'),
        stockCode: str('Satıcı ürün kodu'),
        variantAttributes: arr(
          obj({ name: exampleOnly(str()), value: exampleOnly(str()) }),
          'Ürün varyant özellikleri',
        ),
        customTextOptionValues: arr({}, 'Müşteriye özel ürün seçeneği. Örnekte boş dizi.'),
        price: num('Sipariş ürün birim fiyatı (indirimler hariç)'),
        dueAmount: num('Tahsil edilecek tutar'),
        installmentChargeWithVAT: num('KDV dahil vade farkı (ürün bazlı)'),
        sellerCouponDiscount: num('Mağaza kupon indirimi'),
        sellerCampaignCommissionDiscount: num('Kampanyalı komisyon indirim tutarı'),
        sellerDiscount: num('Mağaza indirimi'),
        mallDiscount: num('Ürün ile ilgili N11 indirimi'),
        sellerInvoiceAmount: num('Mağaza fatura tutarı'),
        totalMallDiscountPrice: num('N11 indirimleri toplamı'),
        orderLineId: int64('Sipariş ürün ID'),
        orderItemLineItemStatusName: str('Sipariş ürün statüsü'),
        totalSellerDiscountPrice: num('Mağaza indirim toplamı'),
        vatRate: num('Sipariş ürün KDV oranı'),
        commissionRate: num('Sipariş ürün komisyon oranı'),
        sellerCampaignCommissionRate: num('Kampanyalı komisyon indirim oranı'),
        taxDeductionRate: num('Sipariş ürün vergi kesinti oranı'),
        totalLaborCostExcludingVAT: num('Sipariş ürün işçilik ücreti'),
        netMarketingFeeRate: num('Pazarlama hizmet bedeli oranı'),
        netMarketplaceFeeRate: num('Pazaryeri hizmet bedeli oranı'),
        barcode: onMicroExport(nullable(str(`Ürün barkodu. ${MICRO_TYPED}`))),
        deliveryFeeType: {
          ...int32(
            'Kargo Ödeme Tipi, 1: Şartlı Kargo (n11 Öder), 3: Mağaza Öder, 5: Şartlı Kargo ' +
              '(Mağaza Öder).',
          ),
          enum: [1, 3, 5],
        },
        sellerDiscountedPrice: num('Mağaza indirimli fiyat'),
        sender: str('Gönderici tipi, SELLER: Satıcı gönderir, N11: n11 depo gönderir.'),
        productOrigin: onMicroExport(nullable(str(`Sipariş ürün menşei bilgisi. ${MICRO_TYPED}`))),
      }),
      PackageHistory: obj({
        createdDate: exampleOnly(int64('Epoch milisaniye.')),
        status: exampleOnly(
          str(
            'Paket statüsü. Lonca: two example values carry a leading space (" Shipped", ' +
              '" Delivered").',
          ),
        ),
      }),

      // -- order line update -------------------------------------------------
      UpdateOrderRequest: obj({
        lines: exampleOnly(
          arr(
            obj({
              lineId: int64("Onaylanacak item id bilgisi (GetShipmentPackages'taki orderLineId)."),
            }),
          ),
        ),
        status: { type: 'string', enum: ['Picking'], description: 'Onaylandı statüsü.' },
      }),
      LineResults: obj({
        content: arr(
          obj({
            lineId: int64(),
            status: str('Satır bazlı sonuç (ör. SUCCESS).'),
            reasons: str('Sonuç mesajı (tek bir string).'),
          }),
        ),
      }),

      // -- package split (example-only pages) --------------------------------
      SplitCombinePackageRequest: obj({
        splitGroups: arr(
          obj({ orderLineIds: arr(int64(), "Aynı pakette olacak sipariş ürün id'leri.") }),
          'Oluşturulacak her paket için bir grup.',
        ),
      }),
      SplitPackageByQuantityRequest: obj({
        cancelledItems: arr(
          obj({
            cancelReasonId: {
              ...int32(
                'İptal nedeni. 61: Stok Tükendi, 62: Kusurlu/Defolu/Bozuk Ürün, 63: Hatalı Fiyat, ' +
                  '64: Mücbir Sebep, 65: Diğer.',
              ),
              enum: [61, 62, 63, 64, 65],
            },
            orderLineId: int64(),
            quantity: int32('İptal edilecek miktar.'),
          }),
          'İptal edilecek sipariş ürünleri (paket bölme ile birlikte).',
        ),
        splitPackages: arr(
          obj({
            packageDetails: arr(
              obj({
                orderLineId: int64(),
                quantities: int32('Oluşacak paketteki ürün miktarı.'),
              }),
            ),
          }),
          'Oluşturulacak her paket için bir packageDetails listesi.',
        ),
      }),
      SplitPackageResult: obj({
        code: int32(),
        message: str(),
        splitPackageOrderItems: arr(
          obj({
            orderNumber: str(),
            packageId: str(),
            orderLineId: int64(),
            stockCode: str(),
            quantity: int32(),
          }),
        ),
      }),

      // -- collection request ------------------------------------------------
      CollectionRequest: obj({
        collectionRequestDetails: exampleOnly(
          arr(
            obj({
              id: str('Paket / Kampanya kodu.'),
              orderLineId: int64('Talep oluşturulacak item id bilgisi.'),
              boxQuantity: int32('Koli adedi.'),
              desi: num('Toplam desi.'),
              shipmentCompany: {
                type: 'string',
                enum: ['HLZ', 'CEVA', 'BL'],
                description:
                  'Kargo firma kısa kodu. HLZ: Horoz Lojistik, CEVA: Ceva Lojistik, BL: Ceva ' +
                  'Tedarik Zinciri (Borusan).',
              },
            }),
            'Paketteki tüm sipariş kalemleri gönderilmelidir. Lonca: the table has no type ' +
              'column; types follow the example.',
          ),
        ),
      }),
      CodeMessage: obj({ code: int32(), message: str() }),

      // -- labour costs ------------------------------------------------------
      LaborCostsRequest: obj({
        laborCostDetails: exampleOnly(
          arr(
            obj({
              orderLineId: int64('İşçilik bedeli eklenecek sipariş ürün id bilgisi.'),
              totalLaborCostExcludingVAT: num('KDV hariç işçilik bedeli (tablodaki tip: amount).'),
              laborVatRate: nullable({
                ...int32(
                  'İşçilik bedeli KDV oranı. null ya da gönderilmediği takdirde 20 olarak baz alınır.',
                ),
                enum: VAT_RATES,
                default: 20,
              }),
            }),
          ),
        ),
      }),
      LaborCostResults: obj({
        content: arr(
          obj({
            lineId: int64(),
            status: str('Satır bazlı sonuç (ör. SUCCESS).'),
            reasons: str('Sonuç mesajı (tek bir string).'),
            details: obj({
              totalLaborCostExcludingVAT: num(),
              laborVatRate: int32(),
              amountExcludingVAT: num(
                'Item bazlı KDV hariç birim fiyat - işçilik bedeli KDV tutarı.',
              ),
            }),
          }),
        ),
      }),
    },
  },
};

/**
 * One standalone document per portal section. n11 groups its documentation
 * into sections ("Ürün Entegrasyonu", "Sipariş Entegrasyonu", "İade/İptal
 * Entegrasyonu", ...) and every section is served from the same host, so a
 * section — not a host or path family — is the service unit, as Trendyol's
 * API definitions are. Only sections with REST operations produce a file.
 */
export const DOCUMENTS = [
  {
    file: 'product.json',
    section: 'Ürün Entegrasyonu',
    sectionUrl: `${PRODUCT_SECTION}/`,
    document: productDocument,
  },
  {
    file: 'order.json',
    section: 'Sipariş Entegrasyonu',
    sectionUrl: `${ORDER_SECTION}/`,
    document: orderDocument,
  },
];

/**
 * Contract-probe snapshots (`probe-snapshots/n11.json`) record, per probe, the
 * `wire` exchanges it caused with the shape (key sets + JSON types, never
 * values) of the raw response body. Each entry names the probe and the spec
 * operation its JSON exchange answered; the whole body is compared from the
 * root of the documented 200 schema. SOAP probes (`/ws/*`, XML bodies) have
 * nothing to compare and are not listed.
 */
export const PROBE_OBSERVATIONS = [
  { probe: 'categories.list', file: 'product.json', operation: 'get /cdn/categories' },
  {
    probe: 'categories.getAttributes',
    file: 'product.json',
    operation: 'get /cdn/category/{categoryId}/attribute',
  },
  { probe: 'products.list', file: 'product.json', operation: 'get /ms/product-query' },
  {
    probe: 'orders.list',
    file: 'order.json',
    operation: 'get /rest/delivery/v1/shipmentPackages',
  },
];
