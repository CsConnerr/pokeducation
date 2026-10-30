const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const html = readFileSync(new URL('../index.html', `file://${__filename}`), 'utf8');
const script = html.match(/<script>'use strict';([\s\S]*?)<\/script>/)[1];
const shuffleSource = script.slice(script.indexOf('    function shuffle('), script.indexOf('    function nextPokemon('));
const questionSource = script.slice(script.indexOf('    function questionBounds('), script.indexOf('    function renderSprites('));

function generator(random) {
  const math = Object.create(Math);
  math.random = random;
  return vm.runInNewContext(`${shuffleSource}\n${questionSource}\nmakeQuestion`, { Math: math });
}

function seededRandom() {
  let seed = 123456789;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

// Expected learning ranges for every position of the classroom slider.
const ranges = [
  [5, 2, 1], [10, 8, 2], [15, 12, 3], [20, 15, 4],
  [25, 19, 5], [30, 23, 6], [35, 27, 7], [40, 30, 8],
  [45, 34, 9], [50, 38, 10], [55, 42, 11], [60, 45, 12],
  [65, 49, 13], [70, 53, 14], [75, 57, 15], [80, 60, 16],
  [85, 64, 17], [90, 68, 18], [95, 72, 19], [100, 75, 20]
];

test('the complete game script parses', () => {
  assert.doesNotThrow(() => new vm.Script(script));
});

for (const operation of ['addition', 'multiplication']) {
  test(`${operation} respects every slider setting, including random extremes`, () => {
    const randomSources = [() => 0, () => 1 - Number.EPSILON, seededRandom()];
    for (const random of randomSources) {
      const makeQuestion = generator(random);
      for (const [limit, minimumTotal, minimumAddend] of ranges) {
        let previousPair = '';
        for (let round = 0; round < 150; round++) {
          const q = makeQuestion(limit, previousPair, operation);
          const pair = `${q.a},${q.b}`;
          assert.equal(q.operation, operation);
          assert.notEqual(pair, previousPair);
          assert.equal(q.total, operation === 'addition' ? q.a + q.b : q.a * q.b);
          assert.ok(q.total >= minimumTotal && q.total <= limit, `${operation} at ${limit}: ${q.a}, ${q.b}, ${q.total}`);
          const minimumOperand = operation === 'addition' ? minimumAddend : (limit === 5 ? 1 : 2);
          assert.ok(q.a >= minimumOperand && q.b >= minimumOperand);
          if (operation === 'multiplication') assert.ok(q.a <= 10 && q.b <= 10);
          assert.equal(q.options.length, 4);
          assert.equal(new Set(q.options).size, 4);
          assert.ok(q.options.includes(q.total));
          assert.ok(q.options.every(n => Number.isInteger(n) && n >= 1 && n <= limit));
          previousPair = pair;
        }
      }
    }
  });

  test(`${operation} stays in range when the slider moves up and down`, () => {
    const makeQuestion = generator(seededRandom());
    let previousPair = '';
    for (const [limit, minimumTotal] of [...ranges, ...ranges.slice().reverse(), ...ranges]) {
      const q = makeQuestion(limit, previousPair, operation);
      assert.ok(q.total >= minimumTotal && q.total <= limit);
      previousPair = `${q.a},${q.b}`;
    }
  });
}
