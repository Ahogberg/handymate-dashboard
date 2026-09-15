// Fail rather than silently reporting partial totals after PostgREST's row limit.
export async function readAll<T = any>(query: () => any): Promise<T[]> {
  const rows: T[] = []
  for (let offset=0; offset<100000; offset+=1000) {
    const {data,error}=await query().range(offset,offset+999)
    if(error) throw error
    if(!data) throw new Error('Missing query result')
    rows.push(...data)
    if(data.length<1000) return rows
  }
  throw new Error('Planning result too large')
}
