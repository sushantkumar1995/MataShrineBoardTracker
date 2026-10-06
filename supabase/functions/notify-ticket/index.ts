import { createClient } from 'npm:@supabase/supabase-js@2';
const appUrl = 'https://sushantkumar1995.github.io/MataShrineBoardTracker/';
const cors = { 'Access-Control-Allow-Origin': 'https://sushantkumar1995.github.io', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers: {...cors,'Content-Type':'application/json'} });
Deno.serve(async req => {
 if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
 if(req.method!=='POST') return reply({error:'Method not allowed'},405);
 try {
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token) return reply({error:'Login required'},401);
  const url=Deno.env.get('SUPABASE_URL')!;
  const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const {data:{user},error:authError}=await admin.auth.getUser(token);
  if(authError||!user) return reply({error:'Login required'},401);
  const {data:profile}=await admin.from('profiles').select('role').eq('id',user.id).single();
  if(!profile||profile.role==='pending') return reply({error:'Access denied'},403);
  const {ticket_id}=await req.json();
  if(typeof ticket_id!=='string'||!/^[0-9a-f-]{36}$/i.test(ticket_id)) return reply({error:'Invalid ticket'},400);
  const {data:ticket,error:ticketError}=await admin.from('tickets').select('*').eq('id',ticket_id).single();
  if(ticketError||!ticket) return reply({error:'Ticket not found'},404);
  if(!['admin','trainer'].includes(profile.role)&&![ticket.reporter_id,ticket.assignee_id].includes(user.id)) return reply({error:'Access denied'},403);
  const key=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('EMAIL_FROM');
  if(!key||!from) return reply({error:'Email is not configured. Ticket is saved; notifications remain pending.'},503);
  const {data:events,error:eventError}=await admin.from('notification_outbox').select('*').eq('ticket_id',ticket_id).neq('status','sent').order('created_at').limit(10);
  if(eventError) throw eventError;
  const {data:routes,error:routeError}=await admin.from('notification_routes').select('email').or(`sector_id.is.null,sector_id.eq.${ticket.sector_id}`);
  if(routeError) throw routeError;
  const ids=[ticket.reporter_id,ticket.trainer_id,ticket.assignee_id].filter(Boolean);
  const {data:people,error:peopleError}=await admin.from('profiles').select('email').in('id',ids);
  if(peopleError) throw peopleError;
  const recipients=[...new Set([...(routes||[]),...(people||[])].map(x=>x.email))];
  if(!recipients.length) return reply({error:'No recipients configured'},400);
  const [{data:sector},{data:facility}]=await Promise.all([admin.from('sectors').select('name').eq('id',ticket.sector_id).single(),admin.from('facilities').select('name').eq('id',ticket.facility_id).single()]);
  let sent=0,failed=0;
  for(const event of events||[]) {
   if(event.status==='processing'&&Date.now()-Date.parse(event.updated_at)<300000) continue;
   const {data:claimed,error:claimError}=await admin.from('notification_outbox').update({status:'processing',attempts:event.attempts+1,updated_at:new Date().toISOString()}).eq('id',event.id).eq('status',event.status).eq('updated_at',event.updated_at).select('id');
   if(claimError) throw claimError;
   if(!claimed?.length) continue;
   try {
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`shrine-${event.id}`},body:JSON.stringify({from,to:recipients,subject:`${ticket.ticket_number}: ${event.event}`,text:`${event.event}\nTicket: ${ticket.ticket_number}\nSector: ${sector?.name||''}\nFacility: ${facility?.name||''}\nIssue: ${ticket.issue}\nPriority: ${ticket.priority}\n\nOpen the app and sign in to view photos and the latest status:\n${appUrl}#ticket/${ticket.id}`})});
    if(!response.ok) throw new Error(`Email provider returned ${response.status}`);
    const {error}=await admin.from('notification_outbox').update({status:'sent',last_error:null,updated_at:new Date().toISOString()}).eq('id',event.id);
    if(error) throw error;
    sent++;
   } catch(e) {
    await admin.from('notification_outbox').update({status:'failed',last_error:e instanceof Error?e.message:'Email failed',updated_at:new Date().toISOString()}).eq('id',event.id);
    failed++;
   }
  }
  return reply({sent,failed,pending:(events?.length||0)-sent-failed});
 } catch { return reply({error:'Notification request failed. The ticket remains saved.'},500); }
});
