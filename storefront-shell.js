/* Restore trusted project markup before the deferred application initializes. */
(()=>{'use strict';const data=document.getElementById('storefrontShell');if(!data)return;const shell=JSON.parse(data.textContent);if(typeof shell!=='string')return;data.insertAdjacentHTML('beforebegin',shell);data.remove()})();
