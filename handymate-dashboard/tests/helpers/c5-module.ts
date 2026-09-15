import ts from 'typescript'
import { readFileSync, existsSync } from 'fs'
import path from 'path'

/** Real application modules with explicit external dependencies. No live clients. */
export function c5Modules(deps:Record<string,unknown>) {
  const cache=new Map<string,Record<string,any>>()
  function load(file:string):Record<string,any> {
    file=path.resolve(file)
    if(cache.has(file)) return cache.get(file)!
    const module={exports:{} as Record<string,any>};cache.set(file,module.exports)
    const js=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
    new Function('require','module','exports',js)((name:string)=>{
      if(name in deps) return deps[name]
      if(name.startsWith('@/')||name.startsWith('.')) {
        const base=name.startsWith('@/')?path.resolve(name.slice(2)):path.resolve(path.dirname(file),name)
        return load(existsSync(base+'.ts')?base+'.ts':existsSync(base+'.tsx')?base+'.tsx':base+'/index.ts')
      }
      return require(name)
    },module,module.exports)
    return module.exports
  }
  return load
}
