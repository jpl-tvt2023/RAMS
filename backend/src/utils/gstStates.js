// The GST state codes (the first two digits of a GSTIN) and their states, as
// Tally spells them. A party's state is read two ways -- from its GSTIN and
// from Tally's ledger -- and the Ledgers and Party ledgers screens flag the
// ledgers where the two disagree, so the accountants can correct Tally.

const GST_STATES = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Dadra & Nagar Haveli and Daman & Diu',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};

// Older or looser spellings Tally ledgers carry, by their key (see keyOf).
const ALIASES = {
  orissa: 'odisha',
  pondicherry: 'puducherry',
  uttaranchal: 'uttarakhand',
  newdelhi: 'delhi',
  nctofdelhi: 'delhi',
  delhinct: 'delhi',
  andamanandnicobar: 'andamanandnicobarislands',
  dadraandnagarhaveli: 'dadraandnagarhaveliananddamananddiu',
  damananddiu: 'dadraandnagarhaveliananddamananddiu',
};

// "Jammu and Kashmir", "JAMMU & KASHMIR" and "jammu&kashmir" share one key.
function keyOf(name) {
  const k = String(name ?? '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');
  return ALIASES[k] || k;
}

// The state a GSTIN is registered in, or null.
function stateOfGstin(gstin) {
  const m = /^(\d{2})[A-Z0-9]{13}$/i.exec(String(gstin ?? '').trim());
  return m ? GST_STATES[m[1]] || null : null;
}

// "Any", blank and the like are no state at all.
function stateOrNull(name) {
  const s = String(name ?? '').trim();
  return !s || /^(any|not applicable|n\/?a|none|-+)$/i.test(s) ? null : s;
}

const sameState = (a, b) => keyOf(a) === keyOf(b);

/**
 * Both readings of a party's state and whether they disagree. `state` is the
 * one to show: the GSTIN's, else Tally's.
 */
function statesOf({ state, gstin }) {
  const tally = stateOrNull(state);
  const gst = stateOfGstin(gstin);
  const differs = Boolean(tally && gst && !sameState(tally, gst));
  return {
    tally_state: tally,
    gst_state: gst,
    state: gst || tally,
    state_differs: differs,
  };
}

module.exports = {
  GST_STATES, keyOf, sameState, stateOfGstin, stateOrNull, statesOf,
};
