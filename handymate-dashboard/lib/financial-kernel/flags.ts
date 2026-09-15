import type { KernelDb } from './events/publish'
export async function isFinancialKernelEnabled(db:KernelDb,businessId:string):Promise<boolean>{
  const {data,error}=await db.rpc('financial_kernel_flags',{p_business_id:businessId})
  if(error)throw new Error(error.message)
  if(data===null)return false
  if(typeof data!=='object'||!('financial_kernel_enabled' in data)||typeof data.financial_kernel_enabled!=='boolean')throw new TypeError('Invalid kernel flags response')
  return data.financial_kernel_enabled
}
