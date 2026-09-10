const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
function load(file,mocks={},cache={}) {
 file=path.resolve(file);if(!fs.existsSync(file)&&file.endsWith('.ts'))file=path.join(file.slice(0,-3),'index.ts');if(cache[file])return cache[file].exports
 const mod={exports:{}};cache[file]=mod
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText
 vm.runInNewContext(code,{module:mod,exports:mod.exports,process,console,Buffer,URL,require(n){
  if(n in mocks)return mocks[n]
  if(n.startsWith('@/'))return load(n.slice(2)+'.ts',mocks,cache)
  if(n.startsWith('.'))return load(path.resolve(path.dirname(file),n)+'.ts',mocks,cache)
  return require(n)
 }})
 return mod.exports
}
function database(respond) {return {from(table){let op='read',value,filters=[];const q={};for(const k of ['select','single','maybeSingle','limit','order','gte','lt','not','ilike'])q[k]=()=>q
 for(const k of ['eq','in','is','or','neq'])q[k]=(...args)=>{filters.push([k,...args]);return q}
 for(const k of ['insert','update'])q[k]=v=>{op=k;value=v;return q}
 q.then=(resolve,reject)=>Promise.resolve().then(()=>respond({table,op,value,filters})).then(resolve,reject);return q}}}

module.exports={load,database}
