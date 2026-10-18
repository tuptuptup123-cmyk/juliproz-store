/* Shared website SALE selections: the browser and initial HTML use the same rules. */
(function(root){
 'use strict';
 const node=typeof module==='object'&&module.exports;
 const taxonomy=node?require('./catalog-taxonomy.js'):root.CatalogTaxonomy;
 const pricing=node?require('./product-pricing.js'):root.ProductPricing;
 const groups={
  clothing:{ru:'Одежда',en:'Clothing',categories:['Одежда','Брюки','Джинсы','Жилеты','Зип-худи','Кардиганы','Костюмы','Купальники','Куртки','Леггинсы','Лонгсливы','Майки','Поло','Рубашки','Свитеры','Свитшоты','Спортивная одежда','Футболки','Худи','Шорты','Топы','Блузы','Юбки','Платья','Комбинезоны','Пиджаки','Пальто','Тренчи','Пуховики','Пляжная одежда']},
  shoes:{ru:'Обувь',en:'Shoes',categories:['Обувь']},
  accessories:{ru:'Аксессуары',en:'Accessories',categories:['Аксессуары','Головной убор','Очки','Перчатки','Сумки','Украшения','Часы']}
 };
 const valid=value=>Object.hasOwn(groups,value)?value:null;
 function fromSearch(search){const params=new URLSearchParams(search),sale=params.get('sale')==='1';return {sale,saleCollection:sale?valid(params.get('collection')):null}}
 function matches(product,collection){return product?.available!==false&&Boolean(pricing.discount(product))&&(!valid(collection)||groups[collection].categories.includes(taxonomy.category(product.category)))}
 function url(lang='ru',collection=null){const params=new URLSearchParams({sale:'1'});if(valid(collection))params.set('collection',collection);if(lang==='en')params.set('lang','en');return '/catalog?'+params}
 const api={groups,fromSearch,matches,url};root.SaleCollections=api;if(node)module.exports=api;
})(typeof window==='object'?window:globalThis);
