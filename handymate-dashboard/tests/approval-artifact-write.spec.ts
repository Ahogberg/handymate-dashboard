import { test, expect } from '@playwright/test'
import { approvalArtifactId, insertApprovalArtifact } from '../lib/approvals/artifact-write'

test('different businesses and different actions cannot share artifact identities',()=>{
 const id=approvalArtifactId('b','a','fact')
 expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/)
 expect(approvalArtifactId('b','a','fact')).toBe(id)
 expect(approvalArtifactId('b2','a','fact')).not.toBe(id)
 expect(approvalArtifactId('b','a','time')).not.toBe(id)
})
test('lost insert response is recovered by finding the existing artifact, without a second write',async()=>{
 let row:any=null,inserts=0
 const db:any={from(){let insert=false,values:any,filters:any[]=[];const q:any={select(){return q},eq(k:any,v:any){filters.push([k,v]);return q},single(){return q},maybeSingle(){return q},insert(v:any){insert=true;values=v;return q},then(resolve:any){if(insert){inserts++;row=values;return resolve({data:null,error:{message:'response lost'}})}expect(filters).toContainEqual(['business_id','b']);resolve({data:row,error:null})}};return q}}
 expect((await insertApprovalArtifact(db,'customer_fact','id','b','a','fact',{content:'Reviewed'})).error).toBeTruthy()
 const second=await insertApprovalArtifact(db,'customer_fact','id','b','a','fact',{content:'Reviewed'})
 expect(second.data.content).toBe('Reviewed');expect(inserts).toBe(1)
})
