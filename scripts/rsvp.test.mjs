// scripts/rsvp.test.mjs — THE RSVP SIGNAL · unit tests (pure logic, no Redis needed).
//   node scripts/rsvp.test.mjs   → exits 1 on any failure (GU2 F7: committed, reproducible evidence).
import { buildSignal, planTransition, normGuest, issueLinks, nameKey } from '../src/lib/rsvp.mjs';

let pass = 0, fail = 0;
const A = (name, cond) => { if (cond) { pass++; } else { fail++; console.log(`  ✗ FAIL ${name}`); } };
const now = 'NOW';

// ── normGuest + issueLinks (dry-run): the delivery-metadata / dedup path ──
{
  A('normGuest string → name only', normGuest('Blake').name === 'Blake' && normGuest('Blake').contact === null);
  A('normGuest object → carries contact', normGuest({ name: 'DK', contact: 'ig', channel: 'instagram' }).contact === 'ig');
  A('normGuest trims name', normGuest('  Zoey  ').name === 'Zoey');
  A('nameKey stable for multi-word', nameKey('James hadely') === 'james-hadely');

  // dry-run preview: contact rides the link output; tokens are throwaway but shape is verifiable.
  const out = await issueLinks({
    campaign: 'test', base: 'https://x/s', dryRun: true,
    guests: [
      { name: 'Ever', contact: '+16785794480', channel: 'sms' },
      'Blake',                                   // bare string still works
      { name: 'Ever', contact: '+1DUP', channel: 'sms' }, // duplicate name → deduped
    ],
  });
  A('issueLinks dedups by name', out.count === 2);
  A('issueLinks keeps first of a dup', out.links[0].contact === '+16785794480');
  A('issueLinks carries channel', out.links[0].channel === 'sms');
  A('issueLinks bare-string contact null', out.links[1].name === 'Blake' && out.links[1].contact === null);
  A('issueLinks builds the /s/<campaign>?g= link', out.links[0].url === `https://x/s/test?g=${out.links[0].token}`);
  A('issueLinks dry-run not persisted', out.persisted === false && out.links[0].status === 'preview');
}

// ── buildSignal: the raw signal envelope + totals-on-read ──
{
  const rows = [
    { guest: 'Blake', status: 'responded', answer: 'yes',   opens: '3', sent_at: 't', first_opened_at: 't', responded_at: 't', last_seen_at: 't' },
    { guest: 'Sarah', status: 'opened',    answer: '',      opens: '1', sent_at: 't', first_opened_at: 't' },
    { guest: 'Bee',   status: 'sent',      answer: '',      opens: '0', sent_at: 't' },
    { guest: 'Dani',  status: 'responded', answer: 'maybe', opens: '2', sent_at: 't', first_opened_at: 't', responded_at: 't', last_seen_at: 't' },
    { guest: 'Kori',  status: 'responded', answer: 'no',    opens: '1', sent_at: 't', first_opened_at: 't', responded_at: 't', last_seen_at: 't' },
    null,                                  // missing hash → skipped
    { guest: 'Ghost', opens: '9' },        // no status → skipped
  ];
  const sig = buildSignal('storie_18', rows);
  const t = sig.totals;
  A('buildSignal v=1.0', sig.v === '1.0');
  A('buildSignal campaign', sig.campaign === 'storie_18');
  A('buildSignal updated_at', typeof sig.updated_at === 'string');
  A('buildSignal sent=5 (skips null + statusless)', t.sent === 5);
  A('buildSignal opened=4 (opened|responded)', t.opened === 4);
  A('buildSignal yes=1', t.yes === 1);
  A('buildSignal maybe=1', t.maybe === 1);
  A('buildSignal no=1', t.no === 1);
  A('buildSignal 5 guest rows', sig.guests.length === 5);
  A('buildSignal opens→number', sig.guests[0].opens === 3 && typeof sig.guests[0].opens === 'number');
  A('buildSignal empty answer→null', sig.guests[1].answer === null);
  A('buildSignal stable id', sig.guests[0].id === 'blake');
  A('buildSignal NO token leaked', sig.guests.every((g) => g.token === undefined));
  A('buildSignal schema-safe guests_count default 1', sig.guests[0].guests_count === 1);
  A('buildSignal schema-safe notes default null', sig.guests[0].notes === null);
}

// ── planTransition: the monotonic guard (mirrors TRANSITION_LUA) ──
{
  let r = planTransition({ status: 'sent' }, 'OPENED', '', now);
  A('sent+OPENED → opened', r.sets.status === 'opened');
  A('sent+OPENED → first_opened seeded', r.sets.first_opened_at === now);
  A('sent+OPENED → opens+1', r.incrOpens === 1);

  r = planTransition({ status: 'opened', first_opened_at: 'earlier' }, 'OPENED', '', now);
  A('opened+OPENED → status untouched', r.sets.status === undefined);
  A('opened+OPENED → first_opened not re-seeded', r.sets.first_opened_at === undefined);
  A('opened+OPENED → last_seen bumped', r.sets.last_seen_at === now);

  r = planTransition({ status: 'responded', answer: 'yes', first_opened_at: 'earlier' }, 'OPENED', '', now);
  A('⚑ responded+OPENED → NO downgrade', r.sets.status === undefined);
  A('⚑ responded+OPENED → only opens+last_seen', r.incrOpens === 1 && r.sets.last_seen_at === now);

  r = planTransition({ status: 'sent' }, 'RESPONDED', 'yes', now);
  A('sent+RESPONDED → responded', r.sets.status === 'responded');
  A('sent+RESPONDED → answer yes', r.sets.answer === 'yes');
  A('sent+RESPONDED → responded_at', r.sets.responded_at === now);
  A('sent+RESPONDED → first_opened seeded', r.sets.first_opened_at === now);

  r = planTransition({ status: 'responded', answer: 'yes', first_opened_at: 'earlier' }, 'RESPONDED', 'no', now);
  A('flip yes→no', r.sets.answer === 'no');
  A('flip → first_opened preserved', r.sets.first_opened_at === undefined);

  try { planTransition({ status: 'sent' }, 'RESPONDED', 'nope', now); A('bad answer throws', false); }
  catch (e) { A('bad answer throws', e.message === 'invalid-answer'); }
  try { planTransition({ status: 'sent' }, 'PING', '', now); A('bad event throws', false); }
  catch (e) { A('bad event throws', e.message === 'invalid-event'); }
}

console.log(`\nRSVP unit tests: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
