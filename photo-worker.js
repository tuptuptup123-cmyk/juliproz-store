// U²-Net inference stays off the UI thread. All assets are served by this site.
importScripts('/vendor/photo-editor/ort.min.js');
ort.env.wasm.numThreads=1;
ort.env.wasm.proxy=false;
ort.env.wasm.wasmPaths='/vendor/photo-editor/';
let model;
self.onmessage=async({data})=>{
 try{
  model ||= ort.InferenceSession.create('/vendor/photo-editor/u2netp.onnx',{executionProviders:['wasm'],graphOptimizationLevel:'all'});
  const session=await model,input=new ort.Tensor('float32',data.input,[1,3,320,320]);
  const result=await session.run({[session.inputNames[0]]:input}),output=result[session.outputNames[0]];
  const values=Float32Array.from(output.data);
  input.dispose();Object.values(result).forEach(t=>t.dispose());
  self.postMessage({id:data.id,values},[values.buffer]);
 }catch(error){model=null;self.postMessage({id:data.id,error:String(error.message||error)})}
};
