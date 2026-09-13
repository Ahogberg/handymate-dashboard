const {load,database}=require('./integrity-loader.cjs')
const assert=require('node:assert/strict'),fs=require('node:fs')
const {PGlite}=require('@electric-sql/pglite')
const {googleReconnection}=load('lib/google/reconnection.ts')
const {findGmailMessage,gmailIdentity}=load('lib/gmail/message-identity.ts')
const calendar=['https://www.googleapis.com/auth/calendar.readonly','https://www.googleapis.com/auth/calendar.events']
const base={email:'a@example.invalid',refreshToken:'new',scopes:calendar,retainedAccountVerified:false}
const cases=[]; const test=(name,fn)=>cases.push([name,fn])
test('calendar-only token has no mail rights',()=>{const r=googleReconnection(base);assert.equal(r.gmail_scope_granted,false);assert.equal(r.gmail_send_scope_granted,false)})
test('verified read and send are independent',()=>{const r=googleReconnection({...base,scopes:[...calendar,'https://www.googleapis.com/auth/gmail.readonly']});assert.equal(r.gmail_scope_granted,true);assert.equal(r.gmail_send_scope_granted,false)})
test('broader existing Google grant is recognized',()=>assert.equal(googleReconnection({...base,scopes:[...calendar,'https://www.googleapis.com/auth/gmail.modify']}).gmail_send_scope_granted,true))
test('new account without refresh is refused',()=>assert.throws(()=>googleReconnection({...base,refreshToken:null})))
test('existing refresh must be verified by Google',()=>assert.throws(()=>googleReconnection({...base,refreshToken:null,existing:{account_email:base.email,refresh_token:'old'}})))
test('verified same-account refresh may be retained',()=>assert.equal(googleReconnection({...base,refreshToken:null,existing:{account_email:base.email,refresh_token:'old'},retainedAccountVerified:true}).gmail_scope_granted,false))
test('account switch cannot reuse cursor or credentials even with new refresh',()=>assert.throws(()=>googleReconnection({...base,existing:{account_email:'b@example.invalid',refresh_token:'old'},retainedAccountVerified:true})))
test('missing calendar grant leaves old connection untouched',()=>assert.throws(()=>googleReconnection({...base,scopes:[]})))
test('mailbox normalized but provider ID remains exact',()=>{const r=gmailIdentity(' A@EXAMPLE.INVALID ','AbC');assert.equal(r.mail_account,'a@example.invalid');assert.equal(r.provider_message_id,'AbC')})
test('identity query binds tenant provider mailbox and message',async()=>{
 const db=database(({filters})=>{for(const pair of [['business_id','b'],['mail_provider','google'],['mail_account','a@example.invalid'],['provider_message_id','m']])assert(filters.some(f=>f[1]===pair[0]&&f[2]===pair[1]));return {data:{id:'row'}}})
 assert.equal((await findGmailMessage(db,'b','a@example.invalid','m')).id,'row')
})
test('ambiguous legacy record blocks rather than duplicates',async()=>{
 const db=database(({filters})=>({data:filters.some(f=>f[1]==='mail_provider'&&f[2]==='legacy')?{id:'old'}:null}))
 await assert.rejects(()=>findGmailMessage(db,'b','a@example.invalid','m'),/äldre mejl/)
})
function callback({differentUser=false,existingError=false,account='a@example.invalid',refresh='new',scopes=calendar}={}){
 const writes=[]
 const db=database(({op,value,filters})=>{assert(filters.some(f=>f[1]==='business_id'&&f[2]==='b')||op==='insert');if(op==='update'||op==='insert'){writes.push(value);return {data:{id:'c'}}}return {data:{id:'c',account_email:'a@example.invalid',refresh_token:'old',calendar_id:'chosen-calendar'},error:existingError?{}:null}})
 const route=load('app/api/google/callback/route.ts',{
  'next/server':{NextResponse:{redirect:url=>({url})}},
  '@/lib/supabase':{getServerSupabase:()=>db}, '@/lib/auth':{getAuthenticatedBusiness:async()=>({business_id:'b'})},
  '@/lib/permissions':{getCurrentUser:async()=>({id:differentUser?'other':'u'})},
  '@/lib/google/oauth-state':{verifyOAuthState:()=>({ok:true,state:{business_id:'b',user_id:'u'}})},
  '@/lib/google-calendar':{getGoogleTokens:async()=>({email:account,subject:'sub',scopes,access_token:'access',refresh_token:refresh,expiry_date:1900000000000}),getCalendarList:async()=>[{id:'primary',primary:true}],verifyGoogleRefreshAccount:async()=>true}
 })
 return {writes,run:()=>route.GET({nextUrl:new URL('https://example.invalid?code=x&state=s')})}
}
test('callback checks actual user within same tenant',async()=>{const c=callback({differentUser:true});await c.run();assert.equal(c.writes.length,0)})
test('callback fails closed on existing-connection DB error',async()=>{const c=callback({existingError:true});await c.run();assert.equal(c.writes.length,0)})
test('callback rejects account replacement before writing',async()=>{const c=callback({account:'b@example.invalid'});await c.run();assert.equal(c.writes.length,0)})
test('callback retains selected calendar and verified scopes',async()=>{const c=callback({scopes:[...calendar,'https://www.googleapis.com/auth/gmail.send']});await c.run();assert.equal(c.writes.length,1);assert.equal(c.writes[0].calendar_id,'chosen-calendar');assert.equal(c.writes[0].gmail_send_scope_granted,true)})
test('callback never overwrites retained refresh with absent token',async()=>{const c=callback({refresh:null});await c.run();assert.equal(c.writes.length,1);assert(!('refresh_token' in c.writes[0]))})
for(const [name,subject,expected] of [['same subject','sub',true],['different subject','other',false],['missing subject','',false]])test('retained refresh verifies '+name,async()=>{
 const oauth={setCredentials:()=>{},refreshAccessToken:async()=>({credentials:{access_token:'new'}}),getTokenInfo:async()=>({sub:'sub'})}
 const {verifyGoogleRefreshAccount}=load('lib/google-calendar.ts',{'googleapis':{google:{auth:{OAuth2:function(){return oauth}}}},'./supabase':{getServerSupabase:()=>null}})
 assert.equal(await verifyGoogleRefreshAccount('old',subject),expected)
})
function preferences({authenticated=true,user=true,direction='both',found=true}={}) {
 const writes=[]
 const route=load('app/api/google/preferences/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},
  '@/lib/auth':{getAuthenticatedBusiness:async()=>authenticated?{business_id:'b'}:null},
  '@/lib/permissions':{getCurrentUser:async()=>user?{id:'u'}:null},
  '@/lib/supabase':{getServerSupabase:()=>database(({value,filters})=>{writes.push(value);for(const [key,val] of [['business_id','b'],['business_user_id','u'],['provider','google']])assert(filters.some(f=>f[1]===key&&f[2]===val));return {data:found?{id:'c'}:null}})}
 })
 return {writes,run:()=>route.PATCH({json:async()=>({syncDirection:direction,refresh_token:'injected'})})}
}
test('preferences route limits write to own user and whitelisted field',async()=>{const c=preferences();assert.equal((await c.run()).status,200);assert.equal(c.writes.length,1);assert.equal(Object.keys(c.writes[0]).join(','),'sync_direction')})
for(const [name,options,status] of [['unauthenticated',{authenticated:false},401],['no membership',{user:false},401],['invalid direction',{direction:'other'},400],['missing connection',{found:false},404]])test('preferences '+name,async()=>{const c=preferences(options);assert.equal((await c.run()).status,status);if(status!==404)assert.equal(c.writes.length,0)})
let db
test('real SQL denies client token reads and writes but preserves safe projection',async()=>{
 await db.exec("SET ROLE authenticated")
 assert.equal((await db.query('SELECT id,gmail_sync_enabled FROM calendar_connection')).rows.length,1)
 for(const sql of ['SELECT access_token FROM calendar_connection','SELECT refresh_token FROM calendar_connection','SELECT * FROM calendar_connection',"UPDATE calendar_connection SET refresh_token='bad'","DELETE FROM calendar_connection","INSERT INTO calendar_connection(id,business_id) VALUES('bad','b')"]){await assert.rejects(()=>db.exec(sql),/permission denied/)}
 await db.exec('RESET ROLE')
})
test('real SQL keeps service token access',async()=>{await db.exec('SET ROLE service_role');assert.equal((await db.query('SELECT refresh_token FROM calendar_connection')).rows[0].refresh_token,'secret');await db.exec('RESET ROLE')})
test('real SQL safe columns still obey tenant RLS',async()=>{await db.exec("SET ROLE authenticated; SET app.business='other'");assert.equal((await db.query('SELECT id FROM calendar_connection')).rows.length,0);await db.exec("RESET ROLE; SET app.business='b'")})
test('real SQL legacy rows unchanged',async()=>{const r=(await db.query("SELECT * FROM email_conversations WHERE gmail_message_id='legacy-id'")).rows[0];assert.equal(r.mail_provider,'legacy');assert.equal(r.mail_account,'');assert.equal(r.provider_message_id,null)})
test('real SQL isolates equal provider IDs by company mailbox and provider',async()=>{
 for(const [b,p,a] of [['b','google','a'],['other','google','a'],['b','google','b'],['b','microsoft','a']]) await db.query('INSERT INTO email_conversations(business_id,gmail_message_id,mail_provider,mail_account,provider_message_id) VALUES ($1,$2,$3,$4,$5)',[b,'same',p,a,'same'])
 assert.equal((await db.query("SELECT count(*)::int n FROM email_conversations WHERE provider_message_id='same'")).rows[0].n,4)
 await assert.rejects(()=>db.exec("INSERT INTO email_conversations(business_id,gmail_message_id,mail_provider,mail_account,provider_message_id) VALUES ('b','same','google','a','same')"),/duplicate key/)
})
test('real SQL rejects incomplete provider identity',async()=>{await assert.rejects(()=>db.exec("INSERT INTO email_conversations(business_id,gmail_message_id,mail_provider) VALUES ('b','broken','google')"),/check constraint/)})
;(async()=>{
 db=new PGlite()
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE calendar_connection(id text PRIMARY KEY,business_id text,gmail_sync_enabled boolean,access_token text,refresh_token text,sync_direction text);
 CREATE POLICY tenant ON calendar_connection TO authenticated USING(business_id=current_setting('app.business'));
 GRANT ALL ON calendar_connection TO authenticated; GRANT SELECT(access_token), UPDATE(refresh_token) ON calendar_connection TO authenticated;
 INSERT INTO calendar_connection VALUES('c','b',false,'access','secret','both'); SET app.business='b';
 CREATE TABLE email_conversations(id serial PRIMARY KEY,business_id text,gmail_message_id text NOT NULL UNIQUE);
 INSERT INTO email_conversations(business_id,gmail_message_id) VALUES('b','legacy-id');`)
 await db.exec(fs.readFileSync('sql/mail_integration_boundaries.sql','utf8'))
 for(const [name,fn] of cases){await fn();console.log('PASS',name)}
 await db.close();console.log(cases.length+' mail boundary tests passed')
})().catch(async e=>{console.error(e);if(db)await db.close();process.exitCode=1})
