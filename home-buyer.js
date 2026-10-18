/* Public homepage content, shared by the browser and the indexable HTML response. */
(function(root){
 'use strict';
 const copy={
  ru:{
   categories:['Сумки','Одежда','Обувь','Часы','Украшения'],categoriesLabel:'Что можно заказать',
   process:'Как заказать через байера',more:'Подробнее об услуге',
   steps:[['Ваш запрос','Пришлите фото, ссылку или название вещи, размер и желаемый цвет.'],['Поиск и согласование','Обсудим наличие, итоговую стоимость, проверку и сроки.'],['Выкуп и доставка','После подтверждения условий организуем выкуп и доставку.']],
   findTitle:'Не нашли нужную вещь в каталоге?',findCopy:'Отправьте модель или фотографию — ваш байер проверит доступные предложения по всему миру, включая редкие вещи под заказ.',findAction:'Найти вещь',
   faqTitle:'Перед первым заказом',faqCopy:'Ответили на частые вопросы, чтобы сотрудничество было комфортным и понятным.',
   questions:[
    ['Из чего складывается стоимость?','Итоговую стоимость и все условия согласуем с вами до оплаты. Менеджер уточнит стоимость вещи, условия выкупа и доставки.'],
    ['Как проверяется подлинность?','Формат проверки зависит от вещи. Обсудим подходящий способ подтверждения подлинности; при необходимости организуем онлайн- или офлайн-аутентификацию через партнёров. Стоимость и условия согласуем заранее.'],
    ['Как согласуются сроки доставки?','Пришлите модель и страну доставки. Менеджер уточнит наличие, возможность выкупа и доставки, затем согласует с вами сроки и итоговые условия до оплаты.']
   ]
  },
  en:{
   categories:['Bags','Clothing','Shoes','Watches','Jewellery'],categoriesLabel:'What we source',
   process:'How personal shopping works',more:'Explore our services',
   steps:[['Your request','Send a photo, link or model name, along with your size and preferred colour.'],['Sourcing and details','We discuss availability, the total cost, authentication and timing.'],['Purchase and delivery','Once you confirm the terms, we arrange the purchase and delivery.']],
   findTitle:'Looking for something beyond the collection?',findCopy:'Send a model or photograph. Your personal shopper will check worldwide availability, including rare and sold-out designer pieces.',findAction:'Find a piece',
   faqTitle:'Before your first order',faqCopy:'Answers to common questions, so you know what to expect.',
   questions:[
    ['What is included in the total cost?','We agree on the total cost and all terms before payment. Your manager will confirm the price of the piece and the purchase and delivery arrangements.'],
    ['How is authenticity checked?','The appropriate check depends on the piece. We discuss how authenticity can be verified and, where needed, arrange online or in-person authentication through our partners. Costs and terms are agreed in advance.'],
    ['How are delivery times agreed?','Send us the model and your delivery country. Your manager will check availability and purchase and delivery options, then agree on the timing and final terms with you before payment.']
   ]
  }
 };
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const arrow='<svg class="inline-arrow" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg>';
 function render(language='ru',prefix=''){
  const en=language==='en',c=copy[en?'en':'ru'],id=escape(prefix),contact=en?'https://wa.me/message/LX6SBE3QCQXKG1':'https://t.me/juliproz';
  return `<ul class="home-buyer-categories" aria-label="${c.categoriesLabel}">${c.categories.map(label=>`<li>${label}</li>`).join('')}</ul>
   <section class="home-buyer-process" id="${id}homeHowItWorks" aria-labelledby="${id}homeProcessTitle">
    <div class="home-section-heading"><h2 id="${id}homeProcessTitle">${c.process}</h2><a class="home-text-link" href="/services${en?'?lang=en':''}">${c.more}${arrow}</a></div>
    <ol class="home-buyer-steps">${c.steps.map(([title,description],i)=>`<li><span class="home-step-number" aria-hidden="true">0${i+1}</span><h3>${title}</h3><p>${description}</p></li>`).join('')}</ol>
   </section>
   <aside class="home-buyer-request" aria-labelledby="${id}homeRequestTitle"><div><h2 id="${id}homeRequestTitle">${c.findTitle}</h2><p>${c.findCopy}</p></div><a class="home-buyer-button home-buyer-button-dark" data-contact-event="manager_general" href="${contact}" target="_blank" rel="noopener">${c.findAction}${arrow}</a></aside>
   <section class="home-buyer-faq" aria-labelledby="${id}homeQuestionsTitle"><div><h2 id="${id}homeQuestionsTitle">${c.faqTitle}</h2><p>${c.faqCopy}</p></div><div class="home-buyer-questions">${c.questions.map(([question,answer],i)=>`<details${i===0?' open':''}><summary>${question}<span class="home-faq-symbol" aria-hidden="true"></span></summary><p>${answer}</p></details>`).join('')}</div></section>`;
 }
 const api={render};
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(typeof document==='undefined')return;
 if(document.documentElement.dataset.storefront==='telegram')return;
 function update(){const el=document.getElementById('homeBuyerContent');if(el)el.innerHTML=render(root.SiteLanguage?.language||document.documentElement.lang)}
 update();document.addEventListener('site-language-change',update);
 root.addEventListener('storage',event=>{if(event.key==='jpWebsiteLanguageV1')update()});
 // Apply the initial anchor after replacing the server-rendered fallback.
 if(location.hash==='#homeHowItWorks')requestAnimationFrame(()=>document.getElementById('homeHowItWorks')?.scrollIntoView());
})(typeof window==='object'?window:globalThis);
