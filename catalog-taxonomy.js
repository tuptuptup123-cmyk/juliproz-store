(function(root){
 const clean=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ');
 const key=value=>clean(value).toLocaleLowerCase('ru').replace(/ё/g,'е');
 const brandKey=value=>key(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[.\s]/g,'');
 const brandNames=['Amiri','Alexander McQueen','Balenciaga','Bottega Veneta','Brioni','Brunello Cucinelli','Burberry','C.P. Company','Canada Goose','Cartier','Chanel','Chrome Hearts','Clive Christian','Dior','Dyson','Fendi','Givenchy','Goyard','Gucci','Hermès','Jil Sander','Kith','Kiton','Loewe','Loro Piana','Louis Vuitton','Maison Margiela','Miu Miu','Moncler','Nike','On','Off-White','Prada','Rimowa','Saint Laurent','Stone Island','Supreme','Swatch','Tom Ford','Valentino','Van Cleef','Versace','Vetements','Zilli'];
 const brands=new Map(brandNames.map(n=>[brandKey(n),n]));brands.set(brandKey('On running'),'On');
 const categoryNames=['Аксессуары','Ароматические свечи','Благовония','Брюки','Головной убор','Джинсы','Духи','Жилеты','Зип-худи','Кардиганы','Костюмы','Купальники','Куртки','Леггинсы','Лонгсливы','Майки','Обувь','Одежда','Очки','Перчатки','Поло','Рубашки','Свитеры','Свитшоты','Спортивная одежда','Сумки','Техника','Украшения','Футболки','Худи','Часы','Шорты','Топы','Блузы','Юбки','Платья','Комбинезоны','Пиджаки','Пальто','Тренчи','Пуховики','Пляжная одежда'];
 const categories=new Map(categoryNames.map(n=>[key(n),n]));
 for(const [alias,label] of Object.entries({'Кепка':'Головной убор','Кепки':'Головной убор','Шапка':'Головной убор','Шапки':'Головной убор','Панама':'Головной убор','Панамы':'Головной убор','Головные уборы':'Головной убор','Кольцо':'Украшения','Кольца':'Украшения','Подвеска':'Украшения','Подвески':'Украшения','Серьга':'Украшения','Серьги':'Украшения','Ремень':'Аксессуары','Ремни':'Аксессуары','Лонгслив':'Лонгсливы'}))categories.set(key(alias),label);
 const category=value=>categories.get(key(value))||clean(value);
 const brand=value=>brands.get(brandKey(value))||clean(value);
 function unique(values,normalize=clean){const result=new Map();for(const value of values){const label=normalize(value);if(label&&!result.has(key(label)))result.set(key(label),label)}return [...result.values()]}
 function brandParts(value){return unique(clean(value).split(/\s*[×]\s*|\s+[xх]\s+/i),brand)}
 const api={clean,key,category,brand,brandParts,unique};root.CatalogTaxonomy=api;
 if(typeof module==='object')module.exports=api;
})(typeof window==='object'?window:globalThis);
