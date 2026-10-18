# Google SEO: RU / EN — 18 октября 2026

Существующие страницы оптимизированы для русскоязычных и англоязычных клиентов по всему миру. Buyer service остаётся названием услуги. Оформление, меню и набор страниц сохранены.

## Группы запросов

Это семантические группы по содержанию услуг и наблюдаемой поисковой выдаче, а не рейтинг частотности. Доступа к измерениям Google Keyword Planner в этой работе не было; объём поиска и прогноз заявок не заявляются.

| Страница | Русские запросы | Английские запросы |
| --- | --- | --- |
| Главная | персональный байер, выкуп люксовых вещей, поиск вещей под заказ | luxury personal shopper, luxury personal shopping, worldwide luxury sourcing, buyer service |
| Hermès | Hermès Birkin под заказ, сумка Kelly, Mini Kelly, редкие сумки Hermès | Hermès personal shopper, Hermès bag sourcing, Birkin bag, Kelly bag, Mini Kelly |
| Chanel | сумки Chanel под заказ, Chanel Classic, Chanel 25, Chanel 19 | Chanel personal shopping, Chanel bags, Classic 11.12, Chanel 25 |
| Loro Piana | обувь Loro Piana, Summer Walk, Open Walk, выкуп под заказ | Loro Piana personal shopper, Summer Walk loafers, Open Walk ankle boots |
| Outlet | выкуп из аутлетов Италии и Франции, аутлеты Европы, приватные сейлы | designer outlets, outlet personal shopping, private sales, discounted luxury clothing |
| Каталог / услуги | купить люксовые вещи, аутентификация, SPA сумок, обслуживание часов | shop designer bags, luxury authentication, handbag care, watch servicing |

Названия моделей описывают возможные запросы на поиск. Они не означают наличие конкретной вещи или гарантированный срок выкупа.

## Сделано

- Доработаны title и description главной, каталога, услуг, Outlet и трёх основных брендовых страниц на обоих языках. Остальные ранее существовавшие страницы брендов сохранены.
- Добавлены естественные формулировки поиска и выкупа в существующие вводные тексты и раскрывающиеся карточки. Новых блоков, меню и скрытых списков ключевых слов нет.
- Проверены названия и описания 400 товаров из публичного API. Закрыты 18 уникальных пробелов в английских переводах, преимущественно Rolex; исходные записи каталога, цены и референсы не менялись.
- Поисковое описание товара теперь содержит название модели: одинаковые заметки о состоянии не создают одинаковые snippets у разных часов.
- Исправлены язык Open Graph и изображение Twitter при первичной загрузке и переключении языка. Русский переключатель возвращает чистый URL, английский — `?lang=en`.
- Разрешены крупные предпросмотры изображений. Сохранены и проверены ранее реализованные canonical, взаимные hreflang, серверный HTML, sitemap и Product/Offer без вымышленных цен и рейтингов.

## Проверка

18 тематических unit-тестов, публичная сборка и два браузерных набора прошли. Проверены мобильные и настольные экраны, переключение RU/EN, обновление, Back/Forward, контакты, фильтры, корзина, страницы без JavaScript и сохранение русского интерфейса Telegram. Скриншоты главной, Hermès и Outlet просмотрены.

## Как оценивать результат

Изменения должны быть повторно обойдены Google. Публикация не означает подтверждённую индексацию или гарантированное место в выдаче. Далее смотреть в Search Console и разделе статистики Google в админке: реальные запросы, показы, клики, страницы и страны; обращения к менеджеру оценивать отдельно от поисковых кликов. Приоритизировать дальнейшие правки по накопленной статистике, а не по числу добавленных ключевых слов.

## Источники

- Google: https://developers.google.com/search/docs/appearance/title-link
- Google: https://developers.google.com/search/docs/appearance/snippet
- Google: https://developers.google.com/search/docs/specialty/international/localized-versions
- Google: https://developers.google.com/search/docs/essentials/spam-policies#keyword-stuffing
- Google: https://developers.google.com/search/docs/appearance/google-images
- Hermès: https://www.hermes.com/sg/en/content/106196-kelly/
- Chanel: https://www.chanel.com/us/fashion/handbags/the-chanel-handbag/
- Loro Piana: https://us.loropiana.com/en/c/shoes
