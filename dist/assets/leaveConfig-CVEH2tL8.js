function r(e){return e==null||e===""?"unrestricted":Number(e)===0?"blocked":"capped"}function t(e,n){return e==="unrestricted"?null:e==="blocked"?0:parseInt(n,10)||0}export{t as a,r as n};
