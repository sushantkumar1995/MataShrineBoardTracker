export const statuses = ['Open','Under Review','Assigned','Awaiting Verification','Closed'];
export const topics = ['Safety & PPE','Personal Hygiene','Cleaning Science','Chemical Competency (Surfaces)','Chemical Reagents & Their Usage','Tools, Mops & Equipment','Other'];
export const observationItems = ['W/C','Urinals','Washbasin','Washroom Floor','Overall Washroom'];
export const escapeHtml = (value='') => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const indiaDate = (date=new Date()) => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const dateLabel = date => new Date(date).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
export function dayBounds(day) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Choose a valid date');
 const start=new Date(`${day}T00:00:00+05:30`);
 if(!Number.isFinite(start.getTime())) throw new Error('Choose a valid date');
 return [start.toISOString(),new Date(start.getTime()+86400000).toISOString()];
}
export function allowedActions(ticket,profile) {
 const admin=profile.role==='admin', trainer=profile.role==='trainer'&&ticket.trainer_id===profile.id;
 if(ticket.status==='Closed') return [];
 if(ticket.status==='Open') return ['admin','trainer'].includes(profile.role)?['Claim']:[];
 if(ticket.status==='Under Review') return admin||trainer?['Assign','Close']:[];
 if(ticket.status==='Assigned') return [...(admin||trainer?['Assign']:[]),...(admin||(profile.role==='groundstaff'&&ticket.assignee_id===profile.id)?['Complete']:[])];
 return admin||trainer?['Close','Return']:[];
}
export async function compressPhoto(file) {
 if(!file.type.startsWith('image/')) throw new Error('Choose an image file');
 if(file.size>20000000) throw new Error('Photo is too large. Maximum input is 20 MB.');
 const bitmap=await createImageBitmap(file).catch(()=>{throw new Error('Unable to read this photo. Try JPEG or PNG.');});
 const scale=Math.min(1,1280/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
 canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.75));
 if(!blob||blob.size>1048576) throw new Error('Compressed photo exceeds 1 MB. Choose a smaller image.');
 return blob;
}
