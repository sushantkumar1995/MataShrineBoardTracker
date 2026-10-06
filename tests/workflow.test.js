import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowedActions,dayBounds,indiaDate,escapeHtml} from '../src/utils.js';
test('reporter cannot claim or close a ticket',()=>{for(const status of ['Open','Under Review','Assigned','Awaiting Verification','Closed'])assert.deepEqual(allowedActions({status,reporter_id:'a'},{id:'a',role:'reporter'}),[]);});
test('only responsible trainer can assign and verify',()=>{assert.deepEqual(allowedActions({status:'Under Review',trainer_id:'t'},{id:'t',role:'trainer'}),['Assign','Close']);assert.deepEqual(allowedActions({status:'Under Review',trainer_id:'t'},{id:'other',role:'trainer'}),[]);assert.deepEqual(allowedActions({status:'Awaiting Verification',trainer_id:'t'},{id:'t',role:'trainer'}),['Close','Return']);});
test('only assigned groundstaff can complete work',()=>{assert.deepEqual(allowedActions({status:'Assigned',assignee_id:'g'},{id:'g',role:'groundstaff'}),['Complete']);assert.deepEqual(allowedActions({status:'Assigned',assignee_id:'g'},{id:'x',role:'groundstaff'}),[]);});
test('daily exports use India boundaries rather than UTC',()=>{assert.deepEqual(dayBounds('2026-10-06'),['2026-10-05T18:30:00.000Z','2026-10-06T18:30:00.000Z']);assert.equal(indiaDate(new Date('2026-10-05T20:00:00Z')),'2026-10-06');});
test('user text is escaped before HTML rendering',()=>assert.equal(escapeHtml('<img onerror="bad">'), '&lt;img onerror=&quot;bad&quot;&gt;'));
