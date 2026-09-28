// Update team names and results here. Scores are rounds won; null = unplayed.
const TOURNAMENT = {
  name: 'Friends Cup',
  teams: Array.from({ length: 8 }, (_, i) => ({ id: `t${i+1}`, name: `Team 0${i+1}`, tag: `0${i+1}` })),
  groups: [
    { id: 'A', teams: ['t1','t2','t3','t4'], tiebreakOrder: [] },
    { id: 'B', teams: ['t5','t6','t7','t8'], tiebreakOrder: [] }
  ],
  matches: [
    { id: 'a1', group: 'A', teams: ['t1','t2'], result: null },
    { id: 'a2', group: 'A', teams: ['t3','t4'], result: null },
    { id: 'a3', group: 'A', teams: ['t1','t3'], result: null },
    { id: 'a4', group: 'A', teams: ['t2','t4'], result: null },
    { id: 'a5', group: 'A', teams: ['t1','t4'], result: null },
    { id: 'a6', group: 'A', teams: ['t2','t3'], result: null },
    { id: 'b1', group: 'B', teams: ['t5','t6'], result: null },
    { id: 'b2', group: 'B', teams: ['t7','t8'], result: null },
    { id: 'b3', group: 'B', teams: ['t5','t7'], result: null },
    { id: 'b4', group: 'B', teams: ['t6','t8'], result: null },
    { id: 'b5', group: 'B', teams: ['t5','t8'], result: null },
    { id: 'b6', group: 'B', teams: ['t6','t7'], result: null },
    { id: 's1', round: 0, seeds: [['A',0],['B',1]], result: null },
    { id: 's2', round: 0, seeds: [['B',0],['A',1]], result: null },
    { id: 'f1', round: 1, from: ['s1','s2'], result: null }
  ]
};
