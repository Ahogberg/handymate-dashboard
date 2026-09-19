import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
export type MailProvider = 'google'|'microsoft'
export const parseProvider=(v:string):MailProvider=>{if(v!=='google'&&v!=='microsoft')throw new Error('Okänd mejlleverantör.');return v}
export const opaque=()=>randomBytes(32).toString('base64url')
export const digest=(v:string)=>createHash('sha256').update(v).digest('base64url')
export const safeReturn=(v:unknown)=>v==='onboarding'?'/onboarding':'/dashboard/settings/integrations'
function key(){const b=Buffer.from(process.env.MAIL_TOKEN_KEY||'','base64');if(b.length!==32)throw new Error('Mejlkopplingens kryptering är inte konfigurerad.');return b}
export function seal(value:string,context:string){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key(),iv);c.setAAD(Buffer.from(context));const body=Buffer.concat([c.update(value,'utf8'),c.final()]);return ['v1',iv.toString('base64url'),c.getAuthTag().toString('base64url'),body.toString('base64url')].join('.')}
export function unseal(value:string,context:string){const [v,iv,tag,body]=value.split('.');if(v!=='v1'||!iv||!tag||!body)throw new Error('Ogiltig skyddad mejlinloggning.');const d=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64url'));d.setAAD(Buffer.from(context));d.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([d.update(Buffer.from(body,'base64url')),d.final()]).toString('utf8')}
export function config(provider:MailProvider){const p=provider==='google'?'GOOGLE_MAIL':'MICROSOFT_MAIL',clientId=process.env[`${p}_CLIENT_ID`]||'',clientSecret=process.env[`${p}_CLIENT_SECRET`]||'',origin=process.env.NEXT_PUBLIC_APP_URL||'https://app.handymate.se';const configured=!!clientId&&!!clientSecret&&Buffer.from(process.env.MAIL_TOKEN_KEY||'','base64').length===32;return{clientId,clientSecret,redirectUri:`${origin}/api/mail/${provider}/callback`,configured,enabled:configured&&process.env.MAIL_SYNC_ENABLED==='true'&&process.env[`${p}_ENABLED`]==='true'}}
export const sameOrigin=(r:Request)=>r.headers.get('origin')===new URL(r.url).origin
