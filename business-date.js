(function(root){
 const timeZone='Europe/Kyiv',formatter=new Intl.DateTimeFormat('sv-SE',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
 const today=(now=new Date())=>formatter.format(now);
 root.BusinessDate={timeZone,today};if(typeof module==='object')module.exports=root.BusinessDate;
})(typeof window==='object'?window:globalThis);
