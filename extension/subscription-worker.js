import {findSubscriptions} from './subscriptions.js';
self.onmessage=({data})=>{
 try{const analysis=findSubscriptions(data.prepared,{asOf:data.asOf,progress:value=>self.postMessage({token:data.token,progress:value})});self.postMessage({token:data.token,analysis});}
 catch(error){self.postMessage({token:data.token,error:error.message});}
};
