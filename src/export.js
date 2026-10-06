import ExcelJS from 'exceljs';
import {dayBounds} from './utils';
async function allRows(query) {
 const rows=[];
 for(let offset=0;;offset+=500){const {data,error}=await query().range(offset,offset+499);if(error)throw error;rows.push(...data);if(data.length<500)return rows;}
}
export async function exportDay(client,day,masters,onProgress=()=>{}) {
 const [start,end]=dayBounds(day);
 const tickets=await allRows(()=>client.from('tickets').select('*').gte('created_at',start).lt('created_at',end).order('created_at').order('id'));
 const training=await allRows(()=>client.from('training_reports').select('*').eq('report_date',day).order('created_at').order('id'));
 const ids=tickets.map(t=>t.id),photos=[],history=[];
 for(let i=0;i<ids.length;i+=100){const part=ids.slice(i,i+100);photos.push(...await allRows(()=>client.from('attachments').select('*').in('ticket_id',part).order('created_at').order('id')));history.push(...await allRows(()=>client.from('ticket_history').select('*').in('ticket_id',part).order('created_at').order('id')));}
 const wb=new ExcelJS.Workbook();wb.creator='Mata Shrine Board Tracker';wb.created=new Date();
 const find=(kind,id)=>masters[kind].find(x=>x.id===id)?.name||masters[kind].find(x=>x.id===id)?.full_name||'';
 const sheet=(name,cols,rows)=>{const ws=wb.addWorksheet(name);ws.columns=cols.map(c=>({header:c,key:c,width:24}));rows.forEach(r=>ws.addRow(r));ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF143F3A'}};ws.views=[{state:'frozen',ySplit:1}];ws.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,ws.rowCount),column:cols.length}};ws.eachRow(r=>r.alignment={vertical:'top',wrapText:true});return ws;};
 sheet('Read Me',['Field','Value'],[{Field:'Report date (India)',Value:day},{Field:'Tickets',Value:'Tickets created on this date, with their current status and all attached photos.'},{Field:'Scope',Value:'Only records accessible to the signed-in user are included.'},{Field:'Training',Value:'Training reports with this report date.'},{Field:'Generated',Value:new Date().toISOString()},{Field:'Source',Value:'Supabase is the source of truth. Editing this export does not update the app.'}]);
 sheet('Tickets',['Ticket','Created','Sector','Facility','Issue','Comments','Priority','Status','Reporter','Trainer','Assigned to','Notification Recipient','Updated','Closed'],tickets.map(t=>({'Ticket':t.ticket_number,'Created':t.created_at,'Sector':find('sectors',t.sector_id),'Facility':find('facilities',t.facility_id),'Issue':t.issue,'Comments':t.comments,'Priority':t.priority,'Status':t.status,'Reporter':find('people',t.reporter_id),'Trainer':find('people',t.trainer_id),'Assigned to':find('people',t.assignee_id),'Notification Recipient':t.recipient_emails?.join(', ')||'Configured routing','Updated':t.updated_at,'Closed':t.closed_at||''})));
 sheet('Ticket History',['Ticket','Time','Person','Action','Comment'],history.map(h=>({'Ticket':tickets.find(t=>t.id===h.ticket_id)?.ticket_number,'Time':h.created_at,'Person':find('people',h.actor_id),'Action':h.action,'Comment':h.note})));
 sheet('Training',['Date','Sector','Trainer','Linked Ticket','Site Details','Topics','Other Topic','Team Size','Attendance','Feedback Score','Feedback Name','Feedback Contact','Observations','Notes'],training.map(t=>({'Date':t.report_date,'Sector':find('sectors',t.sector_id),'Trainer':find('people',t.trainer_id),'Linked Ticket':t.ticket_id||'','Site Details':t.site_details,'Topics':t.topics.join(', '),'Other Topic':t.other_topic,'Team Size':t.team_size,'Attendance':t.attendance,'Feedback Score':t.feedback_score,'Feedback Name':t.feedback_name,'Feedback Contact':t.feedback_contact,'Observations':JSON.stringify(t.observations),'Notes':t.notes})));
 const ws=sheet('Photos',['Ticket','Stage','Uploaded by','Time','Photo'],[]);ws.getColumn(5).width=42;
 let totalBytes=0;
 for(let i=0;i<photos.length;i++) {
  const p=photos[i];onProgress(`Embedding photo ${i+1} of ${photos.length}…`);
  const {data,error}=await client.storage.from('ticket-photos').download(p.path);if(error)throw new Error('A photo could not be downloaded. Export cancelled; try again online.');
  totalBytes+=data.size;if(totalBytes>60000000)throw new Error('Photo export exceeds 60 MB. Export on a desktop or reduce the photos retained for this day.');
  const row=ws.addRow({'Ticket':tickets.find(t=>t.id===p.ticket_id)?.ticket_number,'Stage':p.stage,'Uploaded by':find('people',p.uploaded_by),'Time':p.created_at});row.height=165;
  const image=wb.addImage({buffer:await data.arrayBuffer(),extension:p.path.endsWith('.png')?'png':'jpeg'});
  ws.addImage(image,{tl:{col:4,row:row.number-1},ext:{width:280,height:210},editAs:'oneCell'});
 }
 onProgress('Creating workbook…');const bytes=await wb.xlsx.writeBuffer();
 const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=`Shrine_Inspection_${day}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
 return {tickets:tickets.length,photos:photos.length};
}
