import {openDB} from 'idb';
const db=openDB('shrine-tracker',1,{upgrade(db){db.createObjectStore('drafts',{keyPath:'id'});}});
export async function saveDraft(draft){return (await db).put('drafts',draft);}
export async function getDrafts(userId){return (await (await db).getAll('drafts')).filter(x=>x.userId===userId);}
export async function removeDraft(id){return (await db).delete('drafts',id);}
